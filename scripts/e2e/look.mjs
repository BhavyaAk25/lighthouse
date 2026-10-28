// Screenshot pages as one person: node scripts/e2e/look.mjs "Maya Chen" outdir "/home|desk" "/decisions/D-2026-003|case"
import { open } from "./cdp.mjs";
const [who, out, ...pages] = process.argv.slice(2);
const b = await open();
await b.cookie("lh_demo_safe", "1");
try {
  await b.signIn(who);
  for (const p of pages) {
    const [path, name] = p.split("|");
    await b.go(path, 3500);
    await b.shot(`${out}/${name}.jpg`, { full: true });
    console.log("shot", name);
  }
} finally {
  console.log("errors", JSON.stringify(b.errors.slice(0, 3)));
  b.close();
}
