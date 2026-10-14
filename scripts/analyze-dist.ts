import "./env";
import { db } from "@/lib/db";
import { runRulesEngine } from "@/lib/engine";
import { matchRules } from "@/lib/engine/legal";
import { getCategories, getDcs, getRules, mapCase } from "@/lib/repo";
import { DEFAULT_THRESHOLDS } from "@/lib/types";
async function main() {
  const [cats, rules, dcs] = await Promise.all([getCategories(), getRules(), getDcs()]);
  const rows = await db()`select * from decision_cases where decision_id not like 'D-2026-%' order by random() limit 1500`;
  const agentDist: Record<string, Record<string, number>> = {};
  const byType: Record<string, Record<string, number>> = {};
  const ruleCount: Record<string, number> = {};
  const opsWhy: Record<string, number> = {};
  for (const r of rows) {
    const c = mapCase(r);
    const res = runRulesEngine({ c, f: c.facts!, cat: cats.find((x) => x.category_id === c.category_id)!, cfg: DEFAULT_THRESHOLDS, rules, dcs, runId: "RUN-X" });
    for (const o of res.outputs) { (agentDist[o.agent_type] ??= {})[o.recommendation] = ((agentDist[o.agent_type] ?? {})[o.recommendation] ?? 0) + 1; }
    const fin = res.outputs.find((o) => o.agent_type === "FINANCE")!;
    (byType[c.promo_type] ??= {})[fin.recommendation] = ((byType[c.promo_type] ?? {})[fin.recommendation] ?? 0) + 1;
    const ops = res.outputs.find((o) => o.agent_type === "OPERATIONS")!;
    if (ops.hard_constraint) for (const k of ["DC launch", "fill rate", "online fulfillment", "lead time", "missing"]) if (ops.hard_constraint.includes(k) || (k === "missing" && !ops.valid)) opsWhy[k] = (opsWhy[k] ?? 0) + 1;
    for (const h of matchRules(c, rules)) if (h.rule.review_required || h.rule.prohibited) ruleCount[h.rule.base_key] = (ruleCount[h.rule.base_key] ?? 0) + 1;
  }
  console.log("agent rec distribution:", JSON.stringify(agentDist, null, 1));
  console.log("finance by promo type:", JSON.stringify(byType));
  console.log("ops hard stop reasons:", opsWhy);
  console.log("review rules (count of case-rule hits incl. state variants):", Object.entries(ruleCount).sort((a, b) => b[1] - a[1]).slice(0, 20));
}
main();
