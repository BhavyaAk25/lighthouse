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
        subtitle="Eighteen acceptance tests: Deliverable 1’s criteria plus the department sign-off rules, run live against the real engine and database."
      />
      <TestRunner />
    </div>
  );
}
