"use client";

import { Check } from "lucide-react";
import { WaitingNote } from "@/components/desk";
import { AGENT_META, AgentAvatar, ProvTag, RecBadge, RiskBadge } from "@/components/domain";
import { Card, ConfidenceRing } from "@/components/ui";
import { titleCase } from "@/lib/format";
import type { Persona } from "@/lib/personas";
import type { AgentOutput, AgentType, CaseStatus, EvidenceItem } from "@/lib/types";
import type { PacketView, ReviewView } from "@/lib/views";
import { DecisionPanel } from "./decision-panel";

const METRIC_LABEL: Record<string, string> = {
  unit_uplift_pct: "Unit uplift %",
  revenue_uplift_pct: "Revenue uplift %",
  projected_revenue: "Projected revenue",
  analog_uplift_pct: "Real promo analog %",
  net_benefit: "Net benefit",
  roi_pct: "ROI %",
  downside_net_benefit: "Downside case",
  break_even_discount_pct: "Break-even discount %",
  dc_util_projected_peak_pct: "DC peak load %",
  projected_fill_rate_pct: "Projected fill rate %",
  fulfillment_projected_pct: "Online fulfillment %",
  coverage_days: "Inventory cover (days)",
  labor_projected_pct: "Store labor %",
  launch_gap_units: "Launch gap (units)",
  promo_cost: "Promotion cost",
  vendor_funding: "Supplier funding",
};

function fmt(v: unknown) {
  if (v === null || v === undefined) return "-";
  if (typeof v === "number") return Math.abs(v) >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : String(v);
  return String(v);
}

export function FocusView({
  persona,
  agent,
  decisionId,
  status,
  revision,
  output,
  evidence,
  packet,
  reviews,
  claim,
}: {
  persona: Persona;
  agent: AgentType;
  decisionId: string;
  status: CaseStatus;
  revision: number;
  output?: AgentOutput;
  evidence: EvidenceItem[];
  packet: PacketView | null;
  reviews: ReviewView[];
  claim: string;
}) {
  const isLegal = agent === "LEGAL";
  const mine = reviews.find((r) => r.reviewer_name === persona.name && r.revision === revision);
  if (!packet || !output) return <WaitingNote>Waiting on Maya Chen to run the agents on this case.</WaitingNote>;

  const rules = isLegal ? evidence.filter((e) => e.agent_type === "LEGAL" && e.label.startsWith("Rule")) : [];
  const metrics = Object.entries(output.key_metrics).filter(([k]) => METRIC_LABEL[k]);
  const ev = evidence.filter((e) => e.agent_type === agent);
  const cited = new Set(output.evidence_ids);
  const final = packet.final_decision;
  const legalNotNeeded = isLegal && !packet.requires_legal_review;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-6">
        {isLegal && claim && (
          <div>
            <div className="mb-2 text-[11.5px] tracking-[0.14em] text-muted uppercase">Customer-facing claim</div>
            <p className="font-display text-[30px] leading-tight text-ink">“{claim}”</p>
          </div>
        )}
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <AgentAvatar agent={agent} size={36} />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] text-ink">What the {AGENT_META[agent].name} agent found</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <RecBadge rec={output.recommendation} />
                <RiskBadge risk={output.risk_level} />
              </div>
            </div>
            <ConfidenceRing value={output.confidence} size={46} />
          </div>
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
                  <div className="tnum text-[15px] text-ink">{fmt(v)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {isLegal && rules.length > 0 && (
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

        {!isLegal && ev.length > 0 && (
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

      <div className="space-y-4">
        {final ? (
          <WaitingNote>
            Decided by {packet.decided_by}: {final.replace(/_/g, " ").toLowerCase()}.
          </WaitingNote>
        ) : legalNotNeeded ? (
          <WaitingNote>Nothing on this case needs legal review.</WaitingNote>
        ) : mine ? (
          <WaitingNote>Your {isLegal ? "disposition" : "note"} was sent. Waiting on Maya Chen to decide.</WaitingNote>
        ) : (
          <DecisionPanel persona={persona} decisionId={decisionId} status={status} revision={revision} packet={packet} reviews={reviews} hasRun />
        )}
      </div>
    </div>
  );
}
