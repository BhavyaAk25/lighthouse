import "server-only";
import { lanesFrom, rowToOutput, rowToSignoff } from "./caseflow";
import { db } from "./db";
import { DEPT_OF, type Persona, type Role } from "./personas";
import { getThresholds } from "./repo";
import { DEPT_NAME, laneSummary, REC_WORD, type Lane } from "./signoff";
import type { AgentOutput, AgentType } from "./types";

/**
 * Single source of truth for "who has what" in the live pipeline.
 * Every screen (desk, Flow, badge, journey) reads from here, so counts always match.
 * Scope: the live demo pipeline (D-2026-*), i.e. the 12 demo cases plus any case created in the app.
 * The 4,988 historical cases are the ledger shown on the Dashboard and Decisions pages.
 */

export const ROLE_SHORT: Record<string, string> = {
  DECISION_OWNER: "Executive",
  LEGAL_REVIEWER: "Legal lead",
  FINANCE_REVIEWER: "Finance lead",
  SALES_REVIEWER: "Sales lead",
  OPERATIONS_REVIEWER: "Operations lead",
  ADMIN: "Administrator",
  AI: "AI agents",
  SYSTEM: "Lighthouse",
};

/** One-line description of what each demo case is about. */
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
  ai_rec: string | null;
  confidence: number | null;
  impact: number | null;
  final: string | null;
  decided_by: string | null;
  final_rationale: string | null;
  lanes: Lane[];
  about: string | null;
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : "");

export async function loadPipeline(): Promise<PipelineCase[]> {
  const sql = db();
  const [rows, cfg] = await Promise.all([
    sql`
    select c.decision_id, c.title, c.status, c.revision, c.created_by, c.updated_at, c.scenario_tag,
           l.run_id, l.synthesized_recommendation rec, l.ai_recommendation ai_rec, l.lighthouse_confidence confidence, l.financial_impact impact,
           l.final_decision, l.decided_by, l.final_rationale, coalesce(l.analyzed_at, l.created_at) analyzed_at
    from decision_cases c left join lighthouse_decisions l using (decision_id)
    where c.decision_id like 'D-2026-%'
    order by c.decision_id`,
    getThresholds(),
  ]);
  const runIds = rows.map((r) => r.run_id).filter(Boolean) as string[];
  const [outs, sos] = await Promise.all([
    runIds.length ? sql`select * from agent_outputs where run_id = any(${runIds})` : Promise.resolve([]),
    sql`select r.* from reviews r join decision_cases c on c.decision_id = r.decision_id and c.revision = r.revision
        where r.decision_id like 'D-2026-%' and r.department is not null order by r.created_at`,
  ]);
  return rows.map((r) => {
    const outputs = Object.fromEntries(outs.filter((o) => o.run_id === r.run_id).map((o) => [o.agent_type, rowToOutput(o)])) as Partial<Record<AgentType, AgentOutput>>;
    const signoffs = sos.filter((s) => s.decision_id === r.decision_id).map(rowToSignoff);
    return {
      decision_id: String(r.decision_id),
      title: String(r.title).replace(/ - /g, " · "),
      status: String(r.status),
      revision: Number(r.revision),
      owner: String(r.created_by),
      updated_at: iso(r.updated_at),
      rec: r.rec ? String(r.rec) : null,
      ai_rec: r.ai_rec ? String(r.ai_rec) : null,
      confidence: r.confidence === null ? null : Number(r.confidence),
      impact: r.impact === null ? null : Number(r.impact),
      final: r.final_decision ? String(r.final_decision) : null,
      decided_by: r.decided_by ? String(r.decided_by) : null,
      final_rationale: r.final_rationale ? String(r.final_rationale) : null,
      lanes: lanesFrom(r.run_id ? outputs : {}, signoffs, cfg, r.analyzed_at ? iso(r.analyzed_at) : null),
      about: SCENARIO[String(r.scenario_tag ?? "")] ?? null,
    };
  });
}

export interface WorkItem {
  c: PipelineCase;
  action: string; // what you do
  why: string; // why it is on your plate
  waitingOn?: string; // who has it, when it is someone else's turn
}

export interface MyWork {
  now: WorkItem[];
  waiting: WorkItem[];
  done: WorkItem[];
  /** how many of your agent's answers cleared without you (management by exception) */
  autoCleared: number;
}

const short = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const who = (ls: Lane[]) => ls.map((l) => `${DEPT_NAME[l.dept]} (${l.lead.name.split(" ")[0]})`).join(", ");

export const ACTIONS = {
  submit: "Submit for review",
  revise: "Revise the case",
  signoff: "Sign off",
  decide: "Make the decision",
  escalated: "Decide now",
} as const;

