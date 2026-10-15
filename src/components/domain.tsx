import { CircleDollarSign, Gavel, Scale, ShieldAlert, ShieldCheck, TrendingUp, Truck } from "lucide-react";
import type { ReactNode } from "react";
import { cn, titleCase } from "@/lib/format";
import type { AgentType, CaseStatus, Provenance, Recommendation, RiskLevel } from "@/lib/types";
import { Badge } from "./ui";

export const AGENT_META: Record<AgentType, { name: string; color: string; soft: string; icon: ReactNode; focus: string }> = {
  SALES: { name: "Sales", color: "var(--color-sales)", soft: "#F6EEE6", icon: <TrendingUp className="size-4" />, focus: "Demand & commercial effect" },
  FINANCE: { name: "Finance", color: "var(--color-finance)", soft: "#EDF4EF", icon: <CircleDollarSign className="size-4" />, focus: "Economic value & downside" },
  OPERATIONS: { name: "Operations", color: "var(--color-ops)", soft: "#EDF1F5", icon: <Truck className="size-4" />, focus: "Executability & capacity" },
  LEGAL: { name: "Legal", color: "var(--color-legal)", soft: "#F5EEDF", icon: <Scale className="size-4" />, focus: "Regulatory & contract risk" },
};

export function AgentAvatar({ agent, size = 32 }: { agent: AgentType; size?: number }) {
  const m = AGENT_META[agent];
  return (
    <span className="grid shrink-0 place-items-center rounded-[10px]" style={{ width: size, height: size, background: m.soft, color: m.color }}>
      {m.icon}
    </span>
  );
}

export const REC_META: Record<Recommendation, { label: string; tone: "ok" | "info" | "warn" | "bad" | "violet"; short: string }> = {
  PROCEED: { label: "Proceed", tone: "ok", short: "Proceed" },
  PROCEED_WITH_CONDITIONS: { label: "Proceed with conditions", tone: "info", short: "With conditions" },
  HOLD: { label: "Hold", tone: "warn", short: "Hold" },
  REJECT: { label: "Reject", tone: "bad", short: "Reject" },
  REVIEW_REQUIRED: { label: "Review required", tone: "violet", short: "Review" },
};

export function RecBadge({ rec, short, className }: { rec: Recommendation; short?: boolean; className?: string }) {
  const m = REC_META[rec];
  return (
    <Badge tone={m.tone} dot className={className}>
      {short ? m.short : m.label}
    </Badge>
  );
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  const tone = risk === "LOW" ? "ok" : risk === "MEDIUM" ? "warn" : "bad";
  return (
    <Badge tone={tone} className={cn(risk === "CRITICAL" && "bg-bad text-white ring-bad")}>
      {risk === "CRITICAL" ? <ShieldAlert className="size-3" /> : null}
      {titleCase(risk)} risk
    </Badge>
  );
}

const STATUS_META: Record<CaseStatus, { label: string; tone: "neutral" | "brand" | "ok" | "warn" | "bad" | "violet" }> = {
  DRAFT: { label: "Proposed", tone: "neutral" },
  IN_REVIEW: { label: "In sign-off", tone: "violet" },
  READY_FOR_DECISION: { label: "With executive", tone: "brand" },
  APPROVED: { label: "Approved", tone: "ok" },
  REJECTED: { label: "Rejected", tone: "bad" },
  REVISION_REQUESTED: { label: "Revision requested", tone: "warn" },
};

export function StatusBadge({ status }: { status: CaseStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.DRAFT;
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

const PROV_META: Record<string, { label: string; tone: "ok" | "brand" | "warn" | "neutral" | "violet"; tip: string }> = {
  REAL: { label: "Real data", tone: "ok", tip: "Taken directly from a public Kaggle Walmart dataset" },
  DERIVED: { label: "Derived", tone: "brand", tip: "Computed from real data" },
  GENERATED: { label: "Generated", tone: "warn", tip: "Synthetic pilot data, not Walmart data" },
  PUBLIC: { label: "Public filing", tone: "neutral", tip: "Walmart SEC filing" },
  ASSUMPTION: { label: "Assumption", tone: "violet", tip: "Capstone design assumption" },
};

export function ProvTag({ p, className }: { p: Provenance | string; className?: string }) {
  const m = PROV_META[p] ?? PROV_META.GENERATED;
  return (
    <Badge tone={m.tone} className={cn("px-1.5 text-[11px]", className)}>
      <span title={m.tip}>{m.label}</span>
    </Badge>
  );
}

export function SyntheticNotice({ className }: { className?: string }) {
  return (
    <span
      title="Demand patterns from public Kaggle Walmart data; stores, inventory, rules and costs are generated. Not Walmart internal data."
      className={cn("inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-0.5 text-[11.5px] text-muted", className)}
    >
      <span className="size-1.5 rounded-full bg-brass" />
      Pilot data
    </span>
  );
}

export function GateIcon({ status }: { status: "CLEAR" | "PENDING" | "BLOCKED" | "WARNING" }) {
  if (status === "CLEAR") return <ShieldCheck className="size-4 text-ok" />;
  if (status === "BLOCKED") return <ShieldAlert className="size-4 text-bad" />;
  if (status === "PENDING") return <Gavel className="size-4 text-violet" />;
  return <ShieldAlert className="size-4 text-warn" />;
}

// ---------------------------------------------------------------- department lanes
export const LANE_META: Record<string, { label: string; dot: string; text: string }> = {
  NOT_STARTED: { label: "Not run", dot: "border border-[#CFC8BA] bg-white", text: "text-faint" },
  AUTO: { label: "Cleared automatically", dot: "bg-brand-300", text: "text-muted" },
  PENDING: { label: "Waiting", dot: "bg-brass ring-3 ring-brass/20", text: "text-brass-dark" },
  OVERDUE: { label: "Overdue", dot: "bg-warn ring-3 ring-warn/20", text: "text-warn" },
  CONFIRMED: { label: "Confirmed", dot: "bg-brand-600", text: "text-ink-2" },
  ADJUSTED: { label: "Adjusted", dot: "bg-brand-600 ring-2 ring-brass", text: "text-brass-dark" },
  BLOCKED: { label: "Blocked", dot: "bg-bad", text: "text-bad" },
  PROHIBITED: { label: "Prohibited", dot: "bg-bad", text: "text-bad" },
};

/** Plain-language state of a department lane (Legal uses legal words). */
export function laneLabel(l: { dept: AgentType; state: string; signoff?: { position: string } | null }) {
  if (l.dept === "LEGAL" && l.signoff) {
    if (l.state === "BLOCKED") return "Rejected";
    return l.signoff.position === "PROCEED" ? "Approved" : "Approved with conditions";
  }
  return LANE_META[l.state]?.label ?? l.state;
}

/** Four small dots, one per department (Sales, Finance, Operations, Legal). */
export function LaneDots({ lanes, highlight, className }: { lanes: { dept: AgentType; state: string; lead?: string }[]; highlight?: AgentType; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} aria-label="Department sign-off">
      {lanes.map((l) => (
        <span
          key={l.dept}
          title={`${AGENT_META[l.dept].name}${l.lead ? ` · ${l.lead}` : ""} · ${LANE_META[l.state]?.label ?? l.state}`}
          className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] tracking-wide", highlight === l.dept ? "bg-brass-soft text-brass-dark" : "text-faint")}
        >
          <span className={cn("block size-2 rounded-full", LANE_META[l.state]?.dot)} />
          {AGENT_META[l.dept].name[0]}
        </span>
      ))}
    </span>
  );
}
