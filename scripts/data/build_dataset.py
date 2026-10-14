"""
Lighthouse pilot dataset builder.

Inputs (data/raw, downloaded from Kaggle, not committed):
  - m5-forecasting-accuracy/  REAL Walmart daily unit sales + prices (10 stores, CA/TX/WI)
  - walmart-dataset/Walmart.csv  REAL weekly sales for 45 Walmart stores

Outputs (data/processed):
  categories, regions, stores, dcs, elasticity, sales_daily, ops_daily, dc_daily,
  legal_rules, decision_cases, manifest.json

Provenance rules
  REAL      value taken directly from a Kaggle source
  DERIVED   computed from REAL data (aggregation, scaling, elasticity estimation)
  GENERATED created by this script for fields no public dataset covers

Run:  .venv/bin/python -I scripts/data/build_dataset.py
"""
from __future__ import annotations

import json
import math
import os
import sys
from datetime import date, timedelta

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from rules_catalog import BASE_RULES, CATEGORIES, PILOT_STATES, PROMO_TYPES  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
RAW = os.path.join(ROOT, "data", "raw")
OUT = os.path.join(ROOT, "data", "processed")
os.makedirs(OUT, exist_ok=True)

SEED = 4210
rng = np.random.default_rng(SEED)

# Real M5 window: 2014-10-12 .. 2015-10-11 (365 days). Shifting by 4018 days
# (exactly 574 weeks = 11 years incl. leap days) keeps weekdays AND calendar
# dates aligned, giving the 2025-10-12 .. 2026-10-11 pilot year.
SRC_START = date(2014, 10, 12)
SRC_END = date(2015, 10, 11)
SHIFT_DAYS = 4018
PILOT_START = SRC_START + timedelta(days=SHIFT_DAYS)
PILOT_END = SRC_END + timedelta(days=SHIFT_DAYS)
assert PILOT_START == date(2025, 10, 12) and PILOT_END == date(2026, 10, 11)
PILOT_CLOCK = date(2026, 10, 12)
ANNUAL_PILOT_SALES = 4.8e9  # business-case calibration (Deliverable 1)

CAT_SPEC = {
    # id: (source M5 dept, provenance, mix share, gross margin, avg unit price, ecom share, digital conversion %)
    "C01": ("FOODS_3", "REAL", 0.22, 0.24, 3.1, 0.17, 6.2),
    "C02": ("FOODS_1", "REAL", 0.14, 0.30, 3.6, 0.14, 5.4),
    "C03": ("FOODS_2", "REAL", 0.12, 0.32, 3.4, 0.16, 5.9),
    "C04": ("HOUSEHOLD_1", "REAL", 0.09, 0.28, 5.4, 0.22, 4.8),
    "C05": ("HOUSEHOLD_2", "REAL", 0.06, 0.35, 6.9, 0.27, 3.9),
    "C06": ("HOBBIES_1", "REAL", 0.04, 0.33, 7.8, 0.30, 3.6),
    "C07": ("HOBBIES_2", "REAL", 0.02, 0.38, 4.2, 0.24, 3.1),
    "C08": ("HOUSEHOLD_1", "GENERATED", 0.11, 0.30, 9.4, 0.18, 5.1),
    "C09": ("HOUSEHOLD_2", "GENERATED", 0.06, 0.36, 8.6, 0.24, 4.4),
    "C10": ("HOBBIES_1", "GENERATED", 0.06, 0.18, 46.0, 0.38, 2.6),
    "C11": ("HOBBIES_2", "GENERATED", 0.05, 0.40, 14.5, 0.29, 3.3),
    "C12": ("FOODS_2", "GENERATED", 0.03, 0.27, 12.0, 0.26, 4.0),
}
REGULATED = {"C03", "C04", "C06", "C08", "C09", "C12"}

REGIONS = [
    # id, name, state, store count, M5 source stores, provenance of the regional pattern
    ("R-WEST", "West", "CA", 12, ["CA_1", "CA_2", "CA_3", "CA_4"], "REAL"),
    ("R-SCEN", "South Central", "TX", 11, ["TX_1", "TX_2", "TX_3"], "REAL"),
    ("R-MWST", "Midwest", "WI", 10, ["WI_1", "WI_2", "WI_3"], "REAL"),
    ("R-MATL", "Mid-Atlantic", "VA", 9, ["WI_1", "TX_2", "CA_2"], "GENERATED"),
    ("R-SEST", "Southeast", "GA", 8, ["TX_1", "TX_3", "CA_3"], "GENERATED"),
]
DC_OF_REGION = {"R-WEST": "DC-P01", "R-SCEN": "DC-P01", "R-SEST": "DC-P01", "R-MWST": "DC-P02", "R-MATL": "DC-P02"}

CITY_NAMES = {
    "R-WEST": ["Fresno", "Bakersfield", "Riverside", "Stockton", "Modesto", "Ontario", "Visalia", "Chico", "Redding", "Merced", "Lodi", "Temecula"],
    "R-SCEN": ["San Antonio", "Waco", "Killeen", "Tyler", "Abilene", "Round Rock", "Temple", "McAllen", "Laredo", "Bryan", "Midland"],
    "R-MWST": ["Madison", "Green Bay", "Appleton", "Eau Claire", "Oshkosh", "Janesville", "La Crosse", "Wausau", "Kenosha", "Sheboygan"],
    "R-MATL": ["Richmond", "Roanoke", "Lynchburg", "Fredericksburg", "Harrisonburg", "Winchester", "Danville", "Chesapeake", "Charlottesville"],
    "R-SEST": ["Macon", "Augusta", "Savannah", "Athens", "Columbus", "Valdosta", "Albany", "Dalton"],
}

PROV_NOTE = {}


def log(msg: str) -> None:
    print(f"[build] {msg}", flush=True)


