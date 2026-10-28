import { ArrowRight, Hourglass } from "lucide-react";
import Link from "next/link";
import type { FlowStage } from "@/lib/flow";
import { cn } from "@/lib/format";
import type { Recommendation } from "@/lib/types";
import { AGENT_META, RecBadge } from "./domain";

function Owner({ s }: { s: FlowStage }) {
  return (
    <span className="text-[12.5px] text-muted">
      {s.isYours && s.key !== "signoff" ? <span className="text-brass-dark">You</span> : s.ownerRole}
      {s.ownerName && !s.isYours && <span className="text-faint"> · {s.ownerName}</span>}
    </span>
  );
}

/** Columns of clickable case cards. Your cards have an action button; the rest show whose turn it is. */
export function FlowBoard({ stages }: { stages: FlowStage[] }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.5fr_1fr_1fr]">
      {stages.map((s, i) => (
        <section key={s.key} id={s.key} className="scroll-mt-24">
          <div className={cn("mb-3 rounded-[14px] border bg-white px-4 py-3.5", s.mineCount ? "border-brass shadow-[0_0_0_4px_rgba(176,138,74,0.10)]" : "border-line")}>
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-[15px] text-ink">
                <span className="mr-1.5 text-faint">{i + 1}</span>
                {s.label}
              </div>
              <span className="font-display tnum text-[26px] leading-none text-ink">{s.count}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <Owner s={s} />
              {s.mineCount > 0 && <span className="text-[12.5px] text-brass-dark">{s.mineCount} for you</span>}
            </div>
            {s.depts && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {s.depts.map((d) => (
                  <span
                    key={d.dept}
                    className={cn("rounded-full border px-2.5 py-0.5 text-[12.5px]", d.isYours ? "border-brass bg-brass-soft text-brass-dark" : "border-line-2 bg-canvas/60 text-ink-2")}
                  >
                    {d.isYours ? "You" : AGENT_META[d.dept].name} <span className="tnum text-muted">{d.pending}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2.5">
            {s.items.length === 0 && <div className="rounded-[12px] border border-dashed border-line px-4 py-5 text-center text-[13px] text-muted">Nothing here right now</div>}
            {s.items.map((c) => (
              <Link
                key={c.decision_id}
                href={c.href}
                className={cn("group block rounded-[12px] border bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-pop", c.mine ? "border-brass" : "border-line")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-faint">{c.decision_id}</span>
                  {c.rec && s.key !== "proposed" && s.key !== "sealed" && <RecBadge rec={c.rec as Recommendation} short />}
                </div>
                <div className="mt-1.5 line-clamp-2 text-[14.5px] leading-snug text-ink">{c.title}</div>
                {c.note && <div className="mt-1 line-clamp-2 text-[13px] text-muted">{c.note}</div>}
                <div className="mt-3">
                  {c.mine ? (
                    <span className="inline-flex items-center gap-1.5 rounded-[8px] bg-brand-600 px-2.5 py-1.5 text-[12.5px] text-[#F4F1EA] group-hover:bg-brand-700">
                      {c.action} <ArrowRight className="size-3.5" />
                    </span>
                  ) : c.waitingOn ? (
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
                      <Hourglass className="size-3.5 text-brass" strokeWidth={1.6} /> Waiting on {c.waitingOn}
                    </span>
                  ) : (
                    <span className={cn("text-[12.5px]", c.final === "REJECTED" ? "text-bad" : "text-ok")}>{c.final === "REJECTED" ? "Rejected" : "Approved"}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
