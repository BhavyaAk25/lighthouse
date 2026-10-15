import { AppFrame } from "@/components/shell";
import { isDemoSafe, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateLabel } from "@/lib/format";
import { getPilotClock } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const persona = await requireSession();
  const [demoSafe, clock] = await Promise.all([isDemoSafe(), getPilotClock()]);
  const sql = db();
  const [{ n }] =
    persona.role === "LEGAL_REVIEWER"
      ? await sql`select count(*)::int n from decision_cases where status = 'AWAITING_LEGAL_REVIEW'`
      : persona.role === "DECISION_OWNER"
        ? await sql`select count(*)::int n from decision_cases where status in ('READY_FOR_DECISION','DRAFT','REVISION_REQUESTED') and decision_id like 'D-2026-%'
                    or status = 'READY_FOR_DECISION'`
        : await sql`select count(*)::int n from decision_cases where status in ('READY_FOR_DECISION','AWAITING_LEGAL_REVIEW')`;
  return (
    <AppFrame persona={persona} queueCount={Number(n)} demoSafe={demoSafe} pilotClock={dateLabel(clock)}>
      {children}
    </AppFrame>
  );
}
