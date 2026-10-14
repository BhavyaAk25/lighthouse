import type { Category, DecisionCase, Facts } from "../types";
import { channelFraction, clamp, effectiveDiscount, mechanicLift, num } from "./common";

export interface DemandProjection {
  window_days: number;
  channel_fraction: number;
  seasonal_index: number;
  baseline_daily_revenue: number; // in-scope, regular price, seasonally adjusted
  baseline_revenue: number; // whole promo window, regular price
  baseline_units: number;
  effective_discount: number;
  price_unit_uplift: number;
  mechanic_lift: number;
  analog_uplift_scaled: number | null;
  analog_weight: number;
  fatigue_factor: number;
  unit_uplift: number; // final blended unit uplift (fraction)
  revenue_uplift: number; // fraction, after discount
  projected_revenue: number;
  projected_units: number;
  incremental_revenue: number;
  incremental_units: number;
  online_fraction: number; // share of projected demand fulfilled online
}

/**
 * Shared demand model (the Sales agent's forecast tool, also consumed by Finance and
 * Operations so every agent reasons over the same projection):
 *   units uplift = (1 - effective discount)^elasticity - 1  + mechanic lift
 *   blended 75/25 with the real promo-day analog uplift for the same stores/category,
 *   scaled by discount depth, then a fatigue factor for promotions longer than 4 weeks.
 */
export function projectDemand(c: DecisionCase, f: Facts, cat: Category): DemandProjection {
  const window_days = c.duration_weeks * 7;
  const ecom = num(f.sales.ecom_share, cat.ecom_share_base);
  const channel_fraction = channelFraction(c, ecom);
  const seasonal_index = clamp(num(f.seasonality.seasonal_index, 1), 0.6, 1.8);
  const priceIdx = num(f.sales.avg_price_index, 1) || 1;
  // baseline at regular price: undo any promo days already inside the evidence window
  const baseline_daily_revenue = (num(f.sales.avg_daily_revenue) / priceIdx) * seasonal_index * channel_fraction;
  const baseline_revenue = baseline_daily_revenue * window_days;
  const baseline_units = num(f.sales.avg_daily_units) * seasonal_index * channel_fraction * window_days;

  const effective_discount = effectiveDiscount(c.promo_type, num(c.discount_pct));
  const elasticity = num(cat.elasticity, -1.5) * (c.promo_type === "CLEARANCE_MARKDOWN" ? 0.6 : 1);
  const price_unit_uplift = effective_discount > 0 ? Math.pow(1 - effective_discount, elasticity) - 1 : 0;
  const mechanic = mechanicLift(c.promo_type);

  // analog: real promo days in these stores (depth ~ 1 - promo price index)
  const analogPct = f.promo_analogs.analog_uplift_pct;
  const analogDays = num(f.promo_analogs.promo_store_days);
  const analogDepth = Math.max(0.01, 1 - num(f.promo_analogs.promo_avg_price_index, 0.97));
  let analog_uplift_scaled: number | null = null;
  let analog_weight = 0;
  if (analogPct !== null && analogPct !== undefined && analogDays >= 30 && effective_discount > 0) {
    analog_uplift_scaled = clamp((num(analogPct) / 100) * (effective_discount / analogDepth), -0.1, 1.5);
    analog_weight = 0.25;
  }
  let unit_uplift = price_unit_uplift + mechanic;
  if (analog_uplift_scaled !== null) unit_uplift = (1 - analog_weight) * unit_uplift + analog_weight * analog_uplift_scaled;
  if (c.promo_type === "INVENTORY_REALLOCATION") {
    // recovering sales lost to stock-outs where inventory is moved in
    const fill = num(f.operations.fill_rate_pct_14d, 98) / 100;
    const units = num(c.reallocation_units);
    unit_uplift = clamp((1 - fill) * 1.8 + (baseline_units > 0 ? (units / baseline_units) * 0.15 : 0), 0.005, 0.08);
  }
  const fatigue_factor = c.duration_weeks > 4 ? Math.max(0.7, 1 - 0.04 * (c.duration_weeks - 4)) : 1;
  unit_uplift = unit_uplift * fatigue_factor;

  const revenue_uplift = (1 + unit_uplift) * (1 - effective_discount) - 1;
  const projected_revenue = baseline_revenue * (1 + revenue_uplift);
  const projected_units = baseline_units * (1 + unit_uplift);
  const online_fraction = c.channel === "ONLINE_ONLY" ? 1 : c.channel === "STORE_ONLY" ? 0 : ecom;
  return {
    window_days,
    channel_fraction,
    seasonal_index,
    baseline_daily_revenue,
    baseline_revenue,
    baseline_units,
    effective_discount,
    price_unit_uplift,
    mechanic_lift: mechanic,
    analog_uplift_scaled,
    analog_weight,
    fatigue_factor,
    unit_uplift,
    revenue_uplift,
    projected_revenue,
    projected_units,
    incremental_revenue: projected_revenue - baseline_revenue,
    incremental_units: projected_units - baseline_units,
    online_fraction,
  };
}
