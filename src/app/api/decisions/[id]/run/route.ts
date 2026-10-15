import { getSession, isDemoSafe } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEPT_OF } from "@/lib/personas";
import { executeRun } from "@/lib/runs";
import { AGENTS, type AgentType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/decisions/:id/run            submit the case: all four agents run (proposer on a draft, or the executive)
 * POST /api/decisions/:id/run?agent=X    re-run one department's agent (that department's lead, or the executive)
 */
export async function POST(req: Request, ctx: RouteContext<"/api/decisions/[id]/run">) {
  const { id } = await ctx.params;
  const persona = await getSession();
  if (!persona) return new Response("Not signed in", { status: 401 });
  const agentParam = new URL(req.url).searchParams.get("agent")?.toUpperCase() ?? null;
  const only = agentParam && (AGENTS as readonly string[]).includes(agentParam) ? (agentParam as AgentType) : null;
  const [c] = await db()`select created_by, status from decision_cases where decision_id = ${id}`;
  if (!c) return new Response("Case not found", { status: 404 });
  const exec = persona.role === "DECISION_OWNER";
  if (only) {
    if (!exec && DEPT_OF[persona.role] !== only) return new Response(`Only the ${only.toLowerCase()} lead can re-run the ${only.toLowerCase()} agent.`, { status: 403 });
  } else {
    const proposer = c.created_by === persona.name && ["DRAFT", "REVISION_REQUESTED"].includes(String(c.status));
    if (!exec && !proposer) return new Response("Only the person who proposed this case (or the executive) can submit it.", { status: 403 });
  }
  const mode = (await isDemoSafe()) ? "DEMO_SAFE" : "LIVE_AI";
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        for await (const ev of executeRun(id, { name: persona.name, role: persona.role }, mode, { only: only ?? undefined })) send(ev);
      } catch (e) {
        send({ type: "error", message: String((e as Error).message ?? e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
