import { AlertTriangle, Database, ExternalLink, FileSpreadsheet, Landmark, Sparkles } from "lucide-react";
import { CategorySales, DcLines } from "@/components/charts";
import { ProvTag } from "@/components/domain";
import { InsightTabs } from "@/components/insight-tabs";
import { Card, CardHeader, PageHeader, Stat } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateLabel, int, money } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Data & evidence" };

const PALETTE = ["#142B45", "#24405F", "#3B5878", "#577290", "#7A90A8", "#A3B3C4", "#C9A15B", "#B08A4A", "#8E6F3B", "#D7C5A0", "#9DB3A3", "#5F8A72"];

export default async function DataPage() {
  await requireSession();
  const sql = db();
  const [[m], cats, weekly, dcw, regions, [counts]] = await Promise.all([
    sql`select manifest from dataset_manifest where id = 1`,
    sql`select * from categories order by category_id`,
    sql`select to_char(date_trunc('week', date), 'Mon DD') as week, date_trunc('week', date) as wk, category_id,
               round(sum(store_sales + ecommerce_sales))::float as rev
        from sales_daily group by 1, 2, 3 having count(distinct date) = 7 order by 2`,
    sql`select to_char(date_trunc('week', date), 'Mon DD') as week, date_trunc('week', date) as wk, dc_id, round(avg(utilization_pct), 1)::float as util
        from dc_daily group by 1, 2, 3 having count(*) = 7 order by 2`,
    sql`select r.*, (select round(sum(annual_sales_target)) from stores s where s.region_id = r.region_id)::float as sales,
               (select string_agg(distinct m5_source_store, ', ') from stores s where s.region_id = r.region_id) as m5
        from regions r order by region_id`,
    sql`select (select count(*) from sales_daily)::int sales, (select count(*) from ops_daily)::int ops, (select count(*) from legal_rules)::int rules,
               (select count(*) from legal_rules where enabled)::int rules_on, (select count(*) from decision_cases)::int cases,
               (select count(*) from evidence)::int evidence, (select round(sum(store_sales + ecommerce_sales)) from sales_daily)::float as total`,
  ]);
  const manifest = m.manifest as {
    pilot_window: string[];
    source_window: string[];
    shift_days: number;
    sources: { name: string; url: string; provenance: string; used_for: string; rows_read?: number; price_rows?: number }[];
    outages: { stores: string[]; category: string | null; start: string; end: string; label: string }[];
  };
  const byWeek = new Map<string, Record<string, number | string>>();
  for (const r of weekly) {
    const k = String(r.week);
    if (!byWeek.has(k)) byWeek.set(k, { week: k });
    byWeek.get(k)![String(r.category_id)] = Number(r.rev);
  }
  const dcByWeek = new Map<string, Record<string, number | string>>();
  for (const r of dcw) {
    const k = String(r.week);
    if (!dcByWeek.has(k)) dcByWeek.set(k, { week: k });
    dcByWeek.get(k)![String(r.dc_id)] = Number(r.util);
  }
  const icons = [<FileSpreadsheet key="a" className="size-5" />, <FileSpreadsheet key="b" className="size-5" />, <Landmark key="c" className="size-5" />];

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Where every number comes from." />
      <InsightTabs active="data" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Daily sales rows" value={int(counts.sales)} sub="50 stores × 12 categories × 365 days" icon={<Database className="size-4" />} tone="brand" />
        <Stat label="Operations rows" value={int(counts.ops)} sub="Inventory, capacity, lead time" icon={<Database className="size-4" />} tone="info" />
        <Stat label="Pilot annual sales" value={money(counts.total)} sub="Calibrated to Walmart 10-K store average" icon={<Landmark className="size-4" />} tone="ok" />
        <Stat label="Evidence records" value={int(counts.evidence)} sub={`${int(counts.cases)} decision cases`} icon={<Sparkles className="size-4" />} tone="violet" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {manifest.sources.map((s, i) => (
          <Card key={s.name} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600">{icons[i]}</span>
              <ProvTag p={s.provenance} />
            </div>
            <h3 className="mt-3 text-[14.5px] font-semibold">{s.name}</h3>
            <p className="mt-1 text-[13px] text-ink-2">{s.used_for}</p>
            {s.rows_read ? <p className="mt-2 text-[12px] text-muted">{int(s.rows_read)} values read{s.price_rows ? ` · ${int(s.price_rows)} price rows` : ""}</p> : null}
            <a href={s.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-700 hover:underline">
              Source <ExternalLink className="size-3" />
            </a>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Pilot weekly sales by category"
          subtitle={`Real M5 Walmart daily patterns from ${dateLabel(manifest.source_window[0])} to ${dateLabel(manifest.source_window[1])}, re-dated by exactly ${manifest.shift_days} days (574 weeks) so weekdays and holidays line up with the ${dateLabel(manifest.pilot_window[0])} to ${dateLabel(manifest.pilot_window[1])} pilot year.`}
        />
        <div className="px-3 pb-3">
          <CategorySales data={[...byWeek.values()]} keys={cats.map((c, i) => ({ key: String(c.category_id), name: String(c.name), color: PALETTE[i % PALETTE.length] }))} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader title="Categories and model assumptions" subtitle="Elasticity drives the Sales agent; margin drives Finance. Measured values are shown for transparency." />
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[640px] text-left text-[12.5px]">
              <thead>
                <tr className="border-y border-line bg-canvas/70 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
                  <th className="px-4 py-2">Category</th>
                  <th className="px-3 py-2">Pattern</th>
                  <th className="px-3 py-2">Margin</th>
                  <th className="px-3 py-2">Elasticity used</th>
                  <th className="px-3 py-2">Measured in M5</th>
                  <th className="px-3 py-2">Basket halo</th>
                </tr>
              </thead>
              <tbody>
                {cats.map((c) => (
                  <tr key={String(c.category_id)} className="border-b border-line-2 last:border-0">
                    <td className="px-4 py-2">
                      <div className="font-medium text-ink">{String(c.name)}</div>
                      <div className="text-[11px] text-muted">
                        {String(c.category_id)} · from {String(c.source_dept)}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <ProvTag p={String(c.provenance) === "REAL" ? "DERIVED" : "GENERATED"} />
                    </td>
                    <td className="tnum px-3 py-2">{Number(c.gross_margin_pct)}%</td>
                    <td className="tnum px-3 py-2 font-medium">{Number(c.elasticity).toFixed(2)}</td>
                    <td className="tnum px-3 py-2 text-muted">
                      {c.measured_elasticity !== null ? `${Number(c.measured_elasticity).toFixed(2)} (${int(Number(c.measured_events))} promos)` : "n/a"}
                    </td>
                    <td className="tnum px-3 py-2">{Math.round(Number(c.halo_ratio) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-4 py-3 text-[12px] text-muted">
            Why benchmarks? Price response measured directly in M5 is weak and noisy (weekly-averaged prices blur short promotions, and markdowns coincide with slow
            sellers), so the agents use category-level benchmarks: about one third of the brand-level mean of -2.6 (Bijmolt, van Heerde & Pieters 2005; van Heerde,
            Gupta & Wittink 2003). Labelled as an assumption everywhere it is used.
          </p>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Distribution center utilization" subtitle="Weekly average · generated from real demand" />
            <div className="px-3 pb-3">
              <DcLines data={[...dcByWeek.values()]} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Data-quality incidents" subtitle="Injected on purpose to test missing-evidence handling" icon={<AlertTriangle className="size-4" />} />
            <ul className="space-y-2 px-5 pb-5">
              {manifest.outages.map((o, i) => (
                <li key={i} className="rounded-xl border border-line p-2.5 text-[12.5px]">
                  <div className="font-medium text-ink">{o.label}</div>
                  <div className="text-muted">
                    {dateLabel(o.start)} to {dateLabel(o.end)} · {o.stores.length} stores{o.category ? ` · ${o.category}` : " · all categories"}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Pilot network" subtitle="50 generated store IDs (WMT-P001 to P050) in five pilot regions served by two distribution centers" />
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[640px] text-left text-[12.5px]">
            <thead>
              <tr className="border-y border-line bg-canvas/70 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
                <th className="px-4 py-2">Region</th>
                <th className="px-3 py-2">State</th>
                <th className="px-3 py-2">Stores</th>
                <th className="px-3 py-2">DC</th>
                <th className="px-3 py-2">Demand pattern from M5 stores</th>
                <th className="px-3 py-2">Annual sales</th>
              </tr>
            </thead>
            <tbody>
              {regions.map((r) => (
                <tr key={String(r.region_id)} className="border-b border-line-2 last:border-0">
                  <td className="px-4 py-2 font-medium text-ink">{String(r.name)}</td>
                  <td className="px-3 py-2">{String(r.state)}</td>
                  <td className="tnum px-3 py-2">{Number(r.store_count)}</td>
                  <td className="px-3 py-2 font-mono text-[12px]">{String(r.dc_id)}</td>
                  <td className="px-3 py-2">
                    <span className="mr-2 font-mono text-[12px] text-ink-2">{String(r.m5)}</span>
                    <ProvTag p={String(r.pattern_provenance) === "REAL" ? "REAL" : "GENERATED"} />
                  </td>
                  <td className="tnum px-3 py-2">{money(Number(r.sales))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-4 py-3 text-[12px] text-muted">
          Legal rule catalog: {int(counts.rules)} rules ({int(counts.rules_on)} active, the rest superseded versions kept for audit history), modelled on public U.S.
          regulations. Compliance-risk indicators only, not legal advice.
        </p>
      </Card>
    </div>
  );
}