# --------------------------------------------------------------------------------------
# 1. Load real M5 data
# --------------------------------------------------------------------------------------
log("loading M5 calendar + prices")
cal = pd.read_csv(os.path.join(RAW, "m5-forecasting-accuracy", "calendar.csv"), parse_dates=["date"])
cal["date"] = cal["date"].dt.date
d_of = dict(zip(cal["date"], cal["d"]))
ELAST_START = date(2013, 10, 13)
d_first, d_last = int(d_of[ELAST_START][2:]), int(d_of[SRC_END][2:])
win_first = int(d_of[SRC_START][2:])
day_cols = [f"d_{i}" for i in range(d_first, d_last + 1)]
log(f"reading sales d_{d_first}..d_{d_last} ({len(day_cols)} days)")
sales = pd.read_csv(
    os.path.join(RAW, "m5-forecasting-accuracy", "sales_train_evaluation.csv"),
    usecols=["item_id", "dept_id", "store_id"] + day_cols,
)
prices = pd.read_csv(os.path.join(RAW, "m5-forecasting-accuracy", "sell_prices.csv"))

cal_win = cal[(cal["date"] >= ELAST_START) & (cal["date"] <= SRC_END)].reset_index(drop=True)
wk_of_day = cal_win["wm_yr_wk"].to_numpy()
units = sales[day_cols].to_numpy(dtype=np.float32)  # items x days

# price matrix aligned to items x days (forward/back fill within item)
log("aligning prices")
prices = prices[prices["wm_yr_wk"].isin(np.unique(wk_of_day))]
key = sales["store_id"] + "|" + sales["item_id"]
prices["key"] = prices["store_id"] + "|" + prices["item_id"]
pw = prices.pivot_table(index="key", columns="wm_yr_wk", values="sell_price", aggfunc="first")
pw = pw.reindex(index=key, columns=np.unique(wk_of_day))
pw = pw.ffill(axis=1).bfill(axis=1)
wk_index = {w: i for i, w in enumerate(pw.columns)}
price_day = pw.to_numpy(dtype=np.float32)[:, [wk_index[w] for w in wk_of_day]]
price_day = np.nan_to_num(price_day, nan=np.nanmedian(price_day))
revenue = units * price_day

# --------------------------------------------------------------------------------------
# 2. Price elasticity per department (DERIVED from 2 years of real item-week data)
# --------------------------------------------------------------------------------------
log("estimating promotional price elasticities from real temporary price reductions")
# Method: for every item-week whose price sits >=3% below the item's 13-week regular
# (rolling max) price, compare units sold with the median of nearby regular-price weeks
# (+-6 weeks), after removing department-wide weekly seasonality.
# elasticity_event = log(unit uplift) / log(1 - discount depth); the department value is
# the median across events (robust to outliers).
n_items = units.shape[0]
weeks = np.unique(wk_of_day)
wk_pos = np.searchsorted(weeks, wk_of_day)
q_w = np.zeros((n_items, len(weeks)), dtype=np.float64)
np.add.at(q_w.T, wk_pos, units.T)
p_w = pw.to_numpy(dtype=np.float64)
dept_arr = sales["dept_id"].to_numpy()
elast_rows = []
for dept in sorted(sales["dept_id"].unique()):
    idx = np.where(dept_arr == dept)[0]
    q = q_w[idx]
    p = p_w[idx]
    season = q.sum(axis=0)
    season = season / season.mean()
    qn = q / np.maximum(season, 1e-6)
    ref = pd.DataFrame(p.T).rolling(13, min_periods=4).max().to_numpy().T
    depth = 1 - p / ref
    events = []
    Tn = q.shape[1]
    for i in range(q.shape[0]):
        cand = np.where((depth[i] >= 0.03) & (depth[i] <= 0.6) & (q[i] > 0))[0]
        for t in cand:
            lo, hi = max(0, t - 6), min(Tn, t + 7)
            reg = [k for k in range(lo, hi) if k != t and np.isfinite(depth[i, k]) and depth[i, k] < 0.01 and q[i, k] > 0]
            if len(reg) < 4:
                continue
            base = np.median(qn[i, reg])
            if base < 2:  # too few units for a stable ratio
                continue
            up = qn[i, t] / base
            events.append((math.log(max(up, 0.05)) / math.log(1 - depth[i, t]), depth[i, t], up))
    ev = np.array(events) if events else np.zeros((0, 3))
    beta = float(np.median(ev[:, 0])) if len(ev) else float("nan")
    iqr = float(np.subtract(*np.percentile(ev[:, 0], [75, 25]))) if len(ev) else float("nan")
    elast_rows.append(dict(dept=dept, elasticity_raw=beta, iqr=iqr, n_events=int(len(ev)),
                           median_depth_pct=float(np.median(ev[:, 1]) * 100) if len(ev) else float("nan"),
                           median_unit_uplift_pct=float((np.median(ev[:, 2]) - 1) * 100) if len(ev) else float("nan")))
el = pd.DataFrame(elast_rows)
el["elasticity"] = el["elasticity_raw"].fillna(-1.2).clip(-3.0, -0.6)
log("elasticities: " + ", ".join(f"{r.dept}={r.elasticity_raw:.2f} (n={r.n_events})" for r in el.itertuples()))

# event uplift per dept (DERIVED): revenue on event days vs trailing 28-day median
dept_of_item = sales["dept_id"].to_numpy()
store_of_item = sales["store_id"].to_numpy()
ev_flag = cal_win["event_name_1"].notna().to_numpy()
uplift_rows = []
for dept in sorted(sales["dept_id"].unique()):
    m = dept_of_item == dept
    r = pd.Series(revenue[m].sum(axis=0))
    base = r.rolling(28, min_periods=14).median().shift(1)
    ratio = (r / base).to_numpy()
    valid = np.isfinite(ratio)
    uplift_rows.append(dict(dept=dept, event_uplift=float(np.nanmean(ratio[ev_flag & valid]) - 1), event_days=int((ev_flag & valid).sum())))
el = el.merge(pd.DataFrame(uplift_rows), on="dept")

# --------------------------------------------------------------------------------------
# 3. Store-dept daily series for the 365-day window (DERIVED from REAL)
# --------------------------------------------------------------------------------------
log("aggregating store x dept daily revenue for the pilot window")
off = win_first - d_first
W = 365
rev_w = revenue[:, off:off + W]
units_w = units[:, off:off + W]
price_w = price_day[:, off:off + W]
ref_price = np.median(price_w, axis=1, keepdims=True)
m5_stores = sorted(sales["store_id"].unique())
depts = sorted(sales["dept_id"].unique())
R = {}
PI = {}
for s in m5_stores:
    for d in depts:
        m = (store_of_item == s) & (dept_of_item == d)
        r = rev_w[m].sum(axis=0)
        ref_rev = (units_w[m] * ref_price[m]).sum(axis=0)
        R[(s, d)] = r
        PI[(s, d)] = np.where(ref_rev > 0, r / np.maximum(ref_rev, 1e-9), 1.0)

