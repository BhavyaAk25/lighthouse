"use client";

import { CheckCircle2, Loader2, Lock, RotateCcw, ShieldAlert, ThumbsDown, ThumbsUp, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { recordDecision, recordSignoff } from "@/app/actions";
import { AGENT_META, AgentAvatar, LANE_META, laneLabel, REC_META } from "@/components/domain";
import { Badge, Button, Card } from "@/components/ui";
import { approvalLock } from "@/lib/governance";
import { cn, dateLabel } from "@/lib/format";
import type { Persona } from "@/lib/personas";
import { laneSummary, REC_WORD, type Lane } from "@/lib/signoff";
import type { AgentType, CaseStatus, Recommendation } from "@/lib/types";
import type { PacketView } from "@/lib/views";

const textareaCls =
  "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[13.5px] outline-none transition placeholder:text-faint focus:border-brand-400 focus:shadow-glow";

/** Executive / admin side panel: the four sign-offs, then the decision. */
export function DecisionPanel({ persona, decisionId, status, packet, lanes }: { persona: Persona; decisionId: string; status: CaseStatus; packet: PacketView | null; lanes: Lane[] }) {
  if (!packet)
    return (
      <Card className="p-5">
        <h3 className="text-[15px] font-semibold">Decision</h3>
        <p className="mt-1 text-[13px] text-muted">Appears once the case is submitted and the agents have run.</p>
      </Card>
    );
  return (
    <div className="space-y-4">
      {packet.final_decision && <FinalDecision packet={packet} />}
      <SignoffSummary lanes={lanes} />
      {persona.role === "DECISION_OWNER" && !packet.final_decision && status !== "REVISION_REQUESTED" && <ExecutivePanel decisionId={decisionId} packet={packet} lanes={lanes} />}
      {persona.role === "ADMIN" && (
        <Card className="p-5">
          <div className="flex gap-3">
            <ShieldAlert className="size-5 shrink-0 text-muted" />
            <div>
              <h3 className="text-[14px] font-semibold">Separation of duties</h3>
              <p className="mt-1 text-[13px] text-muted">Administrators can audit this case but not sign off or decide it.</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

/** One row per department: who owns it and where their sign-off stands. */
export function SignoffSummary({ lanes, you }: { lanes: Lane[]; you?: AgentType }) {
  const sum = laneSummary(lanes);
  if (!sum.analyzed) return null;
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[14px] font-semibold">Department sign-off</h3>
        <span className="tnum text-[12.5px] text-muted">{sum.cleared} of 4 cleared</span>
      </div>
      <div className="mt-3 space-y-2">
        {lanes.map((l) => {
          const m = LANE_META[l.state];
          const s = l.signoff;
          const changed = s && s.disposition !== "CONFIRMED" && l.dept !== "LEGAL";
          return (
            <div key={l.dept} className={cn("rounded-[10px] border px-3 py-2.5", you === l.dept ? "border-brass bg-brass-soft/60" : "border-line-2")}>
              <div className="flex items-center gap-2.5">
                <AgentAvatar agent={l.dept} size={24} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-ink">
                    {AGENT_META[l.dept].name} <span className="text-faint">· {you === l.dept ? "You" : l.lead.name}</span>
                  </div>
                </div>
                <span className={cn("flex items-center gap-1.5 text-[12px]", m.text)}>
                  <span className={cn("block size-1.5 rounded-full", m.dot)} />
                  {laneLabel(l)}
                </span>
              </div>
              {changed && (
                <div className="mt-1.5 pl-[34px] text-[12px] text-ink-2">
                  AI said {REC_WORD[s.ai_recommendation]} → {l.state === "BLOCKED" ? (l.dept === "LEGAL" ? "rejected" : "blocked") : REC_WORD[s.position]}
                </div>
              )}
              {s?.condition_text && <p className="mt-1 line-clamp-2 pl-[34px] text-[12px] text-muted">“{s.condition_text}”</p>}
              {l.state === "PROHIBITED" && <p className="mt-1 pl-[34px] text-[12px] text-bad">A legal rule prohibits this case.</p>}
              {(l.state === "PENDING" || l.state === "OVERDUE") && (
                <p className="mt-1 pl-[34px] text-[12px] text-muted">
                  {l.state === "OVERDUE" ? (l.dept === "LEGAL" ? "Overdue. Legal can’t be skipped." : "Overdue. You may decide without it.") : `Needed because ${l.reasons.join("; ")}.`}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
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
            {d === "APPROVED" ? "Approved" : d === "REJECTED" ? "Rejected" : "Sent back for changes"} by {packet.decided_by}
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

function ExecutivePanel({ decisionId, packet, lanes }: { decisionId: string; packet: PacketView; lanes: Lane[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rationale, setRationale] = useState("");
  const rec = packet.synthesized_recommendation;
  const supportive = rec === "PROCEED" || rec === "PROCEED_WITH_CONDITIONS";
  const lock = approvalLock(lanes);
  const sum = laneSummary(lanes);
  const overruling = sum.blocked.filter((l) => l.dept !== "LEGAL");
  const bypassing = sum.pending.filter((l) => l.escalated);
  const highRisk = packet.risk_level === "HIGH" || packet.risk_level === "CRITICAL";
  const needReason = highRisk || !supportive || overruling.length > 0 || bypassing.length > 0;

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
        <h3 className="text-[15px] font-semibold">Your decision</h3>
        <span className="text-[12px] text-muted">Recommended: {REC_META[rec].short}</span>
      </div>
      {lock && (
        <div className="mt-3 flex gap-2.5 rounded-xl border border-[#E9DCC0] bg-brass-soft px-3 py-2.5 text-[12.5px] text-[#7A5C2A]">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <span>{lock} You can still reject it or send it back.</span>
        </div>
      )}
      {!lock && overruling.length > 0 && (
        <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2.5 text-[12.5px] text-[#8A5A12]">
          Approving overrules {overruling.map((l) => `${AGENT_META[l.dept].name} (${l.lead.name})`).join(", ")}. Your reason goes on the record.
        </p>
      )}
      {!lock && bypassing.length > 0 && (
        <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2.5 text-[12.5px] text-[#8A5A12]">
          {bypassing.map((l) => `${AGENT_META[l.dept].name} (${l.lead.name})`).join(", ")} missed the sign-off deadline. You can decide without them, with a reason.
        </p>
      )}
      <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={3} className={cn(textareaCls, "mt-3")} placeholder="Your reason" />
      {needReason && <p className="mt-1.5 text-[11.5px] text-muted">A reason of 20+ characters is required.</p>}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button variant="success" onClick={() => act("APPROVED")} disabled={pending || !!lock} title={lock ?? undefined}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : lock ? <Lock className="size-4" /> : <ThumbsUp className="size-4" />} Approve
        </Button>
        <Button variant="secondary" onClick={() => act("REJECTED")} disabled={pending} className="text-[#9C3A2A]">
          <ThumbsDown className="size-4" /> Reject
        </Button>
        <Button variant="secondary" onClick={() => act("REVISION_REQUESTED")} disabled={pending}>
          <RotateCcw className="size-4" /> Send back
        </Button>
      </div>
    </Card>
  );
}

type Pos = "PROCEED" | "PROCEED_WITH_CONDITIONS" | "HOLD" | "BLOCK";

/** A department lead's sign-off on their own agent's answer. */
export function SignoffPanel({ decisionId, lane }: { decisionId: string; lane: Lane }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const legal = lane.dept === "LEGAL";
  const ai = lane.ai!.recommendation;
  const initial: Pos = legal ? "PROCEED_WITH_CONDITIONS" : ai === "REJECT" ? "BLOCK" : ai === "REVIEW_REQUIRED" ? "HOLD" : (ai as Pos);
  const [pos, setPos] = useState<Pos>(initial);
  const [note, setNote] = useState("");
  const [conds, setConds] = useState("");
  const OPTS: { v: Pos; l: string; d: string }[] = legal
    ? [
        { v: "PROCEED", l: "Approve", d: "Compliant as written" },
        { v: "PROCEED_WITH_CONDITIONS", l: "Approve with conditions", d: "Compliant once conditions are met" },
        { v: "BLOCK", l: "Reject", d: "Final: cannot launch as proposed" },
      ]
    : [
        { v: "PROCEED", l: "Proceed", d: "" },
        { v: "PROCEED_WITH_CONDITIONS", l: "Proceed with conditions", d: "" },
        { v: "HOLD", l: "Hold", d: "" },
        { v: "BLOCK", l: "Block", d: "The executive can overrule" },
      ];
  const asRec: Recommendation = pos === "BLOCK" ? "REJECT" : pos;
  const same = !legal && asRec === ai;
  const label = legal ? (pos === "BLOCK" ? "Reject" : pos === "PROCEED" ? "Approve" : "Approve with conditions") : same ? "Confirm the agent" : pos === "BLOCK" ? "Block it" : `Sign off as ${REC_WORD[pos]}`;
  const needNote = legal || !same;
  return (
    <Card className="border-[#E9DCC0] p-5">
      <h3 className="text-[15px] font-semibold">Your sign-off</h3>
      <p className="mt-1 text-[13px] text-muted">
        Your agent says <span className="text-ink">{REC_WORD[ai]}</span>. {legal ? "Your call is the Legal position." : "Confirm it, or change it if you know better."}
      </p>
      <div className="mt-3 grid gap-2">
        {OPTS.map((o) => (
          <button
            key={o.v}
            onClick={() => setPos(o.v)}
            className={cn(
              "rounded-xl border px-3 py-2.5 text-left transition",
              pos === o.v ? (o.v === "BLOCK" ? "border-bad bg-bad-soft" : "border-brass bg-brass-soft") : "border-line hover:border-[#CFC8BA]",
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13.5px] text-ink">
                {o.l}
                {!legal && (o.v === "BLOCK" ? ai === "REJECT" : o.v === ai) && <span className="ml-2 text-[11px] tracking-[0.1em] text-faint uppercase">AI</span>}
              </span>
              {o.d && <span className="text-[11.5px] text-muted">{o.d}</span>}
            </div>
          </button>
        ))}
      </div>
      {pos === "PROCEED_WITH_CONDITIONS" && (
        <input value={conds} onChange={(e) => setConds(e.target.value)} className={cn(textareaCls, "mt-3 h-10 py-0")} placeholder="Condition (optional), e.g. Cap at 2 per customer" />
      )}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        className={cn(textareaCls, "mt-3")}
        placeholder={needNote ? (legal ? "Legal note" : "Why you are changing the agent’s answer") : "Note (optional)"}
      />
      {needNote && !legal && <p className="mt-1.5 text-[11.5px] text-muted">Changing the AI’s answer needs a reason (20+ characters). It lowers Lighthouse’s confidence and goes on the record.</p>}
      <Button
        className="mt-3 w-full"
        variant={pos === "BLOCK" ? "secondary" : "primary"}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await recordSignoff(decisionId, pos, note, conds ? [conds] : []);
            if (!r.ok) toast.error(r.error);
            else {
              toast.success(r.message ?? "Signed");
              router.refresh();
            }
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : label}
      </Button>
    </Card>
  );
}
