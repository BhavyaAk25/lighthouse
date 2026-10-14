import type { AgentAnalysis, Recommendation, RiskLevel } from "../types";
import { clamp, evidenceFactory, num, pct, round, usdK } from "./common";
import type { EngineContext } from "./context";

export function analyzeSales(ctx: EngineContext): AgentAnalysis {
  const { c, f, cat, cfg, dq, demand: d } = ctx;
  const ev = evidenceFactory(ctx.runId, "SALES", f.data_as_of);
  const e1 = ev.add(
    "Baseline daily revenue (in-scope stores, 56-day window, regular price)",
    round(num(f.sales.avg_daily_revenue), 0),
    "sales_daily",
    "DERIVED",
    "USD/day",
  );
  const e2 = ev.add("Seasonal index for promotion window", round(d.seasonal_index, 3), "sales_daily (same dates, pilot year)", "DERIVED");
  const e3 = ev.add(
    "Promotional price elasticity",
    { benchmark: cat.elasticity, measured_from_m5: cat.measured_elasticity, measured_events: cat.measured_events },
    "categories",
    "ASSUMPTION",
  );
  const e4 = ev.add(
    "Real promo-day analog uplift (units, same stores & category, trailing 365 days)",
    { uplift_pct: f.promo_analogs.analog_uplift_pct, promo_store_days: f.promo_analogs.promo_store_days },
    "sales_daily (promo_flag)",
    "DERIVED",
    "%",
  );
  const e5 = ev.add(
    "Channel mix and digital conversion",
    { ecom_share: f.sales.ecom_share, conversion_pct: f.sales.avg_conversion_pct, channel: c.channel },
    "sales_daily",
    "DERIVED",
  );
  const e6 = ev.add(
    "Demand forecast for promotion window",
    {
      unit_uplift_pct: round(d.unit_uplift * 100, 2),
      revenue_uplift_pct: round(d.revenue_uplift * 100, 2),
      baseline_revenue: round(d.baseline_revenue),
      projected_revenue: round(d.projected_revenue),
    },
    "projectDemand()",
    "DERIVED",
  );
  const e7 = ev.add("Daily revenue volatility (coefficient of variation)", round(num(f.sales.daily_cv), 3), "sales_daily", "DERIVED");
  const e8 = ev.add(
    "Sales evidence freshness",
    { last_sales_date: f.sales.last_sales_date, age_days: dq.sales_age_days, coverage_pct: round(dq.sales_coverage * 100, 1) },
    "sales_daily",
    "DERIVED",
  );

  const upliftPct = d.unit_uplift * 100;
  const analogDays = num(f.promo_analogs.promo_store_days);
  const cv = num(f.sales.daily_cv);
  let conf = 0.88;
  const notes: string[] = [];
  if (analogDays < 30) {
    conf -= 0.12;
    notes.push("few real promo analogs in these stores");
  }
  if (cv > 0.15) conf -= Math.min(0.15, (cv - 0.15) * 0.6);
  if (cat.provenance === "GENERATED") {
    conf -= 0.06;
    notes.push("category demand pattern is generated, not observed");
  }
  if (c.store_count < 5) {
    conf -= 0.1;
    notes.push(`small test scope (${c.store_count} stores)`);
  }
  if (dq.sales_stale) conf -= 0.12;
  conf -= Math.max(0, 1 - dq.sales_coverage) * 0.5;
  conf = clamp(conf, 0.3, 0.95);

  let rec: Recommendation;
  let risk: RiskLevel;
  const conditions: string[] = [];
  let hardReason: string | null = null;
  if (dq.sales_coverage < cfg.sales_coverage_min) {
    rec = "REVIEW_REQUIRED";
    risk = "HIGH";
    hardReason = `Only ${(dq.sales_coverage * 100).toFixed(0)}% of expected sales records are available.`;
  } else if (upliftPct < cfg.min_uplift_pct) {
    rec = "HOLD";
    risk = "MEDIUM";
  } else if (upliftPct < cfg.strong_uplift_pct || conf < 0.65) {
    rec = "PROCEED_WITH_CONDITIONS";
    risk = "MEDIUM";
    if (conf < 0.65) conditions.push("Run as a 2-week test in a subset of stores before full rollout.");
    else conditions.push("Track weekly sell-through; stop early if uplift stays below forecast.");
  } else {
    rec = "PROCEED";
    risk = conf >= 0.75 ? "LOW" : "MEDIUM";
  }
  if (c.channel !== "STORE_ONLY" && rec !== "HOLD" && rec !== "REVIEW_REQUIRED" && d.online_fraction > 0.25)
    conditions.push("Feature the offer on the app homepage to capture digital demand.");

  const rationale =
    rec === "REVIEW_REQUIRED"
      ? `Insufficient sales evidence to forecast demand (${(dq.sales_coverage * 100).toFixed(0)}% coverage).`
      : `Forecast unit uplift ${pct(upliftPct)} and revenue ${pct(d.revenue_uplift * 100)} over ${d.window_days} days ` +
        `(${usdK(d.baseline_revenue)} baseline → ${usdK(d.projected_revenue)}). Elasticity ${cat.elasticity} benchmark` +
        (d.analog_uplift_scaled !== null ? `, blended with ${analogDays} real promo store-days (${pct(num(f.promo_analogs.analog_uplift_pct))} analog uplift)` : "") +
        `. Seasonal index ${d.seasonal_index.toFixed(2)}.` +
        (notes.length ? ` Confidence reduced: ${notes.join("; ")}.` : "");

  return {
    agent_type: "SALES",
    evidence: ev.items,
    metrics: {
      unit_uplift_pct: round(upliftPct, 2),
      revenue_uplift_pct: round(d.revenue_uplift * 100, 2),
      baseline_revenue: round(d.baseline_revenue),
      projected_revenue: round(d.projected_revenue),
      incremental_revenue: round(d.incremental_revenue),
      projected_units: round(d.projected_units),
      seasonal_index: round(d.seasonal_index, 3),
      elasticity: cat.elasticity,
      analog_uplift_pct: f.promo_analogs.analog_uplift_pct,
      analog_store_days: analogDays,
      ecom_share_pct: round(num(f.sales.ecom_share) * 100, 1),
      effective_discount_pct: round(d.effective_discount * 100, 1),
      daily_cv: round(cv, 3),
    },
    baseline: {
      agent_type: "SALES",
      recommendation: rec,
      confidence: round(conf, 2),
      risk_level: risk,
      evidence_ids: [e1, e2, e3, e4, e5, e6, e7, e8],
      key_metrics: {},
      conditions,
      dissent_reason: null,
      rationale,
      provider: "rules-engine",
      model: "lighthouse-rules-v1",
      latency_ms: null,
      valid: rec !== "REVIEW_REQUIRED" || !hardReason,
      validation_issues: hardReason ? [hardReason] : [],
      guardrail_adjustments: [],
      data_quality: dq,
      hard_constraint: hardReason,
    },
    hard: hardReason
      ? { allowed: ["REVIEW_REQUIRED"], min_risk: "HIGH", max_confidence: 0.5, invalid: true, reason: hardReason }
      : { max_confidence: dq.sales_stale ? 0.72 : undefined },
    policy: [
      `Recommend PROCEED when forecast unit uplift is at least ${cfg.strong_uplift_pct}% with adequate confidence.`,
      `Recommend PROCEED_WITH_CONDITIONS for uplift between ${cfg.min_uplift_pct}% and ${cfg.strong_uplift_pct}% or when confidence is below 0.65.`,
      `Recommend HOLD when forecast unit uplift is below ${cfg.min_uplift_pct}%.`,
      `Recommend REVIEW_REQUIRED when fewer than ${cfg.sales_coverage_min * 100}% of expected sales records exist.`,
      "Your objective is demand and commercial effect only; do not judge margin, capacity or legality.",
    ],
  };
}
