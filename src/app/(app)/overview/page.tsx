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
import { ACTIVITY_ACTIONS, describe } from "@/lib/activity";
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
  const [[k], weekly, mix, dissent, demo, activity, signoffs] = await Promise.all([
    sql`select
          (select count(*) from decision_cases where status in ('IN_REVIEW','READY_FOR_DECISION'))::int as open,
          (select count(*) from decision_cases where status = 'IN_REVIEW')::int as legal,
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
               count(*) filter (where c.status in ('DRAFT','IN_REVIEW','READY_FOR_DECISION'))::int as "OPEN"
        from decision_cases c where c.created_at >= ${clock}::date - 182 group by 1, 2 order by 2`,
    sql`select synthesized_recommendation as rec, count(*)::int as n from lighthouse_decisions group by 1 order by 2 desc`,
    sql`select agent_type, round(100.0 * avg(case when recommendation in ('HOLD','REJECT','REVIEW_REQUIRED') then 1 else 0 end), 1)::float as dissent
        from agent_outputs group by 1`,
    sql`select c.decision_id, c.title, c.status, c.scenario_tag, l.synthesized_recommendation from decision_cases c
        left join lighthouse_decisions l using (decision_id) where c.decision_id like 'D-2026-0%' order by c.decision_id`,
    sql`select seq, ts, actor, action, decision_id, payload from audit_log where decision_id is not null and action = any(${ACTIVITY_ACTIONS}) order by seq desc limit 8`,
    sql`select o.agent_type, count(distinct o.decision_id)::int lanes, count(r.review_id)::int signed,
               count(r.review_id) filter (where r.disposition = 'CONFIRMED')::int confirmed,
               count(r.review_id) filter (where r.disposition = 'ADJUSTED')::int adjusted,
               count(r.review_id) filter (where r.disposition = 'BLOCKED')::int blocked
        from agent_outputs o join lighthouse_decisions l on l.run_id = o.run_id
        left join reviews r on r.decision_id = o.decision_id and r.department = o.agent_type and not r.superseded
        group by 1`,
  ]);
  const order: AgentType[] = ["SALES", "FINANCE", "OPERATIONS", "LEGAL"];

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="How the pilot is performing across all 5,000 decisions." />
      <InsightTabs active="overview" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        <Stat label="Open cases" value={k.open} sub="In sign-off or with the executive" />
        <Stat label="In department sign-off" value={k.legal} sub="Waiting on a lead" />
        <Stat label="Material conflicts" value={`${k.conflict_rate ?? 0}%`} sub="Last 90 days" />
        <Stat label="Average confidence" value={`${Math.round(Number(k.avg_conf ?? 0) * 100)}%`} sub="Across all recommendations" />
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
          <CardHeader title="Lighthouse recommendations" subtitle="Across all recommendations" />
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
                <div className="mt-0.5 truncate text-[12.5px] text-muted">{String(d.title).replace(/ - /g, " · ")}</div>
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
            <CardHeader title="Department sign-offs" subtitle="Leads sign only when their agent raises a concern" />
            <div className="space-y-3 px-5 pb-5">
              {order.map((a) => {
                const r = signoffs.find((x) => x.agent_type === a);
                const signed = Number(r?.signed ?? 0);
                const lanes = Math.max(1, Number(r?.lanes ?? 1));
                const w = (v: number) => `${signed ? (100 * v) / signed : 0}%`;
                return (
                  <div key={a}>
                    <div className="flex items-baseline justify-between text-[12.5px]">
                      <span className="text-ink-2">{AGENT_META[a].name}</span>
                      <span className="tnum text-muted">needed a person in {Math.round((100 * signed) / lanes)}% of cases</span>
                    </div>
                    <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-line-2">
                      <span className="bg-brand-600" style={{ width: w(Number(r?.confirmed ?? 0)) }} title="Confirmed the agent" />
                      <span className="bg-brass" style={{ width: w(Number(r?.adjusted ?? 0)) }} title="Changed the agent's answer" />
                      <span className="bg-bad" style={{ width: w(Number(r?.blocked ?? 0)) }} title="Blocked" />
                    </div>
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[11.5px] text-muted">
                <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-brand-600" /> Confirmed the agent</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-brass" /> Changed its answer</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-bad" /> Blocked</span>
              </div>
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
              {activity.map((a) => {
                const text = describe(String(a.action), String(a.actor), String(a.decision_id), (a.payload ?? {}) as Record<string, unknown>);
                return text ? (
                  <li key={Number(a.seq)} className="flex items-start justify-between gap-3 text-[13px]">
                    <Link href={`/decisions/${a.decision_id}`} className="min-w-0 text-ink-2 hover:text-ink">
                      {text}
                    </Link>
                    <span className="shrink-0 text-[12px] text-faint">{relTime(a.ts as string)}</span>
                  </li>
                ) : null;
              })}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
