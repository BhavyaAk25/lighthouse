import "./env";
import { executeRun } from "@/lib/runs";
async function main() {
  const id = process.argv[2] ?? "D-2026-001";
  const mode = (process.argv[3] ?? "LIVE_AI") as "LIVE_AI" | "DEMO_SAFE";
  const t = Date.now();
  for await (const ev of executeRun(id, { name: "Maya Chen", role: "DECISION_OWNER" }, mode)) {
    const s = (Date.now() - t) / 1000;
    if (ev.type === "agent_output") {
      const o = ev.output;
      console.log(`[${s.toFixed(1)}s] ${ev.agent.padEnd(10)} ${o.recommendation} conf=${o.confidence} risk=${o.risk_level} via ${o.provider}/${o.model} ${o.latency_ms}ms valid=${o.valid}`);
      console.log(`         rationale: ${o.rationale.slice(0, 260)}`);
      if (o.conditions.length) console.log(`         conditions: ${o.conditions.join(" | ").slice(0, 260)}`);
      if (o.guardrail_adjustments.length) console.log(`         GUARDRAIL: ${o.guardrail_adjustments.join(" | ")}`);
      if (o.validation_issues.length) console.log(`         issues: ${o.validation_issues.join(" | ").slice(0, 300)}`);
      console.log(`         cited: ${o.evidence_ids.join(", ")}`);
      if (ev.note) console.log(`         note: ${ev.note}`);
    } else if (ev.type === "synthesis") {
      console.log(`[${s.toFixed(1)}s] SYNTHESIS via ${ev.synthesis.provider}/${ev.synthesis.model}: ${ev.synthesis.headline}\n         ${ev.synthesis.summary}\n         factors: ${ev.synthesis.decisive_factors.join(" | ")}\n         next: ${ev.synthesis.next_steps.join(" | ")}`);
    } else if (ev.type === "reconciled") {
      console.log(`[${s.toFixed(1)}s] RECONCILED ${ev.reconciliation.synthesized_recommendation} ${ev.reconciliation.lighthouse_confidence} ${ev.reconciliation.conflict_severity}`);
    } else if (ev.type !== "tool" && ev.type !== "agent_started") console.log(`[${s.toFixed(1)}s]`, JSON.stringify(ev).slice(0, 200));
  }
}
main();
