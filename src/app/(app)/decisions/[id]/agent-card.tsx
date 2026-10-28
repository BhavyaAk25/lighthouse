"use client";

import { AlertTriangle, Bot, Check, ChevronDown, FileSearch, Loader2, ShieldCheck, Wrench } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { AGENT_META, AgentAvatar, RecBadge, RiskBadge } from "@/components/domain";
import { ConfidenceRing } from "@/components/ui";
import { cn, int, money, pct, plainMoney } from "@/lib/format";
import type { AgentOutput, AgentType } from "@/lib/types";

export interface ToolStep {
  name: string;
  detail: string;
  ms: number;
}

const METRICS: Record<AgentType, { key: string; label: string; fmt: (v: unknown) => string; warn?: (v: number) => boolean }[]> = {
  SALES: [
    { key: "unit_uplift_pct", label: "Unit uplift", fmt: (v) => pct(Number(v), 1, true) },
    { key: "revenue_uplift_pct", label: "Revenue uplift", fmt: (v) => pct(Number(v), 1, true), warn: (v) => v < 0 },
    { key: "projected_revenue", label: "Projected revenue", fmt: (v) => money(Number(v)) },
    { key: "analog_uplift_pct", label: "Real promo analog", fmt: (v) => (v === null ? "n/a" : pct(Number(v), 1, true)) },
  ],
  FINANCE: [
    { key: "net_benefit", label: "Net benefit", fmt: (v) => money(Number(v)), warn: (v) => v < 0 },
    { key: "roi_pct", label: "ROI", fmt: (v) => pct(Number(v), 1), warn: (v) => v < 0 },
    { key: "downside_net_benefit", label: "Downside case", fmt: (v) => money(Number(v)), warn: (v) => v < 0 },
    { key: "break_even_discount_pct", label: "Break-even discount", fmt: (v) => (v === null || v === undefined ? "Not binding" : `${v}%`) },
  ],
  OPERATIONS: [
    { key: "dc_util_projected_peak_pct", label: "DC peak load", fmt: (v) => pct(Number(v), 0), warn: (v) => v >= 95 },
    { key: "projected_fill_rate_pct", label: "Projected fill rate", fmt: (v) => pct(Number(v), 1), warn: (v) => v < 95 },
    { key: "fulfillment_projected_pct", label: "Online fulfillment", fmt: (v) => pct(Number(v), 0), warn: (v) => v >= 98 },
    { key: "coverage_days", label: "Inventory cover", fmt: (v) => `${Number(v).toFixed(1)} days` },
  ],
  LEGAL: [
    { key: "rules_triggered", label: "Rules triggered", fmt: (v) => int(Number(v)) },
    { key: "review_required_rules", label: "Need human review", fmt: (v) => int(Number(v)), warn: (v) => v > 0 },
    { key: "prohibited_rules", label: "Prohibited", fmt: (v) => int(Number(v)), warn: (v) => v > 0 },
    { key: "highest_severity", label: "Highest severity", fmt: (v) => String(v ?? "-").toLowerCase() },
  ],
};

