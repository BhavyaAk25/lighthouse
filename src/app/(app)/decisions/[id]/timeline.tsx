import { Bot, CheckCircle2, FilePlus2, Gavel, Link2, MessageSquare, PencilLine, RotateCcw, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardHeader, Mono } from "@/components/ui";
import { dateLabel } from "@/lib/format";
import type { AuditView } from "@/lib/views";

const ICON: Record<string, ReactNode> = {
  CASE_CREATED: <FilePlus2 className="size-3.5" />,
  CASE_REVISED: <PencilLine className="size-3.5" />,
  AGENTS_RUN_COMPLETED: <Bot className="size-3.5" />,
  RECOMMENDATION_GENERATED: <Sparkles className="size-3.5" />,
  GUARDRAIL_APPLIED: <ShieldCheck className="size-3.5" />,
  LEGAL_REVIEW_RECORDED: <Gavel className="size-3.5" />,
  REVIEWER_NOTE_ADDED: <MessageSquare className="size-3.5" />,
  DECISION_RECORDED: <CheckCircle2 className="size-3.5" />,
  DECISION_OVERRIDE_RECORDED: <XCircle className="size-3.5" />,
};

function describe(a: AuditView) {
  const p = a.payload as Record<string, unknown>;
  switch (a.action) {
    case "CASE_CREATED":
      return `Case created${p.title ? `: ${p.title}` : ""}`;
    case "CASE_REVISED":
      return `Revision ${p.revision} created`;
    case "AGENTS_RUN_COMPLETED":
      return `Agents run (${String(p.mode ?? "").replace("_", " ").toLowerCase()}) · ${Object.entries((p.outputs as Record<string, string>) ?? {})
        .map(([k, v]) => `${k[0]}${k.slice(1).toLowerCase()}: ${v.split(" ")[0].replace(/_/g, " ").toLowerCase()}`)
        .join(", ")}`;
    case "RECOMMENDATION_GENERATED":
      return `Lighthouse recommends ${String(p.recommendation).replace(/_/g, " ").toLowerCase()} (confidence ${p.confidence}, conflict ${String(p.conflict).toLowerCase()})`;
    case "GUARDRAIL_APPLIED":
      return `Guardrail applied: ${((p.adjustments as string[]) ?? [])[0] ?? ""}`;
    case "LEGAL_REVIEW_RECORDED":
      return `Legal disposition: ${String(p.disposition).replace(/_/g, " ").toLowerCase()}${p.note ? ` - “${p.note}”` : ""}`;
    case "REVIEWER_NOTE_ADDED":
      return `Reviewer ${String(p.disposition).toLowerCase()}${p.note ? `: “${p.note}”` : ""}`;
    case "DECISION_RECORDED":
    case "DECISION_OVERRIDE_RECORDED":
      return `${String(p.decision).replace(/_/g, " ").toLowerCase()}${p.override ? " (override)" : ""}${p.rationale ? ` - “${p.rationale}”` : ""}`;
    default:
      return a.action.replace(/_/g, " ").toLowerCase();
  }
}

export function Timeline({ entries }: { entries: AuditView[] }) {
  return (
    <Card>
      <CardHeader title="Decision trace" subtitle="Every step, hash-chained" icon={<Link2 className="size-4" />} />
      <ol className="relative px-5 pb-5">
        {entries.length === 0 && <li className="text-[13px] text-muted">No entries yet.</li>}
        {entries.map((a, i) => (
          <li key={a.seq} className="relative flex gap-3 pb-4 last:pb-0">
            {i < entries.length - 1 && <span className="absolute top-7 left-[13px] h-[calc(100%-20px)] w-px bg-line" />}
            <span className="z-10 grid size-[27px] shrink-0 place-items-center rounded-full border border-line bg-white text-brand-600">{ICON[a.action] ?? <RotateCcw className="size-3.5" />}</span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[13px] text-ink">{describe(a)}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted">
                <span>{a.actor}</span>·<span>{dateLabel(a.ts, true)}</span>·<Mono className="text-[11px] text-faint">#{a.seq} {a.hash?.slice(0, 12)}…</Mono>
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
