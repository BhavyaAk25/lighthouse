import "server-only";
import { db } from "./db";
import type { AgentOutput, AgentType, Conflict, EvidenceItem, Gate, Recommendation, RiskLevel } from "./types";

export interface PacketView {
  run_id: string;
  synthesized_recommendation: Recommendation;
  lighthouse_confidence: number;
  confidence_breakdown: Record<string, number>;
  conflict_flag: boolean;
  conflict_severity: string;
  conflicts: Conflict[];
  gates: Gate[];
  risk_level: RiskLevel;
  conditions: string[];
  summary: string;
  summary_provider: string;
  headline: string;
  narrative: { headline?: string; summary?: string; decisive_factors?: string[]; dissent_summary?: string; next_steps?: string[]; provider?: string; model?: string };
  financial_impact: number;
  requires_legal_review: boolean;
  expedited_eligible: boolean;
  owner: string;
  approval_status: string;
  final_decision: string | null;
  final_rationale: string | null;
  decided_by: string | null;
  decided_at: string | null;
  override_flag: boolean;
  created_at: string;
}

export interface ReviewView {
  review_id: number;
  revision: number;
  reviewer_role: string;
  reviewer_name: string;
  disposition: string;
  condition_text: string | null;
  created_at: string;
}

export interface AuditView {
  seq: number;
  ts: string;
  actor: string;
  role: string;
  action: string;
  decision_id: string | null;
  payload: Record<string, unknown>;
  hash: string;
  prev_hash: string;
}

export interface RunView {
  run_id: string;
  mode: string;
  started_at: string;
  duration_ms: number | null;
  provider_summary: string | null;
  started_by: string;
  revision: number;
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : "");

export async function loadDecisionBundle(id: string) {
  const sql = db();
  const [packetRow] = await sql`select * from lighthouse_decisions where decision_id = ${id}`;
  const runRows = await sql`select * from agent_runs where decision_id = ${id} and status = 'COMPLETED' order by started_at desc limit 10`;
  const runId = packetRow ? String(packetRow.run_id) : runRows[0] ? String(runRows[0].run_id) : null;
  const [outs, ev, reviews, audit] = await Promise.all([
    runId ? sql`select * from agent_outputs where run_id = ${runId}` : Promise.resolve([]),
    runId ? sql`select * from evidence where run_id = ${runId} order by evidence_id` : Promise.resolve([]),
    sql`select * from reviews where decision_id = ${id} order by created_at`,
    sql`select seq, ts, actor, role, action, decision_id, payload, hash, prev_hash from audit_log where decision_id = ${id} order by seq`,
  ]);
  const outputs = Object.fromEntries(
    outs.map((o) => [
      o.agent_type,
      {
        agent_type: o.agent_type,
        recommendation: o.recommendation,
        confidence: Number(o.confidence),
        risk_level: o.risk_level,
        evidence_ids: o.evidence_ids,
        key_metrics: o.key_metrics,
        conditions: o.conditions,
        dissent_reason: o.dissent_reason,
        rationale: o.rationale,
        provider: o.provider,
        model: o.model,
        latency_ms: o.latency_ms,
        valid: o.valid,
        validation_issues: o.validation_issues,
        guardrail_adjustments: o.guardrail_adjustments,
        data_quality: o.data_quality,
      } as AgentOutput,
    ]),
  ) as Partial<Record<AgentType, AgentOutput>>;
  const evidence: EvidenceItem[] = ev.map((e) => ({
    evidence_id: String(e.evidence_id),
    agent_type: e.agent_type as AgentType,
    label: String(e.label),
    value: e.value,
    unit: e.unit ?? undefined,
    source: String(e.source),
    provenance: e.provenance,
    as_of: e.as_of ? iso(e.as_of).slice(0, 10) : null,
  }));
  const packet: PacketView | null = packetRow
    ? ({
        ...packetRow,
        lighthouse_confidence: Number(packetRow.lighthouse_confidence),
        financial_impact: Number(packetRow.financial_impact),
        decided_at: packetRow.decided_at ? iso(packetRow.decided_at) : null,
        created_at: iso(packetRow.created_at),
      } as unknown as PacketView)
    : null;
  return {
    packet,
    outputs,
    evidence,
    runs: runRows.map((r) => ({
      run_id: String(r.run_id),
      mode: String(r.mode),
      started_at: iso(r.started_at),
      duration_ms: r.duration_ms === null ? null : Number(r.duration_ms),
      provider_summary: r.provider_summary ? String(r.provider_summary) : null,
      started_by: String(r.started_by),
      revision: Number(r.revision),
    })) as RunView[],
    reviews: reviews.map((r) => ({ ...r, review_id: Number(r.review_id), revision: Number(r.revision), created_at: iso(r.created_at) })) as unknown as ReviewView[],
    audit: audit.map((a) => ({ ...a, seq: Number(a.seq), ts: iso(a.ts) })) as unknown as AuditView[],
  };
}
