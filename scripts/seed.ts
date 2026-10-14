/**
 * Seed the historical decision record:
 *  - runs the deterministic rules engine on all 4,988 historical cases
 *  - stores agent runs, 4 agent outputs per case, evidence, Lighthouse packets
 *  - simulates legal reviews and human decisions (incl. overrides with rationale)
 *  - writes a hash-chained, append-only audit log
 * The 12 curated demo cases (D-2026-001..012) stay in DRAFT for live demonstration.
 *
 * Run: npx tsx scripts/seed.ts
 */
import "./env";
import { db } from "@/lib/db";
import { runRulesEngine } from "@/lib/engine";
import { getCategories, getDcs, getRules, mapCase } from "@/lib/repo";
import { DEFAULT_THRESHOLDS, type AgentOutput, type EvidenceItem } from "@/lib/types";

const PILOT_CLOCK = new Date("2026-10-12T15:00:00Z");
let seed = 4210;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

const LEGAL = { name: "Priya Raman", role: "LEGAL_REVIEWER" };
const REVIEWERS = [
  { name: "David Okafor", role: "FINANCE_REVIEWER" },
  { name: "Hannah Brooks", role: "SALES_REVIEWER" },
  { name: "Luis Moreno", role: "OPERATIONS_REVIEWER" },
];
const APPROVE_NOTES = [
  "Approved per Lighthouse packet; conditions accepted.",
  "Approved. Conditions assigned to category and supply chain leads.",
  "Approved with the stated conditions; revisit after week 2 sell-through.",
  "Approved; aligns with regional price-leadership plan.",
];
const REJECT_NOTES = [
  "Rejected: economics do not justify the markdown investment.",
  "Rejected: capacity risk during peak window is unacceptable.",
  "Rejected: compliance concerns not resolved in time for launch.",
  "Rejected: overlaps with a national event already planned for these stores.",
];
const REVISE_NOTES = [
  "Revise: reduce discount depth and re-run the agents.",
  "Revise: narrow scope to one region as a test.",
  "Revise: refresh inventory evidence before resubmitting.",
  "Revise: remove the marketing claim flagged by Legal.",
];
const OVERRIDE_NOTES = [
  "Override: strategic traffic driver for the quarter; margin loss accepted and capped.",
  "Override: supplier committed additional funding after the run; finance view is outdated.",
  "Override: DC-P02 temporary labor already booked, resolving the capacity constraint.",
  "Override: test in limited stores accepted despite incomplete evidence; refresh before scale-up.",
];
const LEGAL_COND = [
  "Approved subject to revised claim wording on file.",
  "Approved; substantiation reviewed and attached to the case.",
  "Approved with required disclosures added to all creative.",
];

type Row = Record<string, unknown>;

async function insertJson(table: string, rows: Row[], batch = 1500) {
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch);
    const cols = Object.keys(chunk[0]);
    const colList = cols.join(", ");
    await db().query(
      `insert into ${table} (${colList}) select ${colList} from json_populate_recordset(null::${table}, $1::json)`,
      [JSON.stringify(chunk)],
    );
  }
  console.log(`  ${table.padEnd(22)} ${rows.length.toLocaleString().padStart(8)} rows`);
}

