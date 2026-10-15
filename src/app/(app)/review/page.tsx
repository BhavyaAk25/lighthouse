import { ArrowRight, Gavel, Inbox, Play } from "lucide-react";
import Link from "next/link";
import { RecBadge, StatusBadge } from "@/components/domain";
import { Card, ConfidenceRing, EmptyState, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { money, relTime } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/personas";
import type { CaseStatus, Recommendation } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review queue" };

export default async function ReviewQueue() {
  const persona = await requireSession();
  const sql = db();
  const rows =
    persona.role === "LEGAL_REVIEWER"
      ? await sql`select c.decision_id, c.title, c.status, c.updated_at, c.created_by, l.synthesized_recommendation, l.lighthouse_confidence, l.financial_impact,
            (select o.key_metrics->>'top_rule' from agent_outputs o where o.run_id = l.run_id and o.agent_type = 'LEGAL' limit 1) as top_rule,
            (select o.key_metrics->>'review_required_rules' from agent_outputs o where o.run_id = l.run_id and o.agent_type = 'LEGAL' limit 1) as review_rules
          from decision_cases c join lighthouse_decisions l using (decision_id)
          where c.status = 'AWAITING_LEGAL_REVIEW' order by (c.decision_id like 'D-2026-%') desc, c.updated_at desc`
      : persona.role === "DECISION_OWNER"
        ? await sql`select c.decision_id, c.title, c.status, c.updated_at, c.created_by, l.synthesized_recommendation, l.lighthouse_confidence, l.financial_impact,
              null as top_rule, null as review_rules
            from decision_cases c left join lighthouse_decisions l using (decision_id)
            where c.status = 'READY_FOR_DECISION' or (c.decision_id like 'D-2026-%' and c.status in ('DRAFT','REVISION_REQUESTED'))
            order by (c.status = 'READY_FOR_DECISION') desc, (c.decision_id like 'D-2026-%') desc, c.updated_at desc`
        : await sql`select c.decision_id, c.title, c.status, c.updated_at, c.created_by, l.synthesized_recommendation, l.lighthouse_confidence, l.financial_impact,
              null as top_rule, null as review_rules
            from decision_cases c join lighthouse_decisions l using (decision_id)
            where c.status in ('READY_FOR_DECISION','AWAITING_LEGAL_REVIEW') order by (c.decision_id like 'D-2026-%') desc, c.updated_at desc`;

  const subtitle =
    persona.role === "LEGAL_REVIEWER"
      ? "Cases the Legal agent gated. The decision owner cannot approve until you record a disposition."
      : persona.role === "DECISION_OWNER"
        ? "Packets ready for your decision, and demo cases waiting for an agent run."
        : persona.role === "ADMIN"
          ? "Everything currently pending across the pilot. Administrators can observe but not decide."
          : "Open packets where your domain review adds value.";

  return (
    <div>
      <PageHeader eyebrow={ROLE_LABEL[persona.role]} title="Review queue" subtitle={subtitle} />
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={<Inbox className="size-5" />} title="Nothing waiting on you" body="New items appear here as soon as the agents finish a run that needs your attention." />
        ) : (
          <ul>
            {rows.map((r) => (
              <li key={String(r.decision_id)} className="border-b border-line-2 last:border-0">
                <Link href={`/decisions/${r.decision_id}`} className="group flex flex-col gap-3 px-5 py-4 hover:bg-brand-25 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[12px] text-brand-700">{String(r.decision_id)}</span>
                      <StatusBadge status={r.status as CaseStatus} />
                      {r.synthesized_recommendation && <RecBadge rec={r.synthesized_recommendation as Recommendation} short />}
                    </div>
                    <div className="mt-1 truncate text-[14px] font-medium text-ink group-hover:text-brand-700">{String(r.title)}</div>
                    <div className="mt-0.5 text-[12.5px] text-muted">
                      {r.top_rule ? (
                        <span className="inline-flex items-center gap-1 text-[#5b3fd1]">
                          <Gavel className="size-3.5" /> {String(r.review_rules)} rule(s) need review · top: {String(r.top_rule)}
                        </span>
                      ) : (
                        <>
                          {String(r.created_by)} · updated {relTime(r.updated_at as string)}
                          {r.financial_impact !== null && <> · {money(Number(r.financial_impact))} at stake</>}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {r.lighthouse_confidence !== null ? (
                      <ConfidenceRing value={Number(r.lighthouse_confidence)} size={36} stroke={3.5} />
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-[12px] font-medium text-brand-700">
                        <Play className="size-3" /> Run agents
                      </span>
                    )}
                    <ArrowRight className="size-4 text-faint transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
