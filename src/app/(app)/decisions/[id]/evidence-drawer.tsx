"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Database, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AGENT_META, AgentAvatar, ProvTag } from "@/components/domain";
import { cn, money } from "@/lib/format";
import type { AgentOutput, AgentType, EvidenceItem } from "@/lib/types";

type Series = {
  sales: { date: string; store: number; ecom: number; promo: number; event: string | null }[];
  ops: { date: string; on_hand: number; inbound: number; fill_rate: number; fulfillment: number; stores: number }[];
  dc: { date: string; dc_id: string; util: number }[];
};

function Value({ v }: { v: unknown }) {
  if (v === null || v === undefined) return <span className="text-faint">n/a</span>;
  if (typeof v === "number") return <span className="tnum">{Math.abs(v) >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : v}</span>;
  if (typeof v === "string" || typeof v === "boolean") return <span>{String(v)}</span>;
  if (Array.isArray(v)) return <span>{v.join(", ")}</span>;
  return (
    <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
      {Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== undefined)
        .map(([k, x]) => (
          <div key={k} className="flex justify-between gap-2 text-[12px]">
            <span className="text-muted">{k.replace(/_/g, " ")}</span>
            <span className="truncate text-right font-medium text-ink">
              {typeof x === "object" && x !== null ? (Array.isArray(x) ? x.join(", ") : JSON.stringify(x)) : typeof x === "number" ? x.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(x)}
            </span>
          </div>
        ))}
    </div>
  );
}

const short = (d: string) => d.slice(5);

