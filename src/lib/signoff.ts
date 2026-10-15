/**
 * Department sign-off: each of the four department leads owns one agent.
 * Management by exception: a lead only has to sign when their agent raises a concern,
 * has low confidence or is missing evidence. Everything else clears automatically.
 * Pure functions, shared by the server, the UI and the acceptance tests.
 */
import { reconcile } from "./engine/reconcile";
import { LEAD_OF } from "./personas";
import type { AgentOutput, AgentType, DecisionCase, Gate, Reconciliation, Recommendation, RiskLevel, Thresholds } from "./types";
import { AGENTS } from "./types";

export const DEPT_NAME: Record<AgentType, string> = { SALES: "Sales", FINANCE: "Finance", OPERATIONS: "Operations", LEGAL: "Legal" };

export const REC_WORD: Record<string, string> = {
  PROCEED: "proceed",
  PROCEED_WITH_CONDITIONS: "proceed with conditions",
  HOLD: "hold",
  REJECT: "reject",
  REVIEW_REQUIRED: "review required",
};

export type SignoffKind = "CONFIRMED" | "ADJUSTED" | "BLOCKED";

export interface Signoff {
  review_id: number;
  decision_id: string;
  revision: number;
  department: AgentType;
  reviewer_name: string;
  reviewer_role: string;
  disposition: SignoffKind;
  ai_recommendation: Recommendation;
  position: Recommendation;
  conditions: string[];
  condition_text: string | null;
  superseded: boolean;
  created_at: string;
}

/**
 * NOT_STARTED: agents have not run · AUTO: cleared without a person · PENDING / OVERDUE: waiting on the lead
 * CONFIRMED / ADJUSTED / BLOCKED: the lead signed · PROHIBITED: a legal rule forbids the case outright.
 */
export type LaneState = "NOT_STARTED" | "AUTO" | "PENDING" | "OVERDUE" | "CONFIRMED" | "ADJUSTED" | "BLOCKED" | "PROHIBITED";

export interface LaneOutput {
  recommendation: Recommendation;
  confidence: number;
  valid: boolean;
  risk_level: RiskLevel | string;
  reason?: string;
}

export interface Lane {
  dept: AgentType;
  lead: { id: string; name: string; role: string };
  ai: LaneOutput | null;
  required: boolean;
  reasons: string[];
  state: LaneState;
  signoff: Signoff | null;
  position: Recommendation | null;
  dueAt: string | null;
  resolved: boolean;
  /** an overdue non-legal lane the executive may decide without */
  escalated: boolean;
  note: string;
}

export const isProhibited = (o: { recommendation: string; risk_level: string } | null | undefined) =>
  !!o && o.recommendation === "REJECT" && o.risk_level === "CRITICAL";

export function concernsFor(dept: AgentType, o: LaneOutput, cfg: Pick<Thresholds, "signoff_confidence">): string[] {
  const r: string[] = [];
  if (!o.valid) r.push("evidence is incomplete");
  if (o.recommendation === "HOLD" || o.recommendation === "REJECT") r.push(`the ${DEPT_NAME[dept]} agent says ${REC_WORD[o.recommendation]}`);
  if (o.recommendation === "REVIEW_REQUIRED") r.push(dept === "LEGAL" ? "a rule needs a lawyer’s review" : `the ${DEPT_NAME[dept]} agent needs a human check`);
  if (o.confidence < cfg.signoff_confidence) r.push(`the agent is only ${Math.round(o.confidence * 100)}% confident`);
  return r;
}

export function computeLanes(
  outs: Partial<Record<AgentType, LaneOutput>>,
  signoffs: Signoff[],
  cfg: Pick<Thresholds, "signoff_confidence" | "signoff_sla_hours">,
  analyzedAt: string | null,
  now: number = Date.now(),
): Lane[] {
  const active = signoffs.filter((s) => !s.superseded);
  const prohibited = isProhibited(outs.LEGAL);
  const due = analyzedAt ? new Date(new Date(analyzedAt).getTime() + cfg.signoff_sla_hours * 3_600_000).toISOString() : null;
  return AGENTS.map((dept) => {
    const p = LEAD_OF[dept];
    const lead = { id: p.id, name: p.name, role: p.role };
    const o = outs[dept] ?? null;
    const s = [...active].reverse().find((x) => x.department === dept) ?? null;
    const base = { dept, lead, ai: o, signoff: s, dueAt: null as string | null, escalated: false };
    if (!o) return { ...base, required: false, reasons: [], state: "NOT_STARTED", position: null, resolved: false, note: "Agents have not run yet" } as Lane;
    if (dept === "LEGAL" && prohibited)
      return { ...base, required: false, reasons: ["a legal rule prohibits this case"], state: "PROHIBITED", position: "REJECT", resolved: true, note: "Prohibited by rule. Cannot launch." } as Lane;
    const reasons = prohibited ? [] : concernsFor(dept, o, cfg);
    const required = reasons.length > 0;
    if (s)
      return {
        ...base,
        required,
        reasons,
        state: s.disposition,
        position: s.position,
        resolved: true,
        note: s.disposition === "CONFIRMED" ? `Confirmed by ${p.name}` : s.disposition === "ADJUSTED" ? `${p.name} changed it to ${REC_WORD[s.position]}` : `Blocked by ${p.name}`,
      } as Lane;
    if (!required)
      return { ...base, required, reasons, state: "AUTO", position: o.recommendation, resolved: true, note: prohibited ? "Not needed: Legal prohibits this case" : "Cleared automatically: no concerns" } as Lane;
    const overdue = !!due && now > new Date(due).getTime();
    return {
      ...base,
      required,
      reasons,
      state: overdue ? "OVERDUE" : "PENDING",
      position: null,
      dueAt: due,
      resolved: false,
      escalated: overdue && dept !== "LEGAL",
      note: overdue ? `Overdue: ${p.name} has not signed off` : `Waiting on ${p.name}`,
    } as Lane;
  });
}

