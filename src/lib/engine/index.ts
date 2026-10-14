import type { AgentAnalysis, AgentOutput, AgentType, Category, Dc, DecisionCase, Facts, LegalRule, Thresholds } from "../types";
import { RISK_ORDER } from "../types";
import { dataQuality, num } from "./common";
import type { EngineContext } from "./context";
import { projectDemand } from "./demand";
import { analyzeFinance } from "./finance";
import { analyzeLegal } from "./legal";
import { analyzeOperations } from "./operations";
import { reconcile } from "./reconcile";
import { analyzeSales } from "./sales";

export { reconcile } from "./reconcile";

export interface EngineInput {
  c: DecisionCase;
  f: Facts;
  cat: Category;
  cfg: Thresholds;
  rules: LegalRule[];
  dcs: Dc[];
  runId: string;
}

export function buildContext(i: EngineInput): EngineContext {
  const dq = dataQuality(i.c, i.f, i.cfg);
  const demand = projectDemand(i.c, i.f, i.cat);
  return { ...i, dq, demand };
}

export function analyzeAll(ctx: EngineContext): Record<AgentType, AgentAnalysis> {
  return {
    SALES: analyzeSales(ctx),
    FINANCE: analyzeFinance(ctx),
    OPERATIONS: analyzeOperations(ctx),
    LEGAL: analyzeLegal(ctx),
  };
}

/** Attach metrics to an output (metrics always come from the deterministic tools). */
export function finalizeOutput(a: AgentAnalysis, o: AgentOutput): AgentOutput {
  return { ...o, key_metrics: a.metrics };
}

export function financialImpactOf(analyses: Record<AgentType, AgentAnalysis>): number {
  return num(analyses.FINANCE.metrics.financial_impact);
}

/** Full offline pipeline: rules-engine judgement for every agent, then reconciliation. */
export function runRulesEngine(i: EngineInput) {
  const ctx = buildContext(i);
  const analyses = analyzeAll(ctx);
  const outputs = (Object.keys(analyses) as AgentType[]).map((k) => finalizeOutput(analyses[k], analyses[k].baseline));
  const rec = reconcile(i.c, outputs, i.cfg, financialImpactOf(analyses));
  return { ctx, analyses, outputs, reconciliation: rec };
}

/**
 * Guardrails applied to an AI agent's answer. Hard constraints from the deterministic
 * tools cannot be overridden; invalid evidence citations are removed and reported.
 */
export function applyGuardrails(a: AgentAnalysis, o: AgentOutput): AgentOutput {
  const out: AgentOutput = { ...o, conditions: [...o.conditions], guardrail_adjustments: [...o.guardrail_adjustments], validation_issues: [...o.validation_issues] };
  const known = new Set(a.evidence.map((e) => e.evidence_id));
  const cited = out.evidence_ids.filter((id) => known.has(id));
  const unknown = out.evidence_ids.filter((id) => !known.has(id));
  if (unknown.length) out.validation_issues.push(`Removed ${unknown.length} citation(s) to evidence that does not exist: ${unknown.slice(0, 3).join(", ")}.`);
  if (!cited.length) {
    out.validation_issues.push("No valid evidence cited; output treated as unsupported.");
    out.valid = false;
  }
  out.evidence_ids = cited;
  const h = a.hard;
  if (h.allowed && !h.allowed.includes(out.recommendation)) {
    out.guardrail_adjustments.push(`Recommendation changed from ${out.recommendation} to ${h.allowed[0]}: ${h.reason ?? "hard constraint"}.`);
    out.recommendation = h.allowed[0];
  }
  if (h.min_risk && RISK_ORDER[out.risk_level] < RISK_ORDER[h.min_risk]) {
    out.guardrail_adjustments.push(`Risk raised from ${out.risk_level} to ${h.min_risk} (minimum from triggered evidence).`);
    out.risk_level = h.min_risk;
  }
  if (h.max_confidence !== undefined && out.confidence > h.max_confidence) {
    out.guardrail_adjustments.push(`Confidence capped at ${h.max_confidence.toFixed(2)} (stale or incomplete evidence).`);
    out.confidence = h.max_confidence;
  }
  if (h.invalid) {
    out.valid = false;
    if (h.reason && !out.validation_issues.includes(h.reason)) out.validation_issues.push(h.reason);
  }
  out.hard_constraint = a.baseline.hard_constraint ?? null;
  return out;
}
