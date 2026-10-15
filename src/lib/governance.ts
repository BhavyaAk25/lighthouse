/**
 * Human-decision governance rules (single source of truth for the UI, server actions and tests).
 */
export interface GovPacket {
  synthesized_recommendation: string;
  requires_legal_review: boolean;
  risk_level: string;
  gates: { key: string; status: string }[];
}

export type Decision = "APPROVED" | "REJECTED" | "REVISION_REQUESTED";

export function decisionCheck(
  p: GovPacket,
  legalDisposition: string | null | undefined,
  decision: Decision,
  rationale: string,
): { ok: true; override: boolean } | { ok: false; error: string } {
  const legalBlocked = p.gates.find((g) => g.key === "LEGAL_REVIEW")?.status === "BLOCKED";
  if (decision === "APPROVED") {
    if (legalBlocked) return { ok: false, error: "Approval is locked: the Legal agent found a prohibited condition." };
    if (p.requires_legal_review && !legalDisposition) return { ok: false, error: "Approval is locked until Legal & Compliance records a disposition." };
    if (legalDisposition === "REJECTED") return { ok: false, error: "Legal & Compliance rejected this case; it cannot be approved." };
  }
  const rec = p.synthesized_recommendation;
  const supportive = rec === "PROCEED" || rec === "PROCEED_WITH_CONDITIONS";
  const override = (decision === "APPROVED" && !supportive) || (decision === "REJECTED" && supportive);
  const text = rationale.trim();
  if ((override || p.risk_level === "HIGH" || p.risk_level === "CRITICAL") && text.length < 20)
    return {
      ok: false,
      error: override
        ? "This decision overrides Lighthouse: a rationale of at least 20 characters is required."
        : "High-risk decisions require a rationale (20+ characters).",
    };
  if (decision === "REVISION_REQUESTED" && text.length < 10) return { ok: false, error: "Explain what should be revised (10+ characters)." };
  return { ok: true, override };
}
