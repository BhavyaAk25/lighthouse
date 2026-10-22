"use client";

import { Check, Loader2, RefreshCw, Wrench } from "lucide-react";
import { useState } from "react";
import { WaitingNote } from "@/components/desk";
import { AGENT_META, AgentAvatar, ProvTag, RecBadge, RiskBadge } from "@/components/domain";
import { Button, Card, ConfidenceRing } from "@/components/ui";
import { money, titleCase } from "@/lib/format";
import type { Persona } from "@/lib/personas";
import { REC_WORD, type Lane } from "@/lib/signoff";
import type { AgentOutput, AgentType, CaseStatus, EvidenceItem } from "@/lib/types";
import { modelLabel } from "./agent-card";
import { SignoffPanel, SignoffSummary } from "./decision-panel";
import { NextUp, type NextItem } from "@/components/next-up";
import { useRun } from "./use-run";

const METRIC_LABEL: Record<string, string> = {
  unit_uplift_pct: "Unit uplift",
  revenue_uplift_pct: "Revenue uplift",
  projected_revenue: "Projected revenue",
  analog_uplift_pct: "Real promo analog",
  net_benefit: "Net benefit",
  roi_pct: "ROI",
  downside_net_benefit: "Downside case",
  break_even_discount_pct: "Break-even discount",
  dc_util_projected_peak_pct: "DC peak load",
  projected_fill_rate_pct: "Projected fill rate",
  fulfillment_projected_pct: "Online fulfillment",
  coverage_days: "Inventory cover (days)",
  labor_projected_pct: "Store labor",
  launch_gap_units: "Launch gap (units)",
  promo_cost: "Promotion cost",
  vendor_funding: "Supplier funding",
};

const MONEY_KEYS = new Set(["projected_revenue", "net_benefit", "downside_net_benefit", "promo_cost", "vendor_funding"]);
function fmt(k: string, v: unknown) {
  if (v === null || v === undefined) return k === "break_even_discount_pct" ? "Not binding" : "-";
  if (typeof v !== "number") return String(v);
  if (MONEY_KEYS.has(k)) return money(v);
  if (k.endsWith("_pct")) return `${v.toFixed(1)}%`;
  if (k === "launch_gap_units") return Math.round(v).toLocaleString("en-US");
  return String(v);
}

