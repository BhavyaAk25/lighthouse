import type { AgentAnalysis, Recommendation, RiskLevel } from "../types";
import { clamp, daysBetween, evaluationDate, evidenceFactory, num, round } from "./common";
import type { EngineContext } from "./context";

export function analyzeOperations(ctx: EngineContext): AgentAnalysis {
  const { c, f, cfg, dq, demand: d, dcs } = ctx;
  const o = f.operations;
  const ev = evidenceFactory(ctx.runId, "OPERATIONS", o.last_ops_date ?? f.data_as_of);
  const scopeDcs = (o.dcs ?? []).filter(Boolean);
  const dcCap = dcs.filter((x) => scopeDcs.includes(x.dc_id)).reduce((s, x) => s + num(x.daily_capacity_units), 0) || 1;

  const pd = d.projected_units / d.window_days; // projected daily units in scope
  const incrDaily = Math.max(0, d.incremental_units / d.window_days);
  const dcBase = num(f.dc.utilization_pct_window_hist, num(f.dc.utilization_pct_14d, 85));
  // launch-week peak: busiest historical days in the window, capped at window average + 12 pts
  const dcPeakBase = Math.min(num(f.dc.utilization_pct_window_peak, dcBase + 10), dcBase + 12);
  const dcAdded = (incrDaily / dcCap) * 100;
  const dcProjAvg = dcBase + dcAdded;
  const dcProjPeak = dcPeakBase + dcAdded * 1.3; // launch week is front-loaded

  const u = Math.max(0, d.unit_uplift);
  const laborProj = num(o.labor_capacity_pct_14d, 72) + u * (1 - d.online_fraction) * 28 + (c.promo_type === "ENDCAP_FEATURE" ? 3 : 0);
  const fulfilBase = num(o.fulfillment_capacity_pct_14d, 72) + 8; // average plus a peak-day allowance
  const fulfilProj = d.online_fraction > 0 ? fulfilBase + u * d.online_fraction * 55 : fulfilBase;

  const lead = num(o.lead_time_days_14d, 2.5);
  const mitigation = c.promo_type === "INVENTORY_REALLOCATION" ? num(c.reallocation_units) : 0;
  const onHand = num(o.on_hand_units) + num(o.inbound_units) + mitigation;
  const usable = onHand - num(o.safety_stock_units);
  const coverageDays = pd > 0 ? usable / pd : 99;
  const required = pd * (lead + 2) + num(o.safety_stock_units);
  const launchGap = Math.max(0, required - onHand);
  const daysToLaunch = daysBetween(evaluationDate(c), c.start_date);
  const leadIncompatible = launchGap > 0 && daysToLaunch < lead + 2;
  const baseFill = num(o.fill_rate_pct_14d, 98);
  const fillProj = clamp(
    baseFill -
      (required > 0 ? (launchGap / required) * (daysToLaunch >= lead + 2 ? 6 : 25) : 0) -
      Math.max(0, dcProjPeak - 100) * 0.25 -
      Math.max(0, fulfilProj - 100) * 0.2 * d.online_fraction,
    70,
    99.9,
  );

  const e1 = ev.add(
    "Inventory position at evidence date (on hand, inbound, safety stock)",
    { on_hand: o.on_hand_units, inbound: o.inbound_units, safety_stock: o.safety_stock_units, reallocated_in: mitigation || undefined },
    "ops_daily",
    "GENERATED",
    "units",
  );
  const e2 = ev.add("Projected daily demand in scope", round(pd), "projectDemand()", "DERIVED", "units/day");
  const e3 = ev.add(
    "Distribution center utilization (history for same window + 14-day)",
    { window_avg: f.dc.utilization_pct_window_hist, window_peak: f.dc.utilization_pct_window_peak, last_14d: f.dc.utilization_pct_14d, dcs: scopeDcs },
    "dc_daily",
    "GENERATED",
    "%",
  );
  const e4 = ev.add(
    "Projected DC utilization with promotion",
    { average: round(dcProjAvg, 1), launch_week_peak: round(dcProjPeak, 1), added_by_promo: round(dcAdded, 2) },
    "operations model",
    "DERIVED",
    "%",
  );
  const e5 = ev.add(
    "Store labor and online fulfillment capacity (projected)",
    { labor_pct: round(laborProj, 1), fulfillment_p90_pct: round(fulfilProj, 1), labor_14d: o.labor_capacity_pct_14d, fulfillment_14d: o.fulfillment_capacity_pct_14d },
    "ops_daily + operations model",
    "DERIVED",
    "%",
  );
  const e6 = ev.add(
    "Launch inventory requirement and gap",
    { required_units: round(required), gap_units: round(launchGap), coverage_days: round(coverageDays, 1), days_to_launch: daysToLaunch, lead_time_days: lead },
    "operations model",
    "DERIVED",
  );
  const e7 = ev.add("Projected fill rate", round(fillProj, 2), "operations model", "DERIVED", "%");
  const e8 = ev.add(
    "Operations evidence freshness and coverage",
    {
      last_ops_date: o.last_ops_date,
      stores_reporting: `${o.stores_reporting_current}/${o.stores_in_scope}`,
      age_days: dq.ops_age_days,
    },
    "ops_daily",
    "DERIVED",
  );

  const breaches: string[] = [];
  if (dcProjPeak >= cfg.dc_hard_stop_pct) breaches.push(`DC launch-week utilization ${dcProjPeak.toFixed(0)}% ≥ ${cfg.dc_hard_stop_pct}% limit`);
  if (fillProj < cfg.fill_rate_floor_pct) breaches.push(`projected fill rate ${fillProj.toFixed(1)}% < ${cfg.fill_rate_floor_pct}% floor`);
  if (d.online_fraction > 0.15 && fulfilProj >= cfg.fulfillment_hard_stop_pct)
    breaches.push(`online fulfillment capacity ${fulfilProj.toFixed(0)}% ≥ ${cfg.fulfillment_hard_stop_pct}%`);
  if (leadIncompatible) breaches.push(`launch in ${daysToLaunch} days but replenishment lead time is ${lead.toFixed(1)} days`);

  const conditions: string[] = [];
  if (dcProjPeak >= cfg.dc_warn_pct) conditions.push("Stage replenishment by week instead of a single launch delivery.");
  if (d.online_fraction > 0.15 && fulfilProj >= cfg.fulfillment_warn_pct)
    conditions.push("Add pickup/delivery slots or cap daily online orders during launch week.");
  if (laborProj >= cfg.labor_warn_pct) conditions.push(`Schedule additional store labor hours (projected ${laborProj.toFixed(0)}% utilization).`);
  if (launchGap > 0 && !leadIncompatible) conditions.push(`Pre-position ${Math.round(launchGap).toLocaleString()} units before launch.`);

  const missing = dq.ops_coverage < cfg.ops_coverage_min;
  let rec: Recommendation;
  let risk: RiskLevel;
  let hardReason: string | null = null;
  if (missing) {
    rec = "REVIEW_REQUIRED";
    risk = "HIGH";
    hardReason = `Inventory data missing for ${o.stores_in_scope - num(o.stores_reporting_current)} of ${o.stores_in_scope} stores (coverage ${(dq.ops_coverage * 100).toFixed(0)}%). Replacement values are not imputed.`;
  } else if (breaches.length) {
    rec = "HOLD";
    risk = "HIGH";
    hardReason = `Capacity hard stop: ${breaches.join("; ")}.`;
  } else if (conditions.length) {
    rec = "PROCEED_WITH_CONDITIONS";
    risk = "MEDIUM";
  } else {
    rec = "PROCEED";
    risk = "LOW";
  }

  let conf = 0.86;
  if (dq.ops_stale) conf -= 0.15;
  conf -= Math.max(0, 1 - dq.ops_coverage) * 0.6;
  if (Math.abs(dcProjPeak - cfg.dc_hard_stop_pct) < 5) conf -= 0.07;
  if (Math.abs(fillProj - cfg.fill_rate_floor_pct) < 1.5) conf -= 0.05;
  conf = clamp(conf, 0.3, 0.95);

  const rationale = missing
    ? hardReason!
    : `Projected DC utilization ${dcProjAvg.toFixed(0)}% avg / ${dcProjPeak.toFixed(0)}% launch-week peak; online fulfillment ${fulfilProj.toFixed(0)}%; ` +
      `store labor ${laborProj.toFixed(0)}%. Usable inventory covers ${coverageDays.toFixed(1)} days of promoted demand; projected fill rate ${fillProj.toFixed(1)}%.` +
      (breaches.length ? ` Hard stop: ${breaches.join("; ")}.` : "");

  return {
    agent_type: "OPERATIONS",
    evidence: ev.items,
    metrics: {
      dc_util_projected_avg_pct: round(dcProjAvg, 1),
      dc_util_projected_peak_pct: round(dcProjPeak, 1),
      fulfillment_projected_pct: round(fulfilProj, 1),
      labor_projected_pct: round(laborProj, 1),
      projected_fill_rate_pct: round(fillProj, 2),
      coverage_days: round(coverageDays, 1),
      launch_gap_units: round(launchGap),
      lead_time_days: lead,
      days_to_launch: daysToLaunch,
      stores_reporting: `${o.stores_reporting_current}/${o.stores_in_scope}`,
      capacity_breach: breaches.length > 0,
    },
    baseline: {
      agent_type: "OPERATIONS",
      recommendation: rec,
      confidence: round(conf, 2),
      risk_level: risk,
      evidence_ids: [e1, e2, e3, e4, e5, e6, e7, e8],
      key_metrics: {},
      conditions: missing ? [] : conditions,
      dissent_reason: null,
      rationale,
      provider: "rules-engine",
      model: "lighthouse-rules-v1",
      latency_ms: null,
      valid: !missing,
      validation_issues: missing && hardReason ? [hardReason] : [],
      guardrail_adjustments: [],
      data_quality: dq,
      hard_constraint: hardReason,
    },
    hard: missing
      ? { allowed: ["REVIEW_REQUIRED"], min_risk: "HIGH", max_confidence: 0.45, invalid: true, reason: hardReason }
      : breaches.length
        ? { allowed: ["HOLD", "REJECT"], min_risk: "HIGH", reason: hardReason }
        : { max_confidence: dq.ops_stale ? 0.7 : undefined },
    policy: [
      `HOLD (hard stop) if launch-week DC utilization ≥ ${cfg.dc_hard_stop_pct}%, projected fill rate < ${cfg.fill_rate_floor_pct}%, online fulfillment ≥ ${cfg.fulfillment_hard_stop_pct}%, or lead time makes the launch date impossible.`,
      `PROCEED_WITH_CONDITIONS when utilization passes ${cfg.dc_warn_pct}% (DC), ${cfg.fulfillment_warn_pct}% (fulfillment) or ${cfg.labor_warn_pct}% (labor), or a launch inventory gap exists; state the mitigation.`,
      `REVIEW_REQUIRED if fewer than ${cfg.ops_coverage_min * 100}% of stores report current inventory; never impute missing values.`,
      "Your objective is executability only: inventory, capacity, labor, lead time and service level.",
    ],
  };
}