cal_pilot = cal_win.iloc[off:off + W].reset_index(drop=True)
src_dates = cal_pilot["date"].to_numpy()
pilot_dates = np.array([d + timedelta(days=SHIFT_DAYS) for d in src_dates])
event_name = cal_pilot["event_name_1"].fillna("").to_numpy()
months = np.array([d.month for d in pilot_dates])
dow = np.array([d.weekday() for d in pilot_dates])

# --------------------------------------------------------------------------------------
# 4. Categories, regions, stores, DCs
# --------------------------------------------------------------------------------------
log("building categories / stores")
# The measured promotional response in M5 is weak and noisy (weekly-averaged prices blur
# short promotions; markdowns often coincide with slow sellers). We keep the measured values
# for transparency, but drive the Sales agent with CATEGORY-level benchmark elasticities
# (CAPSTONE ASSUMPTION). Brand-level promotional elasticities average about -2.6
# (Bijmolt, van Heerde & Pieters 2005, JMR), but roughly two-thirds of a brand's promo bump
# is switching between brands inside the category (van Heerde, Gupta & Wittink 2003, JMR),
# so category-level response is about one third of the brand-level value.
BENCH_ELASTICITY = {"C01": -0.7, "C02": -0.6, "C03": -1.0, "C04": -0.8, "C05": -1.0, "C06": -1.2,
                    "C07": -0.9, "C08": -0.7, "C09": -0.8, "C10": -1.4, "C11": -1.1, "C12": -0.7}
# Basket halo: incremental revenue from non-promoted items bought on promo-driven trips,
# as a share of the promoted category's incremental revenue (CAPSTONE ASSUMPTION).
HALO = {"C01": 0.5, "C02": 0.5, "C03": 0.45, "C04": 0.4, "C05": 0.25, "C06": 0.2, "C07": 0.2,
        "C08": 0.35, "C09": 0.3, "C10": 0.15, "C11": 0.25, "C12": 0.45}
cat_rows = []
el_by_dept = el.set_index("dept")
for cid, (dept, prov, share, margin, aup, ecom, conv) in CAT_SPEC.items():
    e = el_by_dept.loc[dept]
    cat_rows.append(dict(
        category_id=cid, name=CATEGORIES[cid], source_dept=dept, provenance=prov,
        mix_share=share, gross_margin_pct=round(margin * 100, 1), avg_unit_price=aup,
        ecom_share_base=ecom, digital_conversion_base=conv,
        elasticity=BENCH_ELASTICITY[cid], elasticity_source="BENCHMARK_ASSUMPTION",
        measured_elasticity=round(float(e["elasticity_raw"]), 3) if prov == "REAL" else None,
        measured_events=int(e["n_events"]) if prov == "REAL" else None,
        event_uplift_pct=round(float(e["event_uplift"]) * 100, 2),
        halo_ratio=HALO[cid],
        regulated=cid in REGULATED,
    ))
cats = pd.DataFrame(cat_rows)

wm = pd.read_csv(os.path.join(RAW, "walmart-dataset", "Walmart.csv"))
wm_mean = wm.groupby("Store")["Weekly_Sales"].mean()
wm_rel = (wm_mean / wm_mean.mean()).to_dict()

store_rows = []
n = 0
ys_pool = list(rng.permutation(list(wm_rel.keys())))
for rid, rname, state, count, srcs, prov in REGIONS:
    for k in range(count):
        n += 1
        ys = ys_pool[(n - 1) % len(ys_pool)]
        rel = wm_rel[ys] * (rng.uniform(0.92, 1.08) if n > 45 else 1.0)
        store_rows.append(dict(
            store_id=f"WMT-P{n:03d}", name=f"Pilot Supercenter #{n:03d}", city=CITY_NAMES[rid][k],
            region_id=rid, region=rname, state=state, dc_id=DC_OF_REGION[rid],
            m5_source_store=srcs[k % len(srcs)], wm45_source_store=int(ys), relative_size=rel,
            format="Supercenter", pattern_provenance=prov,
        ))
stores = pd.DataFrame(store_rows)
total_rel = stores["relative_size"].sum()
stores["annual_sales_target"] = ANNUAL_PILOT_SALES * stores["relative_size"] / total_rel
stores["relative_size"] = stores["relative_size"].round(4)
stores["annual_sales_target"] = stores["annual_sales_target"].round(0)
regions = pd.DataFrame([dict(region_id=r[0], name=r[1], state=r[2], store_count=r[3], dc_id=DC_OF_REGION[r[0]],
                             pattern_provenance=r[5]) for r in REGIONS])

# --------------------------------------------------------------------------------------
# 5. sales_daily_store_category  (50 x 12 x 365 = 219,000 rows)
# --------------------------------------------------------------------------------------
log("generating sales_daily (219,000 rows)")


def seasonal_mult(cid: str) -> np.ndarray:
    m = np.ones(W)
    if cid == "C08":  # cold & flu season
        m *= np.where(np.isin(months, [12, 1, 2]), 1.28, np.where(np.isin(months, [11, 3]), 1.12, 0.94))
    if cid == "C10":  # holiday electronics
        m *= np.where(months == 11, 1.55, np.where(months == 12, 1.85, 0.9))
    if cid == "C11":  # back to school + holiday
        m *= np.where(months == 8, 1.3, np.where(months == 12, 1.35, 0.95))
    if cid == "C12":
        m *= np.where(months == 8, 1.12, 1.0)
    if cid == "C09":
        m *= np.where(np.isin(months, [2, 5, 12]), 1.15, 1.0)
    return m / m.mean()