async function main() {
  const t0 = Date.now();
  console.log("Seeding Lighthouse history…");
  const sql = db();
  await sql`truncate audit_log, agent_outputs, evidence, lighthouse_decisions, reviews, llm_cache, config restart identity cascade`;
  await sql`delete from agent_runs`;
  await sql`update decision_cases set status = 'DRAFT', revision = 1`;

  const [cats, rules, dcs] = await Promise.all([getCategories(), getRules(), getDcs()]);
  const catBy = new Map(cats.map((c) => [c.category_id, c]));
  const caseRows = await sql`select * from decision_cases order by created_at, decision_id`;
  const cases = caseRows.map(mapCase);
  console.log(`  loaded ${cases.length} cases`);

  const runs: Row[] = [];
  const outputs: Row[] = [];
  const evidence: Row[] = [];
  const packets: Row[] = [];
  const reviews: Row[] = [];
  const statuses: Row[] = [];
  const audit: Row[] = [];
  const stats: Record<string, number> = {};
  const bump = (k: string) => (stats[k] = (stats[k] ?? 0) + 1);

  const ev = (ts: Date, actor: string, role: string, action: string, decision_id: string | null, payload: object) =>
    audit.push({ ts: ts.toISOString(), actor, role, action, decision_id, payload });

  // system bootstrap entries
  ev(new Date("2025-10-12T12:00:00Z"), "system", "SYSTEM", "SYSTEM_INITIALIZED", null, { version: "1.0", note: "Lighthouse pilot ledger created" });
  ev(new Date("2025-10-12T12:05:00Z"), "Jordan Ellis", "ADMIN", "RULE_CATALOG_LOADED", null, { rules: rules.length, enabled: rules.filter((r) => r.enabled).length });
  ev(new Date("2025-10-12T12:06:00Z"), "Jordan Ellis", "ADMIN", "THRESHOLDS_CONFIGURED", null, { thresholds: DEFAULT_THRESHOLDS });

  for (const c of cases) {
    const created = new Date(c.created_at);
    const isCurated = c.decision_id.startsWith("D-2026-");
    if (isCurated) {
      ev(created, c.created_by, "DECISION_OWNER", "CASE_CREATED", c.decision_id, { title: c.title, scenario: c.scenario_tag });
      continue;
    }
    if (!c.facts) continue;
    const runId = `RUN-${c.decision_id}-1`;
    const res = runRulesEngine({ c, f: c.facts, cat: catBy.get(c.category_id)!, cfg: DEFAULT_THRESHOLDS, rules, dcs, runId });
    const rec = res.reconciliation;
    const runAt = addMin(created, 3 + Math.floor(rand() * 40));
    runs.push({
      run_id: runId,
      decision_id: c.decision_id,
      mode: "RULES_ENGINE",
      started_at: runAt.toISOString(),
      finished_at: addMin(runAt, 0.2).toISOString(),
      status: "COMPLETED",
      started_by: c.created_by,
      provider_summary: "rules-engine",
      duration_ms: 900 + Math.floor(rand() * 1800),
      revision: 1,
    });
    res.outputs.forEach((o: AgentOutput) =>
      outputs.push({
        run_id: runId,
        decision_id: c.decision_id,
        agent_type: o.agent_type,
        recommendation: o.recommendation,
        confidence: o.confidence,
        risk_level: o.risk_level,
        evidence_ids: o.evidence_ids,
        key_metrics: o.key_metrics,
        conditions: o.conditions,
        dissent_reason: o.dissent_reason,
        rationale: o.rationale,
        generated_at: addMin(runAt, 0.1).toISOString(),
        provider: o.provider,
        model: o.model,
        latency_ms: 40 + Math.floor(rand() * 120),
        valid: o.valid,
        validation_issues: o.validation_issues,
        guardrail_adjustments: o.guardrail_adjustments,
        data_quality: o.data_quality,
      }),
    );
    for (const a of Object.values(res.analyses))
      a.evidence.forEach((e: EvidenceItem) =>
        evidence.push({
          evidence_id: e.evidence_id,
          decision_id: c.decision_id,
          run_id: runId,
          agent_type: e.agent_type,
          label: e.label,
          value: e.value ?? null,
          unit: e.unit ?? null,
          source: e.source,
          provenance: e.provenance,
          as_of: e.as_of ?? null,
          created_at: runAt.toISOString(),
        }),
      );

    // workflow outcome
    const ageDays = (PILOT_CLOCK.getTime() - created.getTime()) / 86_400_000;
    const open = ageDays < 7 && rand() < 0.85;
    let status = rec.requires_legal_review ? "AWAITING_LEGAL_REVIEW" : "READY_FOR_DECISION";
    let legalDisposition: string | null = null;
    let approval = "PENDING";
    let final: string | null = null;
    let rationale: string | null = null;
    let decidedAt: Date | null = null;
    let override = false;
    const owner = c.created_by;

    ev(created, owner, "DECISION_OWNER", "CASE_CREATED", c.decision_id, { title: c.title, category: c.category_id, stores: c.store_count });
    ev(runAt, owner, "DECISION_OWNER", "AGENTS_RUN_COMPLETED", c.decision_id, {
      run_id: runId,
      mode: "RULES_ENGINE",
      outputs: Object.fromEntries(res.outputs.map((o) => [o.agent_type, `${o.recommendation} (${o.confidence})`])),
    });
    ev(addMin(runAt, 0.3), "Lighthouse", "SYSTEM", "RECOMMENDATION_GENERATED", c.decision_id, {
      run_id: runId,
      recommendation: rec.synthesized_recommendation,
      confidence: rec.lighthouse_confidence,
      conflict: rec.conflict_severity,
      legal_review_required: rec.requires_legal_review,
    });

    let legalAt = addMin(runAt, 60 * (4 + rand() * 40));
    if (rec.requires_legal_review && !(open && rand() < 0.5)) {
      const r = rand();
      legalDisposition = r < 0.7 ? "APPROVED_WITH_CONDITIONS" : r < 0.85 ? "APPROVED" : "REJECTED";
      const note = legalDisposition === "REJECTED" ? "Claim cannot be substantiated as written; do not launch." : pick(LEGAL_COND);
      reviews.push({
        decision_id: c.decision_id,
        revision: 1,
        reviewer_role: LEGAL.role,
        reviewer_name: LEGAL.name,
        disposition: legalDisposition,
        condition_text: note,
        created_at: legalAt.toISOString(),
      });
      ev(legalAt, LEGAL.name, LEGAL.role, "LEGAL_REVIEW_RECORDED", c.decision_id, { disposition: legalDisposition, note });
      status = "READY_FOR_DECISION";
    } else {
      legalAt = runAt;
    }
    if (rand() < 0.12) {
      const rv = pick(REVIEWERS);
      const disp = rand() < 0.75 ? "CONCUR" : "CONCERN";
      const at = addMin(runAt, 60 * (1 + rand() * 20));
      reviews.push({
        decision_id: c.decision_id,
        revision: 1,
        reviewer_role: rv.role,
        reviewer_name: rv.name,
        disposition: disp,
        condition_text: disp === "CONCUR" ? "Assumptions reviewed; no changes." : "Assumption looks optimistic; monitor closely.",
        created_at: at.toISOString(),
      });
      ev(at, rv.name, rv.role, "REVIEWER_NOTE_ADDED", c.decision_id, { disposition: disp });
    }

    const canDecide = !(open || (rec.requires_legal_review && !legalDisposition));
    if (canDecide) {
      const s = rec.synthesized_recommendation;
      const r = rand();
      if (legalDisposition === "REJECTED") final = r < 0.7 ? "REJECTED" : "REVISION_REQUESTED";
      else if (s === "PROCEED" || s === "PROCEED_WITH_CONDITIONS") final = r < 0.88 ? "APPROVED" : r < 0.93 ? "REJECTED" : "REVISION_REQUESTED";
      else if (s === "HOLD") final = r < 0.55 ? "REJECTED" : r < 0.9 ? "REVISION_REQUESTED" : "APPROVED";
      else if (s === "REJECT") final = r < 0.85 ? "REJECTED" : "REVISION_REQUESTED";
      else final = r < 0.6 ? "REVISION_REQUESTED" : r < 0.85 ? "REJECTED" : "APPROVED";
      override = final === "APPROVED" && !(s === "PROCEED" || s === "PROCEED_WITH_CONDITIONS");
      rationale = override ? pick(OVERRIDE_NOTES) : final === "APPROVED" ? pick(APPROVE_NOTES) : final === "REJECTED" ? pick(REJECT_NOTES) : pick(REVISE_NOTES);
      decidedAt = addMin(legalAt, 60 * (2 + rand() * 70));
      if (decidedAt > PILOT_CLOCK) decidedAt = addMin(PILOT_CLOCK, -30 - Math.floor(rand() * 600));
      approval = final;
      status = final;
      ev(decidedAt, owner, "DECISION_OWNER", override ? "DECISION_OVERRIDE_RECORDED" : "DECISION_RECORDED", c.decision_id, {
        decision: final,
        lighthouse_recommendation: s,
        override,
        rationale,
      });
    }
    bump(`status:${status}`);
    bump(`rec:${rec.synthesized_recommendation}`);
    if (rec.conflict_flag) bump("conflict");
    if (rec.conflict_severity === "MATERIAL" || rec.conflict_severity === "HARD_STOP") bump("material_conflict");
    if (rec.requires_legal_review) bump("legal_review");
    if (res.outputs.some((o) => !o.valid)) bump("invalid_evidence");
    if (res.outputs[0].data_quality.sales_stale || res.outputs[0].data_quality.ops_stale) bump("stale");
    if (override) bump("override");

    packets.push({
      decision_id: c.decision_id,
      run_id: runId,
      conflict_flag: rec.conflict_flag,
      conflict_severity: rec.conflict_severity,
      conflicts: rec.conflicts,
      synthesized_recommendation: rec.synthesized_recommendation,
      lighthouse_confidence: rec.lighthouse_confidence,
      confidence_breakdown: rec.confidence_breakdown,
      risk_level: rec.risk_level,
      conditions: rec.conditions,
      gates: rec.gates,
      summary: rec.summary,
      summary_provider: "rules-engine",
      financial_impact: rec.financial_impact,
      requires_legal_review: rec.requires_legal_review,
      expedited_eligible: rec.expedited_eligible,
      owner,
      approval_status: approval,
      final_decision: final,
      final_rationale: rationale,
      decided_by: final ? owner : null,
      decided_at: decidedAt ? decidedAt.toISOString() : null,
      override_flag: override,
      created_at: addMin(runAt, 0.3).toISOString(),
    });
    statuses.push({ decision_id: c.decision_id, status });
  }

  console.log("Writing…");
  await insertJson("agent_runs", runs);
  await insertJson("agent_outputs", outputs, 1000);
  await insertJson("evidence", evidence, 2500);
  await insertJson("lighthouse_decisions", packets, 800);
  await insertJson("reviews", reviews);
  for (let i = 0; i < statuses.length; i += 2000)
    await sql.query(
      `update decision_cases d set status = x.status from json_to_recordset($1::json) as x(decision_id text, status text) where d.decision_id = x.decision_id`,
      [JSON.stringify(statuses.slice(i, i + 2000))],
    );
  audit.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  await insertJson("audit_log", audit, 2000);
  console.log("  rebuilding audit hash chain…");
  const [{ rebuild_audit_chain: n }] = await sql`select rebuild_audit_chain()`;
  const [v] = await sql`select * from verify_audit_chain()`;
  console.log(`  chain: ${n} entries, first broken: ${v.first_broken_seq ?? "none"}`);

  await insertJson("config", [
    { key: "thresholds", value: DEFAULT_THRESHOLDS, description: "Governance thresholds used by the agents and Lighthouse", updated_by: "Jordan Ellis" },
    { key: "pilot_clock", value: { date: "2026-10-12" }, description: "Evaluation date for evidence freshness (data snapshot ends 2026-10-11)", updated_by: "Jordan Ellis" },
    {
      key: "ai",
      value: { primary: "gemini", fallback: "groq", groq_models: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"], temperature: 0.2 },
      description: "AI provider chain (free tiers)",
      updated_by: "Jordan Ellis",
    },
    {
      key: "agent_registry",
      value: {
        SALES: { name: "Sales Agent", version: "1.0", prompt_version: "2026-10-a", enabled: true, owner: "Hannah Brooks" },
        FINANCE: { name: "Finance Agent", version: "1.0", prompt_version: "2026-10-a", enabled: true, owner: "David Okafor" },
        OPERATIONS: { name: "Operations Agent", version: "1.0", prompt_version: "2026-10-a", enabled: true, owner: "Luis Moreno" },
        LEGAL: { name: "Legal Agent", version: "1.0", prompt_version: "2026-10-a", enabled: true, owner: "Priya Raman" },
      },
      description: "Registered agents",
      updated_by: "Jordan Ellis",
    },
  ]);
  const total = runs.length;
  console.log("\nStats:");
  for (const [k, v] of Object.entries(stats).sort()) console.log(`  ${k.padEnd(32)} ${String(v).padStart(5)}  ${((v / total) * 100).toFixed(1)}%`);
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
