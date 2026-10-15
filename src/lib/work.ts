import "server-only";
import { db } from "./db";
import type { Persona, Role } from "./personas";
import type { AgentType } from "./types";

/**
 * Single source of truth for "who has what" in the live pipeline.
 * Every screen (desk, Flow, badge, journey) reads from here, so counts always match.
 * Scope: the live demo pipeline (D-2026-*), i.e. the 12 demo cases plus any case created in the app.
 * The 4,988 historical cases are the ledger shown on the Dashboard and Decisions pages.
 */

export const ROLE_SHORT: Record<string, string> = {
  DECISION_OWNER: "Decision owner",
  LEGAL_REVIEWER: "Legal",
  FINANCE_REVIEWER: "Finance reviewer",
  SALES_REVIEWER: "Commercial reviewer",
  OPERATIONS_REVIEWER: "Operations reviewer",
  ADMIN: "Administrator",
  AI: "AI agents",
  SYSTEM: "Lighthouse",
};

export const AGENT_FOR: Partial<Record<Role, AgentType>> = {
  FINANCE_REVIEWER: "FINANCE",
  SALES_REVIEWER: "SALES",
  OPERATIONS_REVIEWER: "OPERATIONS",
};
const AGENT_NAME: Record<AgentType, string> = { SALES: "Sales", FINANCE: "Finance", OPERATIONS: "Operations", LEGAL: "Legal" };
const REC_WORD: Record<string, string> = {
  PROCEED: "proceed",
  PROCEED_WITH_CONDITIONS: "proceed with conditions",
  HOLD: "hold",
  REJECT: "reject",
  REVIEW_REQUIRED: "review required",
};

/** One-line description of what each demo case is about (shown before it is analyzed). */
export const SCENARIO: Record<string, string> = {
  ANCHOR_LEGAL_GATE: "Big OTC promotion with a “clinically proven” claim",
  COMPLETE_AGREEMENT: "Small, supplier-funded pantry rollback",
  FINANCE_VS_SALES: "Deep 28% discount: strong demand, thin margin",
  OPS_HARD_STOP: "Urgent BOGO that launches in 3 days",
  LEGAL_PROHIBITED: "Hard seltzer BOGO in Texas",
  MISSING_EVIDENCE: "Electronics in a region with an inventory feed outage",
  STALE_EVIDENCE: "Deli endcap using 18-day-old evidence",
  LOW_CONFIDENCE: "Tiny 3-store test in a new category",
  REJECT_CANDIDATE: "50% clearance on apparel",
  PRIVACY_AND_CLAIMS: "Beauty coupon with a skin-repair claim in California",
  SUPPLIER_EXCLUSIVITY: "8-week supplier-funded endcap in every store",
  INVENTORY_MOVE: "Move 6,000 TVs before the holidays",
  USER_CREATED: "Created in the app",
};

export interface PipelineCase {
  decision_id: string;
  title: string;
  status: string;
  revision: number;
  owner: string;
  updated_at: string;
  rec: string | null;
  confidence: number | null;
  impact: number | null;
  requires_legal: boolean | null;
  final: string | null;
  legal_disposition: string | null;
  top_rule: string | null;
  agents: Partial<Record<AgentType, { rec: string; reason: string }>>;
  noted_by: string[];
  about: string | null;
}

export async function loadPipeline(): Promise<PipelineCase[]> {
  const sql = db();
  const rows = await sql`
    select c.decision_id, c.title, c.status, c.revision, c.created_by, c.updated_at, c.scenario_tag,
           l.run_id, l.synthesized_recommendation rec, l.lighthouse_confidence confidence, l.financial_impact impact,
           l.requires_legal_review, l.final_decision,
           (select r.disposition from reviews r where r.decision_id = c.decision_id and r.revision = c.revision and r.reviewer_role = 'LEGAL_REVIEWER'
              order by r.created_at desc limit 1) legal_disposition,
           (select array_agg(r.reviewer_name) from reviews r where r.decision_id = c.decision_id and r.revision = c.revision) noted_by
    from decision_cases c left join lighthouse_decisions l using (decision_id)
    where c.decision_id like 'D-2026-%'
    order by c.decision_id`;
  const runIds = rows.map((r) => r.run_id).filter(Boolean) as string[];
  const outs = runIds.length
    ? await sql`select run_id, agent_type, recommendation, coalesce(dissent_reason, rationale) reason, key_metrics->>'top_rule' top_rule
                from agent_outputs where run_id = any(${runIds})`
    : [];
  return rows.map((r) => {
    const mine = outs.filter((o) => o.run_id === r.run_id);
    const agents: PipelineCase["agents"] = {};
    for (const o of mine) agents[o.agent_type as AgentType] = { rec: String(o.recommendation), reason: String(o.reason ?? "") };
    return {
      decision_id: String(r.decision_id),
      title: String(r.title).replace(/ - /g, " · "),
      status: String(r.status),
      revision: Number(r.revision),
      owner: String(r.created_by),
      updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
      rec: r.rec ? String(r.rec) : null,
      confidence: r.confidence === null ? null : Number(r.confidence),
      impact: r.impact === null ? null : Number(r.impact),
      requires_legal: r.requires_legal_review === null ? null : Boolean(r.requires_legal_review),
      final: r.final_decision ? String(r.final_decision) : null,
      legal_disposition: r.legal_disposition ? String(r.legal_disposition) : null,
      top_rule: (mine.find((o) => o.agent_type === "LEGAL")?.top_rule as string) ?? null,
      agents,
      noted_by: ((r.noted_by as string[]) ?? []).filter(Boolean),
      about: SCENARIO[String(r.scenario_tag ?? "")] ?? null,
    };
  });
}

