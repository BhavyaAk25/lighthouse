"use client";

import { ArrowRight, Bot, CheckCircle2, ListChecks, Scale, ShieldAlert } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { AgentAvatar, RecBadge, RiskBadge } from "@/components/domain";
import { LogoMark } from "@/components/logo";
import { ConfidenceRing } from "@/components/ui";
import { cn, firstSentences, money, plainMoney } from "@/lib/format";
import type { AgentType, Conflict, Gate, Recommendation, RiskLevel } from "@/lib/types";
import { modelLabel } from "./agent-card";

export interface PacketData {
  synthesized_recommendation: Recommendation;
  /** Lighthouse's recommendation from the AI agents alone, before department sign-off */
  ai_recommendation?: Recommendation | null;
  lighthouse_confidence: number;
  ai_confidence?: number | null;
  /** headline after department sign-off */
  signed_headline?: string;
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

export const REC_TEXT: Record<string, string> = { PROCEED: "Proceed", PROCEED_WITH_CONDITIONS: "Proceed with conditions", HOLD: "Hold", REJECT: "Reject", REVIEW_REQUIRED: "Review required" };

const DISAGREEMENT: Record<string, string> = {
  NONE: "No disagreement",
  MINOR: "Minor disagreement",
  MATERIAL: "Material disagreement",
  HARD_STOP: "Blocking issue",
};

/** Checks that need attention (the department sign-off gate is shown in its own panel). */
export function openChecks(gates: Gate[]) {
  const relevant = gates.filter((g) => g.key !== "SIGN_OFFS");
  return { open: relevant.filter((g) => g.status !== "CLEAR"), clear: relevant.filter((g) => g.status === "CLEAR").length };
}

/** Plain-language parts of the confidence score, for anyone who asks how it is built. */
function ConfidenceParts({ b }: { b: Record<string, number> }) {
  const rows: [string, string][] = [
    ["Agents’ own confidence (weighted)", `${Math.round((b.agent_confidence ?? 0) * 100)}%`],
    ["Evidence complete", `${Math.round((b.evidence_completeness ?? 0) * 100)}%`],
    ["Evidence fresh", `${Math.round((b.freshness ?? 0) * 100)}%`],
    ["Taken off for disagreement", `${Math.round((b.conflict_penalty ?? 0) * 100)}%`],
  ];
  return (
    <details className="group mt-2 text-[12.5px] text-muted">
      <summary className="cursor-pointer list-none hover:text-ink">How this is worked out</summary>
      <div className="mt-2 space-y-1 rounded-[10px] bg-canvas px-3 py-2.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <span>{k}</span>
            <span className="tnum text-ink-2">{v}</span>
          </div>
        ))}
        <p className="pt-1 text-[12px]">Multiplied together, not averaged, so one weak link pulls the score down.</p>
      </div>
    </details>
  );
}