sales_frames, ops_frames = [], []
store_total = np.zeros((len(stores), W))
store_ecom = np.zeros((len(stores), W))
cat_daily = {}
for si, st in stores.iterrows():
    level = st["annual_sales_target"] / 365.0
    shares = cats["mix_share"].to_numpy() * rng.lognormal(0, 0.12, len(cats))
    shares /= shares.sum()
    ecom_store_factor = rng.uniform(0.8, 1.25)
    for ci, c in cats.iterrows():
        cid = c["category_id"]
        src = (st["m5_source_store"], c["source_dept"])
        base = R[src]
        shape = base / base.mean()
        if c["provenance"] == "GENERATED":
            shape = shape * seasonal_mult(cid) * rng.lognormal(0, 0.05, W)
        else:
            shape = shape * rng.lognormal(0, 0.03, W)
        shape = shape / shape.mean()
        total = level * shares[ci] * shape
        pidx = PI[src] * (rng.lognormal(0, 0.01, W) if c["provenance"] == "GENERATED" else 1.0)
        promo = (pidx <= 0.97).astype(int)
        e = np.clip(c["ecom_share_base"] * ecom_store_factor * (1 + 0.08 * (dow >= 5)) * (1 + 0.1 * promo)
                    * rng.lognormal(0, 0.06, W), 0.03, 0.7)
        ecom = total * e
        u = total / (c["avg_unit_price"] * pidx)
        conv = c["digital_conversion_base"] * (1 + 0.25 * promo) * rng.lognormal(0, 0.07, W)
        store_total[si] += total
        store_ecom[si] += ecom
        cat_daily[(si, ci)] = (total, u)
        sales_frames.append(pd.DataFrame(dict(
            date=pilot_dates, store_id=st["store_id"], category_id=cid,
            store_sales=np.round(total - ecom, 2), ecommerce_sales=np.round(ecom, 2), units=np.round(u).astype(int),
            conversion_rate=np.round(conv, 2), promo_flag=promo, price_index=np.round(pidx, 4), event_name=event_name,
        )))
sales_daily = pd.concat(sales_frames, ignore_index=True)
traffic = store_total / store_total.mean(axis=1, keepdims=True)
tmap = {(stores.loc[si, "store_id"], j): round(float(traffic[si, j] * rng.lognormal(0, 0.02)), 3)
        for si in range(len(stores)) for j in range(W)}
day_idx = {d: j for j, d in enumerate(pilot_dates)}
sales_daily["traffic_index"] = [tmap[(s, day_idx[d])] for s, d in zip(sales_daily["store_id"], sales_daily["date"])]
log(f"sales_daily rows={len(sales_daily):,}  annual total=${(sales_daily.store_sales.sum()+sales_daily.ecommerce_sales.sum())/1e9:.2f}B")

# --------------------------------------------------------------------------------------
# 6. Operations simulation (GENERATED, driven by the demand above)
# --------------------------------------------------------------------------------------
log("simulating inventory, DC capacity and fulfillment (GENERATED)")
S, C = len(stores), len(cats)
D = np.zeros((S, C, W))
for (si, ci), (_, u) in cat_daily.items():
    D[si, ci] = u
Dbar = D.mean(axis=2)
Dstd = D.std(axis=2)
cover = rng.uniform(3, 9, (S, C))          # target days of cover (GENERATED policy)
lead = rng.uniform(1.5, 3.5, (S, C))         # DC -> store lead time (days)
ss = 0.6 * Dstd * np.sqrt(lead) + 0.5 * Dbar
on_hand = Dbar * cover + ss
pipeline = np.zeros((S, C, 9))  # arrivals scheduled up to 8 days ahead
dc_ids = stores["dc_id"].to_numpy()
dc_list = ["DC-P01", "DC-P02"]
# DC load = units the DC must ship to its stores (3-day smoothed demand). Capacity is set
# at the 88th percentile of daily load, so peaks (holidays, back-to-school) exceed 100%.
dc_cap, dc_util, dc_req, dc_extra_lead = {}, {}, {}, {}
for dc in dc_list:
    msk = dc_ids == dc
    load = pd.Series(D[msk].sum(axis=(0, 1))).rolling(3, min_periods=1).mean().to_numpy()
    cap = float(np.quantile(load, 0.88)) * 1.01
    dc_cap[dc], dc_req[dc], dc_util[dc] = cap, load, load / cap
    dc_extra_lead[dc] = np.clip((load / cap - 1.0) * 8.0, 0, 3.0)
oh_hist = np.zeros((S, C, W))
in_hist = np.zeros((S, C, W))
fill_hist = np.zeros((S, C, W))
lead_hist = np.zeros((S, C, W))
recent = Dbar.copy()
for t in range(W):
    on_hand += pipeline[:, :, 0]
    pipeline = np.roll(pipeline, -1, axis=2)
    pipeline[:, :, -1] = 0
    sold = np.minimum(on_hand, D[:, :, t])
    fill_hist[:, :, t] = np.where(D[:, :, t] > 0, sold / np.maximum(D[:, :, t], 1e-9), 1.0)
    on_hand -= sold
    recent = 0.9 * recent + 0.1 * D[:, :, t]
    target = recent * cover + ss
    position = on_hand + pipeline.sum(axis=2)
    order = np.maximum(target - position, 0)
    lt = np.clip(lead * rng.lognormal(0, 0.12, (S, C)), 1, 6)
    for dc in dc_list:
        lt[dc_ids == dc] += dc_extra_lead[dc][t]  # congested DC -> slower replenishment
    lead_hist[:, :, t] = lt
    slot = np.clip(np.round(lt).astype(int), 1, 8)
    for k in range(1, 9):
        mk = slot == k
        pipeline[:, :, k][mk] += order[mk]
    oh_hist[:, :, t] = on_hand
    in_hist[:, :, t] = pipeline.sum(axis=2)

labor = np.clip(72 + 20 * (traffic - 1) + rng.normal(0, 3, (S, W)), 55, 109)
fbase = rng.uniform(62, 82, S)[:, None]
fulfil = np.clip(fbase * (store_ecom / store_ecom.mean(axis=1, keepdims=True)) + rng.normal(0, 3, (S, W)), 35, 118)

ops_frames = []
for si, st in stores.iterrows():
    for ci, c in cats.iterrows():
        ops_frames.append(pd.DataFrame(dict(
            date=pilot_dates, store_id=st["store_id"], category_id=c["category_id"], dc_id=st["dc_id"],
            on_hand=np.round(oh_hist[si, ci]).astype(int), inbound=np.round(in_hist[si, ci]).astype(int),
            safety_stock=int(round(ss[si, ci])),
            fill_rate=np.round(np.clip(fill_hist[si, ci] * 100 - rng.uniform(0, 1.5, W), 70, 100), 2),
            lead_time_days=np.round(lead_hist[si, ci], 2),
            labor_capacity_pct=np.round(labor[si] + rng.normal(0, 1, W), 1),
            fulfillment_capacity_pct=np.round(fulfil[si] + rng.normal(0, 1, W), 1),
        )))
