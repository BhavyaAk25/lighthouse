import { AppFrame } from "@/components/shell";
import { isDemoSafe, requireSession } from "@/lib/auth";
import { deskCount } from "@/lib/desk";
import { dateLabel } from "@/lib/format";
import { getPilotClock } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const persona = await requireSession();
  const [demoSafe, clock] = await Promise.all([isDemoSafe(), getPilotClock()]);
  const n = await deskCount(persona);
  return (
    <AppFrame persona={persona} queueCount={Number(n)} demoSafe={demoSafe} pilotClock={dateLabel(clock)}>
      {children}
    </AppFrame>
  );
}