export function modelLabel(provider: string, model: string) {
  if (provider === "rules-engine") return "Rules engine";
  if (provider === "replay") return "Saved AI answer";
  const m = model.replace(/^openai\//, "").replace(/^qwen\//, "").replace(/^gemini-/, "Gemini ").replace(/-flash/, " Flash");
  return provider === "groq" ? `Groq · ${m}` : m;
}

export function AgentCard({
  agent,
  output,
  running,
  steps,
  note,
  onEvidence,
  index,
}: {
  agent: AgentType;
  output?: AgentOutput;
  running: boolean;
  steps: ToolStep[];
  note?: string;
  onEvidence: () => void;
  index: number;
}) {
  const meta = AGENT_META[agent];
  const [open, setOpen] = useState(false);
  const thinking = running && !output;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className={cn("card relative flex flex-col overflow-hidden", thinking && "border-[#D8C9A8]")}
    >
      <div className="h-[2px] w-full" style={{ background: meta.color, opacity: output ? 0.9 : 0.25 }} />
      <div className="flex items-start gap-3 px-4 pt-3.5 pb-3">
        <AgentAvatar agent={agent} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-medium">{meta.name}</h3>
          </div>
          <p className="text-[12.5px] text-muted">{meta.focus}</p>
        </div>
        {output ? (
          <ConfidenceRing value={output.confidence} size={46} />
        ) : thinking ? (
          <Loader2 className="mt-1 size-5 animate-spin text-brand-600" />
        ) : null}
      </div>

      <div className="flex-1 px-4 pb-4">
        <AnimatePresence mode="wait">
          {output ? (
            <motion.div key="out" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <div className="flex flex-wrap items-center gap-1.5">
                <RecBadge rec={output.recommendation} />
                <RiskBadge risk={output.risk_level} />
                {!output.valid && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-bad-soft px-2 py-0.5 text-[12px] font-medium text-[#9C3A2A] ring-1 ring-inset ring-[#EBCFC8]">
                    <AlertTriangle className="size-3" /> Invalid evidence
                  </span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {METRICS[agent].map((m) => {
                  const raw = output.key_metrics?.[m.key];
                  const warn = m.warn && raw !== null && raw !== undefined && m.warn(Number(raw));
                  return (
                    <div key={m.key} className="rounded-[8px] bg-canvas px-2.5 py-2">
                      <div className="text-[11.5px] text-muted">{m.label}</div>
                      <div className={cn("tnum mt-0.5 text-[15px]", warn ? "text-[#9C3A2A]" : "text-ink")}>{raw === undefined ? "-" : m.fmt(raw)}</div>
                    </div>
                  );
                })}
              </div>
              <p className={cn("mt-3 text-[13.5px] leading-relaxed text-ink-2", !open && "line-clamp-3")}>{plainMoney(output.rationale)}</p>
              {output.dissent_reason && open && (
                <p className="mt-2 rounded-lg bg-warn-soft px-2.5 py-1.5 text-[12.5px] text-[#8A5A12]">
                  <span className="font-semibold">Dissent:</span> {output.dissent_reason}
                </p>
              )}
              {open && output.conditions.length > 0 && (
                <ul className="mt-2.5 space-y-1">
                  {output.conditions.map((c, i) => (
                    <li key={i} className="flex gap-2 text-[12.5px] text-ink-2">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-brand-600" />
                      {c}
                    </li>
                  ))}
                </ul>
              )}
              {output.guardrail_adjustments.length > 0 && (
                <div className="mt-2.5 flex gap-2 rounded-lg border border-[#E9DCC0] bg-violet-soft px-2.5 py-2 text-[12px] text-[#7A5C2A]">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    <span className="font-semibold">Guardrail applied.</span> {output.guardrail_adjustments[0]}
                  </span>
                </div>
              )}
              {open && output.validation_issues.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {output.validation_issues.map((v, i) => (
                    <li key={i} className="flex gap-2 text-[12px] text-[#8A5A12]">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      {v}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-line-2 pt-2.5">
                <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-[11.5px] text-muted" title={note ?? undefined}>
                  <Bot className="size-3.5 shrink-0" />
                  <span className="truncate">
                    {modelLabel(output.provider, output.model)}
                    {output.latency_ms ? ` · ${(output.latency_ms / 1000).toFixed(1)}s` : ""}
                  </span>
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={onEvidence} className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[12px] font-medium text-brand-700 hover:bg-brand-50">
                    <FileSearch className="size-3.5" /> {output.evidence_ids.length} evidence
                  </button>
                  <button onClick={() => setOpen(!open)} className="inline-flex h-7 items-center rounded-lg px-1.5 text-muted hover:bg-line-2" aria-label="Expand">
                    <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
                  </button>
                </div>
              </div>
            </motion.div>
          ) : thinking ? (
            <motion.div key="run" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-1.5">
              {steps.map((s, i) => (
                <motion.div key={s.name} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }} className="flex items-start gap-2 text-[12.5px]">
                  <Wrench className="mt-0.5 size-3.5 shrink-0 text-ok" />
                  <span className="min-w-0">
                    <span className="font-mono text-[11.5px] text-ink">{s.name}</span>
                    <span className="block truncate text-muted">{s.detail}</span>
                  </span>
                </motion.div>
              ))}
              <div className="flex items-center gap-2 pt-1 text-[12.5px] font-medium text-brand-700">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-brand-600" />
                </span>
                Reasoning…
              </div>
              <div className="skeleton mt-2 h-3 w-full" />
              <div className="skeleton h-3 w-4/5" />
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-dashed border-line px-3 py-5 text-center text-[12.5px] text-muted">
              Waiting for a run
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
