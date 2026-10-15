import type { AgentAnalysis, PromoType, Recommendation, RiskLevel } from "../types";
import { clamp, effectiveDiscount, evidenceFactory, num, round, usdK } from "./common";
import type { EngineContext } from "./context";
import { projectDemand } from "./demand";

// CAPSTONE ASSUMPTIONS: promotion execution costs per store per week (USD)
const COST_PER_STORE_WEEK: Record<PromoType, number> = {
  PRICE_ROLLBACK: 260,
  BOGO: 420,
  DIGITAL_COUPON: 120,
  ENDCAP_FEATURE: 650,
  BUNDLE_DISCOUNT: 300,
  CLEARANCE_MARKDOWN: 110,
  INVENTORY_REALLOCATION: 0,
  ONLINE_FLASH_DEAL: 0,
};
const FLAT_COST: Partial<Record<PromoType, number>> = { ONLINE_FLASH_DEAL: 8_000, DIGITAL_COUPON: 4_000 };

interface Economics {
  incremental_gross_profit: number;
  halo_gross_profit: number;
  writedown_avoided: number;
  vendor_funding: number;
  promo_cost: number;
  incremental_labor_fulfillment: number;
  inventory_cost: number;
  markdown_investment: number;
  net_benefit: number;
  roi_pct: number;
  investment: number;
}

function economics(ctx: EngineContext, discountPct: number, upliftScale = 1): Economics {
  const { c, cat } = ctx;
  const d = discountPct === c.discount_pct && upliftScale === 1 ? ctx.demand : projectDemand({ ...c, discount_pct: discountPct }, ctx.f, cat);
  const m = num(cat.gross_margin_pct) / 100;
  const de = effectiveDiscount(c.promo_type, discountPct);
  const u = d.unit_uplift * upliftScale;
  const B = d.baseline_revenue;
  // promo GP - base GP; unit cost is fixed, price falls by the effective discount
  const incremental_gross_profit = B * ((1 + u) * (m - de) - m);
  // basket halo: promo-driven trips add purchases of other items (blended 25% margin)
  const halo_gross_profit = Math.max(0, B * u) * num(cat.halo_ratio, 0.3) * 0.25;
  const discountCost = B * (1 + u) * de;
  const vendor_funding = discountCost * (num(c.vendor_funding_pct) / 100);
  const promo_cost =
    c.store_count * c.duration_weeks * COST_PER_STORE_WEEK[c.promo_type] +
    (FLAT_COST[c.promo_type] ?? 0) +
    (c.promo_type === "INVENTORY_REALLOCATION" ? num(c.reallocation_units) * 1.1 : 0);
  const unitPrice = num(cat.avg_unit_price, 5);
  const incrUnits = d.baseline_units * u;
  const incremental_labor_fulfillment = Math.max(0, incrUnits) * (0.06 + d.online_fraction * 0.85);
  const inventory_cost = Math.max(0, incrUnits) * unitPrice * (1 - m) * 0.25 * (c.duration_weeks / 52) * 1.5;
  // clearance: selling aged stock avoids a write-down (assume 60% of cost would be written off)
  const writedown_avoided =
    c.promo_type === "CLEARANCE_MARKDOWN" ? Math.max(0, d.baseline_units * (1 + u)) * unitPrice * (1 - m) * 0.6 : 0;
  const net_benefit =
    incremental_gross_profit + halo_gross_profit + vendor_funding + writedown_avoided - promo_cost - incremental_labor_fulfillment - inventory_cost;
  const markdown_investment = discountCost - vendor_funding;
  const investment = Math.max(1, promo_cost + incremental_labor_fulfillment + inventory_cost + markdown_investment);
  return {
    incremental_gross_profit,
    halo_gross_profit,
    writedown_avoided,
    vendor_funding,
    promo_cost,
    incremental_labor_fulfillment,
    inventory_cost,
    markdown_investment,
    net_benefit,
    roi_pct: (net_benefit / investment) * 100,
    investment,
  };
}

