import { Bot, Check, Minus, ShieldCheck, X } from "lucide-react";
import { cn, relTime } from "@/lib/format";
import type { JourneyStep } from "@/lib/journey";
import { PERSONAS, type Persona } from "@/lib/personas";
import type { Lane } from "@/lib/signoff";
import { AGENT_META, LANE_META } from "./domain";

const ROLE_WORD: Record<string, string> = { DECISION_OWNER: "Executive", PROPOSER: "Proposer", LEADS: "Department leads", AI: "AI agents", SYSTEM: "Lighthouse" };

function Who({ step, isYou }: { step: JourneyStep; isYou: boolean }) {
  const p = PERSONAS.find((x) => x.name === step.who);
  return (
    <div className="mt-1.5 flex items-center justify-center gap-1.5 md:justify-start">
      {step.role === "AI" ? <Bot className="size-3.5 text-muted" strokeWidth={1.6} /> : step.role === "SYSTEM" ? <ShieldCheck className="size-3.5 text-muted" strokeWidth={1.6} /> : null}
      <span className={cn("truncate text-[12.5px]", isYou ? "text-brass-dark" : "text-ink-2")}>{isYou ? "You" : ROLE_WORD[step.role] ?? step.who}</span>
      {!isYou && p && <span className="truncate text-[11.5px] text-faint">· {p.name}</span>}
    </div>
  );
}

/** The four parallel department lanes inside the sign-off step. */
function Lanes({ lanes, viewer }: { lanes: Lane[]; viewer?: Persona }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-1 md:mx-auto md:max-w-[190px]">
      {lanes.map((l) => {
        const you = viewer?.name === l.lead.name;
        const m = LANE_META[l.state];
        return (
          <span
            key={l.dept}
            title={`${AGENT_META[l.dept].name} · ${l.lead.name} · ${m.label}`}
            className={cn("flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-[11px]", you ? "border-brass bg-brass-soft" : "border-line-2 bg-white")}
          >
            <span className={cn("block size-1.5 shrink-0 rounded-full", m.dot)} />
            <span className={cn("truncate", you ? "text-brass-dark" : "text-ink-2")}>{you ? "You" : AGENT_META[l.dept].name}</span>
          </span>
        );
      })}
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
  !!viewer &&
  (s.who === viewer.name || (s.key === "signoff" && !!s.lanes?.some((l) => l.lead.name === viewer.name && (l.state === "PENDING" || l.state === "OVERDUE"))));

export function JourneyBar({ steps, viewer, className, task }: { steps: JourneyStep[]; viewer?: Persona; className?: string; task?: string | null }) {
  const cur = steps.find((s) => s.state === "current");
  const blocked = steps.find((s) => s.state === "blocked");
  const done = steps.every((s) => s.state === "done" || s.state === "skipped");
  const mine = !!task;
  const sign = steps.find((s) => s.key === "signoff");
  const pendingDepts = (sign?.lanes ?? []).filter((l) => l.state === "PENDING" || l.state === "OVERDUE").map((l) => l.lead.name.split(" ")[0]);
  const waitingFor: Record<string, string> = {
    created: `Waiting on ${steps[0].who.split(" ")[0]} to submit it`,
    signoff: `Waiting on ${pendingDepts.join(", ") || "the departments"} to sign off`,
    decide: "Waiting on Maya to decide",
  };
  const headline = done
    ? "Decided and sealed in the audit trail"
    : mine
      ? `Your turn: ${task!.toLowerCase()}`
      : blocked && !cur
        ? `Stopped: ${blocked.detail.toLowerCase()}`
        : cur
          ? waitingFor[cur.key] ?? cur.label
          : blocked
            ? `Stopped: ${blocked.detail.toLowerCase()}`
            : "";
  return (
    <div className={cn("card px-6 py-5", className)}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={cn("size-2 rounded-full", mine ? "bg-brass animate-pulse-soft" : blocked ? "bg-bad" : done ? "bg-ok" : "bg-brand-300")} />
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
                {s.lanes && s.lanes.some((l) => l.state !== "NOT_STARTED") && <Lanes lanes={s.lanes} viewer={viewer} />}
                {s.at && <div className="text-[11px] text-faint">{relTime(s.at)}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
