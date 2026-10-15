import { ArrowRight, Hourglass } from "lucide-react";
import Link from "next/link";
import type { FlowStage } from "@/lib/flow";
import { cn } from "@/lib/format";
import type { Recommendation } from "@/lib/types";
import { RecBadge } from "./domain";

function Owner({ s }: { s: FlowStage }) {
  return (
    <span className="text-[12.5px] text-muted">
      {s.isYours ? <span className="text-brass-dark">You</span> : s.ownerRole}
      {s.ownerName && !s.isYours && <span className="text-faint"> · {s.ownerName}</span>}
    </span>
  );
}

/** Four connected stage tiles; each links to its column. */
export function StageMap({ stages, linkBase = "/flow" }: { stages: FlowStage[]; linkBase?: string }) {
  return (
    <div className="relative grid gap-3 md:grid-cols-4">
      <span className="absolute top-1/2 right-[8%] left-[8%] hidden h-px -translate-y-1/2 bg-line md:block" aria-hidden />
      {stages.map((s, i) => {
        const hot = s.mineCount > 0;
        return (
          <Link
            key={s.key}
            href={`${linkBase}#${s.key}`}
            className={cn(
              "group relative z-10 flex flex-col rounded-[14px] border bg-white p-5 transition-all hover:-translate-y-0.5 hover:shadow-pop",
              hot ? "border-brass shadow-[0_0_0_4px_rgba(176,138,74,0.10)]" : "border-line",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] tracking-[0.14em] text-faint uppercase">Step {i + 1}</span>
              {i < stages.length - 1 && <ArrowRight className="size-3.5 text-faint" />}
            </div>
            <div className="mt-2 text-[16px] text-ink">{s.label}</div>
            <Owner s={s} />
            <div className="mt-4 flex items-end justify-between">
              <span className="font-display tnum text-[36px] leading-none text-ink">{s.count}</span>
              <span className={cn("text-[12.5px]", hot ? "text-brass-dark" : "text-muted")}>
                {hot ? `${s.mineCount} for you` : s.count ? (s.key === "sealed" ? "Done" : "Not yours") : "Empty"}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/** Columns of clickable case cards. Your cards have an action button; the rest show whose turn it is. */
export function FlowBoard({ stages }: { stages: FlowStage[] }) {
  return (
    <div className="grid gap-5 lg:grid-cols-4">
      {stages.map((s) => (
        <section key={s.key} id={s.key} className="scroll-mt-24">
          <div className={cn("mb-3 flex items-end justify-between border-b pb-2.5", s.mineCount ? "border-brass" : "border-line")}>
            <div>
              <div className="text-[14px] text-ink">{s.label}</div>
              <Owner s={s} />
            </div>
            <span className="tnum text-[13px] text-faint">{s.count}</span>
          </div>
          <div className="space-y-2.5">
            {s.items.length === 0 && <div className="rounded-[12px] border border-dashed border-line px-4 py-6 text-center text-[13px] text-faint">Empty</div>}
            {s.items.map((c) => (
              <Link
                key={c.decision_id}
                href={c.href}
                className={cn("group block rounded-[12px] border bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-pop", c.mine ? "border-brass" : "border-line")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-faint">{c.decision_id}</span>
                  {c.rec && s.key !== "analyze" && <RecBadge rec={c.rec as Recommendation} short />}
                </div>
                <div className="mt-1.5 line-clamp-2 text-[14px] leading-snug text-ink">{c.title}</div>
                {c.note && <div className="mt-1 line-clamp-2 text-[12.5px] text-muted">{c.note}</div>}
                <div className="mt-3">
                  {c.mine ? (
                    <span className="inline-flex items-center gap-1.5 rounded-[8px] bg-brand-600 px-2.5 py-1.5 text-[12.5px] text-[#F4F1EA] group-hover:bg-brand-700">
                      {c.action} <ArrowRight className="size-3.5" />
                    </span>
                  ) : c.waitingOn ? (
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
                      <Hourglass className="size-3.5 text-brass" strokeWidth={1.6} /> {c.waitingOn}’s turn
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
