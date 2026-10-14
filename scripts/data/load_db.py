"""
Create the Lighthouse schema in Neon and bulk-load the processed dataset.

Run:  .venv/bin/python -I scripts/data/load_db.py
Reads DATABASE_URL from .env.local (never printed). Uses the direct (non-pooler)
endpoint for COPY speed.
"""
from __future__ import annotations

import io
import json
import os
import time

import pandas as pd
import psycopg

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
P = os.path.join(ROOT, "data", "processed")


def env(name: str) -> str:
    for line in open(os.path.join(ROOT, ".env.local")):
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip()
    raise SystemExit(f"{name} missing in .env.local")


URL = env("DATABASE_URL").replace("-pooler", "")


def log(m: str) -> None:
    print(f"[load] {m}", flush=True)


def pg_array(series: pd.Series) -> pd.Series:
    def conv(v):
        if pd.isna(v) or v == "":
            return "{}"
        items = [x.strip() for x in str(v).split(",") if x.strip()]
        return "{" + ",".join('"' + x.replace('"', '\\"') + '"' for x in items) + "}"
    return series.apply(conv)


def copy_df(cur, table: str, df: pd.DataFrame) -> None:
    t = time.time()
    df = df.copy()
    for col in df.columns:  # nullable integer columns come back from CSV as floats
        if df[col].dtype.kind == "f" and df[col].isna().any():
            nn = df[col].dropna()
            if len(nn) and (nn == nn.round()).all():
                df[col] = df[col].astype("Int64")
    buf = io.StringIO()
    df.to_csv(buf, index=False, header=False, na_rep="\\N")
    buf.seek(0)
    cols = ",".join(df.columns)
    with cur.copy(f"COPY {table} ({cols}) FROM STDIN WITH (FORMAT csv, NULL '\\N')") as cp:
        while chunk := buf.read(1 << 20):
            cp.write(chunk)
    log(f"{table:<22} {len(df):>8,} rows  {time.time() - t:5.1f}s")


with psycopg.connect(URL, autocommit=False) as conn:
    cur = conn.cursor()
    log("applying schema")
    cur.execute(open(os.path.join(ROOT, "db", "schema.sql")).read())
    conn.commit()

    copy_df(cur, "categories", pd.read_csv(os.path.join(P, "categories.csv")))
    copy_df(cur, "regions", pd.read_csv(os.path.join(P, "regions.csv")))
    copy_df(cur, "dcs", pd.read_csv(os.path.join(P, "dcs.csv")))
    copy_df(cur, "stores", pd.read_csv(os.path.join(P, "stores.csv")))
    el = pd.read_csv(os.path.join(P, "elasticity_by_dept.csv"))
    copy_df(cur, "elasticity_by_dept", el[["dept", "elasticity_raw", "iqr", "n_events", "median_depth_pct",
                                           "median_unit_uplift_pct", "elasticity", "event_uplift", "event_days"]])
    rules = pd.read_csv(os.path.join(P, "legal_rules.csv"))
    copy_df(cur, "legal_rules", rules[["rule_id", "base_key", "jurisdiction", "rule_type", "title", "description", "citation",
                                       "severity", "review_required", "prohibited", "trigger", "condition_text", "categories",
                                       "version", "enabled", "effective_date"]])
    copy_df(cur, "dc_daily", pd.read_csv(os.path.join(P, "dc_daily.csv")))
    sales = pd.read_csv(os.path.join(P, "sales_daily.csv.gz"), keep_default_na=False)
    copy_df(cur, "sales_daily", sales[["date", "store_id", "category_id", "store_sales", "ecommerce_sales", "units",
                                       "conversion_rate", "promo_flag", "price_index", "event_name", "traffic_index"]])
    ops = pd.read_csv(os.path.join(P, "ops_daily.csv.gz"))
    copy_df(cur, "ops_daily", ops)

    cases = pd.read_csv(os.path.join(P, "decision_cases.csv"), keep_default_na=False)
    for col in ("flags", "store_ids", "states"):
        cases[col] = pg_array(cases[col])
    cases["region_id"] = cases["region_id"].replace("", None)
    copy_df(cur, "decision_cases", cases[["decision_id", "title", "category_id", "promo_type", "discount_pct", "duration_weeks",
                                          "start_date", "channel", "claim_text", "flags", "vendor_funding_pct", "reallocation_units",
                                          "scope_kind", "region_id", "store_ids", "store_count", "states", "data_as_of",
                                          "created_at", "created_by", "scenario_tag"]])
    manifest = json.load(open(os.path.join(P, "manifest.json")))
    cur.execute("insert into dataset_manifest (id, manifest) values (1, %s)", (json.dumps(manifest),))
    conn.commit()

    log("analyzing tables")
    conn.autocommit = True
    cur.execute("analyze")
    log("computing evidence facts for all decision cases (runs inside Postgres)")
    t = time.time()
    cur.execute("update decision_cases set facts = compute_case_facts(decision_id)")
    log(f"facts computed for {cur.rowcount:,} cases in {time.time() - t:.1f}s")
    cur.execute("select facts from decision_cases where decision_id = 'D-2026-001'")
    print(json.dumps(cur.fetchone()[0], indent=1)[:2500])
