"use client";

import { ArrowRight, Bot, CheckCircle2, GitCompareArrows, Lightbulb, ListChecks, Scale } from "lucide-react";
import { motion } from "motion/react";
import { AgentAvatar, GateIcon, RecBadge, RiskBadge } from "@/components/domain";
import { LogoMark } from "@/components/logo";
import { ConfidenceRing } from "@/components/ui";
import { cn, money } from "@/lib/format";
import type { AgentType, Conflict, Gate, Recommendation, RiskLevel } from "@/lib/types";
import { modelLabel } from "./agent-card";

export interface PacketData {
  synthesized_recommendation: Recommendation;
  lighthouse_confidence: number;
  confidence_breakdown: Record<string, number>;
  conflict_severity: string;
  conflicts: Conflict[];
  gates: Gate[];
  risk_level: RiskLevel;
  conditions: string[];
  headline: string;
  summary: string;
  decisive_factors: string[];
  dissent_summary: string;
  next_steps: string[];
  provider: string;
  model: string;
  financial_impact: number;
  requires_legal_review: boolean;
  expedited_eligible: boolean;
}

const SEVERITY: Record<string, { label: string; cls: string }> = {
  NONE: { label: "No conflict", cls: "bg-ok-soft text-[#2F6347]" },
  MINOR: { label: "Minor conflict", cls: "bg-info-soft text-[#3E5873]" },
  MATERIAL: { label: "Material conflict", cls: "bg-warn-soft text-[#8A5A12]" },
  HARD_STOP: { label: "Hard stop", cls: "bg-bad-soft text-[#9C3A2A]" },
};

const BREAKDOWN_LABEL: Record<string, string> = {
  agent_confidence: "Weighted agent confidence",
  evidence_completeness: "Evidence completeness",
  freshness: "Evidence freshness",
  conflict_penalty: "Conflict penalty",
  hard_constraint_factor: "Hard-constraint factor",
};

export function Packet({ p, synthesizing }: { p: PacketData; synthesizing?: boolean }) {
  const sev = SEVERITY[p.conflict_severity] ?? SEVERITY.NONE;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="gradient-border shadow-card">
      <div className="rounded-t-[12px] border-b border-line px-6 py-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3.5">
            <LogoMark size={34} />
            <div className="min-w-0">
              <div className="text-[11.5px] tracking-[0.14em] text-brass-dark uppercase">Lighthouse recommends</div>
              <h2 className="font-display mt-1 text-[22px] leading-tight text-ink">{p.headline}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <RecBadge rec={p.synthesized_recommendation} className="text-[13px]" />
                <RiskBadge risk={p.risk_level} />
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium", sev.cls)}>
                  <GitCompareArrows className="size-3" />
                  {sev.label}
                </span>
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-[12px] font-medium text-ink-2 ring-1 ring-line">{money(p.financial_impact)} at stake</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-[10px] bg-canvas px-4 py-3">
            <ConfidenceRing value={p.lighthouse_confidence} size={64} stroke={5} />
            <div className="w-[190px] space-y-1">
              {Object.entries(p.confidence_breakdown).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-2 text-[11.5px]">
                  <span className="truncate text-muted">{BREAKDOWN_LABEL[k] ?? k}</span>
                  <span className={cn("tnum font-semibold", k === "conflict_penalty" && Number(v) > 0 ? "text-[#9C3A2A]" : "text-ink")}>
                    {k === "conflict_penalty" ? `-${(Number(v) * 100).toFixed(0)}%` : Number(v).toFixed(2)}
                  </span>
                </div>
              ))}
              <div className="pt-0.5 text-[10.5px] text-faint">Synthesis score, not an average</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1.25fr_1fr]">
        <div className="border-b border-line p-5 lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
              <Bot className="size-4 text-brass" /> Summary
            </h3>
            <span className="text-[11.5px] text-muted">{synthesizing ? "Writing…" : modelLabel(p.provider, p.model)}</span>
          </div>
          {synthesizing ? (
            <div className="mt-3 space-y-2">
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-11/12" />
              <div className="skeleton h-3 w-4/5" />
            </div>
          ) : (
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-2">{p.summary}</p>
          )}
          {p.decisive_factors.length > 0 && (
            <div className="mt-4">
              <h4 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
                <Lightbulb className="size-3.5" /> Why
              </h4>
              <ul className="mt-2 space-y-1.5">
                {p.decisive_factors.map((f, i) => (
                  <li key={i} className="flex gap-2 text-[13px] text-ink-2">
                    <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-brass" /> {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {p.conflicts.length > 0 && (
            <div className="mt-4">
              <h4 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
                <Scale className="size-3.5" /> Disagreements
              </h4>
              <div className="mt-2 space-y-2">
                {p.conflicts.map((c, i) => (
                  <div key={i} className="flex gap-3 rounded-xl border border-line bg-canvas/70 p-2.5">
                    <div className="flex -space-x-1.5">
                      {[...new Set(c.agents)].slice(0, 4).map((a) => (
                        <span key={a} className="rounded-[10px] ring-2 ring-white">
                          <AgentAvatar agent={a as AgentType} size={24} />
                        </span>
                      ))}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{c.kind.replace(/_/g, " ").toLowerCase()}</div>
                      <p className="text-[12.5px] text-ink-2">{c.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {p.dissent_summary && p.dissent_summary !== "No agent dissents." && !synthesizing && (
            <p className="mt-3 text-[12.5px] text-muted">
              <span className="font-semibold text-ink-2">Dissent:</span> {p.dissent_summary}
            </p>
          )}
        </div>
        <div className="p-5">
          <h3 className="text-[13px] font-semibold text-ink">Governance gates</h3>
          <div className="mt-2.5 space-y-2">
            {p.gates.map((g) => (
              <div key={g.key} className="flex items-start gap-2.5 rounded-xl border border-line p-2.5">
                <GateIcon status={g.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-ink">{g.label}</span>
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide",
                        g.status === "CLEAR" && "bg-ok-soft text-[#2F6347]",
                        g.status === "PENDING" && "bg-violet-soft text-[#7A5C2A]",
                        g.status === "WARNING" && "bg-warn-soft text-[#8A5A12]",
                        g.status === "BLOCKED" && "bg-bad-soft text-[#9C3A2A]",
                      )}
                    >
                      {g.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-muted">{g.detail}</p>
                </div>
              </div>
            ))}
          </div>
          {p.conditions.length > 0 && (
            <>
              <h3 className="mt-5 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                <ListChecks className="size-4 text-brass" /> Conditions
              </h3>
              <ul className="mt-2 space-y-1.5">
                {p.conditions.map((c, i) => (
                  <li key={i} className="flex gap-2 text-[12.5px] text-ink-2">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-brass" /> {c}
                  </li>
                ))}
              </ul>
            </>
          )}
          {p.next_steps.length > 0 && !synthesizing && (
            <>
              <h3 className="mt-5 text-[13px] font-semibold text-ink">Next steps</h3>
              <ol className="mt-2 space-y-1.5">
                {p.next_steps.map((s, i) => (
                  <li key={i} className="flex gap-2 text-[12.5px] text-ink-2">
                    <span className="tnum grid size-4 shrink-0 place-items-center rounded-full bg-brand-50 text-[10px] font-semibold text-brand-700">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
