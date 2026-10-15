// Shared domain types for Lighthouse.

export const AGENTS = ["SALES", "FINANCE", "OPERATIONS", "LEGAL"] as const;
export type AgentType = (typeof AGENTS)[number];

export const RECOMMENDATIONS = ["PROCEED", "PROCEED_WITH_CONDITIONS", "HOLD", "REJECT", "REVIEW_REQUIRED"] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export type Provenance = "REAL" | "DERIVED" | "GENERATED" | "PUBLIC" | "ASSUMPTION";

export type CaseStatus =
  | "DRAFT"
  | "IN_REVIEW"
  | "READY_FOR_DECISION"
  | "APPROVED"
  | "REJECTED"
  | "REVISION_REQUESTED";

export type PromoType =
  | "PRICE_ROLLBACK"
  | "BOGO"
  | "DIGITAL_COUPON"
  | "ENDCAP_FEATURE"
  | "BUNDLE_DISCOUNT"
  | "CLEARANCE_MARKDOWN"
  | "INVENTORY_REALLOCATION"
  | "ONLINE_FLASH_DEAL";

export type Channel = "OMNICHANNEL" | "STORE_ONLY" | "ONLINE_ONLY";

export interface DecisionCase {
  decision_id: string;
  title: string;
  category_id: string;
  promo_type: PromoType;
  discount_pct: number;
  duration_weeks: number;
  start_date: string; // YYYY-MM-DD
  channel: Channel;
  claim_text: string;
  flags: string[];
  vendor_funding_pct: number;
  reallocation_units: number;
  scope_kind: "ALL" | "REGION" | "SUBSET";
  region_id: string | null;
  store_ids: string[];
  store_count: number;
  states: string[];
  data_as_of: string;
  created_at: string;
  created_by: string;
  scenario_tag: string;
  status: CaseStatus;
  revision: number;
  facts: Facts | null;
}

export interface Category {
  category_id: string;
  name: string;
  source_dept: string;
  provenance: "REAL" | "GENERATED";
  gross_margin_pct: number;
  avg_unit_price: number;
  ecom_share_base: number;
  elasticity: number;
  elasticity_source: string;
  measured_elasticity: number | null;
  measured_events: number | null;
  halo_ratio: number;
  regulated: boolean;
}

export interface Dc {
  dc_id: string;
  name: string;
  daily_capacity_units: number;
}

export interface LegalRule {
  rule_id: string;
  base_key: string;
  jurisdiction: string;
  rule_type: string;
  title: string;
  description: string;
  citation: string;
  severity: RiskLevel;
  review_required: boolean;
  prohibited: boolean;
  trigger: RuleTrigger;
  condition_text: string;
  version: number;
  enabled: boolean;
}

export interface RuleTrigger {
  categories?: string[];
  promo_types?: string[];
  channels?: string[];
  states?: string[];
  min_discount?: number;
  claim_any?: string[];
  flags_any?: string[];
  min_weeks?: number;
  max_weeks?: number;
}

// Output of compute_case_facts() in Postgres
export interface Facts {
  computed_at: string;
  data_as_of: string;
  data_end: string;
  sales: {
    window_from: string;
    window_to: string;
    days_observed: number;
    rows_observed: number;
    rows_expected: number;
    last_sales_date: string | null;
    total_revenue: number | null;
    avg_daily_revenue: number | null;
    avg_daily_units: number | null;
    ecom_share: number | null;
    avg_price_index: number | null;
    avg_traffic_index: number | null;
    avg_conversion_pct: number | null;
    promo_day_share: number | null;
    daily_cv: number;
    daily_min: number | null;
    daily_max: number | null;
  };
  promo_analogs: {
    promo_store_days: number;
    regular_store_days: number;
    promo_avg_revenue: number | null;
    regular_avg_revenue: number | null;
    promo_avg_price_index: number | null;
    analog_uplift_pct: number | null;
  };
  seasonality: {
    window_start: string;
    window_end: string;
    mapped_from: string;
    mapped_to: string;
    seasonal_index: number | null;
  };
  operations: {
    stores_in_scope: number;
    stores_reporting_current: number;
    stores_reporting_any: number;
    last_ops_date: string | null;
    oldest_store_ops_date: string | null;
    on_hand_units: number | null;
    inbound_units: number | null;
    safety_stock_units: number | null;
    fill_rate_pct_14d: number | null;
    min_fill_rate_pct_14d: number | null;
    lead_time_days_14d: number | null;
    labor_capacity_pct_14d: number | null;
    labor_capacity_pct_max: number | null;
    fulfillment_capacity_pct_14d: number | null;
    fulfillment_capacity_pct_p90: number | null;
    dcs: string[] | null;
  };
  dc: {
    utilization_pct_14d: number | null;
    utilization_pct_max_28d: number | null;
    utilization_pct_window_hist: number | null;
    utilization_pct_window_peak: number | null;
  };
}

