import "server-only";
import { db } from "./db";
import { REVIEWER_AGENT } from "./desk";
import type { Persona } from "./personas";

export type StageKey = "analyze" | "legal" | "decide" | "sealed";

export interface FlowItem {
  decision_id: string;
  title: string;
  status: string;
  rec: string | null;
  confidence: number | null;
  note: string | null;
  mine: boolean; // the viewer must act on this card
  action: string | null; // CTA label when mine
  waitingOn: string | null;
  href: string;
  final: string | null;
}

export interface FlowStage {
  key: StageKey;
  label: string;
  owner: string;
  ownerRole: string;
  verb: string;
  count: number;
  mineCount: number;
  items: FlowItem[];
}

const STAGE_OF: Record<string, StageKey> = {
  DRAFT: "analyze",
  REVISION_REQUESTED: "analyze",
  AWAITING_LEGAL_REVIEW: "legal",
  READY_FOR_DECISION: "decide",
  APPROVED: "sealed",
  REJECTED: "sealed",
};

/** The whole pipeline as the viewer sees it: every stage, who owns it, and which cards are theirs to act on. */
export async function loadFlow(persona: Persona) {
  const sql = db();
  const agent = REVIEWER_AGENT[persona.role] ?? null;
  const owner = persona.role === "DECISION_OWNER" ? persona.name : "Maya Chen";
  // Demo + user-created cases always; plus the viewer's own live queue from the wider ledger.
  const rows = await sql`
    with base as (
      select c.decision_id, c.title, c.status, c.updated_at, c.created_by, c.revision,
             l.synthesized_recommendation rec, l.lighthouse_confidence confidence, l.final_decision final, l.headline,
             (select o.key_metrics->>'top_rule' from agent_outputs o where o.run_id = l.run_id and o.agent_type = 'LEGAL' limit 1) top_rule,
             ${agent}::text as my_agent,
             (select o.recommendation from agent_outputs o where o.run_id = l.run_id and o.agent_type = ${agent ?? "NONE"} limit 1) my_agent_rec,
             (select coalesce(o.dissent_reason, o.rationale) from agent_outputs o where o.run_id = l.run_id and o.agent_type = ${agent ?? "NONE"} limit 1) my_agent_note,
             exists (select 1 from reviews r where r.decision_id = c.decision_id and r.revision = c.revision and r.reviewer_name = ${persona.name}) i_reviewed,
             (c.decision_id like 'D-2026-%') demo
      from decision_cases c left join lighthouse_decisions l using (decision_id)
    )
    select * from (
      select *, row_number() over (partition by status order by demo desc, updated_at desc) rn from base
      where demo
         or (status = 'AWAITING_LEGAL_REVIEW')
         or (status = 'READY_FOR_DECISION' and created_by = ${owner})
         or (status in ('APPROVED','REJECTED') and created_by = ${owner})
    ) x where rn <= 8 order by demo desc, updated_at desc`;
  const counts = await sql`
    select status, count(*)::int n from decision_cases
    where decision_id like 'D-2026-%' or status = 'AWAITING_LEGAL_REVIEW' or (status = 'READY_FOR_DECISION' and created_by = ${owner})
    group by status`;
  const countOf = (keys: string[]) => counts.filter((c) => keys.includes(String(c.status))).reduce((s, c) => s + Number(c.n), 0);

  const stages: FlowStage[] = [
    { key: "analyze", label: "Agents analyze", owner: owner, ownerRole: "DECISION_OWNER", verb: "Run agents", count: countOf(["DRAFT", "REVISION_REQUESTED"]), mineCount: 0, items: [] },
    { key: "legal", label: "Legal review", owner: "Priya Raman", ownerRole: "LEGAL_REVIEWER", verb: "Review", count: countOf(["AWAITING_LEGAL_REVIEW"]), mineCount: 0, items: [] },
    { key: "decide", label: "Decision", owner: owner, ownerRole: "DECISION_OWNER", verb: "Decide", count: countOf(["READY_FOR_DECISION"]), mineCount: 0, items: [] },
    { key: "sealed", label: "Sealed", owner: "Lighthouse", ownerRole: "SYSTEM", verb: "View", count: 0, mineCount: 0, items: [] },
  ];
  const byKey = Object.fromEntries(stages.map((s) => [s.key, s])) as Record<StageKey, FlowStage>;

  for (const r of rows) {
    const key = STAGE_OF[String(r.status)];
    if (!key) continue;
    const stage = byKey[key];
    if (key === "sealed" && stage.items.length >= 6) continue;
    let mine = false;
    let action: string | null = null;
    if (persona.role === "DECISION_OWNER" && (key === "analyze" || key === "decide") && r.created_by === persona.name) {
      mine = true;
      action = key === "analyze" ? (r.status === "REVISION_REQUESTED" ? "Revise" : "Run agents") : "Decide";
    }
    if (persona.role === "LEGAL_REVIEWER" && key === "legal") {
      mine = true;
      action = "Review";
    }
    if (agent && (key === "decide" || key === "legal") && r.my_agent_rec && r.my_agent_rec !== "PROCEED" && !r.i_reviewed) {
      mine = true;
      action = "Validate";
    }
    const waitingOn = mine || key === "sealed" ? null : key === "legal" ? "Priya Raman" : String(r.created_by);
    const note =
      key === "legal" && r.top_rule
        ? `Flagged: ${r.top_rule}`
        : agent && r.my_agent_note && mine
          ? String(r.my_agent_note)
          : key === "sealed"
            ? null
            : r.headline
              ? String(r.headline)
              : null;
    stage.items.push({
      decision_id: String(r.decision_id),
      title: String(r.title).replace(/ - /g, " · "),
      status: String(r.status),
      rec: r.rec ? String(r.rec) : null,
      confidence: r.confidence === null ? null : Number(r.confidence),
      note,
      mine,
      action,
      waitingOn,
      href: `/decisions/${r.decision_id}${mine ? "#act" : ""}`,
      final: r.final ? String(r.final) : null,
    });
    if (mine) stage.mineCount += 1;
  }
  byKey.sealed.count = byKey.sealed.items.length;
  // stages the viewer owns: every case there is theirs, not just the cards shown
  for (const st of stages) {
    const owns = (st.owner === persona.name && st.key !== "sealed") || (st.key === "legal" && persona.role === "LEGAL_REVIEWER");
    if (owns) st.mineCount = st.count;
  }
  // put the viewer's cards first in every column
  for (const s of stages) s.items.sort((a, b) => Number(b.mine) - Number(a.mine));
  return stages;
}
