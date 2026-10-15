import { InsightTabs } from "@/components/insight-tabs";
import { PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { RoiCalculator } from "./calculator";

export const dynamic = "force-dynamic";
export const metadata = { title: "ROI model" };

export default async function RoiPage() {
  await requireSession();
  const [o] = await db()`
    select round(count(*) / 10.0)::int as per_month,
           round(100.0 * avg(case when l.conflict_severity in ('MATERIAL','HARD_STOP') then 1 else 0 end), 1)::float as conflict_pct,
           round(100.0 * avg(case when l.requires_legal_review then 1 else 0 end), 1)::float as legal_pct,
           round(100.0 * avg(case when l.override_flag then 1 else 0 end), 1)::float as override_pct
    from decision_cases c join lighthouse_decisions l using (decision_id)`;
  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Illustrative pilot economics. Every input is an assumption you can move." />
      <InsightTabs active="roi" />
      <RoiCalculator observed={{ perMonth: Number(o.per_month), conflictPct: Number(o.conflict_pct), legalPct: Number(o.legal_pct), overridePct: Number(o.override_pct) }} />
    </div>
  );
}
