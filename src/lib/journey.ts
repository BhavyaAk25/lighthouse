/**
 * The decision journey: who holds a case at each step and where it is now.
 * Proposed -> agents analyze (automatic) -> four departments sign off in parallel -> executive decides -> sealed.
 * Pure function so it can run on the server or the client.
 */
import { EXECUTIVE } from "./personas";
import { DEPT_NAME, laneSummary, type Lane } from "./signoff";

export type StepState = "done" | "current" | "upcoming" | "skipped" | "blocked";
export type StepKey = "created" | "analyze" | "signoff" | "decide" | "record";

export interface JourneyStep {
  key: StepKey;
  label: string;
  who: string;
  role: string; // persona role or "AI" / "SYSTEM" / "LEADS"
  state: StepState;
  detail: string;
  at?: string | null;
  lanes?: Lane[];
}

export interface JourneyInput {
  status: string;
  revision: number;
  created_at: string;
  created_by: string;
  hasPacket: boolean;
  analyzedAt?: string | null;
  lanes: Lane[];
  final?: { decision: string; by: string | null; at: string | null } | null;
}

export function buildJourney(i: JourneyInput): JourneyStep[] {
  const finalD = i.final?.decision ?? null;
  const decided = finalD === "APPROVED" || finalD === "REJECTED";
  const draft = i.status === "DRAFT" || i.status === "REVISION_REQUESTED";
  const sum = laneSummary(i.lanes);

  const created: JourneyStep = {
    key: "created",
    label: "Proposed",
    who: i.created_by,
    role: "PROPOSER",
    state: draft ? "current" : "done",
    detail: i.status === "REVISION_REQUESTED" ? "Sent back for changes" : draft ? (i.revision > 1 ? `Revision ${i.revision} · not submitted` : "Not submitted yet") : i.revision > 1 ? `Revision ${i.revision}` : "Submitted",
    at: null,
  };
  const analyze: JourneyStep = {
    key: "analyze",
    label: "Agents analyze",
    who: "4 AI agents",
    role: "AI",
    state: i.hasPacket && !draft ? "done" : "upcoming",
    detail: i.hasPacket && !draft ? "Automatic on submit" : "Runs on submit",
    at: i.hasPacket && !draft ? i.analyzedAt : null,
  };
  const legal = i.lanes.find((l) => l.dept === "LEGAL");
  const legalStop = legal?.state === "PROHIBITED" || legal?.state === "BLOCKED";
  const signoff: JourneyStep = {
    key: "signoff",
    label: "Department sign-off",
    who: "4 department leads",
    role: "LEADS",
    lanes: i.lanes,
    state: !i.hasPacket || draft ? "upcoming" : legalStop ? "blocked" : sum.pending.length && !decided ? "current" : "done",
    detail:
      !i.hasPacket || draft
        ? "Only where an agent raises a concern"
        : legalStop
          ? legal?.state === "PROHIBITED"
            ? "Legal rule prohibits it"
            : "Rejected by Legal"
          : sum.pending.length && !decided
            ? `${sum.cleared} of 4 cleared · waiting on ${sum.pending.map((l) => DEPT_NAME[l.dept]).join(", ")}`
            : `All cleared${sum.auto ? ` · ${sum.auto} automatically` : ""}`,
  };
  const decide: JourneyStep = decided
    ? { key: "decide", label: "Executive decides", who: i.final?.by ?? EXECUTIVE.name, role: "DECISION_OWNER", state: "done", detail: finalD === "APPROVED" ? "Approved" : "Rejected", at: i.final?.at }
    : !i.hasPacket || draft
      ? { key: "decide", label: "Executive decides", who: EXECUTIVE.name, role: "DECISION_OWNER", state: "upcoming", detail: "Approve, reject or send back" }
      : sum.ready || sum.escalatable || legalStop
        ? { key: "decide", label: "Executive decides", who: EXECUTIVE.name, role: "DECISION_OWNER", state: "current", detail: sum.escalatable && !sum.ready ? "Sign-off overdue: can decide" : "Approve, reject or send back" }
        : { key: "decide", label: "Executive decides", who: EXECUTIVE.name, role: "DECISION_OWNER", state: "upcoming", detail: "After sign-off" };
  const record: JourneyStep = decided
    ? { key: "record", label: "Sealed in audit", who: "Lighthouse", role: "SYSTEM", state: "done", detail: "Hash-chained", at: i.final?.at }
    : { key: "record", label: "Sealed in audit", who: "Lighthouse", role: "SYSTEM", state: "upcoming", detail: "After the decision" };

  // a blocked legal lane still leaves the executive to record the rejection
  if (legalStop && !decided) signoff.state = "blocked";
  return [created, analyze, signoff, decide, record];
}

export function currentStep(steps: JourneyStep[]) {
  return steps.find((s) => s.state === "current") ?? null;
}
