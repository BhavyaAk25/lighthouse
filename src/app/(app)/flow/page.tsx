import { FlowBoard, StageMap } from "@/components/flow";
import { PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { loadFlow } from "@/lib/flow";
import { DEPT_OF } from "@/lib/personas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Flow" };

export default async function FlowPage() {
  const persona = await requireSession();
  const stages = await loadFlow(persona);
  const mine = stages.reduce((s, x) => s + x.mineCount, 0);
  return (
    <div>
      <PageHeader
        title="Flow"
        subtitle={
          mine
            ? `Every live case and whose turn it is. The four departments sign off in parallel. Your ${mine} ${mine === 1 ? "card is" : "cards are"} outlined in brass.`
            : "Every live case and whose turn it is. The four departments sign off in parallel. Nothing is your turn right now."
        }
      />
      <StageMap stages={stages} linkBase="" />
      <div className="mt-10">
        <FlowBoard stages={stages} highlight={DEPT_OF[persona.role]} />
      </div>
    </div>
  );
}