export interface Thresholds {
  sales_stale_days: number;
  ops_stale_days: number;
  min_uplift_pct: number;
  strong_uplift_pct: number;
  financial_impact_threshold: number;
  finance_reject_net: number;
  dc_hard_stop_pct: number;
  dc_warn_pct: number;
  fulfillment_hard_stop_pct: number;
  fulfillment_warn_pct: number;
  labor_warn_pct: number;
  fill_rate_floor_pct: number;
  ops_coverage_min: number;
  sales_coverage_min: number;
  low_confidence: number;
  signoff_confidence: number;
  signoff_sla_hours: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  sales_stale_days: 7,
  ops_stale_days: 5,
  min_uplift_pct: 3,
  strong_uplift_pct: 8,
  financial_impact_threshold: 250_000,
  finance_reject_net: -25_000,
  dc_hard_stop_pct: 112,
  dc_warn_pct: 95,
  fulfillment_hard_stop_pct: 115,
  fulfillment_warn_pct: 98,
  labor_warn_pct: 95,
  fill_rate_floor_pct: 92,
  ops_coverage_min: 0.8,
  sales_coverage_min: 0.6,
  low_confidence: 0.6,
  signoff_confidence: 0.65,
  signoff_sla_hours: 48,
};

export interface EvidenceItem {
  evidence_id: string;
  agent_type: AgentType;
  label: string;
  value: unknown;
  unit?: string;
  source: string;
  provenance: Provenance;
  as_of?: string | null;
}

export interface DataQuality {
  sales_age_days: number | null;
  ops_age_days: number | null;
  sales_stale: boolean;
  ops_stale: boolean;
  sales_coverage: number;
  ops_coverage: number;
  issues: string[];
}

// What each agent produces (stored in agent_outputs)
export interface AgentOutput {
  agent_type: AgentType;
  recommendation: Recommendation;
  confidence: number;
  risk_level: RiskLevel;
  evidence_ids: string[];
  key_metrics: Record<string, number | string | boolean | null>;
  conditions: string[];
  dissent_reason: string | null;
  rationale: string;
  provider: string;
  model: string;
  latency_ms: number | null;
  valid: boolean;
  validation_issues: string[];
  guardrail_adjustments: string[];
  data_quality: DataQuality;
  hard_constraint?: string | null;
}

// Deterministic analysis from the rules engine (the agent's "tools")
export interface AgentAnalysis {
  agent_type: AgentType;
  evidence: EvidenceItem[];
  metrics: Record<string, number | string | boolean | null>;
  baseline: AgentOutput; // the rules engine's own judgement (used offline + as fallback)
  hard: HardConstraint;
  policy: string[]; // plain-language policy the agent must follow
}

export interface HardConstraint {
  // if set, the agent recommendation must be one of these
  allowed?: Recommendation[];
  min_risk?: RiskLevel;
  max_confidence?: number;
  invalid?: boolean;
  reason?: string | null;
}

export interface Conflict {
  agents: AgentType[];
  kind: "SUPPORT_VS_OPPOSE" | "LEGAL_GATE" | "HARD_STOP" | "EVIDENCE" | "RISK_DIVERGENCE";
  description: string;
}

export interface Gate {
  key: "LEGAL_REVIEW" | "OPERATIONS_CAPACITY" | "EVIDENCE_QUALITY" | "FINANCIAL_THRESHOLD" | "SIGN_OFFS";
  label: string;
  status: "CLEAR" | "PENDING" | "BLOCKED" | "WARNING";
  detail: string;
}

export interface Reconciliation {
  synthesized_recommendation: Recommendation;
  lighthouse_confidence: number;
  confidence_breakdown: {
    agent_confidence: number;
    evidence_completeness: number;
    freshness: number;
    conflict_penalty: number;
    hard_constraint_factor: number;
  };
  conflict_flag: boolean;
  conflict_severity: "NONE" | "MINOR" | "MATERIAL" | "HARD_STOP";
  conflicts: Conflict[];
  gates: Gate[];
  risk_level: RiskLevel;
  conditions: string[];
  requires_legal_review: boolean;
  expedited_eligible: boolean;
  financial_impact: number;
  decisive_factors: string[];
  summary: string;
  headline: string;
}

export const RISK_ORDER: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
export const maxRisk = (...r: RiskLevel[]): RiskLevel =>
  r.reduce((a, b) => (RISK_ORDER[b] > RISK_ORDER[a] ? b : a), "LOW" as RiskLevel);
