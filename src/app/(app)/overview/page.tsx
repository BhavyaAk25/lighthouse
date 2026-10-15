import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { DissentBars, RecDonut, WeeklyOutcomes } from "@/components/charts";
import { AGENT_META, RecBadge, StatusBadge } from "@/components/domain";
import { InsightTabs } from "@/components/insight-tabs";
import { Card, CardHeader, PageHeader, Stat } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { money, relTime, titleCase } from "@/lib/format";
import { getPilotClock } from "@/lib/repo";
import type { AgentType, CaseStatus, Recommendation } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

const SCENARIO_COPY: Record<string, string> = {
  ANCHOR_LEGAL_GATE: "Three agents support; Legal gates a clinical claim",
  COMPLETE_AGREEMENT: "All four agents agree",
  FINANCE_VS_SALES: "Strong demand, but economics fail",
  OPS_HARD_STOP: "Launch date shorter than lead time",
  LEGAL_PROHIBITED: "Alcohol BOGO: prohibited",
  MISSING_EVIDENCE: "Inventory feed outage",
  STALE_EVIDENCE: "Evidence 18 days old",
  LOW_CONFIDENCE: "3-store test, generated category",
  REJECT_CANDIDATE: "Deep clearance markdown",
  PRIVACY_AND_CLAIMS: "Digital coupon + skin claims in CA",
  SUPPLIER_EXCLUSIVITY: "8-week supplier endcap",
  INVENTORY_MOVE: "Move TVs before the holidays",
};

