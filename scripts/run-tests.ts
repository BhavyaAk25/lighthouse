import "./env";
import { runAcceptanceTests } from "@/lib/testlab";
// Runs the 18 acceptance tests from the command line (same as Test lab → Run all tests).
// npx tsx --conditions=react-server scripts/run-tests.ts
runAcceptanceTests().then((r) => {
  for (const t of r) console.log(`${t.passed ? "PASS" : "FAIL"} ${t.id} ${t.name}${t.passed ? "" : `\n    ${t.details.join("\n    ")}`}`);
  const ok = r.filter((t) => t.passed).length;
  console.log(`${ok} / ${r.length}`);
  process.exit(ok === r.length ? 0 : 1);
});
