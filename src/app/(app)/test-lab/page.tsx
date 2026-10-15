import { PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { TestRunner } from "./runner";

export const dynamic = "force-dynamic";
export const metadata = { title: "Test lab" };

export default async function TestLab() {
  await requireSession();
  return (
    <div>
      <PageHeader
        title="Test lab"
        subtitle="Fifteen acceptance tests from Deliverable 1, run live."
      />
      <TestRunner />
    </div>
  );
}
