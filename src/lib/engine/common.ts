import type { AgentType, DataQuality, DecisionCase, EvidenceItem, Facts, PromoType, Provenance, Thresholds } from "../types";

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const round = (v: number, d = 0) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};
export const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
};

export function daysBetween(a: string, b: string): number {
  const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((db - da) / 86_400_000);
}

export const usd = (v: number) =>
  (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 });
export const usdK = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `$${(a / 1e3).toFixed(0)}K` : `$${a.toFixed(0)}`;
  return (v < 0 ? "-" : "") + s;
};
export const pct = (v: number, d = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;

/** The date the case is evaluated on: when it was created (historical) or the pilot clock. */
export function evaluationDate(c: DecisionCase): string {
  return String(c.created_at).slice(0, 10);
}

export function dataQuality(c: DecisionCase, f: Facts, cfg: Thresholds): DataQuality {
  const evalDate = evaluationDate(c);
  const salesDate = f.sales.last_sales_date;
  const opsDate = f.operations.oldest_store_ops_date ?? f.operations.last_ops_date;
  const sales_age_days = salesDate ? daysBetween(salesDate, evalDate) : null;
  const ops_age_days = opsDate ? daysBetween(opsDate, evalDate) : null;
  const sales_coverage = f.sales.rows_expected ? num(f.sales.rows_observed) / f.sales.rows_expected : 0;
  const ops_coverage = f.operations.stores_in_scope
    ? num(f.operations.stores_reporting_current) / f.operations.stores_in_scope
    : 0;
  const sales_stale = sales_age_days === null || sales_age_days > cfg.sales_stale_days;
  const ops_stale = ops_age_days === null || ops_age_days > cfg.ops_stale_days;
  const issues: string[] = [];
  if (sales_stale) issues.push(`Sales evidence is ${sales_age_days ?? "?"} days old (limit ${cfg.sales_stale_days}).`);
  if (ops_stale) issues.push(`Operations evidence is ${ops_age_days ?? "?"} days old (limit ${cfg.ops_stale_days}).`);
  if (sales_coverage < 0.98) issues.push(`Sales coverage ${(sales_coverage * 100).toFixed(0)}% of expected store-days.`);
  if (ops_coverage < 1)
    issues.push(
      `${f.operations.stores_in_scope - num(f.operations.stores_reporting_current)} of ${f.operations.stores_in_scope} stores not reporting current inventory.`,
    );
  return { sales_age_days, ops_age_days, sales_stale, ops_stale, sales_coverage, ops_coverage, issues };
}

export function channelFraction(c: DecisionCase, ecomShare: number) {
  if (c.channel === "STORE_ONLY") return 1 - ecomShare;
  if (c.channel === "ONLINE_ONLY") return ecomShare;
  return 1;
}

/** How much of the headline discount customers actually receive, by promotion mechanic. */
export function effectiveDiscount(type: PromoType, discountPct: number): number {
  const d = discountPct / 100;
  switch (type) {
    case "DIGITAL_COUPON":
      return d * 0.45; // only clipping/redeeming customers get the discount
    case "BOGO":
      return d * 0.8; // not every basket completes the pair
    case "BUNDLE_DISCOUNT":
      return d * 0.7;
    case "INVENTORY_REALLOCATION":
      return 0;
    default:
      return d;
  }
}

/** Non-price lift from the mechanic itself (display, urgency, deal salience). */
export function mechanicLift(type: PromoType): number {
  return (
    {
      ENDCAP_FEATURE: 0.12,
      ONLINE_FLASH_DEAL: 0.1,
      BOGO: 0.06,
      DIGITAL_COUPON: 0.05,
      PRICE_ROLLBACK: 0.03,
      BUNDLE_DISCOUNT: 0.03,
      CLEARANCE_MARKDOWN: 0,
      INVENTORY_REALLOCATION: 0,
    } as Record<PromoType, number>
  )[type];
}

export const PROMO_LABEL: Record<PromoType, string> = {
  PRICE_ROLLBACK: "Price rollback",
  BOGO: "Buy one, get one",
  DIGITAL_COUPON: "Digital coupon",
  ENDCAP_FEATURE: "Endcap feature",
  BUNDLE_DISCOUNT: "Bundle discount",
  CLEARANCE_MARKDOWN: "Clearance markdown",
  INVENTORY_REALLOCATION: "Inventory reallocation",
  ONLINE_FLASH_DEAL: "Online flash deal",
};

export function evidenceFactory(runId: string, agent: AgentType, asOf: string | null) {
  const letter = { SALES: "S", FINANCE: "F", OPERATIONS: "O", LEGAL: "L" }[agent];
  const base = runId.replace(/^RUN-/, "EV-");
  let n = 0;
  const items: EvidenceItem[] = [];
  const add = (label: string, value: unknown, source: string, provenance: Provenance, unit?: string) => {
    n += 1;
    const id = `${base}-${letter}${n}`;
    items.push({ evidence_id: id, agent_type: agent, label, value: value ?? "not available", unit, source, provenance, as_of: asOf });
    return id;
  };
  return { items, add };
}
