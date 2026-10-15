import "./env";
import { appendAudit } from "@/lib/audit";
import { refreshCase } from "@/lib/caseflow";
import { db } from "@/lib/db";

/**
 * Plays the middle of the class demo without clicking: Priya approves D-2026-001 with conditions and
 * David changes Finance on D-2026-003 to "proceed with conditions". Used to prepare guide screenshots.
 * `npx tsx --conditions=react-server scripts/demo-signoffs.ts`
 */
const SIGN = [
  { id: "D-2026-001", dept: "LEGAL", name: "Priya Raman", role: "LEGAL_REVIEWER", kind: "CONFIRMED", pos: "PROCEED_WITH_CONDITIONS",
    note: "No substantiation file on record. Approve only with the revised claim wording.", conds: ["Replace “clinically proven” with “relieves cold & flu symptoms”."] },
  { id: "D-2026-003", dept: "FINANCE", name: "David Okafor", role: "FINANCE_REVIEWER", kind: "ADJUSTED", pos: "PROCEED_WITH_CONDITIONS",
    note: "Supplier confirmed 40% funding after the run; margin recovers if the rollback stays at 28% for 4 weeks.", conds: [] as string[] },
];
(async () => {
  const sql = db();
  for (const s of SIGN) {
    const [o] = await sql`select o.recommendation from agent_outputs o join lighthouse_decisions l using (run_id) where l.decision_id = ${s.id} and o.agent_type = ${s.dept}`;
    if (!o) { console.log(`${s.id}: not analyzed, skipped`); continue; }
    await sql`update reviews set superseded = true where decision_id = ${s.id} and department = ${s.dept} and not superseded`;
    await sql`insert into reviews (decision_id, revision, reviewer_role, reviewer_name, disposition, condition_text, department, ai_recommendation, position, conditions)
              values (${s.id}, 1, ${s.role}, ${s.name}, ${s.kind}, ${s.note}, ${s.dept}, ${o.recommendation}, ${s.pos}, ${s.conds})`;
    await appendAudit(s.name, s.role, "DEPARTMENT_SIGNOFF_RECORDED", s.id, { department: s.dept, signoff: s.kind, ai_recommendation: o.recommendation, position: s.pos, note: s.note });
    console.log(s.id, (await refreshCase(s.id))?.status);
  }
})();
