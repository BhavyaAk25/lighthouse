/**
 * Pre-demo: run every curated case once with live AI (saves answers for demo-safe replay),
 * then reset the curated cases to DRAFT. Audit entries are appended, never removed.
 * Run: npx tsx scripts/warm-cache.ts
 */
import "./env";
import { appendAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { executeRun } from "@/lib/runs";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const sql = db();
  const ids = (await sql`select decision_id from decision_cases where decision_id like 'D-2026-0%' order by 1`).map((r) => String(r.decision_id));
  for (const id of ids) {
    await sql`update decision_cases set status = 'DRAFT' where decision_id = ${id}`;
    const t = Date.now();
    const providers: string[] = [];
    for await (const ev of executeRun(id, { name: "Maya Chen", role: "DECISION_OWNER" }, "LIVE_AI")) {
      if (ev.type === "agent_output") providers.push(`${ev.agent[0]}:${ev.output.provider}`);
      if (ev.type === "synthesis") providers.push(`syn:${ev.synthesis.provider}`);
      if (ev.type === "error") console.log(id, "ERROR", ev.message);
    }
    const [{ n }] = await sql`select count(*)::int n from llm_cache where decision_id = ${id}`;
    console.log(`${id}  ${((Date.now() - t) / 1000).toFixed(1)}s  ${providers.join(" ")}  cached=${n}`);
    await sleep(15000); // stay inside Groq's free per-minute token budget
  }
  await sql.transaction([
    sql`delete from lighthouse_decisions where decision_id = any(${ids})`,
    sql`delete from reviews where decision_id = any(${ids})`,
    sql`delete from agent_runs where decision_id = any(${ids})`,
    sql`delete from agent_outputs where decision_id = any(${ids})`,
    sql`delete from evidence where decision_id = any(${ids})`,
    sql`update decision_cases set status = 'DRAFT', revision = 1 where decision_id = any(${ids})`,
  ]);
  await appendAudit("Jordan Ellis", "ADMIN", "DEMO_CASES_RESET", null, { cases: ids, note: "pre-demo cache warm-up" });
  console.log("reset done");
}
main();