ops_daily = pd.concat(ops_frames, ignore_index=True)

# data-quality incidents (GENERATED) - used to test missing-evidence handling
outages = [
    (["WMT-P047", "WMT-P048", "WMT-P049", "WMT-P050"], None, date(2026, 1, 12), date(2026, 1, 21), "Store ops feed outage"),
    (["WMT-P047", "WMT-P048", "WMT-P049", "WMT-P050"], None, date(2026, 5, 11), date(2026, 5, 20), "Store ops feed outage"),
    (["WMT-P047", "WMT-P048", "WMT-P049", "WMT-P050"], None, date(2026, 8, 17), date(2026, 8, 26), "Store ops feed outage"),
    (stores.loc[stores.region_id == "R-MATL", "store_id"].tolist(), "C10", date(2026, 10, 6), date(2026, 10, 11), "Electronics inventory feed outage"),
]
drop = np.zeros(len(ops_daily), dtype=bool)
for st_ids, cat_id, a, b, _ in outages:
    m = ops_daily["store_id"].isin(st_ids) & (ops_daily["date"] >= a) & (ops_daily["date"] <= b)
    if cat_id:
        m &= ops_daily["category_id"] == cat_id
    drop |= m.to_numpy()
ops_daily = ops_daily[~drop].reset_index(drop=True)
log(f"ops_daily rows={len(ops_daily):,} (dropped {int(drop.sum()):,} rows in feed outages)")

dc_daily = pd.concat([pd.DataFrame(dict(
    date=pilot_dates, dc_id=dc, requested_units=np.round(dc_req[dc]).astype(int),
    capacity_units=int(round(dc_cap[dc])), utilization_pct=np.round(dc_util[dc] * 100, 1))) for dc in dc_list])
dcs = pd.DataFrame([
    dict(dc_id="DC-P01", name="Pilot Regional DC 01", serves="West, South Central, Southeast", daily_capacity_units=int(dc_cap["DC-P01"])),
    dict(dc_id="DC-P02", name="Pilot Regional DC 02", serves="Midwest, Mid-Atlantic", daily_capacity_units=int(dc_cap["DC-P02"])),
])

# --------------------------------------------------------------------------------------
# 7. Legal rule catalog (250 rules)
# --------------------------------------------------------------------------------------
log("expanding legal rule catalog")
STATE_TIGHTER = {("CA", "PRIVACY")}  # CCPA/CPRA is materially stricter than other states
SEV_UP = {"LOW": "MEDIUM", "MEDIUM": "HIGH", "HIGH": "HIGH", "CRITICAL": "CRITICAL"}
rules = []
for br in BASE_RULES:
    j = br["juris"]
    # every state has its own unfair/deceptive-practices (UDAP) statute that mirrors
    # federal advertising, pricing and availability rules, so those get state variants
    if j == "FED" and br["type"] in ("ADVERTISING", "PRICING", "AVAILABILITY", "PRIVACY"):
        j = "FED+STATES"
    jlist = ["FED"] if j == "FED" else PILOT_STATES if j == "STATES" else ["FED"] + PILOT_STATES if j == "FED+STATES" else [j]
    for ju in jlist:
        sev = br["sev"]
        if (ju, br["type"]) in STATE_TIGHTER:
            sev = SEV_UP[sev]
        trig = dict(br["trig"])
        if ju != "FED":
            trig["states"] = [ju]
        rules.append(dict(
            base_key=br["key"], jurisdiction=ju, rule_type=br["type"], title=br["title"], description=br["desc"],
            citation=br["cite"], severity=sev, review_required=bool(br["review"] or sev in ("HIGH", "CRITICAL")),
            prohibited=bool(br["prohibited"]), trigger=trig, condition_text=br["cond"],
            categories=",".join(trig.get("categories", [])) or "ALL", version=2, enabled=True,
            effective_date="2026-01-01",
        ))
# superseded prior versions (kept for audit history, disabled) to reach 250
i = 0
while len(rules) < 250:
    src = rules[i % len(rules)]
    if src["version"] == 2:
        old = dict(src)
        old.update(version=1, enabled=False, effective_date="2024-07-01",
                   title=src["title"] + " (prior version)",
                   description=src["description"] + " Superseded by version 2 on 2026-01-01.")
        rules.append(old)
    i += 3
rules = rules[:250]
rules_df = pd.DataFrame(rules)
rules_df.insert(0, "rule_id", [f"LR-{k:03d}" for k in range(1, len(rules_df) + 1)])
rules_df["trigger"] = rules_df["trigger"].apply(json.dumps)
log(f"rules={len(rules_df)} enabled={int(rules_df.enabled.sum())}")

