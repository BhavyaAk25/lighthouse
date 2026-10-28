"use client";

import { CheckCircle2, Loader2, Lock, RotateCcw, ShieldAlert, ThumbsDown, ThumbsUp, XCircle } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { recordDecision, recordSignoff } from "@/app/actions";
import { AGENT_META, AgentAvatar, LANE_META, laneLabel } from "@/components/domain";
import { Badge, Button, Card } from "@/components/ui";
import { approvalLock, decisionCheck } from "@/lib/governance";
import { cn, relTime } from "@/lib/format";
import type { Persona } from "@/lib/personas";
import { laneSummary, REC_WORD, type Lane } from "@/lib/signoff";
import type { AgentType, CaseStatus, Recommendation } from "@/lib/types";
import type { PacketView } from "@/lib/views";
import { NextUp, type NextItem } from "@/components/next-up";

/** Optional reason starters: tap one, then edit it. Saves typing on stage; the reason stays the person's own. */
function Starters({ items, onPick }: { items: string[]; onPick: (t: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Reason starters">
      {items.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onPick(t)}
          className="rounded-full border border-line bg-white px-2.5 py-1 text-left text-[12.5px] text-ink-2 transition hover:border-brass hover:text-ink"
        >
          {t}
        </button>
      ))}
    </div>
  );
}

const textareaCls =
  "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[13.5px] outline-none transition placeholder:text-faint focus:border-brand-400 focus:shadow-glow";

/** Executive / admin side panel: the four sign-offs, then the decision. */
export function DecisionPanel({
  persona,
  decisionId,
  status,
  packet,
  lanes,
  next,
}: {
  persona: Persona;
  decisionId: string;
  status: CaseStatus;
  packet: PacketView | null;
  lanes: Lane[];
  next?: NextItem | null;
}) {
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
      {persona.role === "DECISION_OWNER" && (packet.final_decision || status === "REVISION_REQUESTED") && next !== undefined && <NextUp next={next} />}
      <SignoffSummary lanes={lanes} compact />
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
export function SignoffSummary({ lanes, you, compact }: { lanes: Lane[]; you?: AgentType; compact?: boolean }) {
  const sum = laneSummary(lanes);
  if (!sum.analyzed) return null;
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[14px] font-semibold">Department sign-off</h3>
        <span className="tnum text-[12.5px] text-muted">{sum.cleared} of 4 done</span>
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
              {s?.condition_text && !compact && <p className="mt-1 line-clamp-2 pl-[34px] text-[12.5px] text-muted">“{s.condition_text}”</p>}
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
          <div className="text-[12.5px] text-ink-2" suppressHydrationWarning>
            {packet.decided_at ? relTime(packet.decided_at) : ""}
          </div>
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
  const clean = !lock && !overruling.length && !bypassing.length && sum.pending.length === 0;
  const needReason = highRisk || !supportive || overruling.length > 0 || bypassing.length > 0;

  const [confirm, setConfirm] = useState<"APPROVED" | "REJECTED" | null>(null);
  const record = (d: "APPROVED" | "REJECTED" | "REVISION_REQUESTED") =>
    start(async () => {
      const r = await recordDecision(decisionId, d, rationale);
      setConfirm(null);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message ?? "Recorded");
        setRationale("");
        router.refresh();
      }
    });
  // approve and reject are final, so check the rules here first and then ask once before sealing
  const act = (d: "APPROVED" | "REJECTED" | "REVISION_REQUESTED") => {
    if (d === "REVISION_REQUESTED") return record(d);
    const c = decisionCheck({ synthesized_recommendation: rec, risk_level: packet.risk_level }, lanes, d, rationale);
    if (!c.ok) return toast.error(c.error);
    setConfirm(d);
  };
  const starters = [
    ...(overruling.length ? [`The strategic value outweighs ${AGENT_META[overruling[0].dept].name}’s concern; I accept that risk.`] : []),
    ...(bypassing.length ? ["Deciding without the overdue sign-off; the evidence gap is acceptable for this window."] : []),
    // only offer what is true for this case: "all cleared" never appears next to a block or a lock
    ...(clean && supportive ? ["All four departments cleared and the conditions are accepted."] : []),
    ...(lock
      ? [lanes.find((l) => l.dept === "LEGAL")?.state === "PROHIBITED" ? "A legal rule prohibits this promotion, so it cannot run as proposed." : "Legal has to clear this first; send it back once that is resolved."]
      : []),
    ...(!supportive && !overruling.length && !lock ? ["I agree with Lighthouse: hold this until the open issues are fixed."] : []),
    "Reduce the discount and resubmit with the supplier funding confirmed.",
  ].slice(0, 3);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold">Your decision</h3>
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
      <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={3} className={cn(textareaCls, "mt-3")} placeholder="Your reason" aria-label="Your reason" />
      {needReason && <p className="mt-1.5 text-[12.5px] text-muted">A reason of 20+ characters is required.</p>}
      <Starters items={starters} onPick={setRationale} />
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
      <Dialog.Root open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px]" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[92vw] max-w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-pop">
            <Dialog.Title className="font-display text-[22px] leading-tight text-ink">
              {confirm === "APPROVED" ? "Approve" : "Reject"} {decisionId}?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-[14px] text-muted">This is sealed in the audit trail and can’t be changed afterwards.</Dialog.Description>
            {rationale.trim() && <p className="mt-3 rounded-[10px] bg-canvas px-3.5 py-2.5 text-[14px] text-ink-2">“{rationale.trim()}”</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="secondary">Cancel</Button>
              </Dialog.Close>
              <Button variant={confirm === "APPROVED" ? "success" : "primary"} disabled={pending} onClick={() => confirm && record(confirm)}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : confirm === "APPROVED" ? "Approve and seal" : "Reject and seal"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
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
  const label = legal
    ? pos === "BLOCK"
      ? "Reject"
      : pos === "PROCEED"
        ? "Approve"
        : "Approve with conditions"
    : same
      ? pos === "BLOCK"
        ? "Confirm the agent: block it"
        : "Confirm the agent"
      : pos === "BLOCK"
        ? "Block it"
        : `Sign off as ${REC_WORD[pos]}`;
  // a block always needs a reason, even when it agrees with the agent
  const needNote = legal || !same || pos === "BLOCK";
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
                {!legal && (o.v === "BLOCK" ? ai === "REJECT" : o.v === ai) && <span className="ml-2 rounded-full bg-canvas px-1.5 text-[11.5px] text-muted">AI’s answer</span>}
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
        placeholder={needNote ? (legal ? "Legal note" : pos === "BLOCK" ? "Why it can’t go ahead (the executive sees this)" : "Why you are changing the agent’s answer") : "Note (optional)"}
      />
      <Starters
        items={
          legal
            ? pos === "BLOCK"
              ? ["The claim cannot be substantiated as written."]
              : ["Claim wording revised; substantiation is on file.", "Required disclosures added to all creative."]
            : same && pos !== "BLOCK"
              ? ["Checked against our plan; the agent is right."]
              : pos === "BLOCK"
                ? ["The loss is too large to support from our side."]
                : ["Supplier confirmed extra funding after the run.", "Mitigation in place: staggered launch and capped quantities."]
        }
        onPick={setNote}
      />
      {needNote && !legal && (
        <p className="mt-1.5 text-[12.5px] text-muted">
          {pos === "BLOCK" && same
            ? "Blocking needs a reason (20+ characters). The executive can overrule it, but only with a reason of their own."
            : "Changing the AI’s answer needs a reason (20+ characters). It lowers Lighthouse’s confidence and goes on the record."}
        </p>
      )}
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
