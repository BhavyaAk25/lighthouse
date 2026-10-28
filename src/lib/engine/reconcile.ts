import type {
  AgentOutput,
  AgentType,
  Conflict,
  DecisionCase,
  Gate,
  Reconciliation,
  Recommendation,
  RiskLevel,
  Thresholds,
} from "../types";
import { RISK_ORDER, maxRisk } from "../types";
import { clamp, num, round, usdK } from "./common";

const SUPPORT: Recommendation[] = ["PROCEED", "PROCEED_WITH_CONDITIONS"];
const OPPOSE: Recommendation[] = ["HOLD", "REJECT"];
const WEIGHT: Record<AgentType, number> = { FINANCE: 0.3, SALES: 0.25, OPERATIONS: 0.25, LEGAL: 0.2 };
const NAME: Record<AgentType, string> = { SALES: "Sales", FINANCE: "Finance", OPERATIONS: "Operations", LEGAL: "Legal" };
export const REC_LABEL: Record<Recommendation, string> = {
  PROCEED: "Proceed",
  PROCEED_WITH_CONDITIONS: "Proceed with conditions",
  HOLD: "Hold",
  REJECT: "Reject",
  REVIEW_REQUIRED: "Review required",
};

/**
 * Lighthouse governance rules (Deliverable 1, section 4.2):
 *  1. Legal prohibited  -> REJECT (no proceed), route to legal.
 *  2. Missing/invalid evidence -> REVIEW_REQUIRED; never impute.
 *  3. Operations hard capacity breach -> HOLD unless mitigation resolves it. Finance hold or reject -> no proceed.
 *  4. Support vs oppose positions -> explicit conflict state (never averaged away).
 *  5. Confidence is a synthesis score, not an average.
 *  6. All four positions are preserved in the packet.
 *  7. Human approval is mandatory; legal REVIEW_REQUIRED/HIGH risk gates approval.
 */