/** A department lead's view of a case: their own agent, their own sign-off, everyone else as status only. */
export function FocusView({
  persona,
  agent,
  decisionId,
  status,
  output: serverOutput,
  evidence: serverEvidence,
  lane,
  lanes,
  claim,
  decidedBy,
  final,
  next,
}: {
  persona: Persona;
  agent: AgentType;
  decisionId: string;
  status: CaseStatus;
  output?: AgentOutput;
  evidence: EvidenceItem[];
  lane: Lane;
  lanes: Lane[];
  claim: string;
  decidedBy: string | null;
  final: string | null;
  next: NextItem | null;
}) {
  const run = useRun(decisionId);
  const [stepIn, setStepIn] = useState(false);
  const isLegal = agent === "LEGAL";
  const output = run.running ? run.outputs[agent] : serverOutput;
  const evidence = run.evidence.length && run.running ? run.evidence : serverEvidence;
  const open = !final && (status === "IN_REVIEW" || status === "READY_FOR_DECISION");

  if (!serverOutput && !run.running) return <WaitingNote>Not submitted yet. Your {AGENT_META[agent].name} agent runs as soon as it is.</WaitingNote>;

  const rules = isLegal ? evidence.filter((e) => e.agent_type === "LEGAL" && e.label.startsWith("Rule")) : [];
  const metrics = output ? Object.entries(output.key_metrics).filter(([k]) => METRIC_LABEL[k]) : [];
  const ev = evidence.filter((e) => e.agent_type === agent);
  const cited = new Set(output?.evidence_ids ?? []);
  const mine = lane.signoff && lane.signoff.reviewer_name === persona.name ? lane.signoff : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-6">
        {isLegal && claim && (
          <div>
            <div className="mb-2 text-[11.5px] tracking-[0.14em] text-muted uppercase">Customer-facing claim</div>
            <p className="font-display text-[22px] leading-tight text-ink">“{claim}”</p>
          </div>
        )}
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <AgentAvatar agent={agent} size={36} />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] text-ink">Your {AGENT_META[agent].name} agent</div>
              {output && !run.running ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <RecBadge rec={output.recommendation} />
                  <RiskBadge risk={output.risk_level} />
                </div>
              ) : (
                <div className="mt-1.5 text-[12.5px] text-brand-700">Working · {run.elapsed.toFixed(1)}s</div>
              )}
            </div>
            {output && !run.running ? <ConfidenceRing value={output.confidence} size={46} /> : <Loader2 className="mt-1 size-5 animate-spin text-brand-600" />}
          </div>

          {run.running ? (
            <div className="mt-4 space-y-1.5">
              {(run.steps[agent] ?? []).map((s) => (
                <div key={s.name} className="flex items-start gap-2 text-[12.5px]">
                  <Wrench className="mt-0.5 size-3.5 shrink-0 text-ok" />
                  <span>
                    <span className="font-mono text-[11.5px] text-ink">{s.name}</span>
                    <span className="block text-muted">{s.detail}</span>
                  </span>
                </div>
              ))}
              <div className="skeleton mt-2 h-3 w-full" />
              <div className="skeleton h-3 w-4/5" />
            </div>
          ) : (
            output && (
              <>
                <p className="mt-4 text-[14.5px] leading-relaxed text-ink-2">{output.rationale}</p>
                {output.conditions.length > 0 && (
                  <ul className="mt-4 space-y-1.5">
                    {output.conditions.map((c, i) => (
                      <li key={i} className="flex gap-2 text-[13.5px] text-ink-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-brass" /> {c}
                      </li>
                    ))}
                  </ul>
                )}
                {!isLegal && metrics.length > 0 && (
                  <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 border-t border-line-2 pt-4 sm:grid-cols-3">
                    {metrics.slice(0, 9).map(([k, v]) => (
                      <div key={k}>
                        <div className="text-[12px] text-muted">{METRIC_LABEL[k]}</div>
                        <div className="tnum text-[15px] text-ink">{fmt(k, v)}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line-2 pt-3.5">
                  <span className="text-[12px] text-muted">
                    {modelLabel(output.provider, output.model)}
                    {!output.valid && " · evidence incomplete"}
                  </span>
                  {open && (
                    <Button variant="secondary" size="sm" onClick={() => run.start(agent)} disabled={run.running}>
                      <RefreshCw className="size-3.5" /> Re-run my agent
                    </Button>
                  )}
                </div>
              </>
            )
          )}
        </Card>

        {isLegal && rules.length > 0 && !run.running && (
          <div>
            <div className="mb-3 text-[11.5px] tracking-[0.14em] text-muted uppercase">Triggered rules · {rules.length}</div>
            <div className="card divide-y divide-line-2">
              {rules.map((r) => {
                const v = r.value as { severity: string; review_required: boolean; prohibited: boolean; jurisdictions: string[]; citation: string; condition: string };
                return (
                  <div key={r.evidence_id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-[14px] text-ink">{r.label.replace(/^Rule [^:]+: /, "")}</div>
                      <span className={v.prohibited ? "text-[12px] text-bad" : v.review_required ? "text-[12px] text-brass-dark" : "text-[12px] text-faint"}>
                        {v.prohibited ? "Prohibited" : v.review_required ? "Needs review" : titleCase(v.severity)}
                      </span>
                    </div>
                    <div className="mt-1 text-[12.5px] text-muted">
                      {v.citation} · {v.jurisdictions.join(", ")}
                    </div>
                    <div className="mt-1.5 text-[13px] text-ink-2">{v.condition}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!isLegal && ev.length > 0 && !run.running && (
          <details className="card group px-5 py-4">
            <summary className="cursor-pointer list-none text-[13.5px] text-ink-2">Evidence behind these numbers · {ev.length}</summary>
            <div className="mt-3 divide-y divide-line-2">
              {ev.map((e) => (
                <div key={e.evidence_id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-[13px] text-ink">{e.label}</div>
                    <div className="font-mono text-[11px] text-faint">
                      {e.evidence_id}
                      {cited.has(e.evidence_id) ? " · cited" : ""}
                    </div>
                  </div>
                  <ProvTag p={e.provenance} />
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      <div id="act" className="scroll-mt-24 space-y-4">
        {run.running ? (
          <WaitingNote>Your agent is re-running. Sign off when its new answer is in.</WaitingNote>
        ) : final ? (
          <WaitingNote>
            Decided by {decidedBy}: {final === "APPROVED" ? "approved" : final === "REJECTED" ? "rejected" : "sent back for changes"}.
          </WaitingNote>
        ) : status === "REVISION_REQUESTED" ? (
          <WaitingNote>Sent back for changes. Your agent runs again when the revision is submitted.</WaitingNote>
        ) : lane.state === "PROHIBITED" ? (
          <WaitingNote>A legal rule prohibits this case outright. Nothing to sign: it can only be rejected.</WaitingNote>
        ) : lane.state === "PENDING" || lane.state === "OVERDUE" || stepIn ? (
          <>
            {lane.state === "OVERDUE" && (
              <p className="rounded-xl bg-warn-soft px-3.5 py-2.5 text-[12.5px] text-[#8A5A12]">
                Overdue. {isLegal ? "Approval stays locked until you sign." : "Maya can now decide without your sign-off."}
              </p>
            )}
            {lane.reasons.length > 0 && !stepIn && <p className="text-[13px] text-muted">You’re needed because {lane.reasons.join("; ")}.</p>}
            <SignoffPanel decisionId={decisionId} lane={lane} />
          </>
        ) : mine ? (
          <div className="space-y-2">
            <WaitingNote>
              Done. You {mine.disposition === "CONFIRMED" ? (isLegal ? (mine.position === "PROCEED" ? "approved it" : "approved it with conditions") : "confirmed your agent") : mine.disposition === "BLOCKED" ? (isLegal ? "rejected it" : "blocked it") : `changed it to ${REC_WORD[mine.position]}`}. Maya sees it before deciding.
            </WaitingNote>
            {open && (
              <button onClick={() => setStepIn(true)} className="px-1 text-[12.5px] text-muted underline-offset-2 hover:text-ink hover:underline">
                Change my sign-off
              </button>
            )}
          </div>
        ) : lane.state === "AUTO" ? (
          <div className="space-y-2">
            <WaitingNote>Cleared automatically. Your agent found no concern, so this didn’t need you.</WaitingNote>
            {open && (
              <button onClick={() => setStepIn(true)} className="px-1 text-[12.5px] text-muted underline-offset-2 hover:text-ink hover:underline">
                Step in anyway
              </button>
            )}
          </div>
        ) : null}
        {!run.running && !(lane.state === "PENDING" || lane.state === "OVERDUE" || stepIn) && <NextUp next={next} />}
        <SignoffSummary lanes={lanes} you={agent} />
      </div>
    </div>
  );
}