/** The full reconciliation report (shown under "See the full analysis"). Only what needs attention is spelled out. */
export function Packet({ p, synthesizing }: { p: PacketData; synthesizing?: boolean }) {
  const [more, setMore] = useState(false);
  const changed = !!p.ai_recommendation && p.ai_recommendation !== p.synthesized_recommendation;
  const checks = openChecks(p.gates);
  const summary = plainMoney(p.summary);
  const short = firstSentences(summary, 2);
  const conditions = more ? p.conditions : p.conditions.slice(0, 4);
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="card overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-line px-6 py-5 md:flex-row md:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3.5">
          <LogoMark size={30} />
          <div className="min-w-0">
            <h3 className="text-[15px] text-ink">How Lighthouse reconciled the four agents</h3>
            <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted">
              <RecBadge rec={p.synthesized_recommendation} />
              <span>{DISAGREEMENT[p.conflict_severity] ?? DISAGREEMENT.NONE}</span>
              <span aria-hidden>·</span>
              <span className="tnum">{money(p.financial_impact)} at stake</span>
              <RiskBadge risk={p.risk_level} />
            </div>
            <ConfidenceParts b={p.confidence_breakdown} />
          </div>
        </div>
        <ConfidenceRing value={p.lighthouse_confidence} size={56} stroke={5} />
      </div>

      <div className="grid lg:grid-cols-[1.2fr_1fr]">
        <div className="border-b border-line px-6 py-5 lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between gap-3">
            <h4 className="flex items-center gap-1.5 text-[14px] text-ink">
              <Bot className="size-4 text-brass" strokeWidth={1.7} /> {changed ? "The AI’s summary, before sign-off" : "The AI’s summary"}
            </h4>
            <span className="text-[12px] text-muted">{synthesizing ? "Writing…" : modelLabel(p.provider, p.model)}</span>
          </div>
          {synthesizing ? (
            <div className="mt-3 space-y-2">
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-4/5" />
            </div>
          ) : (
            <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{short}</p>
          )}
          {p.decisive_factors.length > 0 && (
            <ul className="mt-4 space-y-2">
              {p.decisive_factors.slice(0, 3).map((f, i) => (
                <li key={i} className="flex gap-2 text-[13.5px] text-ink-2">
                  <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-brass" /> {plainMoney(f)}
                </li>
              ))}
            </ul>
          )}
          {p.conflicts.length > 0 && (
            <div className="mt-5">
              <h4 className="flex items-center gap-1.5 text-[14px] text-ink">
                <Scale className="size-4 text-brass" strokeWidth={1.7} /> Where the agents disagree
              </h4>
              <ul className="mt-2 space-y-2">
                {p.conflicts.slice(0, 3).map((c, i) => (
                  <li key={i} className="flex gap-3 text-[13.5px] text-ink-2">
                    <span className="flex shrink-0 -space-x-1.5 pt-0.5">
                      {[...new Set(c.agents)].slice(0, 4).map((a) => (
                        <span key={a} className="rounded-[10px] ring-2 ring-white">
                          <AgentAvatar agent={a as AgentType} size={22} />
                        </span>
                      ))}
                    </span>
                    <span>{firstSentences(plainMoney(c.description), 1)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="px-6 py-5">
          <h4 className="text-[14px] text-ink">Checks</h4>
          {checks.open.length === 0 ? (
            <p className="mt-2 flex items-center gap-2 text-[13.5px] text-ok">
              <CheckCircle2 className="size-4" /> All {checks.clear} checks clear.
            </p>
          ) : (
            <ul className="mt-2 space-y-2.5">
              {checks.open.map((g) => (
                <li key={g.key} className="flex gap-2.5 text-[13.5px]">
                  <ShieldAlert className={cn("mt-0.5 size-4 shrink-0", g.status === "BLOCKED" ? "text-bad" : "text-warn")} strokeWidth={1.8} />
                  <span>
                    <span className="text-ink">{g.label}.</span> <span className="text-muted">{plainMoney(g.detail)}</span>
                  </span>
                </li>
              ))}
              {checks.clear > 0 && <li className="pl-[26px] text-[13px] text-muted">The other {checks.clear} checks are clear.</li>}
            </ul>
          )}
          {p.conditions.length > 0 && (
            <>
              <h4 className="mt-5 flex items-center gap-1.5 text-[14px] text-ink">
                <ListChecks className="size-4 text-brass" strokeWidth={1.7} /> Conditions to launch
              </h4>
              <ul className="mt-2 space-y-1.5">
                {conditions.map((c, i) => (
                  <li key={i} className="flex gap-2 text-[13.5px] text-ink-2">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-brass" /> {plainMoney(c)}
                  </li>
                ))}
              </ul>
              {p.conditions.length > 4 && (
                <button onClick={() => setMore(!more)} className="mt-2 text-[13px] text-muted hover:text-ink">
                  {more ? "Show fewer" : `Show ${p.conditions.length - 4} more`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
