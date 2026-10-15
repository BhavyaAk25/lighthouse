import "server-only";
import { appendAudit } from "./audit";
import { refreshCase } from "./caseflow";
import { db } from "./db";

/**
 * Reset the 12 curated demo cases to the class-demo starting state (the audit log is append-only and keeps everything):
 *  - D-2026-001 is a fresh proposal from Hannah, so the class watches four agents run live when she submits it.
 *  - The rest are analyzed (replaying saved AI answers) and sit in department sign-off, so every desk has work.
 *  - D-2026-004: Legal already signed. D-2026-006: Operations is overdue, so it escalates to the executive.
 *  - D-2026-012: already approved and sealed.
 */
export async function resetDemoState(p: { name: string; role: string }) {
  const sql = db();
  const curated = (await sql`select decision_id from decision_cases where scenario_tag <> '' and scenario_tag <> 'USER_CREATED' and decision_id like 'D-2026-0%' order by decision_id`).map((r) => String(r.decision_id));
  await sql.transaction([
    sql`delete from lighthouse_decisions where decision_id = any(${curated})`,
    sql`delete from reviews where decision_id = any(${curated})`,
    sql`delete from agent_runs where decision_id = any(${curated})`,
    sql`delete from agent_outputs where decision_id = any(${curated})`,
    sql`delete from evidence where decision_id = any(${curated})`,
    sql`update decision_cases set status = 'DRAFT', revision = 1, updated_at = now(),
          created_by = case when promo_type = 'INVENTORY_REALLOCATION' then 'Luis Moreno' else 'Hannah Brooks' end,
          title = coalesce(original->>'title', title), discount_pct = coalesce((original->>'discount_pct')::numeric, discount_pct),
          duration_weeks = coalesce((original->>'duration_weeks')::int, duration_weeks), claim_text = coalesce(original->>'claim_text', claim_text),
          vendor_funding_pct = coalesce((original->>'vendor_funding_pct')::numeric, vendor_funding_pct)
        where decision_id = any(${curated})`,
    sql`update decision_cases set facts = compute_case_facts(decision_id) where decision_id = any(${curated})`,
  ]);
  // logged first, so each case's trail after the reset reads as a clean story
  await appendAudit(p.name, p.role, "DEMO_CASES_RESET", null, { cases: curated, live_case: "D-2026-001" });
  const { executeRun } = await import("@/lib/runs");
  const toRun = curated.filter((id) => id !== "D-2026-001");
  for (let i = 0; i < toRun.length; i += 4)
    await Promise.all(
      toRun.slice(i, i + 4).map(async (id) => {
        const [c] = await sql`select created_by from decision_cases where decision_id = ${id}`;
        const role = c.created_by === "Luis Moreno" ? "OPERATIONS_REVIEWER" : "SALES_REVIEWER";
        for await (const ev of executeRun(id, { name: String(c.created_by), role }, "DEMO_SAFE", { pace: false })) if (ev.type === "error") throw new Error(`${id}: ${ev.message}`);
      }),
    );
  // starting positions for the story
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  await sql`update lighthouse_decisions set analyzed_at = ${hoursAgo(3)} where decision_id = any(${toRun})`;
  await sql`update lighthouse_decisions set analyzed_at = ${hoursAgo(54)} where decision_id = 'D-2026-006'`;
  const [legal004] = await sql`select o.recommendation from agent_outputs o join lighthouse_decisions l using (run_id) where l.decision_id = 'D-2026-004' and o.agent_type = 'LEGAL'`;
  if (legal004 && legal004.recommendation === "REVIEW_REQUIRED") {
    await sql`insert into reviews (decision_id, revision, reviewer_role, reviewer_name, disposition, condition_text, department, ai_recommendation, position, conditions, created_at)
              values ('D-2026-004', 1, 'LEGAL_REVIEWER', 'Priya Raman', 'CONFIRMED', 'BOGO terms reviewed; disclose the limit of 2 per customer on all signage.',
                      'LEGAL', 'REVIEW_REQUIRED', 'PROCEED_WITH_CONDITIONS', ${["Disclose the per-customer limit on all signage."]}, ${hoursAgo(1)})`;
    await appendAudit("Priya Raman", "LEGAL_REVIEWER", "DEPARTMENT_SIGNOFF_RECORDED", "D-2026-004", { department: "LEGAL", signoff: "CONFIRMED", ai_recommendation: "REVIEW_REQUIRED", position: "PROCEED_WITH_CONDITIONS", note: "BOGO terms reviewed; disclose the limit of 2 per customer on all signage." });
  }
  // D-2026-006: everyone but Operations has signed, and Operations is past the deadline -> escalates to the executive
  const six = await refreshCase("D-2026-006");
  const NOTE: Record<string, string> = {
    FINANCE: "Margin and funding assumptions match the category plan; fine to proceed.",
    LEGAL: "Standard warranty and e-waste disclosures apply; nothing needs counsel beyond that.",
    SALES: "Demand assumptions match the regional plan.",
  };
  for (const l of six?.lanes ?? [])
    if ((l.state === "PENDING" || l.state === "OVERDUE") && l.dept !== "OPERATIONS" && l.ai) {
      const pos = l.ai.recommendation === "REVIEW_REQUIRED" ? "PROCEED_WITH_CONDITIONS" : l.ai.recommendation === "REJECT" ? "HOLD" : l.ai.recommendation;
      await sql`insert into reviews (decision_id, revision, reviewer_role, reviewer_name, disposition, condition_text, department, ai_recommendation, position, created_at)
                values ('D-2026-006', 1, ${l.lead.role}, ${l.lead.name}, 'CONFIRMED', ${NOTE[l.dept] ?? "Checked against our plan; fine on our side."},
                        ${l.dept}, ${l.ai.recommendation}, ${pos}, ${hoursAgo(30)})`;
      await appendAudit(l.lead.name, l.lead.role, "DEPARTMENT_SIGNOFF_RECORDED", "D-2026-006", { department: l.dept, signoff: "CONFIRMED", ai_recommendation: l.ai.recommendation, position: pos, note: NOTE[l.dept] ?? "" });
    }
  for (const id of toRun) await refreshCase(id);
  const [d12] = await sql`select status from decision_cases where decision_id = 'D-2026-012'`;
  if (d12?.status === "READY_FOR_DECISION") {
    await sql.transaction([
      sql`update lighthouse_decisions set approval_status = 'APPROVED', final_decision = 'APPROVED', decided_by = 'Maya Chen', decided_at = ${hoursAgo(1)},
            final_rationale = 'Moves holiday TV stock ahead of peak; all four departments cleared.' where decision_id = 'D-2026-012'`,
      sql`update decision_cases set status = 'APPROVED' where decision_id = 'D-2026-012'`,
    ]);
    await appendAudit("Maya Chen", "DECISION_OWNER", "DECISION_RECORDED", "D-2026-012", { decision: "APPROVED", override: false, rationale: "Moves holiday TV stock ahead of peak; all four departments cleared." });
  }

  return { cases: curated.length };
}
