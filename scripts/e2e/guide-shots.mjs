// Recaptures every screenshot in docs/guide.html by playing the demo once (local dev server, after a reset).
//   npx tsx --conditions=react-server scripts/reset-demo.ts && node scripts/e2e/guide-shots.mjs
import { join } from "node:path";
import { open, ROOT, sleep } from "./cdp.mjs";

const IMG = join(ROOT, "docs", "img");
const b = await open({ width: 1440, height: 900, scale: 1.18 }); // 1700 × 1062 images
await b.cookie("lh_demo_safe", "1");
const shot = (n) => (console.log("shot", n), b.shot(join(IMG, `${n}.jpg`)));
const top = () => b.js("window.scrollTo(0, 0)");
/** scroll so the first element containing `text` sits near the top of the screen */
const scrollTo = async (text, sel = "h2,h3,div,section,p,span", offset = 90) => {
  await b.js(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => e.textContent.includes(${JSON.stringify(text)})).sort((x, y) => x.textContent.length - y.textContent.length)[0]; if (el) window.scrollTo(0, el.getBoundingClientRect().top + scrollY - ${offset}); })()`);
  await sleep(500);
};
const act = (reason) => b.fill("#act textarea", reason);

try {
  await b.go("/login", 8000);
  await b.mouse(625, 470);
  await sleep(3500);
  await shot("login");

  // Hannah
  await b.signIn("Hannah Brooks");
  await shot("hannah-desk");
  await b.go("/decisions/D-2026-001", 3500);
  await b.click("Submit for review", "button");
  for (let i = 0; i < 20 && !(await b.has("Four agents working")); i++) await sleep(150);
  await sleep(1400);
  await scrollTo("Four agents working");
  await shot("running");
  await b.waitGone("Four agents working");
  await sleep(3500);
  await top();
  await shot("hannah-full");

  // Priya
  await b.click("", 'button[aria-label="Switch person"]');
  await sleep(700);
  await shot("switcher");
  await b.js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await sleep(400);
  await b.switchTo("Priya Raman");
  await b.fill('input[placeholder^="Condition"]', "Replace “clinically proven” with “relieves cold & flu symptoms”");
  await act("No substantiation file on record. Approve only with the revised claim wording.");
  await scrollTo("The customer-facing claim");
  await shot("priya-signoff");
  await b.js(`(() => { const bs = [...document.querySelectorAll('#act button')].filter(e => e.textContent.trim() === 'Approve with conditions'); bs[bs.length-1].click(); })()`);
  await b.waitFor("Done. You approved it with conditions", 15000);
  await sleep(800);
  await b.js("document.querySelector('#act').scrollIntoView({ block: 'center' })");
  await sleep(500);
  await shot("priya-done");

  // David
  await b.switchTo("David Okafor");
  await b.go("/home", 3500);
  await shot("david-desk");
  await b.go("/decisions/D-2026-003", 3500);
  await b.click("Re-run my agent");
  await sleep(1500);
  await b.waitGone("Working ·");
  await sleep(2500);
  await b.click("Proceed with conditions", "#act button");
  await sleep(300);
  await act("Supplier confirmed 40% funding after the run; margin recovers if the rollback stays at 28% for 4 weeks.");
  await b.js("document.querySelector('#act').scrollIntoView({ block: 'center' })");
  await sleep(500);
  await shot("david-signoff");
  await b.click("Sign off as proceed with conditions", "#act button");
  await b.waitFor("Done. You changed it", 15000);

  // Maya
  await b.switchTo("Maya Chen");
  await b.go("/home", 3500);
  await shot("maya-desk");
  await b.go("/decisions/D-2026-003", 3500);
  await scrollTo("Analyzed by all four agents", "div", 24);
  await shot("maya-packet");
  await b.click("See the full analysis", "button");
  await sleep(1400);
  await scrollTo("How Lighthouse reconciled", "h3", 90);
  await shot("maya-full");
  await b.go("/decisions/D-2026-006", 3500);
  await scrollTo("Analyzed by all four agents", "div", 24);
  await shot("escalation");
  await b.go("/decisions/D-2026-005", 3500);
  await scrollTo("Analyzed by all four agents", "div", 24);
  await shot("prohibited");
  await b.go("/decisions/D-2026-001", 3500);
  await b.click("All four departments cleared", "#act button");
  await b.click("Approve", "#act button");
  await sleep(900);
  await shot("confirm");
  await b.click("and seal", "[role=dialog] button");
  await sleep(4000);
  await top();
  await shot("approved");
  await b.js("document.querySelector('#act').scrollIntoView({ block: 'center' })");
  await sleep(500);
  await shot("approved-next");

  // the loop
  await b.go("/decisions/D-2026-003", 3500);
  await act("Cut the discount to 18% and resubmit with the supplier funding confirmed.");
  await b.click("Send back", "#act button");
  await sleep(3500);
  await b.switchTo("Hannah Brooks");
  await b.go("/decisions/D-2026-003", 3500);
  await b.click("Revise case", "button");
  await sleep(900);
  await b.js(`(() => { const i = document.querySelector('[role=dialog] input[type=number]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'18'); i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await b.fill('[role=dialog] input[placeholder^="e.g. Removed"]', "Cut discount to 18% per Maya; supplier funding confirmed at 40%.");
  await sleep(400);
  await shot("revise");
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
  await b.click("The strategic value outweighs", "#act button");
  await b.click("Approve", "#act button");
  await sleep(900);
  await b.click("and seal", "[role=dialog] button");
  await sleep(4000);
  await scrollTo("Analyzed by all four agents", "div", 24);
  await shot("overruled");

  await b.go("/flow", 3500);
  await shot("flow");
  await b.go("/overview", 4500);
  await scrollTo("Department sign-offs", "h2,h3", 90);
  await shot("dashboard-signoffs");
  await b.go("/audit", 3000);
  await b.click("Verify chain", "button");
  await sleep(3500);
  await shot("audit");
  await b.go("/roi", 3500);
  await shot("roi");
  await b.switchTo("Priya Raman");
  await b.go("/history", 3500);
  await shot("history");
  await b.switchTo("Jordan Ellis", "4210");
  await b.go("/test-lab", 3000);
  await b.click("Run all tests", "button");
  await sleep(9000);
  await shot("testlab");
} catch (e) {
  console.error("failed:", e.message);
  await b.shot(join(IMG, "..", "zz-failure.jpg"));
} finally {
  console.log("page errors", JSON.stringify(b.errors.slice(0, 3)));
  b.close();
}
