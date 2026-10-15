import { FlowBoard, StageMap } from "@/components/flow";
import { PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { loadFlow } from "@/lib/flow";

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
        subtitle={mine ? `Where every decision is right now. ${mine} ${mine === 1 ? "card is" : "cards are"} waiting on you, outlined in brass.` : "Where every decision is right now, and who has it."}
      />
      <StageMap stages={stages} viewer={persona} linkBase="" />
      <div className="mt-10">
        <FlowBoard stages={stages} viewer={persona} />
      </div>
    </div>
  );
}
