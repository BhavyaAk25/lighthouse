/**
 * The decision journey: who holds a case at each step and where it is now.
 * Pure function so it can run on the server or the client.
 */
export type StepState = "done" | "current" | "upcoming" | "skipped" | "blocked";
export type StepKey = "created" | "analyze" | "legal" | "decide" | "record";

export interface JourneyStep {
  key: StepKey;
  label: string;
  who: string;
  role: string; // persona role or "AI" / "SYSTEM"
  state: StepState;
  detail: string;
  at?: string | null;
}

export interface JourneyInput {
  status: string;
  revision: number;
  created_at: string;
  created_by: string;
  hasPacket: boolean;
  analyzedAt?: string | null;
  requiresLegal?: boolean | null;
  legalBlocked?: boolean;
  legal?: { reviewer_name: string; disposition: string; created_at: string } | null;
  final?: { decision: string; by: string | null; at: string | null } | null;
}

const LEGAL = "Priya Raman";

export function buildJourney(i: JourneyInput): JourneyStep[] {
  const owner = i.created_by;
  const finalD = i.final?.decision ?? null;
  const decided = finalD === "APPROVED" || finalD === "REJECTED";
  const revising = i.status === "REVISION_REQUESTED" || (i.status === "DRAFT" && i.revision > 1);

  const created: JourneyStep = { key: "created", label: "Case opened", who: owner, role: "DECISION_OWNER", state: "done", detail: i.revision > 1 ? `Revision ${i.revision}` : "Draft", at: i.created_at };

  const analyze: JourneyStep = {
    key: "analyze",
    label: "Agents analyze",
    who: "4 AI agents",
    role: "AI",
    state: i.hasPacket && !revising ? "done" : "current",
    detail: i.hasPacket && !revising ? "Packet ready" : revising ? `Waiting on ${owner} to revise and re-run` : `Waiting on ${owner} to run`,
    at: i.hasPacket && !revising ? i.analyzedAt : null,
  };

  let legal: JourneyStep;
  if (!i.hasPacket || revising) legal = { key: "legal", label: "Legal review", who: LEGAL, role: "LEGAL_REVIEWER", state: "upcoming", detail: "If the Legal agent flags it" };
  else if (i.legalBlocked) legal = { key: "legal", label: "Legal review", who: "Legal agent", role: "AI", state: "blocked", detail: "Prohibited" };
  else if (!i.requiresLegal) legal = { key: "legal", label: "Legal review", who: LEGAL, role: "LEGAL_REVIEWER", state: "skipped", detail: "Not needed" };
  else if (i.legal)
    legal = {
      key: "legal",
      label: "Legal review",
      who: i.legal.reviewer_name,
      role: "LEGAL_REVIEWER",
      state: i.legal.disposition === "REJECTED" ? "blocked" : "done",
      detail: i.legal.disposition === "REJECTED" ? "Rejected" : i.legal.disposition === "APPROVED" ? "Approved" : "Approved with conditions",
      at: i.legal.created_at,
    };
  else legal = { key: "legal", label: "Legal review", who: LEGAL, role: "LEGAL_REVIEWER", state: "current", detail: "Reviewing" };

  const legalPending = legal.state === "current";
  const decide: JourneyStep = decided
    ? { key: "decide", label: "Decision", who: i.final?.by ?? owner, role: "DECISION_OWNER", state: "done", detail: finalD === "APPROVED" ? "Approved" : "Rejected", at: i.final?.at }
    : !i.hasPacket || revising
      ? { key: "decide", label: "Decision", who: owner, role: "DECISION_OWNER", state: "upcoming", detail: "Approve, reject or revise" }
      : legalPending
        ? { key: "decide", label: "Decision", who: owner, role: "DECISION_OWNER", state: "upcoming", detail: "Unlocks after legal" }
        : { key: "decide", label: "Decision", who: owner, role: "DECISION_OWNER", state: "current", detail: "Approve, reject or revise" };

  const record: JourneyStep = decided
    ? { key: "record", label: "Sealed in audit", who: "Lighthouse", role: "SYSTEM", state: "done", detail: "Hash-chained", at: i.final?.at }
    : { key: "record", label: "Sealed in audit", who: "Lighthouse", role: "SYSTEM", state: "upcoming", detail: "After the decision" };

  return [created, analyze, legal, decide, record];
}

export function currentStep(steps: JourneyStep[]) {
  return steps.find((s) => s.state === "current") ?? null;
}

/** Lightweight version for list rows (from status and two flags). */
export function quickJourney(status: string, revision: number, requiresLegal: boolean | null, owner: string) {
  const hasPacket = !["DRAFT", "REVISION_REQUESTED"].includes(status) || false;
  return buildJourney({
    status,
    revision,
    created_at: "",
    created_by: owner,
    hasPacket,
    requiresLegal,
    legal: requiresLegal && ["READY_FOR_DECISION", "APPROVED", "REJECTED"].includes(status) ? { reviewer_name: LEGAL, disposition: "APPROVED", created_at: "" } : null,
    final: ["APPROVED", "REJECTED"].includes(status) ? { decision: status, by: owner, at: null } : null,
  });
}
