import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateLabel } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "History" };

export default async function HistoryPage() {
  const persona = await requireSession();
  const rows = await db()`select r.*, c.title from reviews r join decision_cases c using (decision_id)
                          where r.reviewer_name = ${persona.name} order by r.created_at desc limit 100`;
  return (
    <div className="mx-auto max-w-[880px]">
      <PageHeader title={persona.role === "LEGAL_REVIEWER" ? "My reviews" : "My notes"} />
      {rows.length === 0 ? (
        <EmptyState title="Nothing yet" body="Your dispositions will appear here." />
      ) : (
        <div className="card divide-y divide-line-2 overflow-hidden">
          {rows.map((r) => (
            <Link key={Number(r.review_id)} href={`/decisions/${r.decision_id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-canvas/70">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] text-ink">{String(r.title)}</div>
                <div className="truncate text-[12.5px] text-muted">{String(r.condition_text ?? "")}</div>
              </div>
              <Badge tone={String(r.disposition).includes("REJECT") || r.disposition === "CONCERN" ? "bad" : "ok"}>{String(r.disposition).replace(/_/g, " ").toLowerCase()}</Badge>
              <span className="hidden w-28 text-right text-[12px] text-faint sm:block">{dateLabel(r.created_at as string)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
