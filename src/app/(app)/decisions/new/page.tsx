import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPilotClock } from "@/lib/repo";
import { NewCaseForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New decision" };

export default async function NewDecisionPage() {
  const persona = await requireSession();
  if (persona.role === "ADMIN") redirect("/home");
  const [cats, regions, clock] = await Promise.all([
    db()`select category_id, name, provenance, gross_margin_pct, regulated from categories order by category_id`,
    db()`select region_id, name, state, store_count from regions order by region_id`,
    getPilotClock(),
  ]);
  return (
    <div className="mx-auto max-w-[920px]">
      <PageHeader
        eyebrow={persona.role === "DECISION_OWNER" ? "New case" : "Propose a case"}
        title="Describe the decision"
        subtitle="Choose what, where and how much. When you create it, all four agents run straight away."
      />
      <NewCaseForm
        clock={clock}
        cats={cats.map((c) => ({ id: String(c.category_id), name: String(c.name), provenance: String(c.provenance), margin: Number(c.gross_margin_pct), regulated: Boolean(c.regulated) }))}
        regions={regions.map((r) => ({ id: String(r.region_id), name: String(r.name), state: String(r.state), stores: Number(r.store_count) }))}
      />
    </div>
  );
}