# --------------------------------------------------------------------------------------
# 8. Decision cases (5,000 = 12 curated demo cases + 4,988 historical)
# --------------------------------------------------------------------------------------
log("generating decision cases")
OWNERS = ["Maya Chen", "Marcus Hill", "Elena Ruiz", "Samuel Park"]
CLAIMS = {
    "C01": ["Stock up on pantry staples for less", "Everyday low prices on family-size pantry favorites", "Organic pasta & sauces, now lower",
            "Heart-healthy oats at a new low price", "Use your EBT card and save more on staples"],
    "C02": ["Fresh deli platters for game day", "Farm-fresh produce, picked for value", "Organic berries, rolled back",
            "Fresh rotisserie favorites, lower every day"],
    "C03": ["Party-size snacks and sodas for less", "Hard seltzer variety packs - buy one get one", "Sparkling water multipacks, new low price",
            "Wine & beer weekend bundle", "Customers love these chips - rated 4.8"],
    "C04": ["Paper towels and laundry essentials, rolled back", "Disinfecting wipes kill 99.9% of germs - save now",
            "Eco-friendly detergent, recyclable bottle", "Bulk cleaning supplies for less"],
    "C05": ["Kitchen upgrades at everyday low prices", "Energy-saving air fryers, new low price", "Cookware sets made in USA",
            "Storage and organization sale"],
    "C06": ["Top toys of the season, rolled back", "Build-it kits kids love - text TOYS to join alerts", "Collectible figures, buy one get one",
            "Craft & hobby favorites for less"],
    "C07": ["Seasonal decor at clearance prices", "Back-to-school crafts and supplies", "Holiday crafting kits, limited time"],
    "C08": ["Clinically proven cold & flu relief - save this season", "Vitamins that support immune health", "Allergy relief, pharmacist recommended",
            "Pain relief essentials, everyday low price", "First-aid basics for the family", "Immune booster that prevents flu"],
    "C09": ["Anti-aging collagen serum repairs skin cells", "Clean beauty favorites, non-toxic formulas", "Everyday personal care for less",
            "Dermatologist-recommended skincare, rolled back"],
    "C10": ["Holiday TVs at new low prices", "Earbuds and accessories, flash deal", "Energy Star appliances, save now",
            "Laptops for back to school - fast delivery"],
    "C11": ["Back-to-school basics for less", "Soft cotton tees, everyday value", "Cashmere-blend sweaters, limited time", "Seasonal clearance styles"],
    "C12": ["Diapers and wipes, stock-up savings", "Organic baby food pouches, rolled back", "Formula that supports brain development",
            "Car seats and strollers, new low price"],
}
RISKY_CLAIMS = {
    "Organic pasta & sauces, now lower", "Heart-healthy oats at a new low price", "Use your EBT card and save more on staples",
    "Organic berries, rolled back", "Hard seltzer variety packs - buy one get one", "Wine & beer weekend bundle",
    "Customers love these chips - rated 4.8", "Disinfecting wipes kill 99.9% of germs - save now", "Eco-friendly detergent, recyclable bottle",
    "Energy-saving air fryers, new low price", "Cookware sets made in USA", "Build-it kits kids love - text TOYS to join alerts",
    "Clinically proven cold & flu relief - save this season", "Vitamins that support immune health", "Allergy relief, pharmacist recommended",
    "Immune booster that prevents flu", "Anti-aging collagen serum repairs skin cells", "Clean beauty favorites, non-toxic formulas",
    "Dermatologist-recommended skincare, rolled back", "Energy Star appliances, save now", "Laptops for back to school - fast delivery",
    "Cashmere-blend sweaters, limited time", "Organic baby food pouches, rolled back", "Formula that supports brain development",
}
GENERIC_CLAIMS = ["Everyday low price, now even lower", "Save more on the brands you love", "New low price for a limited time",
                  "Rollback savings this month", "Stock up and save"]
TYPE_W = dict(PRICE_ROLLBACK=0.26, DIGITAL_COUPON=0.15, ENDCAP_FEATURE=0.12, BOGO=0.1, BUNDLE_DISCOUNT=0.09,
              CLEARANCE_MARKDOWN=0.1, INVENTORY_REALLOCATION=0.08, ONLINE_FLASH_DEAL=0.1)
DISC = dict(PRICE_ROLLBACK=(5, 18), DIGITAL_COUPON=(10, 25), ENDCAP_FEATURE=(0, 8), BOGO=(30, 50), BUNDLE_DISCOUNT=(10, 20),
            CLEARANCE_MARKDOWN=(25, 50), INVENTORY_REALLOCATION=(0, 0), ONLINE_FLASH_DEAL=(15, 35))
WEEKS = dict(PRICE_ROLLBACK=(2, 8), DIGITAL_COUPON=(1, 4), ENDCAP_FEATURE=(2, 9), BOGO=(1, 3), BUNDLE_DISCOUNT=(2, 5),
             CLEARANCE_MARKDOWN=(2, 6), INVENTORY_REALLOCATION=(1, 4), ONLINE_FLASH_DEAL=(1, 1))
CAT_W = np.array([0.17, 0.1, 0.1, 0.08, 0.07, 0.06, 0.04, 0.12, 0.07, 0.08, 0.06, 0.05])
PROMO_LABEL = dict(PRICE_ROLLBACK="Price rollback", DIGITAL_COUPON="Digital coupon", ENDCAP_FEATURE="Endcap feature", BOGO="BOGO",
                   BUNDLE_DISCOUNT="Bundle discount", CLEARANCE_MARKDOWN="Clearance markdown",
                   INVENTORY_REALLOCATION="Inventory reallocation", ONLINE_FLASH_DEAL="Online flash deal")
region_stores = {r: stores.loc[stores.region_id == r, "store_id"].tolist() for r in regions.region_id}
all_ids = stores["store_id"].tolist()
cat_ids = cats["category_id"].tolist()