export default async function Overview() {
  await requireSession();
  const sql = db();
  const clock = await getPilotClock();
  const [[k], weekly, mix, dissent, demo, activity] = await Promise.all([
    sql`select
          (select count(*) from decision_cases where status in ('AWAITING_LEGAL_REVIEW','READY_FOR_DECISION'))::int as open,
          (select count(*) from decision_cases where status = 'AWAITING_LEGAL_REVIEW')::int as legal,
          (select round(100.0 * avg(case when l.conflict_severity in ('MATERIAL','HARD_STOP') then 1 else 0 end), 1)
             from lighthouse_decisions l join decision_cases c using (decision_id) where c.created_at >= ${clock}::date - 90)::float as conflict_rate,
          (select round(avg(lighthouse_confidence), 2) from lighthouse_decisions)::float as avg_conf,
          (select coalesce(sum(financial_impact), 0) from lighthouse_decisions where final_decision = 'APPROVED' and decided_at >= ${clock}::date - 90)::float as approved_value,
          (select round(100.0 * avg(case when override_flag then 1 else 0 end), 1) from lighthouse_decisions where final_decision is not null)::float as override_rate,
          (select count(*) from decision_cases)::int as cases,
          (select count(*) from agent_outputs)::int as outputs,
          (select count(*) from audit_log)::int as audit`,
    sql`select to_char(date_trunc('week', c.created_at), 'Mon DD') as week, date_trunc('week', c.created_at) as wk,
               count(*) filter (where c.status = 'APPROVED')::int as "APPROVED",
               count(*) filter (where c.status = 'REJECTED')::int as "REJECTED",
               count(*) filter (where c.status = 'REVISION_REQUESTED')::int as "REVISION_REQUESTED",
               count(*) filter (where c.status in ('DRAFT','AWAITING_LEGAL_REVIEW','READY_FOR_DECISION'))::int as "OPEN"
        from decision_cases c where c.created_at >= ${clock}::date - 182 group by 1, 2 order by 2`,
    sql`select synthesized_recommendation as rec, count(*)::int as n from lighthouse_decisions group by 1 order by 2 desc`,
    sql`select agent_type, round(100.0 * avg(case when recommendation in ('HOLD','REJECT','REVIEW_REQUIRED') then 1 else 0 end), 1)::float as dissent
        from agent_outputs group by 1`,
    sql`select c.decision_id, c.title, c.status, c.scenario_tag, l.synthesized_recommendation from decision_cases c
        left join lighthouse_decisions l using (decision_id) where c.decision_id like 'D-2026-0%' order by c.decision_id`,
    sql`select seq, ts, actor, role, action, decision_id from audit_log order by seq desc limit 9`,
  ]);
  const order: AgentType[] = ["SALES", "FINANCE", "OPERATIONS", "LEGAL"];

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="How the pilot is performing across all 5,000 decisions." />
      <InsightTabs active="overview" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        <Stat label="Needs a decision" value={k.open} sub="Ready or awaiting legal" />
        <Stat label="Awaiting legal" value={k.legal} sub="Approval locked" />
        <Stat label="Material conflicts" value={`${k.conflict_rate ?? 0}%`} sub="Last 90 days" />
        <Stat label="Avg Lighthouse confidence" value={Number(k.avg_conf ?? 0).toFixed(2)} sub="Synthesis score" />
        <Stat label="Approved value" value={money(k.approved_value)} sub="Revenue + markdown, 90 days" />
        <Stat label="Human overrides" value={`${k.override_rate ?? 0}%`} sub="Always with rationale" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Decision outcomes by week" subtitle="Last 26 weeks of the pilot ledger" />
          <div className="px-3 pb-3">
            <WeeklyOutcomes data={weekly.map((w) => ({ week: String(w.week), APPROVED: w.APPROVED, REJECTED: w.REJECTED, REVISION_REQUESTED: w.REVISION_REQUESTED, OPEN: w.OPEN }))} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Lighthouse recommendations" subtitle="Across all recommendation packets" />
          <div className="px-5 pb-5">
            <RecDonut data={mix.map((m) => ({ rec: String(m.rec), n: Number(m.n) }))} />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="Demo scenarios"
            subtitle="Twelve curated cases, one per acceptance test."
            action={
              <Link href="/decisions?tab=demo" className="text-[13px] font-medium text-brand-700 hover:underline">
                View all
              </Link>
            }
          />
          <div className="grid gap-2 px-5 pb-5 sm:grid-cols-2">
            {demo.map((d) => (
              <Link
                key={String(d.decision_id)}
                href={`/decisions/${d.decision_id}`}
                className="group rounded-xl border border-line p-3 transition hover:-translate-y-[1px] hover:border-brand-200 hover:shadow-card"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[12px] text-brand-700">{String(d.decision_id)}</span>
                  {d.synthesized_recommendation ? <RecBadge rec={d.synthesized_recommendation as Recommendation} short /> : <StatusBadge status={d.status as CaseStatus} />}
                </div>
                <div className="mt-1 text-[13px] font-semibold text-ink group-hover:text-brand-700">{SCENARIO_COPY[String(d.scenario_tag)] ?? titleCase(String(d.scenario_tag))}</div>
                <div className="mt-0.5 truncate text-[12px] text-muted">{String(d.title)}</div>
              </Link>
            ))}
          </div>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Which agents push back" subtitle="Share of agent outputs that hold, reject or require review" />
            <div className="px-3 pb-3">
              <DissentBars
                data={order.map((a) => ({ agent: AGENT_META[a].name, dissent: Number(dissent.find((d) => d.agent_type === a)?.dissent ?? 0), color: AGENT_META[a].color }))}
              />
            </div>
          </Card>
          <Card>
            <CardHeader
              title="Recent activity"
              subtitle={`${Number(k.audit).toLocaleString()} audit entries · ${Number(k.outputs).toLocaleString()} agent outputs`}
              icon={<ShieldCheck className="size-4" />}
              action={
                <Link href="/audit" className="text-[13px] font-medium text-brand-700 hover:underline">
                  Audit log
                </Link>
              }
            />
            <ul className="space-y-2.5 px-5 pb-5">
              {activity.map((a) => (
                <li key={Number(a.seq)} className="flex items-start justify-between gap-3 text-[12.5px]">
                  <span className="min-w-0">
                    <span className="font-medium text-ink">{String(a.actor)}</span>{" "}
                    <span className="text-ink-2">{String(a.action).replace(/_/g, " ").toLowerCase()}</span>
                    {a.decision_id && (
                      <Link href={`/decisions/${a.decision_id}`} className="ml-1 font-mono text-[11.5px] text-brand-700 hover:underline">
                        {String(a.decision_id)}
                      </Link>
                    )}
                  </span>
                  <span className="shrink-0 text-[11.5px] text-faint">{relTime(a.ts as string)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
