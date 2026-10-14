-- Lighthouse database schema (PostgreSQL 16+ / Neon)
-- Safe to re-run: drops and recreates everything.

drop schema if exists public cascade;
create schema public;

-- ---------------------------------------------------------------- reference data
create table categories (
  category_id text primary key,
  name text not null,
  source_dept text not null,
  provenance text not null,            -- REAL | GENERATED
  mix_share numeric not null,
  gross_margin_pct numeric not null,
  avg_unit_price numeric not null,
  ecom_share_base numeric not null,
  digital_conversion_base numeric not null,
  elasticity numeric not null,
  elasticity_source text not null,
  measured_elasticity numeric,
  measured_events int,
  event_uplift_pct numeric,
  halo_ratio numeric not null default 0.3,
  regulated boolean not null default false
);

create table regions (
  region_id text primary key,
  name text not null,
  state text not null,
  store_count int not null,
  dc_id text not null,
  pattern_provenance text not null
);

create table dcs (
  dc_id text primary key,
  name text not null,
  serves text not null,
  daily_capacity_units bigint not null
);

create table stores (
  store_id text primary key,
  name text not null,
  city text not null,
  region_id text not null references regions,
  region text not null,
  state text not null,
  dc_id text not null references dcs,
  m5_source_store text not null,
  wm45_source_store int not null,
  relative_size numeric not null,
  format text not null,
  pattern_provenance text not null,
  annual_sales_target numeric not null
);

create table sales_daily (
  date date not null,
  store_id text not null,
  category_id text not null,
  store_sales numeric(14,2) not null,
  ecommerce_sales numeric(14,2) not null,
  units int not null,
  conversion_rate numeric(6,2) not null,
  promo_flag smallint not null,
  price_index numeric(8,4) not null,
  event_name text,
  traffic_index numeric(6,3) not null,
  primary key (category_id, store_id, date)
);
create index sales_daily_date on sales_daily (date);

create table ops_daily (
  date date not null,
  store_id text not null,
  category_id text not null,
  dc_id text not null,
  on_hand int not null,
  inbound int not null,
  safety_stock int not null,
  fill_rate numeric(6,2) not null,
  lead_time_days numeric(6,2) not null,
  labor_capacity_pct numeric(6,1) not null,
  fulfillment_capacity_pct numeric(6,1) not null,
  primary key (category_id, store_id, date)
);
create index ops_daily_date on ops_daily (date);

create table dc_daily (
  date date not null,
  dc_id text not null,
  requested_units bigint not null,
  capacity_units bigint not null,
  utilization_pct numeric(7,1) not null,
  primary key (dc_id, date)
);

create table elasticity_by_dept (
  dept text primary key,
  elasticity_raw numeric,
  iqr numeric,
  n_events int,
  median_depth_pct numeric,
  median_unit_uplift_pct numeric,
  elasticity numeric,
  event_uplift numeric,
  event_days int
);