/** Largest discount (in whole %) that still breaks even, or null if none does. */
function breakEvenDiscount(ctx: EngineContext): number | null {
  if (ctx.c.promo_type === "INVENTORY_REALLOCATION") return null;
  let best: number | null = null;
  for (let p = 1; p <= 60; p++) {
    if (economics(ctx, p).net_benefit >= 0) best = p;
  }
  return best === 60 ? null : best; // null = not binding (profitable at every tested depth) or never profitable
}

export function analyzeFinance(ctx: EngineContext): AgentAnalysis {
  const { c, f, cat, cfg, dq, demand: d } = ctx;
  const ev = evidenceFactory(ctx.runId, "FINANCE", f.data_as_of);
  const eco = economics(ctx, num(c.discount_pct));
  const down = economics(ctx, num(c.discount_pct), 0.6);
  const be = breakEvenDiscount(ctx);
  const baselineMissing = num(f.sales.rows_observed) === 0 || d.baseline_revenue <= 0;

  const e1 = ev.add("Baseline window revenue at regular price", round(d.baseline_revenue), "projectDemand()", "DERIVED", "USD");
  const e2 = ev.add("Category gross margin", num(cat.gross_margin_pct), "categories", "ASSUMPTION", "%");
  const e3 = ev.add(
    "Incremental gross profit (promo vs baseline)",
    round(eco.incremental_gross_profit),
    "finance model",
    "DERIVED",
    "USD",
  );
  const e4 = ev.add(
    "Promotion execution cost",
    { total: round(eco.promo_cost), basis: `${c.store_count} stores x ${c.duration_weeks} wk` },
    "finance model (cost assumptions)",
    "ASSUMPTION",
    "USD",
  );
  const e5 = ev.add(
    "Incremental labor, fulfillment and inventory carrying cost",
    { labor_fulfillment: round(eco.incremental_labor_fulfillment), inventory: round(eco.inventory_cost) },
    "finance model",
    "DERIVED",
    "USD",
  );
  ev.add("Basket halo gross profit (other items on promo trips)", { amount: round(eco.halo_gross_profit), halo_ratio: cat.halo_ratio }, "finance model", "ASSUMPTION", "USD");
  const e6 = ev.add("Supplier funding offset", { pct: c.vendor_funding_pct, amount: round(eco.vendor_funding) }, "decision case", "GENERATED", "USD");
  const e7 = ev.add(
    "Net benefit, ROI and downside case (uplift -40%)",
    { net_benefit: round(eco.net_benefit), roi_pct: round(eco.roi_pct, 1), downside_net: round(down.net_benefit) },
    "finance model",
    "DERIVED",
  );
  const e8 = ev.add(
    "Break-even discount",
    be ?? (eco.net_benefit >= 0 ? "Not binding: profitable at every tested discount up to 60%" : "None: not profitable at any discount"),
    "finance model (solver)",
    "DERIVED",
    be === null ? undefined : "%",
  );

  const net = eco.net_benefit;
  // materiality: small losses relative to the revenue at stake are a HOLD, not a REJECT
  const rejectLine = Math.min(cfg.finance_reject_net, -0.02 * d.baseline_revenue);
  const costCeiling = Math.max(0, eco.incremental_gross_profit + eco.halo_gross_profit + eco.vendor_funding - eco.inventory_cost);
  let rec: Recommendation;
  let risk: RiskLevel;
  const conditions: string[] = [];
  let hardReason: string | null = null;
  if (baselineMissing) {
    rec = "REVIEW_REQUIRED";
    risk = "HIGH";
    hardReason = "No sales baseline available for the scope; financial impact cannot be computed.";
  } else if (net < rejectLine) {
    rec = "REJECT";
    risk = "HIGH";
    hardReason = `Net benefit ${usdK(net)} is below the ${usdK(rejectLine)} rejection line (larger of ${usdK(cfg.finance_reject_net)} or 2% of baseline revenue).`;
    if (be !== null && be < c.discount_pct) conditions.push(`Economics break even at a discount of ${be}% or less.`);
  } else if (net < 0) {
    rec = "HOLD";
    risk = "MEDIUM";
    if (be !== null && be < c.discount_pct) conditions.push(`Reduce discount to ${be}% or less to break even.`);
  } else if (down.net_benefit < 0) {
    rec = "PROCEED_WITH_CONDITIONS";
    risk = "MEDIUM";
    conditions.push(`Keep total promotion and fulfillment costs within ${usdK(costCeiling)} (cost ceiling).`);
  } else {
    rec = "PROCEED";
    risk = "LOW";
  }
  if (c.vendor_funding_pct > 0 && rec !== "REJECT" && rec !== "REVIEW_REQUIRED")
    conditions.push(`Secure signed supplier funding agreement for ${c.vendor_funding_pct}% of markdown.`);

  let conf = 0.86;
  if (cat.provenance === "GENERATED") conf -= 0.05;
  if (dq.sales_stale) conf -= 0.1;
  if (Math.abs(net) < 0.05 * eco.investment) conf -= 0.12; // marginal economics
  conf = clamp(conf - Math.max(0, 1 - dq.sales_coverage) * 0.4, 0.3, 0.95);

  const rationale = baselineMissing
    ? "Cannot evaluate economics: the sales baseline for this scope is missing."
    : `Incremental gross profit ${usdK(eco.incremental_gross_profit)} on the promoted category, ${usdK(eco.halo_gross_profit)} basket halo` +
      (eco.vendor_funding > 0 ? `, ${usdK(eco.vendor_funding)} supplier funding` : "") +
      (eco.writedown_avoided > 0 ? `, ${usdK(eco.writedown_avoided)} write-down avoided on aged stock` : "") +
      `, less ${usdK(eco.promo_cost)} promotion cost and ${usdK(eco.incremental_labor_fulfillment + eco.inventory_cost)} labor/fulfillment/inventory ` +
      `= net ${usdK(net)} (ROI ${eco.roi_pct.toFixed(1)}%). Downside case (uplift -40%): ${usdK(down.net_benefit)}.` +
      (be !== null && be < c.discount_pct ? ` Break-even discount is ${be}%.` : "");

  return {
    agent_type: "FINANCE",
    evidence: ev.items,
    metrics: {
      net_benefit: round(net),
      roi_pct: round(eco.roi_pct, 1),
      incremental_gross_profit: round(eco.incremental_gross_profit),
      halo_gross_profit: round(eco.halo_gross_profit),
      writedown_avoided: round(eco.writedown_avoided),
      promo_cost: round(eco.promo_cost),
      incremental_costs: round(eco.incremental_labor_fulfillment + eco.inventory_cost),
      vendor_funding: round(eco.vendor_funding),
      markdown_investment: round(eco.markdown_investment),
      downside_net_benefit: round(down.net_benefit),
      break_even_discount_pct: be,
      cost_ceiling: round(costCeiling),
      gross_margin_pct: num(cat.gross_margin_pct),
      financial_impact: round(Math.abs(d.incremental_revenue) + eco.markdown_investment),
    },
    baseline: {
      agent_type: "FINANCE",
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
      valid: !baselineMissing,
      validation_issues: baselineMissing && hardReason ? [hardReason] : [],
      guardrail_adjustments: [],
      data_quality: dq,
      hard_constraint: hardReason,
    },
    hard: baselineMissing
      ? { allowed: ["REVIEW_REQUIRED"], min_risk: "HIGH", max_confidence: 0.5, invalid: true, reason: hardReason }
      : net < rejectLine
        ? { allowed: ["REJECT", "HOLD"], min_risk: "HIGH", reason: hardReason }
        : { max_confidence: dq.sales_stale ? 0.72 : undefined },
    policy: [
      `Recommend REJECT when net benefit is below the rejection line (the larger loss of ${usdK(cfg.finance_reject_net)} or 2% of baseline revenue).`,
      "Recommend HOLD when net benefit is negative but above the rejection threshold.",
      "Recommend PROCEED_WITH_CONDITIONS when net benefit is positive but the downside case is negative (state a cost ceiling).",
      "Recommend PROCEED when both the expected and downside cases are positive.",
      "Recommend REVIEW_REQUIRED when the sales baseline is missing; never invent a baseline.",
      "Your objective is economic value and downside only.",
    ],
  };
}