export interface WorkItem {
  c: PipelineCase;
  action: string; // what you do
  why: string; // why it is on your plate
  waitingOn?: string; // role · name, when it is someone else's turn
}

export interface MyWork {
  now: WorkItem[];
  waiting: WorkItem[];
  done: WorkItem[];
}

const short = (s: string, n = 110) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function workFor(persona: Persona, pipeline: PipelineCase[]): MyWork {
  const now: WorkItem[] = [];
  const waiting: WorkItem[] = [];
  const done: WorkItem[] = [];
  const agent = AGENT_FOR[persona.role];

  for (const c of pipeline) {
    const legalWho = "Legal · Priya Raman";
    const ownerWho = `Decision owner · ${c.owner}`;
    if (persona.role === "DECISION_OWNER") {
      if (c.owner !== persona.name) continue;
      if (c.status === "DRAFT") now.push({ c, action: "Run the agents", why: c.revision > 1 ? `Revision ${c.revision} is ready to analyze.` : c.about ? `${c.about}. Not analyzed yet.` : "Not analyzed yet." });
      else if (c.status === "REVISION_REQUESTED") now.push({ c, action: "Revise the case", why: "You asked for a revision. Change the terms, then run the agents again." });
      else if (c.status === "READY_FOR_DECISION")
        now.push({
          c,
          action: "Make the decision",
          why: `Lighthouse recommends ${REC_WORD[c.rec ?? ""] ?? "a decision"}.${c.legal_disposition ? ` Legal ${c.legal_disposition === "APPROVED" ? "approved" : "approved with conditions"}.` : ""}`,
        });
      else if (c.status === "AWAITING_LEGAL_REVIEW")
        waiting.push({ c, action: "", why: `The Legal agent flagged ${c.top_rule ? `“${c.top_rule}”` : "a rule"}. You can decide once Legal records a disposition.`, waitingOn: legalWho });
      else done.push({ c, action: "", why: c.final === "APPROVED" ? "You approved it." : "You rejected it." });
    } else if (persona.role === "LEGAL_REVIEWER") {
      if (c.status === "AWAITING_LEGAL_REVIEW") now.push({ c, action: "Review the claim", why: `The Legal agent flagged ${c.top_rule ? `“${c.top_rule}”` : "a rule that needs a lawyer"}. Approval is locked until you decide.` });
      else if (c.status === "DRAFT" || c.status === "REVISION_REQUESTED")
        waiting.push({ c, action: "", why: "Not analyzed yet. If the Legal agent flags a risk, it comes to you.", waitingOn: ownerWho });
      else if (c.legal_disposition) done.push({ c, action: "", why: `You recorded: ${c.legal_disposition.replace(/_/g, " ").toLowerCase()}.` });
    } else if (agent) {
      const a = c.agents[agent];
      const concern = a && ["HOLD", "REJECT", "REVIEW_REQUIRED"].includes(a.rec);
      const noted = c.noted_by.includes(persona.name);
      if ((c.status === "READY_FOR_DECISION" || c.status === "AWAITING_LEGAL_REVIEW") && concern && !noted)
        now.push({ c, action: "Give your view", why: `The ${AGENT_NAME[agent]} agent says ${REC_WORD[a.rec]}: ${short(a.reason)}` });
      else if (c.status === "DRAFT" || c.status === "REVISION_REQUESTED")
        waiting.push({ c, action: "", why: `Not analyzed yet. If the ${AGENT_NAME[agent]} agent raises a concern, it comes to you.`, waitingOn: ownerWho });
      else if (noted) done.push({ c, action: "", why: "You added your view." });
    }
  }
  const rank = (a: string) => (a === "Make the decision" ? 0 : a === "Revise the case" ? 1 : a === "Review the claim" || a === "Give your view" ? 0 : 2);
  now.sort((a, b) => rank(a.action) - rank(b.action));
  return { now, waiting, done };
}

export async function myWorkCount(persona: Persona) {
  if (persona.role === "ADMIN") return 0;
  return workFor(persona, await loadPipeline()).now.length;
}

/** The handful of steps a person takes part in, phrased from their point of view. */
export function myProcess(role: Role): { label: string; you: boolean }[] {
  if (role === "DECISION_OWNER")
    return [
      { label: "You open a case and run the agents", you: true },
      { label: "Legal reviews anything the Legal agent flags", you: false },
      { label: "You approve, reject or ask for a revision", you: true },
      { label: "Lighthouse seals it in the audit trail", you: false },
    ];
  if (role === "LEGAL_REVIEWER")
    return [
      { label: "The decision owner runs the agents", you: false },
      { label: "The Legal agent flags risky claims or terms", you: false },
      { label: "You approve, approve with conditions, or reject", you: true },
      { label: "The decision owner makes the final call", you: false },
    ];
  if (role === "ADMIN")
    return [
      { label: "You maintain rules and thresholds", you: true },
      { label: "Agents and people decide within them", you: false },
      { label: "You verify the audit trail", you: true },
    ];
  const name = role === "FINANCE_REVIEWER" ? "Finance" : role === "SALES_REVIEWER" ? "Sales" : "Operations";
  return [
    { label: "The decision owner runs the agents", you: false },
    { label: `The ${name} agent raises a concern`, you: false },
    { label: "You confirm or challenge it with a short note", you: true },
    { label: "The decision owner decides, seeing your note", you: false },
  ];
}