create table legal_rules (
  rule_id text primary key,
  base_key text not null,
  jurisdiction text not null,
  rule_type text not null,
  title text not null,
  description text not null,
  citation text not null,
  severity text not null check (severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
  review_required boolean not null,
  prohibited boolean not null,
  trigger jsonb not null,
  condition_text text not null,
  categories text not null,
  version int not null,
  enabled boolean not null,
  effective_date date not null,
  updated_at timestamptz not null default now(),
  updated_by text not null default 'seed'
);

create table dataset_manifest (
  id int primary key default 1,
  manifest jsonb not null
);

-- ---------------------------------------------------------------- decisions
create table decision_cases (
  decision_id text primary key,
  title text not null,
  category_id text not null references categories,
  promo_type text not null,
  discount_pct numeric not null,
  duration_weeks int not null,
  start_date date not null,
  channel text not null,
  claim_text text not null default '',
  flags text[] not null default '{}',
  vendor_funding_pct numeric not null default 0,
  reallocation_units int not null default 0,
  scope_kind text not null,
  region_id text,
  store_ids text[] not null,
  store_count int not null,
  states text[] not null,
  data_as_of date not null,
  created_at timestamptz not null,
  created_by text not null,
  scenario_tag text not null default '',
  status text not null default 'DRAFT',
  -- DRAFT | AWAITING_LEGAL_REVIEW | READY_FOR_DECISION | APPROVED | REJECTED | REVISION_REQUESTED
  facts jsonb,
  revision int not null default 1,
  updated_at timestamptz not null default now()
);
create index decision_cases_status on decision_cases (status);
create index decision_cases_category on decision_cases (category_id);
create index decision_cases_created on decision_cases (created_at desc);

create table agent_runs (
  run_id text primary key,
  decision_id text not null references decision_cases on delete cascade,
  mode text not null,                   -- LIVE_AI | DEMO_SAFE | RULES_ENGINE
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'RUNNING', -- RUNNING | COMPLETED | FAILED
  started_by text not null,
  provider_summary text,
  duration_ms int,
  revision int not null default 1
);
create index agent_runs_decision on agent_runs (decision_id, started_at desc);

create table agent_outputs (
  output_id bigserial primary key,
  run_id text not null references agent_runs on delete cascade,
  decision_id text not null,
  agent_type text not null check (agent_type in ('FINANCE','SALES','OPERATIONS','LEGAL')),
  recommendation text not null check (recommendation in ('PROCEED','PROCEED_WITH_CONDITIONS','HOLD','REJECT','REVIEW_REQUIRED')),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  risk_level text not null check (risk_level in ('LOW','MEDIUM','HIGH','CRITICAL')),
  evidence_ids text[] not null,
  key_metrics jsonb not null,
  conditions text[] not null default '{}',
  dissent_reason text,
  rationale text not null,
  generated_at timestamptz not null default now(),
  provider text not null,               -- gemini | groq | rules-engine | replay
  model text not null,
  latency_ms int,
  valid boolean not null default true,
  validation_issues jsonb not null default '[]',
  guardrail_adjustments jsonb not null default '[]',
  data_quality jsonb not null default '{}'
);
create index agent_outputs_decision on agent_outputs (decision_id);
create index agent_outputs_run on agent_outputs (run_id);

create table evidence (
  evidence_id text primary key,
  decision_id text not null,
  run_id text not null,
  agent_type text not null,
  label text not null,
  value jsonb not null,
  unit text,
  source text not null,                 -- table / function that produced it
  provenance text not null,             -- REAL | DERIVED | GENERATED | PUBLIC | ASSUMPTION
  as_of date,
  created_at timestamptz not null default now()
);
create index evidence_decision on evidence (decision_id);
create index evidence_run on evidence (run_id);

create table lighthouse_decisions (
  decision_id text primary key references decision_cases on delete cascade,
  run_id text not null,
  conflict_flag boolean not null,
  conflict_severity text not null,      -- NONE | MINOR | MATERIAL | HARD_STOP
  conflicts jsonb not null,
  synthesized_recommendation text not null,
  lighthouse_confidence numeric(4,3) not null,
  confidence_breakdown jsonb not null,
  risk_level text not null,
  conditions text[] not null default '{}',
  gates jsonb not null,
  summary text not null,
  summary_provider text not null,
  financial_impact numeric,
  requires_legal_review boolean not null,
  expedited_eligible boolean not null,
  owner text not null,
  approval_status text not null default 'PENDING',
  final_decision text,
  final_rationale text,
  decided_by text,
  decided_at timestamptz,
  override_flag boolean not null default false,
  created_at timestamptz not null default now()
);

create table reviews (
  review_id bigserial primary key,
  decision_id text not null references decision_cases on delete cascade,
  revision int not null default 1,
  reviewer_role text not null,
  reviewer_name text not null,
  disposition text not null,            -- APPROVED | APPROVED_WITH_CONDITIONS | REJECTED | CONCUR | CONCERN
  condition_text text,
  created_at timestamptz not null default now()
);
create index reviews_decision on reviews (decision_id);

create table config (
  key text primary key,
  value jsonb not null,
  description text not null default '',
  updated_by text not null default 'seed',
  updated_at timestamptz not null default now()
);

create table llm_cache (
  decision_id text not null,
  revision int not null,
  agent_type text not null,             -- FINANCE | SALES | OPERATIONS | LEGAL | SYNTHESIS
  output jsonb not null,
  provider text not null,
  model text not null,
  created_at timestamptz not null default now(),
  primary key (decision_id, revision, agent_type)
);

-- ---------------------------------------------------------------- immutable audit log
create table audit_log (
  seq bigserial primary key,
  ts timestamptz not null default now(),
  actor text not null,
  role text not null,
  action text not null,
  decision_id text,
  payload jsonb not null default '{}',
  prev_hash text,
  hash text
);
create index audit_log_decision on audit_log (decision_id, seq);
create index audit_log_ts on audit_log (ts desc);

create or replace function audit_hash_input(p_prev text, p_ts timestamptz, p_actor text, p_role text,
                                            p_action text, p_decision text, p_payload jsonb)
returns text language sql immutable as $$
  select coalesce(p_prev, 'GENESIS') || '|' ||
         to_char(p_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' ||
         p_actor || '|' || p_role || '|' || p_action || '|' || coalesce(p_decision, '') || '|' || p_payload::text
$$;

-- Append-only: block UPDATE / DELETE unless a maintenance flag is set by the seed script.
create or replace function audit_log_guard() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('lighthouse.audit_maintenance', true), 'off') = 'on' then
    return coalesce(new, old);
  end if;
  raise exception 'audit_log is append-only (attempted %)', tg_op;
end $$;
create trigger audit_log_no_update before update or delete on audit_log
  for each row execute function audit_log_guard();

-- Append one entry with a hash chained to the previous entry (serialized by advisory lock).
create or replace function append_audit(p_actor text, p_role text, p_action text, p_decision text, p_payload jsonb)
returns audit_log language plpgsql as $$
declare
  v_prev text;
  v_ts timestamptz := clock_timestamp();
  v_row audit_log;
begin
  perform pg_advisory_xact_lock(4210);
  select hash into v_prev from audit_log order by seq desc limit 1;
  insert into audit_log (ts, actor, role, action, decision_id, payload, prev_hash, hash)
  values (v_ts, p_actor, p_role, p_action, p_decision, coalesce(p_payload, '{}'::jsonb), coalesce(v_prev, 'GENESIS'),
          encode(sha256(convert_to(audit_hash_input(v_prev, v_ts, p_actor, p_role, p_action, p_decision,
                                                     coalesce(p_payload, '{}'::jsonb)), 'UTF8')), 'hex'))
  returning * into v_row;
  return v_row;
end $$;

-- Recompute the full chain (used once after bulk seeding).
create or replace function rebuild_audit_chain() returns int language plpgsql as $$
declare
  r record;
  v_prev text := null;
  n int := 0;
begin
  perform set_config('lighthouse.audit_maintenance', 'on', true);
  for r in select * from audit_log order by seq loop
    update audit_log set prev_hash = coalesce(v_prev, 'GENESIS'),
      hash = encode(sha256(convert_to(audit_hash_input(v_prev, r.ts, r.actor, r.role, r.action, r.decision_id, r.payload), 'UTF8')), 'hex')
    where seq = r.seq returning hash into v_prev;
    n := n + 1;
  end loop;
  perform set_config('lighthouse.audit_maintenance', 'off', true);
  return n;
end $$;

-- Verify the chain; returns the number of entries checked and the first broken seq (null if intact).
create or replace function verify_audit_chain()
returns table (entries bigint, first_broken_seq bigint, last_hash text) language plpgsql stable as $$
declare
  r record;
  v_prev text := null;
  v_n bigint := 0;
  v_expected text;
begin
  for r in select * from audit_log order by seq loop
    v_expected := encode(sha256(convert_to(audit_hash_input(v_prev, r.ts, r.actor, r.role, r.action, r.decision_id, r.payload), 'UTF8')), 'hex');
    v_n := v_n + 1;
    if r.hash is distinct from v_expected or r.prev_hash is distinct from coalesce(v_prev, 'GENESIS') then
      entries := v_n; first_broken_seq := r.seq; last_hash := r.hash; return next; return;
    end if;
    v_prev := r.hash;
  end loop;
  entries := v_n; first_broken_seq := null; last_hash := v_prev; return next;
end $$;

-- ---------------------------------------------------------------- evidence facts
-- Single source of truth for the numbers every agent reasons over.
create or replace function compute_case_facts(p_id text) returns jsonb language plpgsql stable as $$
declare
  c decision_cases%rowtype;
  v_from date;
  v_to date;
  v_sales jsonb;
  v_vol jsonb;
  v_promo jsonb;
  v_season jsonb;
  v_ops jsonb;
  v_dc jsonb;
  v_win_start date;
  v_win_end date;
  v_data_end date;
  v_shift int;
begin
  select * into c from decision_cases where decision_id = p_id;
  if not found then return null; end if;
  v_to := c.data_as_of;
  v_from := c.data_as_of - 55;
  select max(date) into v_data_end from sales_daily;

  select jsonb_build_object(
    'window_from', v_from, 'window_to', v_to,
    'days_observed', count(distinct date),
    'rows_observed', count(*),
    'rows_expected', 56 * c.store_count,
    'last_sales_date', max(date),
    'total_revenue', round(sum(store_sales + ecommerce_sales), 2),
    'avg_daily_revenue', round(sum(store_sales + ecommerce_sales) / nullif(count(distinct date), 0), 2),
    'avg_daily_units', round(sum(units)::numeric / nullif(count(distinct date), 0), 1),
    'ecom_share', round(sum(ecommerce_sales) / nullif(sum(store_sales + ecommerce_sales), 0), 4),
    'avg_price_index', round(avg(price_index), 4),
    'avg_traffic_index', round(avg(traffic_index), 3),
    'avg_conversion_pct', round(avg(conversion_rate), 2),
    'promo_day_share', round(avg(promo_flag), 4)
  ) into v_sales
  from sales_daily
  where category_id = c.category_id and store_id = any(c.store_ids) and date between v_from and v_to;

  select jsonb_build_object('daily_cv', round(coalesce(stddev_samp(rev) / nullif(avg(rev), 0), 0), 4),
                            'daily_min', round(min(rev), 2), 'daily_max', round(max(rev), 2))
  into v_vol
  from (select date, sum(store_sales + ecommerce_sales) rev from sales_daily
        where category_id = c.category_id and store_id = any(c.store_ids) and date between v_from and v_to
        group by date) d;

  -- promo analogs: real promo days (price index <= 0.97) vs regular days, trailing 365 days
  select jsonb_build_object(
    'promo_store_days', count(*) filter (where promo_flag = 1),
    'regular_store_days', count(*) filter (where promo_flag = 0),
    'promo_avg_revenue', round(avg(store_sales + ecommerce_sales) filter (where promo_flag = 1), 2),
    'regular_avg_revenue', round(avg(store_sales + ecommerce_sales) filter (where promo_flag = 0), 2),
    'promo_avg_price_index', round(avg(price_index) filter (where promo_flag = 1), 4),
    'analog_uplift_pct', round(100 * (avg(units) filter (where promo_flag = 1) / nullif(avg(units) filter (where promo_flag = 0), 0) - 1), 2)
  ) into v_promo
  from sales_daily
  where category_id = c.category_id and store_id = any(c.store_ids) and date between v_to - 364 and v_to;

  -- seasonality: the promo window's calendar dates in the pilot year vs the annual average
  v_win_start := c.start_date;
  v_win_end := c.start_date + (c.duration_weeks * 7) - 1;
  v_shift := 0;
  while v_win_start - v_shift > v_data_end loop v_shift := v_shift + 364; end loop;
  select jsonb_build_object(
    'window_start', c.start_date, 'window_end', v_win_end,
    'mapped_from', v_win_start - v_shift, 'mapped_to', v_win_end - v_shift,
    'seasonal_index', round(
      (select avg(rev) from (select date, sum(store_sales + ecommerce_sales) rev from sales_daily
                             where category_id = c.category_id and date between v_win_start - v_shift and v_win_end - v_shift
                             group by date) w) /
      nullif((select avg(rev) from (select date, sum(store_sales + ecommerce_sales) rev from sales_daily
                                    where category_id = c.category_id group by date) a), 0), 4)
  ) into v_season;

  -- operations position at the evidence date (latest row per store on or before data_as_of)
  with latest as (
    select distinct on (store_id) * from ops_daily
    where category_id = c.category_id and store_id = any(c.store_ids) and date <= v_to and date >= v_to - 30
    order by store_id, date desc
  ), recent as (
    select * from ops_daily
    where category_id = c.category_id and store_id = any(c.store_ids) and date between v_to - 13 and v_to
  )
  select jsonb_build_object(
    'stores_in_scope', c.store_count,
    'stores_reporting_current', (select count(*) from latest where date >= v_to - 1),
    'stores_reporting_any', (select count(*) from latest),
    'last_ops_date', (select max(date) from latest),
    'oldest_store_ops_date', (select min(date) from latest),
    'on_hand_units', (select sum(on_hand) from latest),
    'inbound_units', (select sum(inbound) from latest),
    'safety_stock_units', (select sum(safety_stock) from latest),
    'fill_rate_pct_14d', (select round(avg(fill_rate), 2) from recent),
    'min_fill_rate_pct_14d', (select round(min(fill_rate), 2) from recent),
    'lead_time_days_14d', (select round(avg(lead_time_days), 2) from recent),
    'labor_capacity_pct_14d', (select round(avg(labor_capacity_pct), 1) from recent),
    'labor_capacity_pct_max', (select round(max(labor_capacity_pct), 1) from recent),
    'fulfillment_capacity_pct_14d', (select round(avg(fulfillment_capacity_pct), 1) from recent),
    'fulfillment_capacity_pct_p90', (select round(percentile_cont(0.9) within group (order by fulfillment_capacity_pct)::numeric, 1) from recent),
    'dcs', (select array_agg(distinct dc_id) from stores where store_id = any(c.store_ids))
  ) into v_ops;

  select jsonb_build_object(
    'utilization_pct_14d', round(avg(utilization_pct) filter (where date between v_to - 13 and v_to), 1),
    'utilization_pct_max_28d', round(max(utilization_pct) filter (where date between v_to - 27 and v_to), 1),
    'utilization_pct_window_hist', round(avg(utilization_pct) filter (where date between v_win_start - v_shift and v_win_end - v_shift), 1),
    'utilization_pct_window_peak', round(max(utilization_pct) filter (where date between v_win_start - v_shift and v_win_end - v_shift), 1)
  ) into v_dc
  from dc_daily
  where dc_id in (select distinct dc_id from stores where store_id = any(c.store_ids));

  return jsonb_build_object(
    'computed_at', now(), 'data_as_of', c.data_as_of, 'data_end', v_data_end,
    'sales', v_sales || coalesce(v_vol, '{}'::jsonb), 'promo_analogs', v_promo, 'seasonality', v_season,
    'operations', v_ops, 'dc', v_dc
  );
end $$;