def make_case(did, created, cid, ptype, scope_kind, region=None, stores_sel=None, disc=None, weeks=None,
              channel=None, claim=None, flags=None, as_of=None, owner=None, vendor_pct=None, realloc_units=None, tag=None):
    if stores_sel is None:
        if scope_kind == "ALL":
            stores_sel = all_ids
        elif scope_kind == "REGION":
            stores_sel = region_stores[region]
        else:
            pool = region_stores[region] if region else all_ids
            k = int(rng.integers(3, min(15, len(pool)) + 1))
            stores_sel = sorted(rng.choice(pool, size=k, replace=False).tolist())
    lo, hi = DISC[ptype]
    disc = disc if disc is not None else (0 if hi == 0 else int(rng.integers(lo, hi + 1)))
    wlo, whi = WEEKS[ptype]
    weeks = weeks if weeks is not None else int(rng.integers(wlo, whi + 1))
    if channel is None:
        channel = "ONLINE_ONLY" if ptype == "ONLINE_FLASH_DEAL" else "STORE_ONLY" if ptype in ("INVENTORY_REALLOCATION", "ENDCAP_FEATURE") \
            else rng.choice(["OMNICHANNEL", "STORE_ONLY", "ONLINE_ONLY"], p=[0.62, 0.26, 0.12]).item()
    if claim is None:
        safe = [x for x in CLAIMS[cid] if x not in RISKY_CLAIMS] + GENERIC_CLAIMS
        risky = [x for x in CLAIMS[cid] if x in RISKY_CLAIMS] or safe
        claim = (rng.choice(risky) if rng.random() < 0.22 else rng.choice(safe)).item()
    if flags is None:
        flags = []
        if ptype in ("PRICE_ROLLBACK", "CLEARANCE_MARKDOWN") and rng.random() < 0.3:
            flags.append("price_comparison")
        if ptype == "BOGO" and rng.random() < 0.4:
            flags.append("free_offer")
        if ptype == "DIGITAL_COUPON":
            flags.append("uses_customer_data")
        fund_p = dict(PRICE_ROLLBACK=0.8, BOGO=0.8, ENDCAP_FEATURE=0.85, DIGITAL_COUPON=0.65, BUNDLE_DISCOUNT=0.7,
                      CLEARANCE_MARKDOWN=0.1, ONLINE_FLASH_DEAL=0.6, INVENTORY_REALLOCATION=0.0)[ptype]
        if rng.random() < fund_p:
            flags.append("supplier_funded")
        if cid in ("C06", "C12") and rng.random() < 0.25:
            flags.append("kids_marketing")
        if ptype == "ONLINE_FLASH_DEAL" or rng.random() < 0.12:
            flags.append("limited_time")
        if "made in usa" in claim.lower():
            flags.append("made_in_usa")
    if vendor_pct is None:
        vendor_pct = int(rng.integers(45, 96)) if "supplier_funded" in flags else 0
    if realloc_units is None:
        realloc_units = int(rng.integers(2000, 20000)) if ptype == "INVENTORY_REALLOCATION" else 0
    start = created + timedelta(days=int(rng.integers(7, 29)))
    as_of = as_of or (created - timedelta(days=1))
    region_label = "All 50 pilot stores" if len(stores_sel) == 50 else (
        regions.set_index("region_id").loc[region, "name"] + (" region" if scope_kind == "REGION" else f" ({len(stores_sel)} stores)")
        if region else f"{len(stores_sel)} stores")
    states = sorted(stores.set_index("store_id").loc[stores_sel, "state"].unique().tolist())
    title = f"{PROMO_LABEL[ptype]}{'' if disc == 0 else f' {disc}%'} - {CATEGORIES[cid]} - {region_label}, {weeks} wk"
    return dict(
        decision_id=did, title=title, category_id=cid, promo_type=ptype, discount_pct=disc, duration_weeks=weeks,
        start_date=start.isoformat(), channel=channel, claim_text=claim, flags=",".join(flags), vendor_funding_pct=vendor_pct,
        reallocation_units=realloc_units, scope_kind=scope_kind, region_id=region or "", store_ids=",".join(stores_sel),
        store_count=len(stores_sel), states=",".join(states), data_as_of=as_of.isoformat(), created_at=created.isoformat(),
        created_by=owner or rng.choice(OWNERS).item(), scenario_tag=tag or "",
    )


cases = []
# ---- curated demo cases (pilot clock 2026-10-12, not yet analyzed) ----
T0 = PILOT_CLOCK
AS0 = PILOT_END
curated = [
    dict(did="D-2026-001", cid="C08", ptype="PRICE_ROLLBACK", scope_kind="ALL", disc=15, weeks=6, channel="OMNICHANNEL",
         claim="Clinically proven cold & flu relief - save 15% this season", flags=["supplier_funded"], vendor_pct=80,
         tag="ANCHOR_LEGAL_GATE"),
    dict(did="D-2026-002", cid="C01", ptype="PRICE_ROLLBACK", scope_kind="REGION", region="R-WEST", disc=8, weeks=3,
         channel="OMNICHANNEL", claim="Stock up on pantry staples for less", flags=["supplier_funded"], vendor_pct=85,
         tag="COMPLETE_AGREEMENT"),
    dict(did="D-2026-003", cid="C05", ptype="PRICE_ROLLBACK", scope_kind="REGION", region="R-SCEN", disc=28, weeks=4,
         channel="OMNICHANNEL", claim="Storage and organization sale", flags=[], tag="FINANCE_VS_SALES"),
    dict(did="D-2026-004", cid="C04", ptype="BOGO", scope_kind="REGION", region="R-MWST", disc=45, weeks=3,
         channel="OMNICHANNEL", claim="Paper towels and laundry essentials - buy one get one", flags=["supplier_funded"],
         vendor_pct=75, tag="OPS_HARD_STOP"),
    dict(did="D-2026-005", cid="C03", ptype="BOGO", scope_kind="REGION", region="R-SCEN", disc=50, weeks=2,
         channel="STORE_ONLY", claim="Hard seltzer variety packs - buy one get one", flags=["free_offer"], tag="LEGAL_PROHIBITED"),
    dict(did="D-2026-006", cid="C10", ptype="PRICE_ROLLBACK", scope_kind="REGION", region="R-MATL", disc=12, weeks=3,
         channel="OMNICHANNEL", claim="Holiday TVs at new low prices", flags=["supplier_funded"], vendor_pct=70,
         tag="MISSING_EVIDENCE"),
    dict(did="D-2026-007", cid="C02", ptype="ENDCAP_FEATURE", scope_kind="REGION", region="R-SEST", disc=6, weeks=3,
         channel="STORE_ONLY", claim="Fresh rotisserie favorites, lower every day", flags=["supplier_funded"], vendor_pct=70,
         as_of=date(2026, 9, 24), tag="STALE_EVIDENCE"),
    dict(did="D-2026-008", cid="C12", ptype="DIGITAL_COUPON", scope_kind="SUBSET", region="R-MATL",
         stores_sel=["WMT-P034", "WMT-P038", "WMT-P041"], disc=18, weeks=2, channel="ONLINE_ONLY",
         claim="Diapers and wipes, stock-up savings", flags=["uses_customer_data"], tag="LOW_CONFIDENCE"),
    dict(did="D-2026-009", cid="C11", ptype="CLEARANCE_MARKDOWN", scope_kind="REGION", region="R-WEST", disc=50, weeks=3,
         channel="OMNICHANNEL", claim="Seasonal clearance styles", flags=["price_comparison"], tag="REJECT_CANDIDATE"),
    dict(did="D-2026-010", cid="C09", ptype="DIGITAL_COUPON", scope_kind="REGION", region="R-WEST", disc=20, weeks=3,
         channel="ONLINE_ONLY", claim="Anti-aging collagen serum repairs skin cells", flags=["uses_customer_data"], tag="PRIVACY_AND_CLAIMS"),
    dict(did="D-2026-011", cid="C03", ptype="ENDCAP_FEATURE", scope_kind="ALL", disc=5, weeks=8, channel="STORE_ONLY",
         claim="Sparkling water multipacks, new low price", flags=["supplier_funded"], vendor_pct=50, tag="SUPPLIER_EXCLUSIVITY"),
    dict(did="D-2026-012", cid="C10", ptype="INVENTORY_REALLOCATION", scope_kind="REGION", region="R-SCEN", disc=0, weeks=2,
         channel="STORE_ONLY", claim="Holiday TVs at new low prices", flags=[], realloc_units=6000, tag="INVENTORY_MOVE"),
]
for cc in curated:
    as_of = cc.pop("as_of", AS0)
    did = cc.pop("did")
    tag = cc.pop("tag")
    case = make_case(did, T0, as_of=as_of, owner="Maya Chen", tag=tag, **cc)
    # D-2026-004 is an urgent request: launch in 3 days, shorter than replenishment lead time
    case["start_date"] = (T0 + timedelta(days=3 if did == "D-2026-004" else 21)).isoformat()
    cases.append(case)

