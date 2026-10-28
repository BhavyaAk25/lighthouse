import { AppFrame } from "@/components/shell";
import { isDemoSafe, requireSession } from "@/lib/auth";
import { dateLabel } from "@/lib/format";
import { PERSONAS } from "@/lib/personas";
import { getPilotClock } from "@/lib/repo";
import { loadPipeline, workFor } from "@/lib/work";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const persona = await requireSession();
  const [demoSafe, clock, pipeline] = await Promise.all([isDemoSafe(), getPilotClock(), loadPipeline()]);
  // how much is waiting for each person (shown in the name menu, so the presenter knows who to switch to)
  const counts = Object.fromEntries(PERSONAS.map((p) => [p.id, p.role === "ADMIN" ? 0 : workFor(p, pipeline).now.length]));
  return (
    <AppFrame persona={persona} queueCount={counts[persona.id] ?? 0} counts={counts} demoSafe={demoSafe} pilotClock={dateLabel(clock)}>
      {children}
    </AppFrame>
  );
}
