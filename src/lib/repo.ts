import { db } from "./db";
import type { Category, Dc, DecisionCase, Facts, LegalRule, Thresholds } from "./types";
import { DEFAULT_THRESHOLDS } from "./types";

type Row = Record<string, unknown>;
const n = (v: unknown) => (v === null || v === undefined ? (v as null) : Number(v));
const d = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : (v as null));
const ts = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : (v as null));

export function mapCase(r: Row): DecisionCase {
  return {
    decision_id: String(r.decision_id),
    title: String(r.title),
    category_id: String(r.category_id),
    promo_type: r.promo_type as DecisionCase["promo_type"],
    discount_pct: Number(r.discount_pct),
    duration_weeks: Number(r.duration_weeks),
    start_date: d(r.start_date) as string,
    channel: r.channel as DecisionCase["channel"],
    claim_text: String(r.claim_text ?? ""),
    flags: (r.flags as string[]) ?? [],
    vendor_funding_pct: Number(r.vendor_funding_pct ?? 0),
    reallocation_units: Number(r.reallocation_units ?? 0),
    scope_kind: r.scope_kind as DecisionCase["scope_kind"],
    region_id: (r.region_id as string) ?? null,
    store_ids: (r.store_ids as string[]) ?? [],
    store_count: Number(r.store_count),
    states: (r.states as string[]) ?? [],
    data_as_of: d(r.data_as_of) as string,
    created_at: ts(r.created_at) as string,
    created_by: String(r.created_by),
    scenario_tag: String(r.scenario_tag ?? ""),
    status: r.status as DecisionCase["status"],
    revision: Number(r.revision ?? 1),
    facts: (r.facts as Facts) ?? null,
  };
}

export function mapCategory(r: Row): Category {
  return {
    category_id: String(r.category_id),
    name: String(r.name),
    source_dept: String(r.source_dept),
    provenance: r.provenance as Category["provenance"],
    gross_margin_pct: Number(r.gross_margin_pct),
    avg_unit_price: Number(r.avg_unit_price),
    ecom_share_base: Number(r.ecom_share_base),
    elasticity: Number(r.elasticity),
    elasticity_source: String(r.elasticity_source),
    measured_elasticity: n(r.measured_elasticity),
    measured_events: n(r.measured_events),
    halo_ratio: Number(r.halo_ratio ?? 0.3),
    regulated: Boolean(r.regulated),
  };
}

export function mapRule(r: Row): LegalRule {
  return {
    rule_id: String(r.rule_id),
    base_key: String(r.base_key),
    jurisdiction: String(r.jurisdiction),
    rule_type: String(r.rule_type),
    title: String(r.title),
    description: String(r.description),
    citation: String(r.citation),
    severity: r.severity as LegalRule["severity"],
    review_required: Boolean(r.review_required),
    prohibited: Boolean(r.prohibited),
    trigger: (r.trigger as LegalRule["trigger"]) ?? {},
    condition_text: String(r.condition_text),
    version: Number(r.version),
    enabled: Boolean(r.enabled),
  };
}

export async function getCase(id: string): Promise<DecisionCase | null> {
  const rows = await db()`select * from decision_cases where decision_id = ${id}`;
  return rows[0] ? mapCase(rows[0]) : null;
}

export async function getCategories(): Promise<Category[]> {
  const rows = await db()`select * from categories order by category_id`;
  return rows.map(mapCategory);
}

export async function getRules(onlyEnabled = true): Promise<LegalRule[]> {
  const rows = onlyEnabled
    ? await db()`select * from legal_rules where enabled order by rule_id`
    : await db()`select * from legal_rules order by rule_id`;
  return rows.map(mapRule);
}

export async function getDcs(): Promise<Dc[]> {
  const rows = await db()`select dc_id, name, daily_capacity_units from dcs order by dc_id`;
  return rows.map((r) => ({ dc_id: String(r.dc_id), name: String(r.name), daily_capacity_units: Number(r.daily_capacity_units) }));
}

export async function getConfigValue<T>(key: string, fallback: T): Promise<T> {
  const rows = await db()`select value from config where key = ${key}`;
  return rows[0] ? ({ ...(fallback as object), ...(rows[0].value as object) } as T) : fallback;
}

export async function getThresholds(): Promise<Thresholds> {
  return getConfigValue<Thresholds>("thresholds", DEFAULT_THRESHOLDS);
}

export async function getPilotClock(): Promise<string> {
  const rows = await db()`select value from config where key = 'pilot_clock'`;
  return rows[0] ? String((rows[0].value as { date: string }).date) : "2026-10-12";
}

export async function computeFacts(id: string): Promise<Facts> {
  const rows = await db()`update decision_cases set facts = compute_case_facts(decision_id), updated_at = now()
                          where decision_id = ${id} returning facts`;
  return rows[0].facts as Facts;
}
