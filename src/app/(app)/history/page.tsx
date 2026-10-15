import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { RecBadge } from "@/components/domain";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { cn, dateLabel } from "@/lib/format";
import { DEPT_OF } from "@/lib/personas";
import { DEPT_NAME } from "@/lib/signoff";
import type { Recommendation } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "My sign-offs" };

const KIND: Record<string, { label: string; cls: string }> = {
  CONFIRMED: { label: "Confirmed", cls: "text-ok" },
  ADJUSTED: { label: "Adjusted", cls: "text-brass-dark" },
  BLOCKED: { label: "Blocked", cls: "text-bad" },
};

export default async function HistoryPage() {
  const persona = await requireSession();
  const dept = DEPT_OF[persona.role];
  const sql = db();
  const [rows, [stats]] = await Promise.all([
    sql`select r.*, c.title from reviews r join decision_cases c using (decision_id)
        where r.reviewer_name = ${persona.name} and r.department is not null and not r.superseded order by r.created_at desc limit 60`,
    sql`select count(*)::int n, count(*) filter (where disposition = 'CONFIRMED')::int confirmed,
               count(*) filter (where disposition = 'ADJUSTED')::int adjusted, count(*) filter (where disposition = 'BLOCKED')::int blocked
        from reviews where reviewer_name = ${persona.name} and department is not null and not superseded`,
  ]);
  const pct = (v: number) => (stats.n ? `${Math.round((100 * v) / stats.n)}%` : "-");
  const tiles = [
    ["Sign-offs", Number(stats.n).toLocaleString(), ""],
    ["Agreed with the agent", pct(stats.confirmed), "text-ok"],
    ["Changed the answer", pct(stats.adjusted), "text-brass-dark"],
    ["Blocked", pct(stats.blocked), "text-bad"],
  ];
  return (
    <div className="mx-auto max-w-[920px]">
      <PageHeader title="My sign-offs" subtitle={dept ? `Every time you signed off on the ${DEPT_NAME[dept]} agent, including the pilot history.` : undefined} />
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([l, v, cls]) => (
          <Card key={l} className="p-4">
            <div className="text-[12.5px] text-muted">{l}</div>
            <div className={cn("font-display tnum mt-1.5 text-[28px] leading-none", cls)}>{v}</div>
          </Card>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Nothing yet" body="Your sign-offs will appear here." />
      ) : (
        <div className="card divide-y divide-line-2 overflow-hidden">
          {rows.map((r) => {
            const k = KIND[String(r.disposition)] ?? KIND.CONFIRMED;
            return (
              <Link key={Number(r.review_id)} href={`/decisions/${r.decision_id}`} className="flex flex-col gap-2 px-5 py-3.5 hover:bg-canvas/70 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] text-ink">{String(r.title).replace(/ - /g, " · ")}</div>
                  {r.condition_text && <div className="truncate text-[12.5px] text-muted">{String(r.condition_text)}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <RecBadge rec={r.ai_recommendation as Recommendation} short />
                  <ArrowRight className="size-3.5 text-faint" />
                  <span className={cn("w-20 text-[12.5px]", k.cls)}>{k.label}</span>
                  <span className="hidden w-24 text-right text-[12px] text-faint sm:block">{dateLabel(r.created_at as string)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