function FinanceWaterfall({ m }: { m: Record<string, unknown> }) {
  const n = (k: string) => Number(m[k] ?? 0);
  const rows = [
    { name: "Promo GP", v: n("incremental_gross_profit") },
    { name: "Halo", v: n("halo_gross_profit") },
    { name: "Supplier $", v: n("vendor_funding") },
    { name: "Write-down", v: n("writedown_avoided") },
    { name: "Promo cost", v: -n("promo_cost") },
    { name: "Ops cost", v: -n("incremental_costs") },
    { name: "Net", v: n("net_benefit") },
  ].filter((r) => r.v !== 0 || r.name === "Net");
  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={rows} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke="#eef1f7" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#667085" }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={(v) => money(v)} tick={{ fontSize: 11, fill: "#667085" }} axisLine={false} tickLine={false} width={64} />
        <Tooltip formatter={(v) => money(Number(v), false)} cursor={{ fill: "#f6f8fc" }} />
        <ReferenceLine y={0} stroke="#d0d5dd" />
        <Bar dataKey="v" radius={[6, 6, 6, 6]}>
          {rows.map((r) => (
            <Cell key={r.name} fill={r.name === "Net" ? (r.v >= 0 ? "#12a26b" : "#d92d20") : r.v >= 0 ? "#7b91f4" : "#f4a29b"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function EvidenceDrawer({
  agent,
  open,
  onClose,
  evidence,
  output,
  decisionId,
}: {
  agent: AgentType | null;
  open: boolean;
  onClose: () => void;
  evidence: EvidenceItem[];
  output?: AgentOutput;
  decisionId: string;
}) {
  const [series, setSeries] = useState<Series | null>(null);
  useEffect(() => {
    if (open && !series && (agent === "SALES" || agent === "OPERATIONS"))
      fetch(`/api/decisions/${decisionId}/series`)
        .then((r) => r.json())
        .then(setSeries)
        .catch(() => {});
  }, [open, agent, series, decisionId]);
  if (!agent) return null;
  const meta = AGENT_META[agent];
  const items = evidence.filter((e) => e.agent_type === agent);
  const cited = new Set(output?.evidence_ids ?? []);
  const dcByDate = series
    ? Object.values(
        series.dc.reduce<Record<string, Record<string, number | string>>>((acc, r) => {
          acc[r.date] ??= { date: r.date };
          acc[r.date][r.dc_id] = r.util;
          return acc;
        }, {}),
      )
    : [];
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed top-0 right-0 z-50 flex h-full w-full max-w-[640px] flex-col bg-white shadow-pop outline-none">
          <div className="flex items-center gap-3 border-b border-line px-5 py-4">
            <AgentAvatar agent={agent} size={36} />
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[16px] font-semibold">{meta.name} Agent evidence</Dialog.Title>
              <Dialog.Description className="text-[12.5px] text-muted">
                Every number traces to a source record. {cited.size} of {items.length} items cited by the agent.
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-lg p-1.5 text-muted hover:bg-line-2">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-5 scrollbar-thin">
            {agent === "SALES" && series && (
              <div className="rounded-xl border border-line p-3">
                <div className="mb-1 text-[12.5px] font-semibold">Daily revenue in scope (last 120 days, store + online)</div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={series.sales} margin={{ left: 0, right: 8, top: 6 }}>
                    <defs>
                      <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3d63dd" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#3d63dd" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gE" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7a5af8" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#7a5af8" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#eef1f7" />
                    <XAxis dataKey="date" tickFormatter={short} tick={{ fontSize: 10.5, fill: "#667085" }} axisLine={false} tickLine={false} minTickGap={28} />
                    <YAxis tickFormatter={(v) => money(v)} tick={{ fontSize: 10.5, fill: "#667085" }} axisLine={false} tickLine={false} width={58} />
                    <Tooltip formatter={(v) => money(Number(v), false)} labelFormatter={(l, p) => `${l}${p?.[0]?.payload?.event ? ` · ${p[0].payload.event}` : ""}`} />
                    <Area type="monotone" dataKey="store" stackId="1" stroke="#3d63dd" fill="url(#gS)" name="Store" />
                    <Area type="monotone" dataKey="ecom" stackId="1" stroke="#7a5af8" fill="url(#gE)" name="Online" />
                  </AreaChart>
                </ResponsiveContainer>
                <p className="mt-1 text-[11px] text-muted">Shape from real M5 Walmart daily sales (re-dated to the pilot year); level calibrated to Walmart 10-K averages.</p>
              </div>
            )}
            {agent === "OPERATIONS" && series && (
              <div className="grid gap-3">
                <div className="rounded-xl border border-line p-3">
                  <div className="mb-1 text-[12.5px] font-semibold">Inventory on hand + inbound (units, last 60 days)</div>
                  <ResponsiveContainer width="100%" height={170}>
                    <AreaChart data={series.ops} margin={{ left: 0, right: 8, top: 6 }}>
                      <CartesianGrid vertical={false} stroke="#eef1f7" />
                      <XAxis dataKey="date" tickFormatter={short} tick={{ fontSize: 10.5, fill: "#667085" }} axisLine={false} tickLine={false} minTickGap={28} />
                      <YAxis tick={{ fontSize: 10.5, fill: "#667085" }} axisLine={false} tickLine={false} width={58} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                      <Tooltip formatter={(v) => Number(v).toLocaleString()} />
                      <Area type="monotone" dataKey="on_hand" stackId="1" stroke="#0e9aa7" fill="#0e9aa733" name="On hand" />
                      <Area type="monotone" dataKey="inbound" stackId="1" stroke="#7b91f4" fill="#7b91f433" name="Inbound" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="rounded-xl border border-line p-3">
                  <div className="mb-1 text-[12.5px] font-semibold">Distribution center utilization (%)</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={dcByDate} margin={{ left: 0, right: 8, top: 6 }}>
                      <CartesianGrid vertical={false} stroke="#eef1f7" />
                      <XAxis dataKey="date" tickFormatter={short} tick={{ fontSize: 10.5, fill: "#667085" }} axisLine={false} tickLine={false} minTickGap={28} />
                      <YAxis domain={[60, "auto"]} tick={{ fontSize: 10.5, fill: "#667085" }} axisLine={false} tickLine={false} width={36} />
                      <Tooltip />
                      <ReferenceLine y={100} stroke="#d92d20" strokeDasharray="4 4" />
                      <Line type="monotone" dataKey="DC-P01" stroke="#3d63dd" dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="DC-P02" stroke="#0e9aa7" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                  <p className="mt-1 text-[11px] text-muted">Generated operations data driven by the real demand series. Gaps indicate store feed outages.</p>
                </div>
              </div>
            )}
            {agent === "FINANCE" && output && (
              <div className="rounded-xl border border-line p-3">
                <div className="mb-1 text-[12.5px] font-semibold">How the net benefit is built</div>
                <FinanceWaterfall m={output.key_metrics} />
              </div>
            )}
            {items.length === 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-line p-6 text-[13px] text-muted">
                <Database className="size-4" /> No evidence recorded for this agent yet.
              </div>
            )}
            {items.map((e) => (
              <div key={e.evidence_id} className={cn("rounded-xl border p-3", cited.has(e.evidence_id) ? "border-brand-200 bg-brand-25" : "border-line")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-ink">{e.label}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                      <span className="font-mono">{e.evidence_id}</span>·<span>{e.source}</span>
                      {e.as_of && <>· as of {e.as_of}</>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {cited.has(e.evidence_id) && <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">CITED</span>}
                    <ProvTag p={e.provenance} />
                  </div>
                </div>
                <div className="mt-2 text-[13px] text-ink-2">
                  <Value v={e.value} />
                  {e.unit && typeof e.value !== "object" && <span className="ml-1 text-muted">{e.unit}</span>}
                </div>
              </div>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
