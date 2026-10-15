import "./env";
import { resetDemoState } from "@/lib/demo";
// Same as Rules & agents → Demo controls → Reset demo cases. `npx tsx scripts/reset-demo.ts`
resetDemoState({ name: "Jordan Ellis", role: "ADMIN" }).then((r) => console.log(`reset ${r.cases} cases`)).catch((e) => (console.error(e), process.exit(1)));
