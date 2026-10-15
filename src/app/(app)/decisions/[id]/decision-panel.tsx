"use client";

import { CheckCircle2, Gavel, Loader2, Lock, MessageSquarePlus, RotateCcw, ShieldAlert, ThumbsDown, ThumbsUp, UserCheck, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addReviewerNote, recordDecision, recordLegalReview } from "@/app/actions";
import { REC_META } from "@/components/domain";
import { Badge, Button, Card } from "@/components/ui";
import { cn, dateLabel } from "@/lib/format";
import { ROLE_LABEL, type Persona } from "@/lib/personas";
import type { CaseStatus } from "@/lib/types";
import type { PacketView, ReviewView } from "@/lib/views";

const textareaCls =
  "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[13.5px] outline-none transition placeholder:text-faint focus:border-brand-400 focus:shadow-glow";

export function DecisionPanel({
  persona,
  decisionId,
  status,
  revision,
  packet,
  reviews,
  hasRun,
}: {
  persona: Persona;
  decisionId: string;
  status: CaseStatus;
  revision: number;
  packet: PacketView | null;
  reviews: ReviewView[];
  hasRun: boolean;
}) {
  const current = reviews.filter((r) => r.revision === revision);
  const legal = [...current].reverse().find((r) => r.reviewer_role === "LEGAL_REVIEWER");
  const notes = current.filter((r) => r.reviewer_role !== "LEGAL_REVIEWER");

  if (!packet || !hasRun)
    return (
      <Card className="p-5">
        <h3 className="text-[15px] font-semibold">Decision</h3>
        <p className="mt-1 text-[13px] text-muted">
          {persona.role === "DECISION_OWNER" ? "Run the agents first." : "Waiting on Maya Chen to run the agents."}
        </p>
      </Card>
    );

  return (
    <div className="space-y-4">
      {packet.final_decision && <FinalDecision packet={packet} />}
      {persona.role === "DECISION_OWNER" && !packet.final_decision && (
        <OwnerPanel decisionId={decisionId} packet={packet} legal={legal} status={status} />
      )}
      {persona.role === "LEGAL_REVIEWER" && <LegalPanel decisionId={decisionId} packet={packet} legal={legal} final={!!packet.final_decision} />}
      {["FINANCE_REVIEWER", "SALES_REVIEWER", "OPERATIONS_REVIEWER"].includes(persona.role) && !packet.final_decision && (
        <ReviewerPanel decisionId={decisionId} persona={persona} />
      )}
      {persona.role === "ADMIN" && (
        <Card className="p-5">
          <div className="flex gap-3">
            <ShieldAlert className="size-5 shrink-0 text-muted" />
            <div>
              <h3 className="text-[14px] font-semibold">Separation of duties</h3>
              <p className="mt-1 text-[13px] text-muted">Administrators can audit this case but not decide it.</p>
            </div>
          </div>
        </Card>
      )}
      {(legal || notes.length > 0) && (
        <Card className="p-5">
          <h3 className="text-[14px] font-semibold">Reviews on this revision</h3>
          <div className="mt-3 space-y-2.5">
            {[...(legal ? [legal] : []), ...notes].map((r) => (
              <div key={r.review_id} className="flex gap-3 rounded-xl border border-line p-3">
                <UserCheck className="mt-0.5 size-4 shrink-0 text-brand-600" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold">{r.reviewer_name}</span>
                    <span className="text-[12px] text-muted">{ROLE_LABEL[r.reviewer_role as keyof typeof ROLE_LABEL] ?? r.reviewer_role}</span>
                    <Badge tone={r.disposition.includes("REJECT") || r.disposition === "CONCERN" ? "bad" : r.disposition === "APPROVED_WITH_CONDITIONS" ? "info" : "ok"}>
                      {r.disposition.replace(/_/g, " ").toLowerCase()}
                    </Badge>
                  </div>
                  {r.condition_text && <p className="mt-1 text-[12.5px] text-ink-2">{r.condition_text}</p>}
                  <p className="mt-1 text-[11.5px] text-faint">{dateLabel(r.created_at, true)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function FinalDecision({ packet }: { packet: PacketView }) {
  const d = packet.final_decision!;
  const tone = d === "APPROVED" ? "ok" : d === "REJECTED" ? "bad" : "warn";
  return (
    <Card className={cn("overflow-hidden p-0", tone === "ok" && "border-[#D3E5D9]", tone === "bad" && "border-[#EBCFC8]")}>
      <div className={cn("flex items-center gap-3 px-5 py-4", tone === "ok" ? "bg-ok-soft" : tone === "bad" ? "bg-bad-soft" : "bg-warn-soft")}>
        {d === "APPROVED" ? <CheckCircle2 className="size-6 text-ok" /> : d === "REJECTED" ? <XCircle className="size-6 text-bad" /> : <RotateCcw className="size-6 text-warn" />}
        <div>
          <div className="text-[15px] font-semibold">
            {d === "APPROVED" ? "Approved" : d === "REJECTED" ? "Rejected" : "Revision requested"} by {packet.decided_by}
          </div>
          <div className="text-[12.5px] text-ink-2">{dateLabel(packet.decided_at, true)}</div>
        </div>
        {packet.override_flag && (
          <Badge tone="warn" className="ml-auto">
            Human override
          </Badge>
        )}
      </div>
      {packet.final_rationale && <p className="px-5 py-3.5 text-[13px] text-ink-2">“{packet.final_rationale}”</p>}
    </Card>
  );
}

function OwnerPanel({ decisionId, packet, legal, status }: { decisionId: string; packet: PacketView; legal?: ReviewView; status: CaseStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rationale, setRationale] = useState("");
  const rec = packet.synthesized_recommendation;
  const supportive = rec === "PROCEED" || rec === "PROCEED_WITH_CONDITIONS";
  const legalGate = packet.gates.find((g) => g.key === "LEGAL_REVIEW");
  const legalBlocked = legalGate?.status === "BLOCKED";
  const legalPending = packet.requires_legal_review && !legal;
  const legalRejected = legal?.disposition === "REJECTED";
  const approveLocked = legalBlocked || legalPending || legalRejected;
  const highRisk = packet.risk_level === "HIGH" || packet.risk_level === "CRITICAL";

  const act = (d: "APPROVED" | "REJECTED" | "REVISION_REQUESTED") =>
    start(async () => {
      const r = await recordDecision(decisionId, d, rationale);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message ?? "Recorded");
        setRationale("");
        router.refresh();
      }
    });

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold">
          Your decision
        </h3>
        <span className="text-[12px] text-muted">Recommended: {REC_META[rec].short}</span>
      </div>
      {approveLocked && (
        <div className="mt-3 flex gap-2.5 rounded-xl border border-[#E9DCC0] bg-violet-soft px-3 py-2.5 text-[12.5px] text-[#7A5C2A]">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <span>
            {legalBlocked
              ? "Approval locked: prohibited by the Legal agent."
              : legalRejected
                ? "Approval locked: rejected by Priya Raman (Legal)."
                : "Waiting on Priya Raman · Legal review"}
          </span>
        </div>
      )}
      <textarea
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        rows={3}
        className={cn(textareaCls, "mt-3")}
        placeholder="Your reason"
      />
      {(highRisk || !supportive) && <p className="mt-1.5 text-[11.5px] text-muted">A short reason is required.</p>}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button variant="success" onClick={() => act("APPROVED")} disabled={pending || approveLocked} title={approveLocked ? "Locked by governance gate" : undefined}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : approveLocked ? <Lock className="size-4" /> : <ThumbsUp className="size-4" />} Approve
        </Button>
        <Button variant="secondary" onClick={() => act("REJECTED")} disabled={pending} className="text-[#9C3A2A]">
          <ThumbsDown className="size-4" /> Reject
        </Button>
        <Button variant="secondary" onClick={() => act("REVISION_REQUESTED")} disabled={pending}>
          <RotateCcw className="size-4" /> Revise
        </Button>
      </div>
      {status === "REVISION_REQUESTED" && <p className="mt-3 text-[12px] text-muted">Revision requested. Use “Revise case” above to change parameters and re-run.</p>}
    </Card>
  );
}

function LegalPanel({ decisionId, packet, legal, final }: { decisionId: string; packet: PacketView; legal?: ReviewView; final: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [disp, setDisp] = useState<"APPROVED" | "APPROVED_WITH_CONDITIONS" | "REJECTED">("APPROVED_WITH_CONDITIONS");
  const [note, setNote] = useState("");
  if (!packet.requires_legal_review && !legal)
    return (
      <Card className="p-5">
        <h3 className="text-[15px] font-semibold">Legal & Compliance</h3>
        <p className="mt-1 text-[13px] text-muted">No triggered rule requires human legal review for this case. You can still read the Legal agent’s conditions.</p>
      </Card>
    );
  if (legal || final)
    return (
      <Card className="p-5">
        <h3 className="text-[15px] font-semibold">Legal disposition recorded</h3>
        <p className="mt-1 text-[13px] text-muted">{legal ? `${legal.disposition.replace(/_/g, " ").toLowerCase()} on ${dateLabel(legal.created_at, true)}.` : "Case is final."}</p>
      </Card>
    );
  const OPTS = [
    { v: "APPROVED", l: "Approve", d: "Compliant as written" },
    { v: "APPROVED_WITH_CONDITIONS", l: "Approve with conditions", d: "Compliant once conditions are met" },
    { v: "REJECTED", l: "Reject", d: "Cannot launch as proposed" },
  ] as const;
  return (
    <Card className="border-[#E9DCC0] p-5">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold">
        Your legal disposition
      </h3>
      
      <div className="mt-3 grid gap-2">
        {OPTS.map((o) => (
          <button
            key={o.v}
            onClick={() => setDisp(o.v)}
            className={cn(
              "rounded-xl border p-2.5 text-left transition",
              disp === o.v ? (o.v === "REJECTED" ? "border-bad bg-bad-soft" : "border-brass bg-brass-soft") : "border-line hover:border-[#CFC8BA]",
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13.5px] text-ink">{o.l}</span>
              <span className="text-[11.5px] text-muted">{o.d}</span>
            </div>
          </button>
        ))}
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={cn(textareaCls, "mt-3")} placeholder="Note or conditions" />
      <Button
        className="mt-3 w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await recordLegalReview(decisionId, disp, note);
            if (!r.ok) toast.error(r.error);
            else {
              toast.success(r.message ?? "Recorded");
              router.refresh();
            }
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : "Record legal disposition"}
      </Button>
    </Card>
  );
}

function ReviewerPanel({ decisionId, persona }: { decisionId: string; persona: Persona }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const send = (d: "CONCUR" | "CONCERN") =>
    start(async () => {
      const r = await addReviewerNote(decisionId, d, note);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message ?? "Added");
        setNote("");
        router.refresh();
      }
    });
  return (
    <Card className="p-5">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold">
        Your note
      </h3>
      
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={cn(textareaCls, "mt-3")} placeholder="e.g. Margin assumption matches the category plan." />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => send("CONCUR")}>
          <ThumbsUp className="size-4" /> Concur
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => send("CONCERN")}>
          <ShieldAlert className="size-4" /> Raise concern
        </Button>
      </div>
    </Card>
  );
}
