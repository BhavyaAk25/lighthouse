import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import Groq from "groq-sdk";

export type ProviderName = "gemini" | "groq";

export interface LlmRequest {
  label: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}

export interface LlmResult {
  text: string;
  provider: ProviderName;
  model: string;
  latency_ms: number;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public attempts: string[],
  ) {
    super(message);
  }
}

const GROQ_MODELS = (process.env.GROQ_MODELS ?? "openai/gpt-oss-120b,qwen/qwen3.8-27b,openai/gpt-oss-20b")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

let gemini: GoogleGenAI | null = null;
let groq: Groq | null = null;
const geminiClient = () => (gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!, httpOptions: { timeout: 45_000 } }));
const groqClient = () => (groq ??= new Groq({ apiKey: process.env.GROQ_API_KEY!, timeout: 45_000, maxRetries: 0 }));

export const providerConfigured = (p: ProviderName) =>
  p === "gemini" ? Boolean(process.env.GEMINI_API_KEY) : Boolean(process.env.GROQ_API_KEY);

// ---------------------------------------------------------------- Gemini model discovery
let geminiModelPromise: Promise<string> | null = null;
let geminiDown: { until: number; reason: string } | null = null;

function versionOf(name: string) {
  const m = name.match(/gemini-(\d+)(?:\.(\d+))?/);
  return m ? Number(m[1]) * 100 + Number(m[2] ?? 0) : 0;
}