export function reconcile(c: DecisionCase, outputs: AgentOutput[], cfg: Thresholds, financialImpact: number): Reconciliation {
  const by = Object.fromEntries(outputs.map((o) => [o.agent_type, o])) as Record<AgentType, AgentOutput>;
  const legal = by.LEGAL;
  const ops = by.OPERATIONS;
  const fin = by.FINANCE;
  const sales = by.SALES;
  const legalProhibited = legal.recommendation === "REJECT" && legal.risk_level === "CRITICAL";
  const legalReview = legal.recommendation === "REVIEW_REQUIRED" || RISK_ORDER[legal.risk_level] >= RISK_ORDER.HIGH;
  const opsHardStop = ops.valid && (ops.recommendation === "HOLD" || ops.recommendation === "REJECT") && Boolean(ops.hard_constraint);
  const invalid = outputs.filter((o) => !o.valid);
  const supporters = outputs.filter((o) => SUPPORT.includes(o.recommendation));
  const opposers = outputs.filter((o) => OPPOSE.includes(o.recommendation));

  // ---- conflicts
  const conflicts: Conflict[] = [];
  if (supporters.length && opposers.length) {
    for (const op of opposers)
      conflicts.push({
        agents: [...supporters.map((s) => s.agent_type), op.agent_type],
        kind: (op.agent_type === "OPERATIONS" && opsHardStop) || (op.agent_type === "LEGAL" && legalProhibited) ? "HARD_STOP" : "SUPPORT_VS_OPPOSE",
        description: `${NAME[op.agent_type]} recommends ${REC_LABEL[op.recommendation].toLowerCase()} while ${supporters
          .map((s) => NAME[s.agent_type])
          .join(", ")} support proceeding. ${op.hard_constraint ?? op.rationale.split(". ")[0]}`,
      });
  }
  if (legal.recommendation === "REVIEW_REQUIRED")
    conflicts.push({
      agents: ["LEGAL", ...supporters.filter((s) => s.agent_type !== "LEGAL").map((s) => s.agent_type)],
      kind: "LEGAL_GATE",
      description: `Legal requires human compliance review before launch${supporters.length ? ` while ${supporters.map((s) => NAME[s.agent_type]).join(", ")} support proceeding` : ""}.`,
    });
  for (const o of invalid)
    conflicts.push({
      agents: [o.agent_type],
      kind: "EVIDENCE",
      description: `${NAME[o.agent_type]} output is invalid: ${o.validation_issues[0] ?? "required evidence missing"}.`,
    });
  const risks = outputs.map((o) => RISK_ORDER[o.risk_level]);
  if (!conflicts.length && Math.max(...risks) - Math.min(...risks) >= 2)
    conflicts.push({
      agents: outputs.filter((o) => RISK_ORDER[o.risk_level] >= 2).map((o) => o.agent_type),
      kind: "RISK_DIVERGENCE",
      description: "Agents agree on direction but assess materially different risk levels.",
    });

  const severity: Reconciliation["conflict_severity"] =
    legalProhibited || opsHardStop
      ? "HARD_STOP"
      : conflicts.some((x) => x.kind === "SUPPORT_VS_OPPOSE" || x.kind === "EVIDENCE" || x.kind === "HARD_STOP")
        ? "MATERIAL"
        : conflicts.length
          ? "MINOR"
          : "NONE";

  // ---- synthesized recommendation
  let rec: Recommendation;
  const decisive: string[] = [];
  if (legalProhibited) {
    rec = "REJECT";
    decisive.push(`Legal prohibition: ${legal.hard_constraint ?? legal.rationale}`);
  } else if (invalid.length) {
    rec = "REVIEW_REQUIRED";
    decisive.push(...invalid.map((o) => `${NAME[o.agent_type]} evidence incomplete: ${o.validation_issues[0] ?? ""}`));
  } else if (opsHardStop) {
    rec = "HOLD";
    decisive.push(ops.hard_constraint ?? "Operations capacity hard stop.");
  } else if (fin.recommendation === "REJECT") {
    rec = sales.recommendation === "PROCEED" ? "HOLD" : "REJECT";
    decisive.push(`Finance: ${fin.hard_constraint ?? fin.rationale.split(". ")[0]}`);
  } else if (fin.recommendation === "HOLD") {
    // economics unresolved: the case waits until Finance can support it
    rec = "HOLD";
    decisive.push(`Finance holds: ${fin.hard_constraint ?? fin.rationale.split(". ")[0]}`);
  } else if (opposers.length >= 2) {
    rec = "HOLD";
    decisive.push(`${opposers.map((o) => NAME[o.agent_type]).join(" and ")} oppose proceeding.`);
  } else if (opposers.length === 1) {
    rec = "PROCEED_WITH_CONDITIONS";
    decisive.push(`${NAME[opposers[0].agent_type]} dissents (${REC_LABEL[opposers[0].recommendation]}); conditions address the concern.`);
  } else if (legal.recommendation === "REVIEW_REQUIRED") {
    rec = "PROCEED_WITH_CONDITIONS";
    decisive.push("Three functions support proceeding; legal compliance review is a mandatory gate.");
  } else if (outputs.some((o) => o.recommendation === "PROCEED_WITH_CONDITIONS" || o.recommendation === "REVIEW_REQUIRED")) {
    rec = "PROCEED_WITH_CONDITIONS";
    decisive.push("All functions support proceeding with conditions.");
  } else {
    rec = "PROCEED";
    decisive.push("All four agents support proceeding with compatible evidence.");
  }
  if (rec !== "REJECT" && fin.recommendation !== "REJECT") {
    const nb = num(fin.key_metrics.net_benefit);
    decisive.push(`Finance net benefit ${usdK(nb)}; Sales unit uplift ${num(sales.key_metrics.unit_uplift_pct).toFixed(1)}%.`);
  }

  // ---- gates
  const legalGate: Gate = legalProhibited
    ? { key: "LEGAL_REVIEW", label: "Legal & compliance", status: "BLOCKED", detail: legal.hard_constraint ?? "Prohibited condition." }
    : legalReview
      ? { key: "LEGAL_REVIEW", label: "Legal & compliance", status: "PENDING", detail: "Human legal/compliance disposition required before approval." }
      : { key: "LEGAL_REVIEW", label: "Legal & compliance", status: "CLEAR", detail: "No rule requires human review." };
  const opsGate: Gate = !ops.valid
    ? { key: "OPERATIONS_CAPACITY", label: "Operations capacity", status: "WARNING", detail: "Operations evidence incomplete." }
    : opsHardStop
      ? { key: "OPERATIONS_CAPACITY", label: "Operations capacity", status: "BLOCKED", detail: ops.hard_constraint ?? "Capacity breach." }
      : ops.recommendation === "PROCEED_WITH_CONDITIONS"
        ? { key: "OPERATIONS_CAPACITY", label: "Operations capacity", status: "WARNING", detail: "Executable with mitigation conditions." }
        : { key: "OPERATIONS_CAPACITY", label: "Operations capacity", status: "CLEAR", detail: "Within capacity limits." };
  const staleCount = Number(sales.data_quality.sales_stale) + Number(ops.data_quality.ops_stale);
  const evidenceGate: Gate = invalid.length
    ? { key: "EVIDENCE_QUALITY", label: "Evidence quality", status: "BLOCKED", detail: `${invalid.length === 1 ? "One agent is" : `${invalid.length} agents are`} missing evidence, so ${invalid.length === 1 ? "its answer is" : "their answers are"} not counted.` }
    : staleCount
      ? { key: "EVIDENCE_QUALITY", label: "Evidence quality", status: "WARNING", detail: "Stale evidence; confidence downgraded." }
      : { key: "EVIDENCE_QUALITY", label: "Evidence quality", status: "CLEAR", detail: "Evidence complete and fresh." };
  const overThreshold = financialImpact >= cfg.financial_impact_threshold;
  const finGate: Gate = {
    key: "FINANCIAL_THRESHOLD",
    label: "Financial impact",
    status: overThreshold ? "WARNING" : "CLEAR",
    detail: overThreshold
      ? `${usdK(financialImpact)} at stake exceeds the ${usdK(cfg.financial_impact_threshold)} threshold; named executive approval required.`
      : `${usdK(financialImpact)} at stake; below the ${usdK(cfg.financial_impact_threshold)} threshold.`,
  };

  // ---- confidence synthesis (not an average)
  const agentConfidence = outputs.reduce((s, o) => s + WEIGHT[o.agent_type] * o.confidence, 0);
  const completeness = clamp(
    ((Math.min(1, sales.data_quality.sales_coverage) + Math.min(1, ops.data_quality.ops_coverage)) / 2) *
      (1 - invalid.length * 0.15),
    0.3,
    1,
  );
  const freshness = 1 - 0.12 * staleCount;
  const conflictPenalty = { NONE: 0, MINOR: 0.05, MATERIAL: 0.15, HARD_STOP: 0.08 }[severity];
  const hardFactor = legalProhibited || opsHardStop ? 0.95 : 1;
  const confidence = clamp(agentConfidence * completeness * freshness * (1 - conflictPenalty) * hardFactor, 0.15, 0.95);

  const conditions = [
    ...(legalReview && !legalProhibited ? ["Legal/compliance approval recorded before launch."] : []),
    ...[...new Set(outputs.flatMap((o) => o.conditions))],
  ].slice(0, 8);
  const risk: RiskLevel = maxRisk(...outputs.map((o) => o.risk_level));
  const expedited = !overThreshold && severity === "NONE" && !legalReview && rec === "PROCEED";

  const headline =
    rec === "REJECT"
      ? legalProhibited
        ? "Do not proceed: legal prohibition"
        : "Do not proceed: economics fail"
      : rec === "HOLD"
        ? opsHardStop
          ? "Hold: operations capacity hard stop"
          : fin.recommendation === "REJECT" || fin.recommendation === "HOLD"
            ? "Hold: economics do not work at this discount"
            : "Hold: agents oppose proceeding"
        : rec === "REVIEW_REQUIRED"
          ? "Review required: evidence incomplete"
          : rec === "PROCEED_WITH_CONDITIONS"
            ? legalReview
              ? "Proceed with conditions after legal approval"
              : "Proceed with conditions"
            : "Proceed";
  const summary =
    `${headline}. ` +
    outputs.map((o) => `${NAME[o.agent_type]}: ${REC_LABEL[o.recommendation]} (${o.confidence.toFixed(2)})`).join("; ") +
    `. ${decisive[0] ?? ""} Lighthouse confidence ${confidence.toFixed(2)}` +
    (severity !== "NONE" ? `, conflict severity ${severity.toLowerCase().replace("_", " ")}.` : ".");

  return {
    synthesized_recommendation: rec,
    lighthouse_confidence: round(confidence, 2),
    confidence_breakdown: {
      agent_confidence: round(agentConfidence, 3),
      evidence_completeness: round(completeness, 3),
      freshness: round(freshness, 3),
      conflict_penalty: conflictPenalty,
      hard_constraint_factor: hardFactor,
    },
    conflict_flag: severity !== "NONE",
    conflict_severity: severity,
    conflicts,
    gates: [legalGate, opsGate, evidenceGate, finGate],
    risk_level: legalProhibited ? "CRITICAL" : risk,
    conditions,
    requires_legal_review: legalReview && !legalProhibited,
    expedited_eligible: expedited,
    financial_impact: round(financialImpact),
    decisive_factors: decisive.slice(0, 4),
    summary,
    headline,
  };
}
