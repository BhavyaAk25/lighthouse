import "server-only";
import { DEPT_OF, EXECUTIVE, LEAD_OF, type Persona } from "./personas";
import { DEPT_NAME, type LaneState } from "./signoff";
import type { AgentType } from "./types";
import { AGENTS } from "./types";
import { loadPipeline, workFor } from "./work";

export type StageKey = "proposed" | "signoff" | "decide" | "sealed";

export interface FlowLane {
  dept: AgentType;
  state: LaneState;
  lead: string;
}

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
  lanes: FlowLane[];
}

export interface DeptCount {
  dept: AgentType;
  name: string;
  lead: string;
  pending: number;
  isYours: boolean;
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
  /** sign-off stage only: open lanes per department */
  depts?: DeptCount[];
}

const STAGE_OF: Record<string, StageKey> = {
  DRAFT: "proposed",
  REVISION_REQUESTED: "proposed",
  IN_REVIEW: "signoff",
  READY_FOR_DECISION: "decide",
  APPROVED: "sealed",
  REJECTED: "sealed",
};

/** The live pipeline, stage by stage, from the viewer's point of view (same data as the desk). */
export async function loadFlow(persona: Persona): Promise<FlowStage[]> {
  const pipeline = await loadPipeline();
  const work = workFor(persona, pipeline);
  const mine = new Map(work.now.map((w) => [w.c.decision_id, w]));
  const myDept = DEPT_OF[persona.role];
  const isExec = persona.role === "DECISION_OWNER";
  const stages: FlowStage[] = [
    { key: "proposed", label: "Proposed", ownerRole: "Proposer", ownerName: "", isYours: pipeline.some((c) => STAGE_OF[c.status] === "proposed" && c.owner === persona.name), count: 0, mineCount: 0, items: [] },
    { key: "signoff", label: "Department sign-off", ownerRole: "Four leads, in parallel", ownerName: "", isYours: !!myDept, count: 0, mineCount: 0, items: [] },
    { key: "decide", label: "Executive decision", ownerRole: "Executive", ownerName: EXECUTIVE.name, isYours: isExec, count: 0, mineCount: 0, items: [] },
    { key: "sealed", label: "Sealed", ownerRole: "Lighthouse", ownerName: "", isYours: false, count: 0, mineCount: 0, items: [] },
  ];
  const byKey = Object.fromEntries(stages.map((s) => [s.key, s])) as Record<StageKey, FlowStage>;
  for (const c of pipeline) {
    const key = STAGE_OF[c.status];
    if (!key) continue;
    const w = mine.get(c.decision_id);
    const pending = c.lanes.filter((l) => l.state === "PENDING" || l.state === "OVERDUE");
    byKey[key].items.push({
      decision_id: c.decision_id,
      title: c.title,
      status: c.status,
      rec: c.rec,
      note: w ? w.why : key === "proposed" ? (c.status === "REVISION_REQUESTED" ? "Sent back for changes" : c.about) : null,
      mine: !!w,
      action: w ? w.action : null,
      waitingOn: w || key === "sealed" ? null : key === "proposed" ? c.owner.split(" ")[0] : key === "signoff" ? pending.map((l) => DEPT_NAME[l.dept]).join(", ") || "Lighthouse" : "Maya",
      href: `/decisions/${c.decision_id}${w ? "#act" : ""}`,
      final: c.final,
      lanes: c.lanes.map((l) => ({ dept: l.dept, state: l.state, lead: l.lead.name })),
    });
  }
  byKey.signoff.depts = AGENTS.map((d) => ({
    dept: d,
    name: DEPT_NAME[d],
    lead: LEAD_OF[d].name,
    pending: pipeline.filter((c) => c.status === "IN_REVIEW" && c.lanes.some((l) => l.dept === d && (l.state === "PENDING" || l.state === "OVERDUE"))).length,
    isYours: myDept === d,
  }));
  for (const s of stages) {
    s.items.sort((a, b) => Number(b.mine) - Number(a.mine));
    s.count = s.items.length;
    s.mineCount = s.items.filter((i) => i.mine).length;
  }
  return stages;
}
