import { GitCompareArrows, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { RecBadge, StatusBadge } from "@/components/domain";
import { Card, ConfidenceRing, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { cn, dateLabel, money } from "@/lib/format";
import type { CaseStatus, Recommendation } from "@/lib/types";
import { Filters } from "./filters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Decisions" };

const PAGE = 25;
const TABS = [
  { k: "demo", l: "Demo cases" },
  { k: "open", l: "Needs action" },
  { k: "legal", l: "Awaiting legal" },
  { k: "decided", l: "Decided" },
  { k: "all", l: "All" },
];

export default async function DecisionsPage({ searchParams }: PageProps<"/decisions">) {
  const persona = await requireSession();
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined)) ?? "";
  const tab = one("tab") || "demo";
  const q = one("q").trim();
  const cat = one("cat");
  const rec = one("rec");
  const conflict = one("conflict") === "1";
  const page = Math.max(1, Number(one("page") || 1));
  const sql = db();

  const where: string[] = [];
  const args: unknown[] = [];
  // "$?" marks where the single bound parameter goes (may appear several times)
  const add = (cond: string, v?: unknown) => {
    if (v !== undefined) {
      args.push(v);
      const ph = "$" + args.length;
      where.push(cond.split("$?").join(ph));
    } else where.push(cond);
  };
  if (tab === "demo") add("(c.decision_id like 'D-2026-0%' or c.scenario_tag = 'USER_CREATED')");
  if (tab === "open") add("c.status in ('DRAFT','AWAITING_LEGAL_REVIEW','READY_FOR_DECISION')");
  if (tab === "legal") add("c.status = 'AWAITING_LEGAL_REVIEW'");
  if (tab === "decided") add("c.status in ('APPROVED','REJECTED','REVISION_REQUESTED')");
  if (q) add("(c.decision_id ilike $? or c.title ilike $? or c.claim_text ilike $?)", `%${q}%`);
  if (cat) add("c.category_id = $?", cat);
  if (rec) add("l.synthesized_recommendation = $?", rec);
  if (conflict) add("l.conflict_severity in ('MATERIAL','HARD_STOP')");
  const w = where.length ? `where ${where.join(" and ")}` : "";
  const order = tab === "demo" ? "c.decision_id asc" : "c.created_at desc, c.decision_id desc";
  const rows = await sql.query(
    `select c.decision_id, c.title, c.status, c.created_at, c.created_by, c.store_count, c.category_id, cat.name as category,
            l.synthesized_recommendation, l.lighthouse_confidence, l.conflict_severity, l.financial_impact, l.override_flag
     from decision_cases c join categories cat using (category_id)
     left join lighthouse_decisions l using (decision_id)
     ${w} order by ${order} limit ${PAGE} offset ${(page - 1) * PAGE}`,
    args,
  );
  const [{ n }] = await sql.query(`select count(*)::int n from decision_cases c left join lighthouse_decisions l using (decision_id) ${w}`, args);
  const cats = await sql`select category_id, name from categories order by category_id`;
  const pages = Math.max(1, Math.ceil(Number(n) / PAGE));
  const link = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { tab, q, cat, rec, conflict: conflict ? "1" : "", page: String(page), ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === undefined ? "" : String(v)])) };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "page" && v === "1")) p.set(k, v);
    return `/decisions?${p.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="Decisions"
        subtitle="Every promotion and inventory decision in the pilot."
        actions={
          persona.role === "DECISION_OWNER" && (
            <LinkButton href="/decisions/new">
              <Plus className="size-4" /> New decision
            </LinkButton>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-1 rounded-xl border border-line bg-white p-1 shadow-card sm:w-fit">
        {TABS.map((t) => (
          <Link
            key={t.k}
            href={link({ tab: t.k, page: 1 })}
            className={cn("rounded-[9px] px-3 py-1.5 text-[13px] font-medium transition", tab === t.k ? "bg-brand-600 text-white shadow" : "text-ink-2 hover:bg-line-2")}
          >
            {t.l}
          </Link>
        ))}
      </div>
      <Filters q={q} cat={cat} rec={rec} conflict={conflict} cats={cats.map((c) => ({ id: String(c.category_id), name: String(c.name) }))} />
      <Card className="mt-4 overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={<Sparkles className="size-5" />} title="No decisions match" body="Try another tab or clear the filters." />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[860px] text-left">
              <thead>
                <tr className="border-b border-line bg-canvas/70 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted">
                  <th className="px-4 py-2.5">Decision</th>
                  <th className="px-3 py-2.5">Lighthouse</th>
                  <th className="px-3 py-2.5">Confidence</th>
                  <th className="px-3 py-2.5">At stake</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={String(r.decision_id)} className="group border-b border-line-2 last:border-0 hover:bg-brand-25">
                    <td className="max-w-[440px] px-4 py-3">
                      <Link href={`/decisions/${r.decision_id}`} className="block">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[12px] text-brand-700">{String(r.decision_id)}</span>
                          {(r.conflict_severity === "MATERIAL" || r.conflict_severity === "HARD_STOP") && (
                            <span title="Material conflict between agents" className="text-warn">
                              <GitCompareArrows className="size-3.5" />
                            </span>
                          )}
                          {r.override_flag && <span className="rounded bg-warn-soft px-1 text-[10.5px] font-semibold text-[#8A5A12]">OVERRIDE</span>}
                        </div>
                        <div className="truncate text-[13.5px] font-medium text-ink group-hover:text-brand-700">{String(r.title)}</div>
                        <div className="text-[12px] text-muted">
                          {String(r.category)} · {Number(r.store_count)} stores
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-3">{r.synthesized_recommendation ? <RecBadge rec={r.synthesized_recommendation as Recommendation} short /> : <span className="text-[12px] text-faint">Not run</span>}</td>
                    <td className="px-3 py-3">{r.lighthouse_confidence !== null ? <ConfidenceRing value={Number(r.lighthouse_confidence)} size={34} stroke={3.5} /> : <span className="text-faint">-</span>}</td>
                    <td className="tnum px-3 py-3 text-[13px] text-ink-2">{r.financial_impact !== null ? money(Number(r.financial_impact)) : "-"}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status={r.status as CaseStatus} />
                    </td>
                    <td className="px-4 py-3 text-right text-[12.5px] text-muted">
                      <div>{dateLabel(r.created_at as string)}</div>
                      <div className="text-[11.5px]">{String(r.created_by)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[12.5px] text-muted">
          <span>
            {Number(n).toLocaleString()} decision{Number(n) === 1 ? "" : "s"} · page {page} of {pages}
          </span>
          <div className="flex gap-1.5">
            <Link aria-disabled={page <= 1} href={link({ page: Math.max(1, page - 1) })} className={cn("rounded-lg border border-line bg-white px-2.5 py-1 font-medium text-ink-2 hover:bg-line-2", page <= 1 && "pointer-events-none opacity-40")}>
              Previous
            </Link>
            <Link aria-disabled={page >= pages} href={link({ page: Math.min(pages, page + 1) })} className={cn("rounded-lg border border-line bg-white px-2.5 py-1 font-medium text-ink-2 hover:bg-line-2", page >= pages && "pointer-events-none opacity-40")}>
              Next
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
