import { getSession, isDemoSafe } from "@/lib/auth";
import { executeRun } from "@/lib/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(_req: Request, ctx: RouteContext<"/api/decisions/[id]/run">) {
  const { id } = await ctx.params;
  const persona = await getSession();
  if (!persona) return new Response("Not signed in", { status: 401 });
  if (persona.role !== "DECISION_OWNER") return new Response("Only the Decision Owner can run the agents.", { status: 403 });
  const mode = (await isDemoSafe()) ? "DEMO_SAFE" : "LIVE_AI";
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        for await (const ev of executeRun(id, { name: persona.name, role: persona.role }, mode)) send(ev);
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
