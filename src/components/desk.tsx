import { ArrowUpRight, Hourglass } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn, money } from "@/lib/format";
import type { DeskItem } from "@/lib/desk";
import { quickJourney } from "@/lib/journey";
import { JourneyDots } from "./journey";
import type { Recommendation } from "@/lib/types";
import { RecBadge } from "./domain";

export function Greeting({ name, line, eyebrow }: { name: string; line: ReactNode; eyebrow: string }) {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return (
    <div className="mb-10">
      <div className="text-[11.5px] tracking-[0.14em] text-brass-dark uppercase">{eyebrow}</div>
      <h1 className="font-display mt-2 text-[36px] leading-[1.02] text-ink">
        {part}, {name.split(" ")[0]}.
      </h1>
      <p className="mt-3 text-[15px] text-muted">{line}</p>
    </div>
  );
}

export function DeskSection({ title, count, children, empty }: { title: string; count?: number; children: ReactNode; empty?: string }) {
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-[11.5px] tracking-[0.14em] text-muted uppercase">{title}</h2>
        {count !== undefined && <span className="tnum text-[12px] text-faint">{count}</span>}
      </div>
      {empty ? <p className="rounded-[12px] border border-dashed border-line px-5 py-6 text-[13.5px] text-muted">{empty}</p> : <div className="card divide-y divide-line-2 overflow-hidden">{children}</div>}
    </section>
  );
}

export function DeskRow({ item, action, sub, showRec = true }: { item: DeskItem; action: string; sub?: ReactNode; showRec?: boolean }) {
  return (
    <Link href={`/decisions/${item.decision_id}`} className="group flex items-center gap-5 px-5 py-4 transition-colors hover:bg-canvas/70">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[11.5px] text-faint">{item.decision_id}</span>
          {showRec && item.rec && <RecBadge rec={item.rec as Recommendation} short />}
          <span className="ml-1 hidden sm:inline-flex">
            <JourneyDots steps={quickJourney(item.status, item.revision, item.requires_legal, item.owner)} />
          </span>
        </div>
        <div className="mt-1 truncate text-[15px] text-ink">{item.title.replace(/ - /g, " · ")}</div>
        {sub && <div className="mt-0.5 truncate text-[13px] text-muted">{sub}</div>}
      </div>
      {item.impact !== null && <span className="tnum hidden text-[13px] text-muted sm:block">{money(item.impact)}</span>}
      <span className="inline-flex shrink-0 items-center gap-1 text-[13px] text-ink-2 group-hover:text-ink">
        {action} <ArrowUpRight className="size-3.5 text-faint transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brass" />
      </span>
    </Link>
  );
}

export function WaitingRow({ item, who }: { item: DeskItem; who: string }) {
  return (
    <Link href={`/decisions/${item.decision_id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-canvas/70">
      <Hourglass className="size-4 shrink-0 text-brass" strokeWidth={1.6} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] text-ink">{item.title.replace(/ - /g, " · ")}</div>
        <div className="flex items-center gap-3 text-[12.5px] text-muted">
          <span>Waiting on {who}</span>
          <JourneyDots steps={quickJourney(item.status, item.revision, item.requires_legal, item.owner)} />
        </div>
      </div>
      <span className="font-mono text-[11.5px] text-faint">{item.decision_id}</span>
    </Link>
  );
}

export function WaitingNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-[12px] border border-line bg-white px-5 py-4 text-[14px] text-ink-2", className)}>
      <Hourglass className="size-4 shrink-0 text-brass" strokeWidth={1.6} />
      <span>{children}</span>
    </div>
  );
}