export function laneSummary(lanes: Lane[]) {
  const pending = lanes.filter((l) => l.state === "PENDING" || l.state === "OVERDUE");
  const analyzed = lanes.every((l) => l.state !== "NOT_STARTED");
  return {
    analyzed,
    cleared: lanes.filter((l) => l.resolved).length,
    pending,
    blocked: lanes.filter((l) => l.state === "BLOCKED" || l.state === "PROHIBITED"),
    adjusted: lanes.filter((l) => l.state === "ADJUSTED"),
    auto: lanes.filter((l) => l.state === "AUTO").length,
    ready: analyzed && pending.length === 0,
    /** the executive may decide now because every open lane is overdue and none is Legal */
    escalatable: analyzed && pending.length > 0 && pending.every((l) => l.escalated),
    legalOpen: pending.some((l) => l.dept === "LEGAL"),
  };
}

const SUPPORT = new Set<Recommendation>(["PROCEED", "PROCEED_WITH_CONDITIONS"]);
const capRisk = (r: RiskLevel, cap: RiskLevel): RiskLevel => {
  const order: RiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  return order[Math.min(order.indexOf(r), order.indexOf(cap))];
};

/** The agents' outputs as the departments actually signed them (human position wins; AI answer kept for the record). */
export function signedOutputs(outputs: AgentOutput[], lanes: Lane[]): AgentOutput[] {
  return outputs.map((o) => {
    const lane = lanes.find((l) => l.dept === o.agent_type);
    const s = lane?.signoff;
    if (!s) return o;
    const who = s.reviewer_name;
    const pos = s.position;
    const supportive = SUPPORT.has(pos);
    const out: AgentOutput = {
      ...o,
      recommendation: pos,
      confidence: s.disposition === "ADJUSTED" ? Math.round(o.confidence * 0.85 * 1000) / 1000 : o.confidence,
      conditions: [...new Set([...o.conditions, ...s.conditions])],
      valid: true,
      validation_issues: o.valid ? o.validation_issues : [...o.validation_issues, `Evidence gap accepted by ${who}.`],
      hard_constraint: s.disposition === "BLOCKED" ? `${who} blocked: ${s.condition_text ?? ""}`.trim() : supportive ? null : o.hard_constraint,
      risk_level: s.disposition === "BLOCKED" && o.agent_type === "LEGAL" ? "CRITICAL" : supportive && o.agent_type === "LEGAL" ? capRisk(o.risk_level, "MEDIUM") : o.risk_level,
    };
    if (!o.valid && s.disposition !== "BLOCKED") out.conditions = [...out.conditions, `${DEPT_NAME[o.agent_type]} evidence gap accepted by ${who}; refresh before scale-up.`];
    return out;
  });
}

/** Reconcile again using the signed positions, and say who did what in the gates. */
export function reconcileSigned(c: DecisionCase | null, outputs: AgentOutput[], lanes: Lane[], cfg: Thresholds, financialImpact: number): Reconciliation {
  const rec = reconcile(c as DecisionCase, signedOutputs(outputs, lanes), cfg, financialImpact);
  const legal = lanes.find((l) => l.dept === "LEGAL");
  const sum = laneSummary(lanes);
  const gates: Gate[] = rec.gates.map((g) => {
    if (g.key !== "LEGAL_REVIEW" || !legal) return g;
    if (legal.state === "PROHIBITED") return g;
    if (legal.state === "BLOCKED") return { ...g, status: "BLOCKED", detail: `Rejected by ${legal.lead.name}: ${legal.signoff?.condition_text ?? ""}` };
    if (legal.signoff)
      return {
        ...g,
        status: "CLEAR",
        detail: `${legal.signoff.position === "PROCEED" ? "Approved" : "Approved with conditions"} by ${legal.lead.name}${legal.signoff.condition_text ? `: ${legal.signoff.condition_text}` : ""}`,
      };
    if (legal.state === "PENDING" || legal.state === "OVERDUE") return { ...g, status: "PENDING", detail: `Waiting on ${legal.lead.name} (Legal) to sign off.` };
    return g;
  });
  const otherBlocks = sum.blocked.filter((l) => l.dept !== "LEGAL");
  const signGate: Gate = sum.pending.length
    ? {
        key: "SIGN_OFFS",
        label: "Department sign-off",
        status: "PENDING",
        detail: `${sum.cleared} of 4 cleared · waiting on ${sum.pending.map((l) => `${DEPT_NAME[l.dept]} (${l.lead.name}${l.state === "OVERDUE" ? ", overdue" : ""})`).join(", ")}.`,
      }
    : otherBlocks.length
      ? {
          key: "SIGN_OFFS",
          label: "Department sign-off",
          status: "WARNING",
          detail: `${otherBlocks.map((l) => `${DEPT_NAME[l.dept]} blocked (${l.lead.name})`).join(", ")}. The executive can overrule with a written reason.`,
        }
      : {
          key: "SIGN_OFFS",
          label: "Department sign-off",
          status: "CLEAR",
          detail: `All four departments cleared${sum.auto ? ` (${sum.auto} automatically)` : ""}${sum.adjusted.length ? `; ${sum.adjusted.map((l) => DEPT_NAME[l.dept]).join(", ")} adjusted the AI position` : ""}.`,
        };
  return { ...rec, gates: [signGate, ...gates], requires_legal_review: legal?.required ?? rec.requires_legal_review };
}
