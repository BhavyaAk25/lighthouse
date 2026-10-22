import "server-only";
import { cookies } from "next/headers";
import { db } from "./db";
import type { Persona } from "./personas";

export interface ActivityItem {
  seq: number;
  ts: string;
  decision_id: string;
  actor: string;
  text: string;
}

const DEPT: Record<string, string> = { SALES: "Sales", FINANCE: "Finance", OPERATIONS: "Operations", LEGAL: "Legal" };
const word = (s: unknown) => String(s ?? "").replace(/_/g, " ").toLowerCase();
const first = (n: string) => n.split(" ")[0];

function describe(action: string, actor: string, id: string, p: Record<string, unknown>): string | null {
  const who = first(actor);
  switch (action) {
    case "AGENTS_RUN_COMPLETED":
      return `${who} submitted ${id}; all four agents ran`;
    case "AGENT_RERUN_COMPLETED":
      return `${who} re-ran the ${DEPT[String(p.agent)] ?? ""} agent on ${id}`;
    case "DEPARTMENT_SIGNOFF_RECORDED": {
      const d = String(p.department);
      if (d === "LEGAL")
        return p.signoff === "BLOCKED" ? `${who} rejected ${id} on legal grounds` : `${who} approved ${id}${p.position === "PROCEED" ? "" : " with conditions"} (Legal)`;
      if (p.signoff === "CONFIRMED") return `${who} confirmed the ${DEPT[d]} agent on ${id}`;
      if (p.signoff === "BLOCKED") return `${who} blocked ${id} for ${DEPT[d]}`;
      return `${who} changed ${DEPT[d]} on ${id} from ${word(p.ai_recommendation)} to ${word(p.position)}`;
    }
    case "DECISION_RECORDED":
    case "DECISION_OVERRIDE_RECORDED":
      return p.decision === "REVISION_REQUESTED"
        ? `${who} sent ${id} back for changes`
        : `${who} ${p.decision === "APPROVED" ? "approved" : "rejected"} ${id}${p.override ? " (override, with a reason)" : ""}`;
    case "CASE_REVISED":
      return `${who} revised ${id} (revision ${p.revision})`;
    case "CASE_CREATED":
      return `${who} proposed ${id}`;
    default:
      return null;
  }
}

const COOKIE = (id: string) => `lh_seen_${id}`;

/** What other people did on the live cases since this person last opened their desk. */
export async function activitySince(persona: Persona): Promise<{ items: ActivityItem[]; head: number }> {
  const jar = await cookies();
  const seen = Number(jar.get(COOKIE(persona.id))?.value ?? 0) || 0;
  const sql = db();
  const [{ reset, head }] = await sql`select coalesce((select max(seq) from audit_log where action = 'DEMO_CASES_RESET'), 0)::bigint reset,
                                             (select max(seq) from audit_log)::bigint head`;
  const from = Math.max(seen, Number(reset));
  const rows = await sql`select seq, ts, actor, action, decision_id, payload from audit_log
    where seq > ${from} and decision_id like 'D-2026-%' and actor <> ${persona.name} and actor <> 'Lighthouse'
      and action in ('AGENTS_RUN_COMPLETED','AGENT_RERUN_COMPLETED','DEPARTMENT_SIGNOFF_RECORDED','DECISION_RECORDED','DECISION_OVERRIDE_RECORDED','CASE_REVISED','CASE_CREATED')
    order by seq desc limit 6`;
  const items = rows
    .map((r) => {
      const text = describe(String(r.action), String(r.actor), String(r.decision_id), (r.payload ?? {}) as Record<string, unknown>);
      return text ? { seq: Number(r.seq), ts: r.ts instanceof Date ? r.ts.toISOString() : String(r.ts), decision_id: String(r.decision_id), actor: String(r.actor), text } : null;
    })
    .filter(Boolean) as ActivityItem[];
  return { items, head: Number(head) };
}

export const seenCookieName = COOKIE;
