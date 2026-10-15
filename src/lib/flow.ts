import "server-only";
import type { Persona } from "./personas";
import { loadPipeline, workFor } from "./work";

export type StageKey = "analyze" | "legal" | "decide" | "sealed";

export interface FlowItem {
  decision_id: string;
  title: string;
  status: string;
  rec: string | null;
  note: string | null;
  mine: boolean;
  action: string | null;
  waitingOn: string | null;
  href: string;
  final: string | null;
}

export interface FlowStage {
  key: StageKey;
  label: string;
  ownerRole: string;
  ownerName: string;
  isYours: boolean;
  count: number;
  mineCount: number;
  items: FlowItem[];
}

const STAGE_OF: Record<string, StageKey> = {
  DRAFT: "analyze",
  REVISION_REQUESTED: "analyze",
  AWAITING_LEGAL_REVIEW: "legal",
  READY_FOR_DECISION: "decide",
  APPROVED: "sealed",
  REJECTED: "sealed",
};

/** The live pipeline, stage by stage, from the viewer's point of view (same data as the desk). */
export async function loadFlow(persona: Persona): Promise<FlowStage[]> {
  const pipeline = await loadPipeline();
  const work = workFor(persona, pipeline);
  const mine = new Map(work.now.map((w) => [w.c.decision_id, w]));
  const owner = pipeline[0]?.owner ?? "Maya Chen";
  const isOwner = persona.role === "DECISION_OWNER";
  const stages: FlowStage[] = [
    { key: "analyze", label: "Agents analyze", ownerRole: "Decision owner", ownerName: owner, isYours: isOwner, count: 0, mineCount: 0, items: [] },
    { key: "legal", label: "Legal review", ownerRole: "Legal", ownerName: "Priya Raman", isYours: persona.role === "LEGAL_REVIEWER", count: 0, mineCount: 0, items: [] },
    { key: "decide", label: "Decision", ownerRole: "Decision owner", ownerName: owner, isYours: isOwner, count: 0, mineCount: 0, items: [] },
    { key: "sealed", label: "Sealed", ownerRole: "Lighthouse", ownerName: "", isYours: false, count: 0, mineCount: 0, items: [] },
  ];
  const byKey = Object.fromEntries(stages.map((s) => [s.key, s])) as Record<StageKey, FlowStage>;
  for (const c of pipeline) {
    const key = STAGE_OF[c.status];
    if (!key) continue;
    const w = mine.get(c.decision_id);
    byKey[key].items.push({
      decision_id: c.decision_id,
      title: c.title,
      status: c.status,
      rec: c.rec,
      note: w ? w.why : key === "legal" && c.top_rule ? `Flagged: ${c.top_rule}` : null,
      mine: !!w,
      action: w ? w.action : null,
      waitingOn: w || key === "sealed" ? null : key === "legal" ? "Legal" : "Decision owner",
      href: `/decisions/${c.decision_id}${w ? "#act" : ""}`,
      final: c.final,
    });
  }
  for (const s of stages) {
    s.items.sort((a, b) => Number(b.mine) - Number(a.mine));
    s.count = s.items.length;
    s.mineCount = s.items.filter((i) => i.mine).length;
  }
  return stages;
}