export function workFor(persona: Persona, pipeline: PipelineCase[]): MyWork {
  const now: WorkItem[] = [];
  const waiting: WorkItem[] = [];
  const done: WorkItem[] = [];
  let autoCleared = 0;
  const dept = DEPT_OF[persona.role];
  const exec = persona.role === "DECISION_OWNER";
  if (persona.role === "ADMIN") return { now, waiting, done, autoCleared };

  for (const c of pipeline) {
    const sum = laneSummary(c.lanes);
    const mine = c.owner === persona.name;
    const final = c.status === "APPROVED" || c.status === "REJECTED";

    // proposer duties
    if (mine && c.status === "DRAFT") {
      now.push({ c, action: ACTIONS.submit, why: `${c.about ? `${c.about}. ` : ""}Submitting runs all four agents.` });
      continue;
    }
    if (mine && c.status === "REVISION_REQUESTED") {
      now.push({ c, action: ACTIONS.revise, why: c.final_rationale ? `${c.decided_by ?? "The executive"} asked: “${short(c.final_rationale, 100)}”` : "The executive asked for changes." });
      continue;
    }

    if (exec) {
      if (c.status === "READY_FOR_DECISION") {
        const legal = c.lanes.find((l) => l.dept === "LEGAL");
        const blocks = sum.blocked.filter((l) => l.dept !== "LEGAL");
        const why =
          legal?.state === "PROHIBITED"
            ? "A Legal rule prohibits it, so it can only be rejected."
            : legal?.state === "BLOCKED"
              ? `${legal.lead.name} (Legal) rejected it, so it can only be rejected or revised.`
              : blocks.length
                ? `${who(blocks)} blocked it. You can overrule with a reason.`
                : `All four departments cleared. Lighthouse recommends ${REC_WORD[c.rec ?? ""] ?? "a decision"}.${sum.adjusted.length ? ` ${who(sum.adjusted)} changed the AI’s answer.` : ""}`;
        now.push({ c, action: ACTIONS.decide, why });
      } else if (c.status === "IN_REVIEW" && sum.escalatable) {
        now.push({ c, action: ACTIONS.escalated, why: `${who(sum.pending)} missed the sign-off deadline. You can decide without them.` });
      } else if (c.status === "IN_REVIEW") {
        waiting.push({ c, action: "", why: `${sum.cleared} of 4 departments cleared.`, waitingOn: who(sum.pending) });
      } else if (final && c.decided_by === persona.name) {
        done.push({ c, action: "", why: c.final === "APPROVED" ? "You approved it." : "You rejected it." });
      }
      continue;
    }

    // department lead duties
    const lane = dept ? c.lanes.find((l) => l.dept === dept) : undefined;
    if (lane && (lane.state === "PENDING" || lane.state === "OVERDUE") && !final) {
      const first = (lane.ai?.reason ?? "").split(/(?<=\.)\s/)[0];
      const detail = first ? `: ${short(first, 95)}` : ".";
      now.push({
        c,
        action: ACTIONS.signoff,
        why: `${cap(lane.reasons.join("; "))}${detail}${lane.state === "OVERDUE" ? (lane.dept === "LEGAL" ? " Overdue: approval stays locked until you sign." : " Overdue: Maya can now decide without you.") : ""}`,
      });
      continue;
    }
    if (lane?.signoff && lane.signoff.reviewer_name === persona.name) {
      const s = lane.signoff;
      done.push({
        c,
        action: "",
        why:
          dept === "LEGAL"
            ? s.disposition === "BLOCKED"
              ? "You rejected it."
              : s.position === "PROCEED"
                ? "You approved it."
                : "You approved it with conditions."
            : s.disposition === "CONFIRMED"
              ? "You confirmed your agent."
              : s.disposition === "ADJUSTED"
                ? `You changed it to ${REC_WORD[s.position]}.`
                : "You blocked it.",
      });
      continue;
    }
    if (lane?.state === "AUTO") autoCleared += 1;
    if (mine && (c.status === "IN_REVIEW" || c.status === "READY_FOR_DECISION"))
      waiting.push({
        c,
        action: "",
        why: c.status === "READY_FOR_DECISION" ? "All departments are done." : `${sum.cleared} of 4 departments cleared.`,
        waitingOn: c.status === "READY_FOR_DECISION" ? "Maya (Executive)" : who(sum.pending),
      });
    else if (mine && final) done.push({ c, action: "", why: `Your proposal was ${c.final === "APPROVED" ? "approved" : "rejected"}.` });
  }
  const rank = (a: string) => ({ [ACTIONS.decide]: 0, [ACTIONS.escalated]: 1, [ACTIONS.signoff]: 0, [ACTIONS.revise]: 2, [ACTIONS.submit]: 3 })[a] ?? 4;
  now.sort((a, b) => rank(a.action) - rank(b.action));
  return { now, waiting, done, autoCleared };
}

export async function myWorkCount(persona: Persona) {
  if (persona.role === "ADMIN") return 0;
  return workFor(persona, await loadPipeline()).now.length;
}

/** The handful of steps a person takes part in, phrased from their point of view. */
export function myProcess(role: Role): { label: string; you: boolean }[] {
  if (role === "DECISION_OWNER")
    return [
      { label: "A lead proposes a case; all four agents run", you: false },
      { label: "Leads sign off where their agent raised a concern", you: false },
      { label: "You approve, reject or send it back", you: true },
      { label: "Lighthouse seals it in the audit trail", you: false },
    ];
  if (role === "ADMIN")
    return [
      { label: "You maintain rules, thresholds and AI settings", you: true },
      { label: "Leads and the executive decide within them", you: false },
      { label: "You verify the audit trail", you: true },
    ];
  const d = DEPT_OF[role]!;
  const name = DEPT_NAME[d];
  return [
    { label: role === "SALES_REVIEWER" ? "You propose a promotion; all four agents run" : "A case is proposed; all four agents run", you: role === "SALES_REVIEWER" },
    { label: `Your ${name} agent analyzes it`, you: false },
    {
      label: d === "LEGAL" ? "If it flags a rule, you approve or reject. Your rejection is final" : "If it raises a concern, you confirm, adjust or block",
      you: true,
    },
    { label: "Maya decides, seeing your sign-off", you: false },
  ];
}
