/**
 * Executive decision rules (single source of truth for the UI, server actions and tests).
 *  - Approval needs every department lane resolved. Legal can never be skipped or overruled.
 *  - A Sales, Finance or Operations block can be overruled by the executive with a written reason.
 *  - A lane that is overdue (past the sign-off SLA) escalates: the executive may decide without it, with a reason.
 *  - Going against Lighthouse's recommendation is an override and needs a reason.
 */
import { DEPT_NAME, laneSummary, type Lane } from "./signoff";
import type { AgentType } from "./types";

export interface GovPacket {
  synthesized_recommendation: string;
  risk_level: string;
}

export type Decision = "APPROVED" | "REJECTED" | "REVISION_REQUESTED";

export type DecisionCheck =
  | { ok: true; override: boolean; overruled: AgentType[]; bypassed: AgentType[] }
  | { ok: false; error: string };

const names = (ls: Lane[]) => ls.map((l) => `${DEPT_NAME[l.dept]} (${l.lead.name})`).join(", ");

/** Why approval is locked, if it is. Shown on the decision panel before the executive clicks. */
export function approvalLock(lanes: Lane[]): string | null {
  const legal = lanes.find((l) => l.dept === "LEGAL");
  const sum = laneSummary(lanes);
  if (!sum.analyzed) return "The agents have not analyzed this case yet.";
  if (legal?.state === "PROHIBITED") return "Locked: a Legal rule prohibits this case.";
  if (legal?.state === "BLOCKED") return `Locked: ${legal.lead.name} (Legal) rejected it. Legal blocks cannot be overruled.`;
  if (legal && !legal.resolved) return `Locked until ${legal.lead.name} (Legal) signs off.`;
  const waiting = sum.pending.filter((l) => !l.escalated);
  if (waiting.length) return `Waiting on ${names(waiting)} to sign off.`;
  return null;
}

export function decisionCheck(p: GovPacket, lanes: Lane[], decision: Decision, rationale: string): DecisionCheck {
  const sum = laneSummary(lanes);
  if (!sum.analyzed) return { ok: false, error: "The agents have not analyzed this case yet." };
  const text = rationale.trim();
  const rec = p.synthesized_recommendation;
  const supportive = rec === "PROCEED" || rec === "PROCEED_WITH_CONDITIONS";
  let overruled: AgentType[] = [];
  let bypassed: AgentType[] = [];

  if (decision === "APPROVED") {
    const lock = approvalLock(lanes);
    if (lock) return { ok: false, error: lock.replace(/^Locked: /, "Approval is locked: ") };
    overruled = sum.blocked.filter((l) => l.dept !== "LEGAL").map((l) => l.dept);
    bypassed = sum.pending.filter((l) => l.escalated).map((l) => l.dept);
    if (overruled.length && text.length < 20)
      return { ok: false, error: `You are overruling ${names(sum.blocked.filter((l) => l.dept !== "LEGAL"))}. Give a reason of at least 20 characters.` };
    if (bypassed.length && text.length < 20)
      return { ok: false, error: `${names(sum.pending)} did not sign off in time. Give a reason of at least 20 characters to decide without them.` };
  }
  const override = (decision === "APPROVED" && !supportive) || (decision === "REJECTED" && supportive) || overruled.length > 0 || bypassed.length > 0;
  if ((override || p.risk_level === "HIGH" || p.risk_level === "CRITICAL") && decision !== "REVISION_REQUESTED" && text.length < 20)
    return {
      ok: false,
      error: override ? "This goes against Lighthouse’s recommendation: a reason of at least 20 characters is required." : "High-risk decisions need a reason (20+ characters).",
    };
  if (decision === "REVISION_REQUESTED" && text.length < 10) return { ok: false, error: "Say what should change (10+ characters)." };
  return { ok: true, override, overruled, bypassed };
}