/** Pick the newest stable Flash model this key can use (free tier), unless GEMINI_MODEL is set. */
export function geminiModel(): Promise<string> {
  if (process.env.GEMINI_MODEL) return Promise.resolve(process.env.GEMINI_MODEL);
  geminiModelPromise ??= (async () => {
    try {
      const pager = await geminiClient().models.list({ config: { pageSize: 200 } });
      const names: string[] = [];
      for await (const m of pager) {
        const name = (m.name ?? "").replace(/^models\//, "");
        if ((m.supportedActions ?? []).includes("generateContent")) names.push(name);
      }
      const plain = names.filter((n) => /^gemini-\d+(\.\d+)?-flash$/.test(n));
      const flash = names.filter((n) => /^gemini-[\d.]+-flash/.test(n) && !/(lite|image|tts|live|audio|thinking|exp)/.test(n));
      const pool = plain.length ? plain : flash;
      pool.sort((a, b) => versionOf(b) - versionOf(a));
      return pool[0] ?? "gemini-2.5-flash";
    } catch {
      return "gemini-2.5-flash";
    }
  })();
  return geminiModelPromise;
}

async function callGemini(req: LlmRequest): Promise<LlmResult> {
  const model = await geminiModel();
  const t = Date.now();
  const base = {
    systemInstruction: req.system,
    responseMimeType: "application/json",
    responseJsonSchema: req.schema,
    temperature: 0.2,
    maxOutputTokens: req.maxTokens ?? 1400,
  };
  let res;
  try {
    res = await geminiClient().models.generateContent({
      model,
      contents: req.user,
      config: { ...base, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
    });
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    if (!/thinking/i.test(msg)) throw e;
    res = await geminiClient().models.generateContent({ model, contents: req.user, config: base });
  }
  const text = res.text ?? "";
  if (!text.trim()) throw new Error("Gemini returned an empty response");
  return { text, provider: "gemini", model, latency_ms: Date.now() - t };
}

async function callGroq(req: LlmRequest, model: string): Promise<LlmResult> {
  const t = Date.now();
  const reasoning = /gpt-oss|qwen/.test(model);
  const res = await groqClient().chat.completions.create({
    model,
    messages: [
      { role: "system", content: `${req.system}\n\nReturn ONLY a JSON object that matches this JSON Schema:\n${JSON.stringify(req.schema)}` },
      { role: "user", content: req.user },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_completion_tokens: req.maxTokens ?? 1400,
    ...(reasoning ? { reasoning_effort: "low" as const, include_reasoning: false } : {}),
  });
  const text = res.choices[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("Groq returned an empty response");
  return { text, provider: "groq", model, latency_ms: Date.now() - t };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function retryAfterMs(e: unknown): number | null {
  const err = e as { status?: number; headers?: Record<string, string> | Headers };
  if (err?.status !== 429) return null;
  const h = err.headers;
  const v = h instanceof Headers ? h.get("retry-after") : h?.["retry-after"];
  const s = v ? Number(v) : 2;
  return Number.isFinite(s) ? s * 1000 : 2000;
}

/**
 * Call the provider chain: Gemini (primary, free tier) then Groq models (free tier).
 * A provider that fails is skipped for 60 seconds so a demo never waits on a dead endpoint.
 */
export async function callLlm(req: LlmRequest, prefer: ProviderName[] = ["gemini", "groq"]): Promise<LlmResult> {
  const attempts: string[] = [];
  for (const p of prefer) {
    if (!providerConfigured(p)) {
      attempts.push(`${p}: not configured`);
      continue;
    }
    if (p === "gemini") {
      if (geminiDown && geminiDown.until > Date.now()) {
        attempts.push(`gemini: skipped (${geminiDown.reason})`);
        continue;
      }
      try {
        return await callGemini(req);
      } catch (e) {
        const msg = String((e as Error).message ?? e).slice(0, 160);
        attempts.push(`gemini: ${msg}`);
        geminiDown = { until: Date.now() + 60_000, reason: msg.slice(0, 60) };
      }
    } else {
      for (const m of GROQ_MODELS) {
        try {
          return await callGroq(req, m);
        } catch (e) {
          const wait = retryAfterMs(e);
          if (wait !== null && wait <= 8000) {
            await sleep(wait);
            try {
              return await callGroq(req, m);
            } catch (e2) {
              attempts.push(`groq ${m}: ${String((e2 as Error).message ?? e2).slice(0, 120)}`);
              continue;
            }
          }
          attempts.push(`groq ${m}: ${String((e as Error).message ?? e).slice(0, 120)}`);
        }
      }
    }
  }
  throw new ProviderError(`All AI providers failed for ${req.label}`, attempts);
}

export async function providerStatus() {
  const out: { provider: ProviderName; configured: boolean; ok: boolean; model?: string; detail?: string; latency_ms?: number }[] = [];
  for (const p of ["gemini", "groq"] as ProviderName[]) {
    if (!providerConfigured(p)) {
      out.push({ provider: p, configured: false, ok: false, detail: "API key not set" });
      continue;
    }
    const t = Date.now();
    try {
      if (p === "gemini") {
        const model = await geminiModel();
        await callGemini({ label: "health", system: "Reply with JSON.", user: 'Return {"ok": true}', schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }, maxTokens: 50 });
        out.push({ provider: p, configured: true, ok: true, model, latency_ms: Date.now() - t });
      } else {
        const r = await callGroq({ label: "health", system: "Reply with JSON.", user: 'Return {"ok": true}', schema: { type: "object", properties: { ok: { type: "boolean" } } }, maxTokens: 50 }, GROQ_MODELS[0]);
        out.push({ provider: p, configured: true, ok: true, model: r.model, latency_ms: Date.now() - t });
      }
    } catch (e) {
      out.push({ provider: p, configured: true, ok: false, detail: String((e as Error).message ?? e).slice(0, 200), latency_ms: Date.now() - t });
    }
  }
  return out;
}

export const MODEL_LABEL = (provider: string, model: string) => {
  if (provider === "rules-engine") return "Rules engine";
  if (provider === "replay") return `Replay · ${model}`;
  const pretty = model.replace(/^openai\//, "").replace(/^qwen\//, "").replace(/^gemini-/, "Gemini ").replace(/-flash/, " Flash");
  return provider === "groq" ? `Groq · ${pretty}` : pretty;
};
