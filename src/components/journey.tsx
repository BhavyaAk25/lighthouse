import { Bot, Check, Minus, ShieldCheck, X } from "lucide-react";
import { cn, dateLabel } from "@/lib/format";
import type { JourneyStep } from "@/lib/journey";
import { PERSONAS, type Persona } from "@/lib/personas";

function Who({ step, isYou }: { step: JourneyStep; isYou: boolean }) {
  const p = PERSONAS.find((x) => x.name === step.who);
  return (
    <div className="mt-2 flex items-center justify-center gap-1.5 md:justify-start">
      {p ? (
        <span className="grid size-5 place-items-center rounded-full text-[9px] text-[#F4F1EA]" style={{ background: p.color }}>
          {p.initials}
        </span>
      ) : step.role === "AI" ? (
        <Bot className="size-4 text-muted" strokeWidth={1.6} />
      ) : (
        <ShieldCheck className="size-4 text-muted" strokeWidth={1.6} />
      )}
      <span className="truncate text-[12.5px] text-ink-2">{step.who}</span>
      {isYou && <span className="rounded-full bg-brass-soft px-1.5 text-[10.5px] text-brass-dark">You</span>}
    </div>
  );
}

function Node({ state }: { state: JourneyStep["state"] }) {
  if (state === "done")
    return (
      <span className="grid size-8 place-items-center rounded-full bg-brand-600 text-[#F4F1EA]">
        <Check className="size-4" strokeWidth={2.2} />
      </span>
    );
  if (state === "current")
    return (
      <span className="relative grid size-8 place-items-center rounded-full border-2 border-brass bg-white shadow-[0_0_0_6px_rgba(176,138,74,0.12)]">
        <span className="absolute size-2.5 animate-ping rounded-full bg-brass/60" />
        <span className="size-2.5 rounded-full bg-brass" />
      </span>
    );
  if (state === "blocked")
    return (
      <span className="grid size-8 place-items-center rounded-full bg-bad text-white">
        <X className="size-4" strokeWidth={2.2} />
      </span>
    );
  if (state === "skipped")
    return (
      <span className="grid size-8 place-items-center rounded-full border border-dashed border-[#CFC8BA] bg-canvas text-faint">
        <Minus className="size-3.5" />
      </span>
    );
  return <span className="block size-8 rounded-full border border-line bg-white" />;
}

const isMine = (s: JourneyStep, viewer?: Persona) =>
  !!viewer && (s.who === viewer.name || (s.key === "analyze" && viewer.role === "DECISION_OWNER" && s.state === "current"));

export function JourneyBar({ steps, viewer, className }: { steps: JourneyStep[]; viewer?: Persona; className?: string }) {
  const cur = steps.find((s) => s.state === "current");
  const blocked = steps.find((s) => s.state === "blocked");
  const done = steps.every((s) => s.state === "done" || s.state === "skipped");
  const mine = cur && isMine(cur, viewer);
  const headline = blocked
    ? `Stopped at ${blocked.label.toLowerCase()} · ${blocked.detail}`
    : done
      ? "Decision sealed in the audit trail"
      : cur
        ? mine
          ? `Your turn · ${cur.key === "analyze" ? "Run the agents" : cur.key === "decide" ? "Make the decision" : cur.label}`
          : `Waiting on ${cur.key === "analyze" ? steps[0].who : cur.who} · ${cur.label}`
        : "";
  return (
    <div className={cn("card px-6 py-5", className)}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={cn("size-2 rounded-full", blocked ? "bg-bad" : done ? "bg-ok" : mine ? "bg-brass animate-pulse-soft" : "bg-brand-300")} />
          <span className={cn("text-[14.5px]", mine ? "text-brass-dark" : "text-ink")}>{headline}</span>
        </div>
        {mine ? (
          <a href="#act" className="inline-flex items-center gap-1.5 rounded-[8px] bg-brand-600 px-3 py-1.5 text-[12.5px] text-[#F4F1EA] hover:bg-brand-700">
            Go to it →
          </a>
        ) : (
          <a href="/flow" className="hidden text-[12.5px] text-muted hover:text-ink sm:block">
            See full flow →
          </a>
        )}
      </div>
      {/* horizontal on md+, vertical on mobile */}
      <ol className="grid gap-4 md:grid-cols-5 md:gap-0">
        {steps.map((s, i) => {
          const leftDone = i > 0 && ["done", "skipped"].includes(steps[i - 1].state);
          return (
            <li key={s.key} className="relative flex gap-3 md:block">
              {i > 0 && (
                <span
                  className={cn("absolute top-4 hidden h-px md:block", leftDone ? "bg-brand-600" : "bg-line")}
                  style={{ left: "-50%", right: "calc(50% + 22px)" }}
                />
              )}
              <div className="relative z-10 flex shrink-0 md:justify-center">
                <Node state={s.state} />
              </div>
              <div className="min-w-0 md:mt-3 md:text-center">
                <div className={cn("text-[13.5px]", s.state === "current" ? "text-ink" : s.state === "upcoming" || s.state === "skipped" ? "text-faint" : "text-ink-2")}>{s.label}</div>
                <div className="md:flex md:justify-center">
                  <Who step={s} isYou={isMine(s, viewer)} />
                </div>
                <div className={cn("mt-1 text-[12px]", s.state === "blocked" ? "text-bad" : s.state === "current" ? "text-brass-dark" : "text-muted")}>{s.detail}</div>
                {s.at && <div className="text-[11px] text-faint">{dateLabel(s.at, true)}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function JourneyDots({ steps }: { steps: JourneyStep[] }) {
  return (
    <span className="inline-flex items-center" aria-label="Journey">
      {steps.map((s, i) => (
        <span key={s.key} className="inline-flex items-center">
          {i > 0 && <span className={cn("h-px w-3", ["done", "skipped"].includes(steps[i - 1].state) ? "bg-brand-600" : "bg-line")} />}
          <span
            title={`${s.label} · ${s.who} · ${s.detail}`}
            className={cn(
              "block size-2 rounded-full",
              s.state === "done" && "bg-brand-600",
              s.state === "current" && "size-2.5 bg-brass ring-3 ring-brass/20",
              s.state === "upcoming" && "border border-[#CFC8BA] bg-white",
              s.state === "skipped" && "border border-dashed border-[#CFC8BA]",
              s.state === "blocked" && "bg-bad",
            )}
          />
        </span>
      ))}
    </span>
  );
}
