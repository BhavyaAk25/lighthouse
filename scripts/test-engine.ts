import "./env";
import { db } from "@/lib/db";
import { getCategories, getDcs, getRules, mapCase } from "@/lib/repo";
import { runRulesEngine } from "@/lib/engine";
import { DEFAULT_THRESHOLDS } from "@/lib/types";

async function main() {
  const filter = process.argv[2] ?? "D-2026-%";
  const [cats, rules, dcs] = await Promise.all([getCategories(), getRules(), getDcs()]);
  const rows = await db()`select * from decision_cases where decision_id like ${filter} order by decision_id limit 20`;
  for (const r of rows) {
    const c = mapCase(r);
    const cat = cats.find((x) => x.category_id === c.category_id)!;
    const res = runRulesEngine({ c, f: c.facts!, cat, cfg: DEFAULT_THRESHOLDS, rules, dcs, runId: "RUN-TEST" });
    const o = Object.fromEntries(res.outputs.map((x) => [x.agent_type, `${x.recommendation}(${x.confidence})${x.valid ? "" : "!"}`]));
    console.log(`\n${c.decision_id} [${c.scenario_tag}] ${c.title}`);
    console.log("  ", o.SALES, "|", o.FINANCE, "|", o.OPERATIONS, "|", o.LEGAL);
    console.log("   =>", res.reconciliation.synthesized_recommendation, res.reconciliation.lighthouse_confidence, res.reconciliation.conflict_severity, "|", res.reconciliation.headline);
    const s = res.analyses.SALES.metrics, f = res.analyses.FINANCE.metrics, op = res.analyses.OPERATIONS.metrics;
    console.log(`   sales uplift ${s.unit_uplift_pct}% rev ${s.revenue_uplift_pct}% base ${s.baseline_revenue} | fin net ${f.net_benefit} roi ${f.roi_pct} down ${f.downside_net_benefit} be ${f.break_even_discount_pct}`);
    console.log(`   ops dc ${op.dc_util_projected_avg_pct}/${op.dc_util_projected_peak_pct} fulfil ${op.fulfillment_projected_pct} labor ${op.labor_projected_pct} fill ${op.projected_fill_rate_pct} gap ${op.launch_gap_units} cov ${op.coverage_days} rep ${op.stores_reporting}`);
    console.log(`   legal: ${res.outputs[3].rationale.slice(0, 160)}`);
  }
}
main();