# ---- historical cases ----
hist_start, hist_end = date(2025, 12, 10), date(2026, 10, 9)
span = (hist_end - hist_start).days
n_hist = 5000 - len(cases)
outage_windows = [(a, b) for _, cat_id, a, b, _ in outages if cat_id is None]
for k in range(n_hist):
    created = hist_start + timedelta(days=int(min(span, rng.beta(1.3, 1.0) * span)))
    cid = rng.choice(cat_ids, p=CAT_W / CAT_W.sum()).item()
    ptype = rng.choice(list(TYPE_W), p=np.array(list(TYPE_W.values())) / sum(TYPE_W.values())).item()
    roll = rng.random()
    scope_kind = "REGION" if roll < 0.55 else "SUBSET" if roll < 0.8 else "ALL"
    region = rng.choice(regions.region_id.tolist()).item() if scope_kind != "ALL" else None
    as_of = None
    stores_sel = None
    q = rng.random()
    if q < 0.11:  # stale evidence snapshot
        as_of = created - timedelta(days=int(rng.integers(9, 22)))
    elif q < 0.165:  # case touching an ops-feed outage
        a, b = outage_windows[int(rng.integers(0, len(outage_windows)))]
        as_of = a + timedelta(days=int(rng.integers(3, (b - a).days + 1)))
        created = as_of + timedelta(days=1)
        scope_kind, region = "SUBSET", "R-SEST"
        stores_sel = sorted(set(rng.choice(["WMT-P047", "WMT-P048", "WMT-P049", "WMT-P050"], size=3, replace=False).tolist()
                                + rng.choice(region_stores["R-SEST"][:4], size=1).tolist()))
    if as_of is not None and as_of < PILOT_START + timedelta(days=60):
        as_of = PILOT_START + timedelta(days=60)
        created = max(created, as_of + timedelta(days=1))
    cases.append(make_case(f"D-2025-{k + 1:04d}" if created.year == 2025 else f"D-26H-{k + 1:04d}", created, cid, ptype,
                           scope_kind, region=region, stores_sel=stores_sel, as_of=as_of))
cases_df = pd.DataFrame(cases)
log(f"cases={len(cases_df)}  curated={len(curated)}")

# --------------------------------------------------------------------------------------
# 9. Write outputs
# --------------------------------------------------------------------------------------
log("writing outputs")
cats.to_csv(os.path.join(OUT, "categories.csv"), index=False)
regions.to_csv(os.path.join(OUT, "regions.csv"), index=False)
stores.to_csv(os.path.join(OUT, "stores.csv"), index=False)
dcs.to_csv(os.path.join(OUT, "dcs.csv"), index=False)
el.to_csv(os.path.join(OUT, "elasticity_by_dept.csv"), index=False)
rules_df.to_csv(os.path.join(OUT, "legal_rules.csv"), index=False)
cases_df.to_csv(os.path.join(OUT, "decision_cases.csv"), index=False)
sales_daily.to_csv(os.path.join(OUT, "sales_daily.csv.gz"), index=False, compression="gzip")
ops_daily.to_csv(os.path.join(OUT, "ops_daily.csv.gz"), index=False, compression="gzip")
dc_daily.to_csv(os.path.join(OUT, "dc_daily.csv"), index=False)

manifest = dict(
    built_at=pd.Timestamp.now().isoformat(timespec="seconds"), seed=SEED,
    pilot_window=[PILOT_START.isoformat(), PILOT_END.isoformat()], pilot_clock=PILOT_CLOCK.isoformat(),
    source_window=[SRC_START.isoformat(), SRC_END.isoformat()], shift_days=SHIFT_DAYS,
    sources=[
        dict(name="M5 Forecasting - Accuracy (Walmart)", url="https://www.kaggle.com/competitions/m5-forecasting-accuracy",
             provenance="REAL", used_for="Daily demand shape, seasonality, events, prices, price elasticity, promo detection",
             rows_read=int(units.size), price_rows=int(len(prices))),
        dict(name="Walmart 45-store weekly sales", url="https://www.kaggle.com/datasets/yasserh/walmart-dataset",
             provenance="REAL", used_for="Relative store size distribution for the 50 pilot stores", rows_read=int(len(wm))),
        dict(name="Walmart Inc. FY2026 Form 10-K", url="https://www.sec.gov/Archives/edgar/data/104169/000010416926000055/wmt-20260131.htm",
             provenance="PUBLIC", used_for="Average sales per store level calibration ($4.8B for 50 stores) and eCommerce share"),
    ],
    tables={k: int(v) for k, v in dict(categories=len(cats), regions=len(regions), stores=len(stores), dcs=len(dcs),
                                         sales_daily=len(sales_daily), ops_daily=len(ops_daily), dc_daily=len(dc_daily),
                                         legal_rules=len(rules_df), decision_cases=len(cases_df)).items()},
    outages=[dict(stores=s, category=c, start=a.isoformat(), end=b.isoformat(), label=l) for s, c, a, b, l in outages],
    elasticity=el.round(4).to_dict(orient="records"),
)
with open(os.path.join(OUT, "manifest.json"), "w") as f:
    json.dump(manifest, f, indent=2)
log("done")
