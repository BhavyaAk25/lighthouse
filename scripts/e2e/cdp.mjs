// Minimal Chrome DevTools Protocol driver (Node 22 global WebSocket): drives headless Chrome for demo checks and screenshots.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const BASE = process.env.LHBASE ?? "http://localhost:3000";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function open({ width = 1440, height = 900, scale = 1 } = {}) {
  const port = 9300 + Math.floor(Math.random() * 600);
  const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "lh-e2e-"))}`, "--no-first-run", "--hide-scrollbars", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "about:blank"], { stdio: "ignore" });
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(200);
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page");
    } catch {}
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener("message", (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) (pending.get(d.id)(d), pending.delete(d.id));
    if (d.method === "Runtime.exceptionThrown") errors.push(String(d.params.exceptionDetails?.exception?.description ?? d.params.exceptionDetails?.text).slice(0, 300));
    if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(d.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
  });
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, (d) => (d.error ? rej(new Error(`${method}: ${d.error.message}`)) : res(d.result)));
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });
  const js = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.value;
  const b = {
    send,
    js,
    errors,
    async cookie(name, value) {
      await send("Network.setCookies", { cookies: [{ name, value, domain: new URL(BASE).hostname, path: "/" }] });
    },
    async go(path, wait = 3000) {
      await send("Page.navigate", { url: `${BASE}${path}` });
      await sleep(wait);
    },
    async click(text, sel = "button,a") {
      const ok = await js(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.includes(${JSON.stringify(text)})); if (!el) return false; el.click(); return true; })()`);
      if (!ok) throw new Error(`no element: ${text}`);
    },
    async fill(selector, value) {
      await js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.focus(); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await send("Input.insertText", { text: value });
    },
    async mouse(x, y) {
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
    },
    text: async () => (await js("document.querySelector('main')?.innerText ?? document.body.innerText")) ?? "",
    has: async (t) => ((await js("document.body.innerText")) ?? "").toLowerCase().includes(t.toLowerCase()),
    async waitFor(t, ms = 30000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (await b.has(t)) return true;
        await sleep(400);
      }
      throw new Error(`timeout waiting for: ${t}`);
    },
    async waitGone(t, ms = 90000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (!(await b.has(t))) return true;
        await sleep(500);
      }
      throw new Error(`still showing: ${t}`);
    },
    async signIn(name) {
      await b.go("/login", 3500);
      await b.click(name, "button");
      await sleep(3500);
    },
    async switchTo(name, pin) {
      await b.click("", 'button[aria-label="Switch person"]');
      await sleep(500);
      await js(`[...document.querySelectorAll('[data-radix-popper-content-wrapper] button')].find(e => e.textContent.includes(${JSON.stringify(name)})).click()`);
      if (pin) {
        await sleep(400);
        await b.fill('input[placeholder="Admin PIN"]', pin);
        await b.click("Go", "button");
      }
      await sleep(3200);
    },
    async shot(file, { full = false, maxHeight = 3200, toasts = false } = {}) {
      await js(`document.querySelectorAll('nextjs-portal${toasts ? "" : ", [data-sonner-toaster]"}').forEach(e => e.style.display = 'none')`);
      // viewport shots capture what is on screen (keeps the scroll position); full shots capture the whole page from the top
      const r = full
        ? await send("Page.captureScreenshot", { format: "jpeg", quality: 80, clip: { x: 0, y: 0, width: await js("innerWidth"), height: Math.min(maxHeight, await js("document.documentElement.scrollHeight")), scale: 1 }, captureBeyondViewport: true })
        : await send("Page.captureScreenshot", { format: "jpeg", quality: 82 });
      await js("document.querySelectorAll('[data-sonner-toaster]').forEach(e => e.style.display = '')");
      const { writeFileSync } = await import("node:fs");
      writeFileSync(file, Buffer.from(r.data, "base64"));
    },
    close() {
      ws.close();
      proc.kill();
    },
  };
  return b;
}

/** Make a signed session cookie for a persona (same secret as the app) — for quick page checks. */
export function sessionFor(persona) {
  return execFileSync("npx", ["tsx", "scripts/cookie.ts", persona], { cwd: ROOT }).toString().trim();
}
