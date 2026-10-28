// Plays the whole class demo in headless Chrome and checks each hand-off.
// Run after a reset:  npx tsx --conditions=react-server scripts/reset-demo.ts && node scripts/e2e/demo-run.mjs [outDir]
// LHBASE=https://… to run against the live site (admin steps are skipped there). LIVE=1 for live AI instead of replay.
import { mkdirSync } from "node:fs";
import { BASE, open, sleep } from "./cdp.mjs";

const out = process.argv[2] ?? "/tmp/lighthouse-demo-run";
mkdirSync(out, { recursive: true });
const local = BASE.includes("localhost");
const results = [];
const check = (name, ok, detail = "") => (results.push({ name, ok, detail }), console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` · ${detail}` : ""}`));

const b = await open();
await b.cookie("lh_demo_safe", process.env.LIVE ? "0" : "1");
const shot = (n) => b.shot(`${out}/${n}.jpg`, { full: true });
const act = (reason) => b.fill("#act textarea", reason);
const panel = async () => ((await b.js("document.querySelector('#act')?.innerText")) ?? "").replace(/\s+/g, " ");
const confirmSeal = async () => {
  await sleep(600);
  await b.click("and seal", "[role=dialog] button");
  await sleep(3800);
};

try {
  // 1. sign-in, light the lighthouse
  await b.go("/login", 8000);
  await b.mouse(625, 470);
  await sleep(3000);
  await shot("01-login");
  // 2. Hannah submits
  await b.signIn("Hannah Brooks");
  await shot("02-hannah-desk");
  await b.go("/decisions/D-2026-001", 3500);
  await b.click("Submit for review", "button");
  await sleep(2500);
  await b.waitGone("Four agents working");
  await sleep(3500);
  check("Hannah stays on the full analysis", (await b.js("location.search")).includes("view=full"));
  check("Brief shown after submit", await b.has("Lighthouse recommends"));
  await shot("03-hannah-full");
  // 3. Priya signs Legal
  await b.switchTo("Priya Raman");
  check("Switcher keeps the page", (await b.js("location.pathname")) === "/decisions/D-2026-001");
  await b.fill('input[placeholder^="Condition"]', "Replace “clinically proven” with “relieves cold & flu symptoms”");
  await act("No substantiation file on record. Approve only with the revised claim wording.");
  await shot("04-priya-form");
  await b.js(`(() => { const bs = [...document.querySelectorAll('#act button')].filter(e => e.textContent.trim() === 'Approve with conditions'); bs[bs.length-1].click(); })()`);
  await b.waitFor("Done. You approved it with conditions", 15000);
  check("Priya gets a Next card", /next for you/i.test(await panel()));
  await shot("05-priya-done");
  // 4. David adjusts Finance
  await b.switchTo("David Okafor");
  await b.go("/home", 3500);
  check("David sees what changed", await b.has("Since you last looked"));
  await shot("06-david-desk");
  await b.go("/decisions/D-2026-003", 3500);
  await b.click("Re-run my agent");
  await sleep(1500);
  await b.waitGone("Working ·");
  await sleep(2500);
  await b.click("Proceed with conditions", "#act button");
  await sleep(300);
  await act("Supplier confirmed 40% funding after the run; margin recovers if the rollback stays at 28% for 4 weeks.");
  await shot("07-david-form");
  await b.click("Sign off as proceed with conditions", "#act button");
  await b.waitFor("Done. You changed it", 15000);
  // 5. Maya
  await b.switchTo("Maya Chen");
  await b.go("/home", 3500);
  check("Maya's desk previews AI vs signed", await b.has("AI alone said hold"));
  await shot("08-maya-desk");
  await b.go("/decisions/D-2026-003", 3500);
  check("Brief explains what people changed", await b.has("What people changed"));
  await shot("09-maya-003-brief");
  await b.click("See the full analysis", "button");
  await sleep(1200);
  await shot("10-maya-003-full");
  await b.go("/decisions/D-2026-006", 3500);
  await shot("11-maya-006");
  await b.go("/decisions/D-2026-005", 3500);
  check("005 approval locked", await b.js("[...document.querySelectorAll('#act button')].find(x => x.textContent.includes('Approve'))?.disabled"));
  // approve 001 with the seal confirmation
  await b.go("/decisions/D-2026-001", 3500);
  await b.click("All four departments cleared", "#act button"); // a reason starter
  check("Reason starter fills the reason", ((await b.js("document.querySelector('#act textarea').value")) ?? "").length > 20);
  await b.click("Approve", "#act button");
  await sleep(800);
  check("Seal confirmation shown", await b.has("sealed in the audit trail"));
  await shot("12-maya-confirm");
  await confirmSeal();
  check("001 approved", await b.has("Approved by Maya Chen"));
  await shot("13-maya-approved");
  // 6. the loop: send back, revise, block, overrule
  await b.go("/decisions/D-2026-003", 3500);
  await act("Cut the discount to 18% and resubmit with the supplier funding confirmed.");
  await b.click("Send back", "#act button");
  await sleep(3500);
  await b.switchTo("Hannah Brooks");
  await b.go("/home", 3500);
  check("Hannah sees Revise the case", await b.has("Revise the case"));
  await b.go("/decisions/D-2026-003", 3500);
  await b.click("Revise case", "button");
  await sleep(800);
  await b.js(`(() => { const i = document.querySelector('[role=dialog] input[type=number]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'18'); i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await b.fill('[role=dialog] input[placeholder^="e.g. Removed"]', "Cut discount to 18% per Maya; supplier funding confirmed at 40%.");
  await b.click("Create revision", "[role=dialog] button");
  await sleep(2500);
  await b.waitGone("Four agents working");
  await sleep(3500);
  await b.switchTo("David Okafor");
  await b.go("/decisions/D-2026-003", 3500);
  if (await b.has("Your sign-off")) {
    await act("Even at 18% the category loses money; I can’t support it from Finance.");
    await b.click("Confirm the agent", "#act button");
    await b.waitFor("Done. You", 15000);
  }
  await b.switchTo("Maya Chen");
  await b.go("/decisions/D-2026-003", 3500);
  await shot("14-maya-overrule");
  await act("Strategic traffic driver for Q4; I accept the margin hit with supplier funding confirmed.");
  await b.click("Approve", "#act button");
  await confirmSeal();
  check("Overrule recorded", (await b.has("Human override")) || (await b.has("Approved by Maya Chen")));
  // 7. the rest
  await b.go("/flow", 3500);
  await shot("15-flow");
  await b.go("/overview", 4000);
  await shot("16-dashboard");
  await b.go("/audit", 3000);
  await b.click("Verify chain", "button");
  await sleep(3500);
  check("Audit chain verifies", await b.has("verified"));
  if (local) {
    await b.switchTo("Jordan Ellis", "4210");
    await b.go("/test-lab", 3000);
    await b.click("Run all tests", "button");
    await sleep(9000);
    check("Acceptance tests", await b.has("18 / 18 acceptance tests passed"));
    await shot("17-tests");
  }
} catch (e) {
  check("run completed", false, e.message);
  await shot("zz-failure");
} finally {
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} / ${results.length} checks passed · page errors: ${b.errors.length ? JSON.stringify(b.errors.slice(0, 3)) : "none"}`);
  b.close();
  process.exit(failed ? 1 : 0);
}
