import { Link2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Card, Mono, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { cn, dateLabel } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/personas";
import { VerifyChain } from "./verify";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit log" };

const PAGE = 40;
const ACTIONS = [
  "CASE_CREATED",
  "AGENTS_RUN_COMPLETED",
  "RECOMMENDATION_GENERATED",
  "GUARDRAIL_APPLIED",
  "LEGAL_REVIEW_RECORDED",
  "DECISION_RECORDED",
  "DECISION_OVERRIDE_RECORDED",
  "CASE_REVISED",
  "RULE_UPDATED",
  "THRESHOLDS_UPDATED",
  "SIGNED_IN",
];

function summary(action: string, p: Record<string, unknown>) {
  if (action === "DECISION_RECORDED" || action === "DECISION_OVERRIDE_RECORDED") return `${String(p.decision).toLowerCase()}${p.rationale ? ` · “${String(p.rationale).slice(0, 90)}”` : ""}`;
  if (action === "RECOMMENDATION_GENERATED") return `${String(p.recommendation).replace(/_/g, " ").toLowerCase()} · conf ${p.confidence} · ${String(p.conflict).toLowerCase()}`;
  if (action === "AGENTS_RUN_COMPLETED") return `${String(p.mode ?? "").toLowerCase().replace("_", " ")} · ${p.providers ?? ""}`;
  if (action === "LEGAL_REVIEW_RECORDED") return String(p.disposition).replace(/_/g, " ").toLowerCase();
  if (action === "RULE_UPDATED") return `${p.rule_id} · ${String(p.reason ?? "").slice(0, 80)}`;
  if (action === "THRESHOLDS_UPDATED") return `${Object.keys((p.changed as object) ?? {}).join(", ")} · ${String(p.reason ?? "").slice(0, 60)}`;
  if (action === "GUARDRAIL_APPLIED") return String(((p.adjustments as string[]) ?? [])[0] ?? "").slice(0, 100);
  if (action === "CASE_CREATED") return String(p.title ?? "").slice(0, 90);
  return "";
}

export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  await requireSession();
  const sp = await searchParams;
  const action = typeof sp.action === "string" ? sp.action : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = Math.max(1, Number(sp.page ?? 1));
  const sql = db();
  const rows = await sql.query(
    `select seq, ts, actor, role, action, decision_id, payload, hash, prev_hash from audit_log
     where ($1 = '' or action = $1) and ($2 = '' or decision_id ilike $3 or actor ilike $3)
     order by seq desc limit ${PAGE} offset ${(page - 1) * PAGE}`,
    [action, q, `%${q}%`],
  );
  const [{ n }] = await sql.query(`select count(*)::int n from audit_log where ($1 = '' or action = $1) and ($2 = '' or decision_id ilike $3 or actor ilike $3)`, [action, q, `%${q}%`]);
  const pages = Math.max(1, Math.ceil(Number(n) / PAGE));
  const qs = (patch: Record<string, string | number>) => {
    const p = new URLSearchParams({ ...(action ? { action } : {}), ...(q ? { q } : {}), page: String(page), ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, String(v)])) });
    if (p.get("page") === "1") p.delete("page");
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/audit?${p}`;
  };
  return (
    <div>
      <PageHeader
        title="Audit log"
        subtitle="Append-only and hash-chained. Each entry stores the SHA-256 of the previous entry; the database rejects any update or delete. Verify the whole chain at any time."
      />
      <VerifyChain />
      <form className="mt-5 flex flex-col gap-2 sm:flex-row" action="/audit">
        <input name="q" defaultValue={q} placeholder="Filter by decision ID or person…" className="h-9 flex-1 rounded-[10px] border border-line bg-white px-3 text-[13.5px] outline-none focus:border-brand-400" />
        <select name="action" defaultValue={action} className="h-9 rounded-[10px] border border-line bg-white px-2.5 text-[13px] text-ink-2">
          <option value="">All actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a.replace(/_/g, " ").toLowerCase()}
            </option>
          ))}
        </select>
        <button className="h-9 rounded-[10px] bg-brand-600 px-4 text-[13px] font-medium text-white">Filter</button>
      </form>
      <Card className="mt-4 overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-line bg-canvas/70 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted">
                <th className="px-4 py-2.5">#</th>
                <th className="px-3 py-2.5">When</th>
                <th className="px-3 py-2.5">Who</th>
                <th className="px-3 py-2.5">Action</th>
                <th className="px-3 py-2.5">Detail</th>
                <th className="px-4 py-2.5">Hash chain</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={Number(r.seq)} className="border-b border-line-2 align-top last:border-0">
                  <td className="tnum px-4 py-2.5 text-[12.5px] text-muted">{Number(r.seq)}</td>
                  <td className="px-3 py-2.5 text-[12.5px] whitespace-nowrap text-ink-2">{dateLabel(r.ts as string, true)}</td>
                  <td className="px-3 py-2.5 text-[12.5px]">
                    <div className="font-medium text-ink">{String(r.actor)}</div>
                    <div className="text-[11.5px] text-muted">{ROLE_LABEL[r.role as keyof typeof ROLE_LABEL] ?? String(r.role).toLowerCase()}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold",
                        String(r.action).includes("OVERRIDE") ? "bg-warn-soft text-[#9a5b00]" : String(r.action).includes("DECISION") ? "bg-ok-soft text-[#087443]" : "bg-line-2 text-ink-2",
                      )}
                    >
                      {String(r.action).replace(/_/g, " ").toLowerCase()}
                    </span>
                    {r.decision_id && (
                      <Link href={`/decisions/${r.decision_id}`} className="mt-1 block font-mono text-[11.5px] text-brand-700 hover:underline">
                        {String(r.decision_id)}
                      </Link>
                    )}
                  </td>
                  <td className="max-w-[320px] px-3 py-2.5 text-[12.5px] text-ink-2">{summary(String(r.action), r.payload as Record<string, unknown>)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <Link2 className="size-3 text-faint" />
                      <Mono className="text-[11px]">{String(r.hash).slice(0, 16)}</Mono>
                    </div>
                    <Mono className="text-[10.5px] text-faint">prev {String(r.prev_hash).slice(0, 12)}</Mono>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[12.5px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" /> {Number(n).toLocaleString()} entries · page {page} of {pages}
          </span>
          <div className="flex gap-1.5">
            <Link href={qs({ page: Math.max(1, page - 1) })} className={cn("rounded-lg border border-line bg-white px-2.5 py-1 font-medium text-ink-2", page <= 1 && "pointer-events-none opacity-40")}>
              Newer
            </Link>
            <Link href={qs({ page: Math.min(pages, page + 1) })} className={cn("rounded-lg border border-line bg-white px-2.5 py-1 font-medium text-ink-2", page >= pages && "pointer-events-none opacity-40")}>
              Older
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
