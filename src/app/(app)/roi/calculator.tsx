"use client";

import { RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { Tornado } from "@/components/charts";
import { Badge, Button, Card, CardHeader, KV } from "@/components/ui";
import { cn, money } from "@/lib/format";

interface Inputs {
  decisions: number;
  hours: number;
  rate: number;
  bps: number;
  sales: number;
  invBase: number;
  invPct: number;
  compliance: number;
  cost: number;
}
const BASE: Inputs = { decisions: 120, hours: 2.5, rate: 85, bps: 1.5, sales: 4.8e9, invBase: 250e6, invPct: 0.1, compliance: 150_000, cost: 1_150_000 };

function compute(i: Inputs) {
  const labor = i.decisions * 12 * i.hours * i.rate;
  const margin = (i.bps / 10_000) * i.sales;
  const inventory = (i.invPct / 100) * i.invBase;
  const benefit = labor + margin + inventory + i.compliance;
  const roi = ((benefit - i.cost) / i.cost) * 100;
  const payback = i.cost / (benefit / 12);
  return { labor, margin, inventory, compliance: i.compliance, benefit, roi, payback };
}

const SLIDERS: { k: keyof Inputs; label: string; min: number; max: number; step: number; fmt: (v: number) => string; low: number; high: number }[] = [
  { k: "decisions", label: "Cross-functional decisions / month", min: 20, max: 400, step: 10, fmt: (v) => `${v}`, low: 80, high: 160 },
  { k: "hours", label: "Reconciliation hours saved / decision", min: 0.5, max: 6, step: 0.25, fmt: (v) => `${v} h`, low: 1.5, high: 3.5 },
  { k: "rate", label: "Loaded hourly cost", min: 40, max: 200, step: 5, fmt: (v) => `$${v}`, low: 65, high: 105 },
  { k: "bps", label: "Margin / markdown improvement", min: 0, max: 5, step: 0.25, fmt: (v) => `${v} bps`, low: 0.5, high: 2.5 },
  { k: "invPct", label: "Inventory loss reduction", min: 0, max: 0.5, step: 0.01, fmt: (v) => `${v.toFixed(2)}%`, low: 0.05, high: 0.15 },
  { k: "compliance", label: "Compliance / rework proxy", min: 0, max: 400_000, step: 10_000, fmt: (v) => money(v), low: 75_000, high: 225_000 },
  { k: "cost", label: "Year-1 implementation cost", min: 500_000, max: 2_500_000, step: 50_000, fmt: (v) => money(v), low: 1_450_000, high: 850_000 },
];

export function RoiCalculator({ observed }: { observed: { perMonth: number; conflictPct: number; legalPct: number; overridePct: number } }) {
  const [i, setI] = useState<Inputs>(BASE);
  const r = useMemo(() => compute(i), [i]);
  const tornado = useMemo(() => {
    const base = compute(i).roi;
    return SLIDERS.map((s) => {
      const lo = compute({ ...i, [s.k]: s.low }).roi - base;
      const hi = compute({ ...i, [s.k]: s.high }).roi - base;
      return { driver: s.label.replace(/ \/ .*| improvement| reduction| proxy/g, ""), low: Math.min(lo, hi), high: Math.max(lo, hi), span: Math.abs(hi - lo) };
    }).sort((a, b) => b.span - a.span);
  }, [i]);
  const parts = [
    { l: "Reconciliation time saved", v: r.labor, c: "#3d63dd" },
    { l: "Margin / markdown decisions", v: r.margin, c: "#12a26b" },
    { l: "Inventory / fulfillment loss", v: r.inventory, c: "#0e93b8" },
    { l: "Compliance / rework", v: r.compliance, c: "#8e4ec6" },
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-semibold">Assumptions</h3>
          <Button variant="ghost" size="sm" onClick={() => setI(BASE)}>
            <RotateCcw className="size-3.5" /> Deliverable 1 values
          </Button>
        </div>
        <div className="mt-4 space-y-4">
          {SLIDERS.map((s) => (
            <label key={s.k} className="block">
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="font-medium text-ink-2">{s.label}</span>
                <span className="tnum font-semibold text-brand-700">{s.fmt(i[s.k])}</span>
              </div>
              <input type="range" min={s.min} max={s.max} step={s.step} value={i[s.k]} onChange={(e) => setI({ ...i, [s.k]: Number(e.target.value) })} className="mt-1.5 w-full accent-brand-600" />
            </label>
          ))}
        </div>
        <div className="mt-5 rounded-xl border border-line bg-canvas p-3 text-[12.5px]">
          <div className="font-semibold text-ink">Observed in the pilot ledger</div>
          <KV k="Decision cases per month" v={observed.perMonth} />
          <KV k="With a material agent conflict" v={`${observed.conflictPct}%`} />
          <KV k="Needing legal review" v={`${observed.legalPct}%`} />
          <KV k="Human overrides (with rationale)" v={`${observed.overridePct}%`} />
          <Button variant="soft" size="sm" className="mt-2 w-full" onClick={() => setI({ ...i, decisions: Math.round((observed.perMonth * observed.conflictPct) / 100 / 10) * 10 })}>
            Use observed conflict volume
          </Button>
        </div>
      </Card>
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <div className="text-[13px] font-medium text-muted">Annual modeled benefit</div>
            <div className="tnum mt-1 text-[26px] font-semibold tracking-tight">{money(r.benefit)}</div>
          </Card>
          <Card className={cn("p-4", r.roi >= 0 ? "border-[#c6ecd9]" : "border-[#f9cbc7]")}>
            <div className="text-[13px] font-medium text-muted">Year-1 ROI</div>
            <div className={cn("tnum mt-1 text-[26px] font-semibold tracking-tight", r.roi >= 0 ? "text-ok" : "text-bad")}>{r.roi.toFixed(1)}%</div>
          </Card>
          <Card className="p-4">
            <div className="text-[13px] font-medium text-muted">Payback</div>
            <div className="tnum mt-1 text-[26px] font-semibold tracking-tight">{Number.isFinite(r.payback) ? `${r.payback.toFixed(1)} mo` : "-"}</div>
          </Card>
        </div>
        <Card>
          <CardHeader title="Where the benefit comes from" subtitle={`vs ${money(i.cost)} Year-1 cost (illustrative enterprise pilot)`} action={<Badge tone="violet">Capstone assumption</Badge>} />
          <div className="px-5 pb-5">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-line-2">
              {parts.map((p) => (
                <div key={p.l} style={{ width: `${(p.v / Math.max(1, r.benefit)) * 100}%`, background: p.c }} />
              ))}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {parts.map((p) => (
                <div key={p.l} className="flex items-center justify-between rounded-lg border border-line-2 px-3 py-2 text-[12.5px]">
                  <span className="flex items-center gap-2 text-ink-2">
                    <span className="size-2.5 rounded-full" style={{ background: p.c }} />
                    {p.l}
                  </span>
                  <span className="tnum font-semibold">{money(p.v)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Sensitivity (tornado)" subtitle="Change in Year-1 ROI when each assumption moves to its pessimistic / optimistic value, others held constant" />
          <div className="px-3 pb-3">
            <Tornado data={tornado} />
          </div>
        </Card>
      </div>
    </div>
  );
}
