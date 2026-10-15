import "server-only";
import { db } from "./db";
import { getThresholds } from "./repo";
import { computeLanes, laneSummary, reconcileSigned, type Lane, type LaneOutput, type Signoff } from "./signoff";
import type { AgentOutput, AgentType, Recommendation, Thresholds } from "./types";
import { AGENTS } from "./types";

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : "");

export function rowToOutput(o: Record<string, unknown>): AgentOutput {
  return {
    agent_type: o.agent_type as AgentType,
    recommendation: o.recommendation as Recommendation,
    confidence: Number(o.confidence),
    risk_level: o.risk_level as AgentOutput["risk_level"],
    evidence_ids: (o.evidence_ids as string[]) ?? [],
    key_metrics: (o.key_metrics as AgentOutput["key_metrics"]) ?? {},
    conditions: (o.conditions as string[]) ?? [],
    dissent_reason: (o.dissent_reason as string | null) ?? null,
    rationale: String(o.rationale ?? ""),
    provider: String(o.provider),
    model: String(o.model),
    latency_ms: o.latency_ms === null || o.latency_ms === undefined ? null : Number(o.latency_ms),
    valid: Boolean(o.valid),
    validation_issues: (o.validation_issues as string[]) ?? [],
    guardrail_adjustments: (o.guardrail_adjustments as string[]) ?? [],
    data_quality: (o.data_quality as AgentOutput["data_quality"]) ?? ({} as AgentOutput["data_quality"]),
    hard_constraint: (o.hard_constraint as string | null) ?? null,
  };
}

export function rowToSignoff(r: Record<string, unknown>): Signoff {
  return {
    review_id: Number(r.review_id),
    decision_id: String(r.decision_id),
    revision: Number(r.revision),
    department: r.department as AgentType,
    reviewer_name: String(r.reviewer_name),
    reviewer_role: String(r.reviewer_role),
    disposition: r.disposition as Signoff["disposition"],
    ai_recommendation: r.ai_recommendation as Recommendation,
    position: (r.position ?? r.ai_recommendation) as Recommendation,
    conditions: (r.conditions as string[]) ?? [],
    condition_text: (r.condition_text as string | null) ?? null,
    superseded: Boolean(r.superseded),
    created_at: iso(r.created_at),
  };
}

export const toLaneOutput = (o: Pick<AgentOutput, "recommendation" | "confidence" | "valid" | "risk_level" | "dissent_reason" | "rationale">): LaneOutput => ({
  recommendation: o.recommendation,
  confidence: o.confidence,
  valid: o.valid,
  risk_level: o.risk_level,
  reason: o.dissent_reason ?? o.rationale,
});

export function lanesFrom(outputs: Partial<Record<AgentType, AgentOutput>>, signoffs: Signoff[], cfg: Thresholds, analyzedAt: string | null): Lane[] {
  const outs = Object.fromEntries(Object.entries(outputs).map(([k, o]) => [k, toLaneOutput(o!)])) as Partial<Record<AgentType, LaneOutput>>;
  return computeLanes(outs, signoffs, cfg, analyzedAt);
}

/**
 * Recompute the case after anything changes (a run, a re-run, a sign-off):
 * lanes -> signed reconciliation -> packet columns -> status.
 */
export async function refreshCase(decisionId: string): Promise<{ lanes: Lane[]; status: string } | null> {
  const sql = db();
  const [[c], [pk], cfg] = await Promise.all([
    sql`select decision_id, status, revision from decision_cases where decision_id = ${decisionId}`,
    sql`select run_id, financial_impact, analyzed_at, created_at, final_decision from lighthouse_decisions where decision_id = ${decisionId}`,
    getThresholds(),
  ]);
  if (!c || !pk) return null;
  const [outRows, soRows] = await Promise.all([
    sql`select * from agent_outputs where run_id = ${pk.run_id}`,
    sql`select * from reviews where decision_id = ${decisionId} and revision = ${c.revision} and department is not null order by created_at`,
  ]);
  const outputs = Object.fromEntries(outRows.map((o) => [o.agent_type, rowToOutput(o)])) as Partial<Record<AgentType, AgentOutput>>;
  if (AGENTS.some((a) => !outputs[a])) return null;
  const signoffs = soRows.map(rowToSignoff);
  const lanes = lanesFrom(outputs, signoffs, cfg, iso(pk.analyzed_at ?? pk.created_at));
  const rec = reconcileSigned(null, AGENTS.map((a) => outputs[a]!), lanes, cfg, Number(pk.financial_impact ?? 0));
  const final = ["APPROVED", "REJECTED", "REVISION_REQUESTED"].includes(String(c.status));
  const status = final ? String(c.status) : laneSummary(lanes).ready ? "READY_FOR_DECISION" : "IN_REVIEW";
  await sql.transaction([
    sql`update lighthouse_decisions set synthesized_recommendation = ${rec.synthesized_recommendation}, lighthouse_confidence = ${rec.lighthouse_confidence},
          confidence_breakdown = ${JSON.stringify(rec.confidence_breakdown)}::jsonb, conflict_flag = ${rec.conflict_flag},
          conflict_severity = ${rec.conflict_severity}, conflicts = ${JSON.stringify(rec.conflicts)}::jsonb, gates = ${JSON.stringify(rec.gates)}::jsonb,
          risk_level = ${rec.risk_level}, conditions = ${rec.conditions}, requires_legal_review = ${rec.requires_legal_review},
          expedited_eligible = ${rec.expedited_eligible}, headline = ${rec.headline}
        where decision_id = ${decisionId}`,
    sql`update decision_cases set status = ${status}, updated_at = now() where decision_id = ${decisionId} and status <> ${status}`,
  ]);
  return { lanes, status };
}
