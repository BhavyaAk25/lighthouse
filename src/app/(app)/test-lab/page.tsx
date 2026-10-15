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
        subtitle="Fifteen scripted acceptance tests from Deliverable 1 (section 7.2 and objectives OBJ-01 to OBJ-07), run live against the real engine and database. Read-only: nothing is changed."
      />
      <TestRunner />
    </div>
  );
}
