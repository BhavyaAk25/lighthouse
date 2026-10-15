import "server-only";
import { db } from "./db";
import type { Persona, Role } from "./personas";
import type { AgentType } from "./types";

export const REVIEWER_AGENT: Partial<Record<Role, AgentType>> = {
  FINANCE_REVIEWER: "FINANCE",
  SALES_REVIEWER: "SALES",
  OPERATIONS_REVIEWER: "OPERATIONS",
};

export interface DeskItem {
  decision_id: string;
  revision: number;
  owner: string;
  requires_legal: boolean | null;
  title: string;
  status: string;
  rec: string | null;
  confidence: number | null;
  impact: number | null;
  note: string | null;
  updated_at: string;
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ""));
const map = (rows: Record<string, unknown>[]): DeskItem[] =>
  rows.map((r) => ({
    decision_id: String(r.decision_id),
    revision: Number(r.revision ?? 1),
    owner: String(r.created_by ?? "Maya Chen"),
    requires_legal: r.requires_legal_review === null || r.requires_legal_review === undefined ? null : Boolean(r.requires_legal_review),
    title: String(r.title),
    status: String(r.status),
    rec: r.rec ? String(r.rec) : null,
    confidence: r.confidence === null || r.confidence === undefined ? null : Number(r.confidence),
    impact: r.impact === null || r.impact === undefined ? null : Number(r.impact),
    note: r.note ? String(r.note) : null,
    updated_at: iso(r.updated_at),
  }));

/** Items for the Decision Owner: ready to decide, to analyze, and waiting on Legal. */
export async function ownerDesk(owner: string) {
  const sql = db();
  const [ready, toRun, waiting] = await Promise.all([
    sql`select c.decision_id, c.title, c.status, c.updated_at, c.revision, c.created_by, l.requires_legal_review, l.synthesized_recommendation rec, l.lighthouse_confidence confidence,
               l.financial_impact impact, l.headline note
        from decision_cases c join lighthouse_decisions l using (decision_id)
        where c.status = 'READY_FOR_DECISION' and c.created_by = ${owner}
        order by (c.decision_id like 'D-2026-%') desc, c.updated_at desc limit 6`,
    sql`select c.decision_id, c.title, c.status, c.updated_at, c.revision, c.created_by, null::boolean requires_legal_review, null rec, null confidence, null impact,
               case when c.status = 'REVISION_REQUESTED' then 'Revision requested' else null end note
        from decision_cases c
        where (c.decision_id like 'D-2026-%') and c.status in ('DRAFT','REVISION_REQUESTED')
        order by c.decision_id limit 20`,
    sql`select c.decision_id, c.title, c.status, c.updated_at, c.revision, c.created_by, l.requires_legal_review, l.synthesized_recommendation rec, l.lighthouse_confidence confidence,
               l.financial_impact impact, null note
        from decision_cases c join lighthouse_decisions l using (decision_id)
        where c.status = 'AWAITING_LEGAL_REVIEW' and c.created_by = ${owner}
        order by (c.decision_id like 'D-2026-%') desc, c.updated_at desc limit 5`,
  ]);
  const [{ ready_n, waiting_n }] = await sql`select count(*) filter (where status = 'READY_FOR_DECISION')::int ready_n,
                                                    count(*) filter (where status = 'AWAITING_LEGAL_REVIEW')::int waiting_n
                                             from decision_cases where created_by = ${owner}`;
  return { ready: map(ready), toRun: map(toRun), waiting: map(waiting), readyCount: Number(ready_n), waitingCount: Number(waiting_n) };
}

/** Items for Legal: cases the Legal agent gated, with the top triggered rule. */
export async function legalDesk() {
  const sql = db();
  const [todo, upstream] = await Promise.all([
    sql`select c.decision_id, c.title, c.status, c.updated_at, c.revision, c.created_by, l.requires_legal_review, l.synthesized_recommendation rec, l.lighthouse_confidence confidence, l.financial_impact impact,
               (select o.key_metrics->>'top_rule' from agent_outputs o where o.run_id = l.run_id and o.agent_type = 'LEGAL' limit 1) note
        from decision_cases c join lighthouse_decisions l using (decision_id)
        where c.status = 'AWAITING_LEGAL_REVIEW'
        order by (c.decision_id like 'D-2026-%') desc, c.updated_at desc limit 25`,
    sql`select count(*)::int n from decision_cases where decision_id like 'D-2026-%' and status = 'DRAFT'`,
  ]);
  const [{ n }] = await sql`select count(*)::int n from decision_cases where status = 'AWAITING_LEGAL_REVIEW'`;
  return { todo: map(todo), total: Number(n), upstream: Number(upstream[0].n) };
}

/** Items for a functional reviewer: open packets where their agent dissented or set conditions. */
export async function reviewerDesk(persona: Persona) {
  const agent = REVIEWER_AGENT[persona.role]!;
  const sql = db();
  const todo = await sql`
    select c.decision_id, c.title, c.status, c.updated_at, c.revision, c.created_by, l.requires_legal_review, o.recommendation rec, o.confidence, l.financial_impact impact,
           coalesce(o.dissent_reason, o.rationale) note
    from decision_cases c join lighthouse_decisions l using (decision_id)
    join agent_outputs o on o.run_id = l.run_id and o.agent_type = ${agent}
    where c.status in ('READY_FOR_DECISION','AWAITING_LEGAL_REVIEW')
      and o.recommendation <> 'PROCEED'
      and not exists (select 1 from reviews r where r.decision_id = c.decision_id and r.revision = c.revision and r.reviewer_name = ${persona.name})
    order by (c.decision_id like 'D-2026-%') desc, (o.recommendation in ('HOLD','REJECT','REVIEW_REQUIRED')) desc, c.updated_at desc limit 20`;
  const [{ n }] = await sql`select count(*)::int n from decision_cases where decision_id like 'D-2026-%' and status = 'DRAFT'`;
  return { agent, todo: map(todo), upstream: Number(n) };
}

export async function deskCount(persona: Persona): Promise<number> {
  const sql = db();
  if (persona.role === "DECISION_OWNER") {
    const [{ n }] = await sql`select count(*)::int n from decision_cases where created_by = ${persona.name}
      and (status = 'READY_FOR_DECISION' or (decision_id like 'D-2026-%' and status in ('DRAFT','REVISION_REQUESTED')))`;
    return Number(n);
  }
  if (persona.role === "LEGAL_REVIEWER") {
    const [{ n }] = await sql`select count(*)::int n from decision_cases where status = 'AWAITING_LEGAL_REVIEW'`;
    return Number(n);
  }
  const agent = REVIEWER_AGENT[persona.role];
  if (!agent) return 0;
  const [{ n }] = await sql`select count(*)::int n from decision_cases c join lighthouse_decisions l using (decision_id)
    join agent_outputs o on o.run_id = l.run_id and o.agent_type = ${agent}
    where c.status in ('READY_FOR_DECISION','AWAITING_LEGAL_REVIEW') and o.recommendation <> 'PROCEED'
      and not exists (select 1 from reviews r where r.decision_id = c.decision_id and r.revision = c.revision and r.reviewer_name = ${persona.name})`;
  return Number(n);
}
