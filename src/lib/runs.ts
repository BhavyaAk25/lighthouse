import { runAiAgent } from "./ai/agents";
import type { ProviderName } from "./ai/providers";
import { synthesize, templateSynthesis, type SynthesisResult } from "./ai/synthesis";
import { appendAudit } from "./audit";
import { refreshCase, rowToOutput } from "./caseflow";
import { db } from "./db";
import { analyzeAll, buildContext, finalizeOutput, financialImpactOf, reconcile } from "./engine";
import { computeFacts, getCase, getCategories, getDcs, getRules, getThresholds } from "./repo";
import type { AgentAnalysis, AgentOutput, AgentType, Reconciliation } from "./types";
import { AGENTS } from "./types";

export type RunMode = "LIVE_AI" | "DEMO_SAFE";

export type RunEvent =
  | { type: "run_started"; run_id: string; mode: RunMode; revision: number; only: AgentType | null }
  | { type: "tool"; agent: AgentType | "LIGHTHOUSE"; name: string; detail: string; ms: number }
  | { type: "agent_started"; agent: AgentType; provider_hint: string }
  | { type: "agent_output"; agent: AgentType; output: AgentOutput; evidence: AgentAnalysis["evidence"]; note?: string }
  | { type: "reconciled"; reconciliation: Reconciliation }
  | { type: "synthesis"; synthesis: SynthesisResult }
  | { type: "done"; run_id: string; status: string; duration_ms: number }
  | { type: "error"; message: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const newRunId = () => `RUN-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

export interface RunOptions {
  /** re-run a single department's agent; the other three keep their current answers */
  only?: AgentType;
  /** pace tool events so people can follow along (off for bulk/demo reset) */
  pace?: boolean;
}

export async function* executeRun(decisionId: string, actor: { name: string; role: string }, mode: RunMode, opts: RunOptions = {}): AsyncGenerator<RunEvent> {
  const t0 = Date.now();
  const only = opts.only ?? null;
  const pace = opts.pace ?? true;
  const nap = (ms: number) => (pace ? sleep(ms) : Promise.resolve());
  const sql = db();
  const c0 = await getCase(decisionId);
  if (!c0) {
    yield { type: "error", message: "Decision case not found" };
    return;
  }
  if (["APPROVED", "REJECTED"].includes(c0.status)) {
    yield { type: "error", message: "This decision is final. Revise the case to analyze it again." };
    return;
  }
  // a single-agent re-run keeps the other departments' current answers
  let previous: Partial<Record<AgentType, AgentOutput>> = {};
  let previousRunId = "";
  if (only) {
    const [pk] = await sql`select l.run_id from lighthouse_decisions l join agent_runs r using (run_id) where l.decision_id = ${decisionId} and r.revision = ${c0.revision}`;
    if (!pk) {
      yield { type: "error", message: "Submit the case first: all four agents have to run once before one can be re-run." };
      return;
    }
    previousRunId = String(pk.run_id);
    previous = Object.fromEntries((await sql`select * from agent_outputs where run_id = ${previousRunId}`).map((o) => [o.agent_type, rowToOutput(o)]));
  }
  const runId = newRunId();
  await sql`insert into agent_runs (run_id, decision_id, mode, started_by, revision) values (${runId}, ${decisionId}, ${mode}, ${actor.name}, ${c0.revision})`;
  yield { type: "run_started", run_id: runId, mode, revision: c0.revision, only };

  try {
    // ---- 1. evidence gathering (the agents' tools)
    let t = Date.now();
    const facts = await computeFacts(decisionId);
    const [cats, rules, dcs, cfg] = await Promise.all([getCategories(), getRules(), getDcs(), getThresholds()]);
    const c = { ...c0, facts };
    const cat = cats.find((x) => x.category_id === c.category_id)!;
    yield { type: "tool", agent: "LIGHTHOUSE", name: "compute_case_facts", detail: `Evidence snapshot as of ${facts.data_as_of} for ${c.store_count} stores`, ms: Date.now() - t };
    t = Date.now();
    const ctx = buildContext({ c, f: facts, cat, cfg, rules, dcs, runId });
    const analyses = analyzeAll(ctx);
    const toolMs = Date.now() - t;
    const toolNames: Record<AgentType, [string, string][]> = {
      SALES: [
        ["query_sales_baseline", `${facts.sales.rows_observed}/${facts.sales.rows_expected} store-days, 56-day window`],
        ["query_promo_analogs", `${facts.promo_analogs.promo_store_days} real promo store-days`],
        ["forecast_demand", "elasticity x mechanic x analog blend"],
      ],
      FINANCE: [
        ["load_margin_and_cost_assumptions", `${cat.gross_margin_pct}% gross margin`],
        ["model_promo_economics", "incremental GP, halo, funding, costs"],
        ["solve_break_even_discount", "1-60% sweep"],
      ],
      OPERATIONS: [
        ["query_inventory_position", `${facts.operations.stores_reporting_current}/${facts.operations.stores_in_scope} stores reporting`],
        ["query_dc_capacity", `${(facts.operations.dcs ?? []).join(", ")}`],
        ["project_capacity_and_fill", "DC, labor, fulfillment, lead time"],
      ],
      LEGAL: [
        ["screen_case_attributes", `${c.states.join(", ")} · ${c.promo_type}`],
        ["match_rule_catalog", `${rules.length} enabled rules`],
      ],
    };
    const running: AgentType[] = only ? [only] : [...AGENTS];
    for (const ag of running) yield { type: "agent_started", agent: ag, provider_hint: mode === "DEMO_SAFE" ? "replay" : "gemini" };
    // tools already ran (deterministic, ~ms); pace the events so people can follow the evidence gathering
    for (let step = 0; step < 3; step++) {
      for (const ag of running) {
        const t = toolNames[ag][step];
        if (t) yield { type: "tool", agent: ag, name: t[0], detail: t[1], ms: Math.max(1, Math.round(toolMs / 11)) };
      }
      await nap(260);
    }

    // ---- 2. agents
    const outputs: Partial<Record<AgentType, AgentOutput>> = {};
    if (only) {
      // carry the other three forward; their evidence is re-gathered deterministically under the new run id
      const oldBase = previousRunId.replace(/^RUN-/, "EV-");
      const newBase = runId.replace(/^RUN-/, "EV-");
      for (const ag of AGENTS)
        if (ag !== only && previous[ag])
          outputs[ag] = { ...previous[ag]!, evidence_ids: previous[ag]!.evidence_ids.map((e) => e.replace(oldBase, newBase)), key_metrics: analyses[ag].metrics };
    }
    const cached =
      mode === "DEMO_SAFE"
        ? Object.fromEntries(
            (await sql`select agent_type, output from llm_cache where decision_id = ${decisionId} and revision = ${c.revision}`).map((r) => [
              r.agent_type,
              r.output,
            ]),
          )
        : {};
    const prefer: ProviderName[] = ["gemini", "groq"];

    if (mode === "DEMO_SAFE") {
      for (const ag of running) {
        await nap(450 + Math.random() * 650);
        const cachedOut = cached[ag] as AgentOutput | undefined;
        const out = cachedOut
          ? finalizeOutput(analyses[ag], { ...cachedOut, provider: "replay", latency_ms: 0 })
          : finalizeOutput(analyses[ag], analyses[ag].baseline);
        outputs[ag] = out;
        yield { type: "agent_output", agent: ag, output: out, evidence: analyses[ag].evidence, note: cachedOut ? "Replayed saved AI answer" : "Rules engine (no saved AI answer for this revision)" };
      }
    } else {
      // run in parallel; results streamed as they finish
      const pending = new Map<AgentType, Promise<{ ag: AgentType; r: Awaited<ReturnType<typeof runAiAgent>> }>>();
      running.forEach((ag, i) =>
        pending.set(
          ag,
          (async () => {
            await sleep(i * 250); // gentle stagger for free-tier rate limits
            return { ag, r: await runAiAgent(analyses[ag], ctx, prefer) };
          })(),
        ),
      );
      while (pending.size) {
        const { ag, r } = await Promise.race(pending.values());
        pending.delete(ag);
        outputs[ag] = r.output;
        yield {
          type: "agent_output",
          agent: ag,
          output: r.output,
          evidence: analyses[ag].evidence,
          note: r.error ? `AI unavailable - rules engine used (${r.error.slice(0, 90)})` : undefined,
        };
      }
    }

    // ---- 3. reconcile + synthesis
    t = Date.now();
    const outs = AGENTS.map((a) => outputs[a]!) as AgentOutput[];
    const rec = reconcile(c, outs, cfg, financialImpactOf(analyses));
    yield { type: "tool", agent: "LIGHTHOUSE", name: "reconcile_and_govern", detail: `${rec.conflicts.length} conflict(s), ${rec.gates.filter((g) => g.status !== "CLEAR").length} gate(s) active`, ms: Date.now() - t };
    yield { type: "reconciled", reconciliation: rec };

    let synthesis: SynthesisResult;
    if (mode === "DEMO_SAFE") {
      const cs = cached.SYNTHESIS as SynthesisResult | undefined;
      synthesis = cs ? { ...cs, provider: "replay" } : templateSynthesis(c, outs, rec);
      await nap(400);
    } else {
      synthesis = await synthesize(c, outs, rec, prefer);
    }
    yield { type: "synthesis", synthesis };

    // ---- 4. persist
    const evidence = Object.values(analyses).flatMap((a) =>
      a.evidence.map((e) => ({
        evidence_id: e.evidence_id,
        decision_id: decisionId,
        run_id: runId,
        agent_type: e.agent_type,
        label: e.label,
        value: e.value ?? "not available",
        unit: e.unit ?? null,
        source: e.source,
        provenance: e.provenance,
        as_of: e.as_of ?? null,
      })),
    );
    const outRows = outs.map((o) => ({
      run_id: runId,
      decision_id: decisionId,
      agent_type: o.agent_type,
      recommendation: o.recommendation,
      confidence: o.confidence,
      risk_level: o.risk_level,
      evidence_ids: o.evidence_ids,
      key_metrics: o.key_metrics,
      conditions: o.conditions,
      dissent_reason: o.dissent_reason,
      rationale: o.rationale,
      provider: o.provider,
      model: o.model,
      latency_ms: o.latency_ms,
      valid: o.valid,
      validation_issues: o.validation_issues,
      guardrail_adjustments: o.guardrail_adjustments,
      data_quality: o.data_quality,
      hard_constraint: o.hard_constraint ?? null,
    }));
    const providers = [...new Set(outs.map((o) => o.provider).concat(synthesis.provider))].join(", ");
    const duration = Date.now() - t0;
    await sql.transaction([
      sql`insert into evidence (evidence_id, decision_id, run_id, agent_type, label, value, unit, source, provenance, as_of)
          select evidence_id, decision_id, run_id, agent_type, label, value, unit, source, provenance, as_of
          from json_populate_recordset(null::evidence, ${JSON.stringify(evidence)}::json)`,
      sql`insert into agent_outputs (run_id, decision_id, agent_type, recommendation, confidence, risk_level, evidence_ids, key_metrics,
                                     conditions, dissent_reason, rationale, provider, model, latency_ms, valid, validation_issues,
                                     guardrail_adjustments, data_quality, hard_constraint)
          select run_id, decision_id, agent_type, recommendation, confidence, risk_level, evidence_ids, key_metrics, conditions,
                 dissent_reason, rationale, provider, model, latency_ms, valid, validation_issues, guardrail_adjustments, data_quality, hard_constraint
          from json_populate_recordset(null::agent_outputs, ${JSON.stringify(outRows)}::json)`,
      sql`delete from lighthouse_decisions where decision_id = ${decisionId}`,
      sql`insert into lighthouse_decisions (decision_id, run_id, conflict_flag, conflict_severity, conflicts, synthesized_recommendation,
                                            lighthouse_confidence, confidence_breakdown, risk_level, conditions, gates, summary,
                                            summary_provider, headline, narrative, financial_impact, requires_legal_review,
                                            expedited_eligible, owner, ai_recommendation, ai_confidence, analyzed_at)
          values (${decisionId}, ${runId}, ${rec.conflict_flag}, ${rec.conflict_severity}, ${JSON.stringify(rec.conflicts)}::jsonb,
                  ${rec.synthesized_recommendation}, ${rec.lighthouse_confidence}, ${JSON.stringify(rec.confidence_breakdown)}::jsonb,
                  ${rec.risk_level}, ${rec.conditions}, ${JSON.stringify(rec.gates)}::jsonb, ${synthesis.summary}, ${synthesis.provider},
                  ${synthesis.headline}, ${JSON.stringify(synthesis)}::jsonb, ${rec.financial_impact}, ${rec.requires_legal_review},
                  ${rec.expedited_eligible}, ${c.created_by}, ${rec.synthesized_recommendation}, ${rec.lighthouse_confidence}, now())`,
      // a fresh answer from an agent needs a fresh sign-off from its department
      only
        ? sql`update reviews set superseded = true where decision_id = ${decisionId} and revision = ${c.revision} and department = ${only}`
        : sql`update reviews set superseded = true where decision_id = ${decisionId} and revision = ${c.revision} and department is not null`,
      sql`update decision_cases set status = 'IN_REVIEW', updated_at = now() where decision_id = ${decisionId}`,
      sql`update agent_runs set status = 'COMPLETED', finished_at = now(), duration_ms = ${duration}, provider_summary = ${providers}
          where run_id = ${runId}`,
    ]);
    if (mode === "LIVE_AI") {
      const cacheRows = outs
        .filter((o) => o.provider === "gemini" || o.provider === "groq")
        .map((o) => ({ agent_type: o.agent_type, output: o, provider: o.provider, model: o.model }));
      if (synthesis.provider === "gemini" || synthesis.provider === "groq")
        cacheRows.push({ agent_type: "SYNTHESIS" as AgentType, output: synthesis as unknown as AgentOutput, provider: synthesis.provider, model: synthesis.model });
      for (const r of cacheRows)
        await sql`insert into llm_cache (decision_id, revision, agent_type, output, provider, model)
                  values (${decisionId}, ${c.revision}, ${r.agent_type}, ${JSON.stringify(r.output)}::jsonb, ${r.provider}, ${r.model})
                  on conflict (decision_id, revision, agent_type) do update set output = excluded.output, provider = excluded.provider,
                  model = excluded.model, created_at = now()`;
    }
    await appendAudit(actor.name, actor.role, only ? "AGENT_RERUN_COMPLETED" : "AGENTS_RUN_COMPLETED", decisionId, {
      run_id: runId,
      mode,
      ...(only ? { agent: only, previous_run: previousRunId } : {}),
      revision: c.revision,
      providers,
      outputs: Object.fromEntries(outs.map((o) => [o.agent_type, `${o.recommendation} (${o.confidence})`])),
    });
    const guardrails = outs.filter((o) => !only || o.agent_type === only).flatMap((o) => o.guardrail_adjustments.map((g) => `${o.agent_type}: ${g}`));
    if (guardrails.length) await appendAudit("Lighthouse", "SYSTEM", "GUARDRAIL_APPLIED", decisionId, { run_id: runId, adjustments: guardrails });
    await appendAudit("Lighthouse", "SYSTEM", "RECOMMENDATION_GENERATED", decisionId, {
      run_id: runId,
      recommendation: rec.synthesized_recommendation,
      confidence: rec.lighthouse_confidence,
      conflict: rec.conflict_severity,
      legal_review_required: rec.requires_legal_review,
      summary_provider: synthesis.provider,
    });
    const refreshed = await refreshCase(decisionId);
    yield { type: "done", run_id: runId, status: refreshed?.status ?? "IN_REVIEW", duration_ms: duration };
  } catch (e) {
    await sql`update agent_runs set status = 'FAILED', finished_at = now() where run_id = ${runId}`;
    yield { type: "error", message: String((e as Error).message ?? e).slice(0, 300) };
  }
}
