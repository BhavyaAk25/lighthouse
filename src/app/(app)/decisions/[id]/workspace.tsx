"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { FileDown, History, Loader2, PencilLine, Play, RefreshCw, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { reviseCase } from "@/app/actions";
import { Button, buttonClass } from "@/components/ui";
import { cn, dateLabel } from "@/lib/format";
import type { Persona } from "@/lib/personas";
import type { RunEvent } from "@/lib/runs";
import type { AgentOutput, AgentType, CaseStatus, EvidenceItem, Reconciliation } from "@/lib/types";
import { AGENTS } from "@/lib/types";
import type { PacketView, ReviewView, RunView } from "@/lib/views";
import { AgentCard, type ToolStep } from "./agent-card";
import { DecisionPanel } from "./decision-panel";
import { EvidenceDrawer } from "./evidence-drawer";
import { Packet, type PacketData } from "./packet";

interface Props {
  persona: Persona;
  decisionId: string;
  status: CaseStatus;
  revision: number;
  demoSafe: boolean;
  outputs: Partial<Record<AgentType, AgentOutput>>;
  evidence: EvidenceItem[];
  packet: PacketView | null;
  reviews: ReviewView[];
  runs: RunView[];
  caseParams: { discount_pct: number; duration_weeks: number; claim_text: string; vendor_funding_pct: number; promo_type: string };
  timeline: React.ReactNode;
}

function packetFromView(p: PacketView): PacketData {
  return {
    synthesized_recommendation: p.synthesized_recommendation,
    lighthouse_confidence: p.lighthouse_confidence,
    confidence_breakdown: p.confidence_breakdown,
    conflict_severity: p.conflict_severity,
    conflicts: p.conflicts,
    gates: p.gates,
    risk_level: p.risk_level,
    conditions: p.conditions,
    headline: p.narrative?.headline || p.headline || p.summary.split(". ")[0],
    summary: p.narrative?.summary || p.summary,
    decisive_factors: p.narrative?.decisive_factors ?? [],
    dissent_summary: p.narrative?.dissent_summary ?? "",
    next_steps: p.narrative?.next_steps ?? [],
    provider: p.narrative?.provider || p.summary_provider,
    model: p.narrative?.model || "",
    financial_impact: p.financial_impact,
    requires_legal_review: p.requires_legal_review,
    expedited_eligible: p.expedited_eligible,
  };
}

export function Workspace(props: Props) {
  const { persona, decisionId, status, revision, demoSafe } = props;
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [liveRunId, setLiveRunId] = useState<string | null>(null);
  const [liveOutputs, setLiveOutputs] = useState<Partial<Record<AgentType, AgentOutput>>>({});
  const [liveEvidence, setLiveEvidence] = useState<EvidenceItem[]>([]);
  const [steps, setSteps] = useState<Record<string, ToolStep[]>>({});
  const [notes, setNotes] = useState<Partial<Record<AgentType, string>>>({});
  const [rec, setRec] = useState<Reconciliation | null>(null);
  const [synth, setSynth] = useState<PacketData | null>(null);
  const [drawer, setDrawer] = useState<AgentType | null>(null);
  const startedAt = useRef(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((Date.now() - startedAt.current) / 1000), 100);
    return () => clearInterval(t);
  }, [running]);

  // show streamed state until the server has persisted this run, then fall back to server data
  const live = running || (!!liveRunId && props.packet?.run_id !== liveRunId);
  const outputs = live ? liveOutputs : props.outputs;
  const evidence = live && liveEvidence.length ? liveEvidence : props.evidence;
  const packetData: PacketData | null = useMemo(() => {
    if (live && rec) {
      const s = synth;
      return {
        synthesized_recommendation: rec.synthesized_recommendation,
        lighthouse_confidence: rec.lighthouse_confidence,
        confidence_breakdown: rec.confidence_breakdown,
        conflict_severity: rec.conflict_severity,
        conflicts: rec.conflicts,
        gates: rec.gates,
        risk_level: rec.risk_level,
        conditions: rec.conditions,
        headline: s?.headline ?? rec.headline,
        summary: s?.summary ?? rec.summary,
        decisive_factors: s?.decisive_factors ?? rec.decisive_factors,
        dissent_summary: s?.dissent_summary ?? "",
        next_steps: s?.next_steps ?? [],
        provider: s?.provider ?? "",
        model: s?.model ?? "",
        financial_impact: rec.financial_impact,
        requires_legal_review: rec.requires_legal_review,
        expedited_eligible: rec.expedited_eligible,
      };
    }
    if (!props.packet) return null;
    const base = packetFromView(props.packet);
    // reflect the human legal disposition recorded after the run
    const legal = [...props.reviews].reverse().find((r) => r.reviewer_role === "LEGAL_REVIEWER" && r.revision === revision);
    if (legal)
      base.gates = base.gates.map((g) =>
        g.key === "LEGAL_REVIEW" && g.status !== "BLOCKED"
          ? {
              ...g,
              status: legal.disposition === "REJECTED" ? "BLOCKED" : "CLEAR",
              detail: `${legal.disposition === "REJECTED" ? "Rejected" : legal.disposition === "APPROVED" ? "Approved" : "Approved with conditions"} by ${legal.reviewer_name}: ${legal.condition_text ?? ""}`,
            }
          : g,
      );
    return base;
  }, [live, rec, synth, props.packet, props.reviews, revision]);

  const run = async () => {
    setRunning(true);
    setLiveOutputs({});
    setLiveEvidence([]);
    setSteps({});
    setNotes({});
    setRec(null);
    setSynth(null);
    startedAt.current = Date.now();
    setElapsed(0);
    try {
      const res = await fetch(`/api/decisions/${decisionId}/run`, { method: "POST" });
      if (!res.ok || !res.body) {
        toast.error((await res.text()) || "Run failed");
        setRunning(false);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const ev = JSON.parse(line.slice(6)) as RunEvent;
          if (ev.type === "run_started") setLiveRunId(ev.run_id);
          else if (ev.type === "tool") setSteps((s) => ({ ...s, [ev.agent]: [...(s[ev.agent] ?? []), { name: ev.name, detail: ev.detail, ms: ev.ms }] }));
          else if (ev.type === "agent_output") {
            setLiveOutputs((o) => ({ ...o, [ev.agent]: ev.output }));
            setLiveEvidence((e) => [...e.filter((x) => x.agent_type !== ev.agent), ...ev.evidence]);
            if (ev.note) setNotes((n) => ({ ...n, [ev.agent]: ev.note }));
          } else if (ev.type === "reconciled") setRec(ev.reconciliation);
          else if (ev.type === "synthesis")
            setSynth({
              ...(null as unknown as PacketData),
              headline: ev.synthesis.headline,
              summary: ev.synthesis.summary,
              decisive_factors: ev.synthesis.decisive_factors,
              dissent_summary: ev.synthesis.dissent_summary,
              next_steps: ev.synthesis.next_steps,
              provider: ev.synthesis.provider,
              model: ev.synthesis.model,
            } as PacketData);
          else if (ev.type === "done") {
            toast.success(`Recommendation packet ready in ${(ev.duration_ms / 1000).toFixed(1)}s`);
          } else if (ev.type === "error") toast.error(ev.message);
        }
      }
    } catch (e) {
      toast.error(String((e as Error).message ?? e));
    } finally {
      setRunning(false);
      router.refresh();
    }
  };

  const canRun = persona.role === "DECISION_OWNER" && !["APPROVED", "REJECTED"].includes(status);
  const hasRun = Object.keys(props.outputs).length === 4 || Object.keys(liveOutputs).length > 0;
  const fallbackNotes = Object.values(notes).filter((n) => n?.startsWith("AI unavailable"));

  return (
    <>
      {/* run bar */}
      <div className="no-print mb-6 flex flex-col gap-3 rounded-[12px] border border-line bg-white p-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3 px-1">
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", running ? "bg-brand-600 text-[#F4F1EA]" : "bg-canvas text-brass")}>
            {running ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          </span>
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold">
              {running ? `Agents working · ${elapsed.toFixed(1)}s` : hasRun ? "Analysis complete" : "Not analyzed yet"}
            </div>
            <div className="truncate text-[12px] text-muted">
              {running
                ? demoSafe
                  ? "Replaying saved answers"
                  : "Gathering evidence, then reasoning"
                : props.runs[0]
                  ? `${dateLabel(props.runs[0].started_at, true)} · ${props.runs[0].provider_summary ?? ""}${props.runs[0].duration_ms ? ` · ${(props.runs[0].duration_ms / 1000).toFixed(1)}s` : ""}`
                  : "Four agents will analyze this case in parallel"}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {props.runs.length > 1 && (
            <span className="hidden items-center gap-1 text-[12px] text-muted md:inline-flex">
              <History className="size-3.5" /> {props.runs.length} runs
            </span>
          )}
          {persona.role === "DECISION_OWNER" && !["APPROVED", "REJECTED"].includes(status) && <ReviseDialog decisionId={decisionId} params={props.caseParams} />}
          <Link href={`/packet/${decisionId}`} className={buttonClass("secondary", "md")} target="_blank">
            <FileDown className="size-4" /> Export packet
          </Link>
          {canRun && (
            <Button onClick={run} disabled={running} size="md">
              {running ? <Loader2 className="size-4 animate-spin" /> : hasRun ? <RefreshCw className="size-4" /> : <Play className="size-4" />}
              {running ? "Running" : hasRun ? "Re-run agents" : "Run agents"}
            </Button>
          )}
        </div>
      </div>
      {fallbackNotes.length > 0 && (
        <div className="mb-4 rounded-xl border border-[#EEDCB8] bg-warn-soft px-3.5 py-2.5 text-[12.5px] text-[#8A5A12]">
          No AI provider answered for some agents, so the rules engine filled in. Results are valid and labelled.
        </div>
      )}

      {/* agents */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {AGENTS.map((a, i) => (
          <AgentCard key={a} index={i} agent={a} output={outputs[a]} running={running} steps={steps[a] ?? []} note={notes[a]} onEvidence={() => setDrawer(a)} />
        ))}
      </div>

      {/* packet + decision */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          {packetData ? (
            <Packet p={packetData} synthesizing={running && !!rec && !synth} />
          ) : (
            <div className="rounded-[12px] border border-dashed border-line px-6 py-12 text-center">
              <p className="font-display text-[19px] text-ink">Lighthouse’s recommendation will appear here.</p>
            </div>
          )}
          {props.timeline}
        </div>
        <div className="space-y-4">
          <DecisionPanel persona={persona} decisionId={decisionId} status={status} revision={revision} packet={running ? null : props.packet} reviews={props.reviews} hasRun={hasRun && !running} />
        </div>
      </div>

      <EvidenceDrawer agent={drawer} open={!!drawer} onClose={() => setDrawer(null)} evidence={evidence} output={drawer ? outputs[drawer] : undefined} decisionId={decisionId} />
    </>
  );
}

function ReviseDialog({ decisionId, params }: { decisionId: string; params: Props["caseParams"] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [d, setD] = useState(params.discount_pct);
  const [w, setW] = useState(params.duration_weeks);
  const [v, setV] = useState(params.vendor_funding_pct);
  const [claim, setClaim] = useState(params.claim_text);
  const [note, setNote] = useState("");
  const input = "h-10 w-full rounded-xl border border-line px-3 text-[13.5px] outline-none focus:border-brand-400 focus:shadow-glow";
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="secondary">
          <PencilLine className="size-4" /> Revise case
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[94vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-pop">
          <div className="flex items-start justify-between">
            <div>
              <Dialog.Title className="text-[17px] font-semibold">Revise decision case</Dialog.Title>
              <Dialog.Description className="mt-1 text-[13px] text-muted">Creates a new revision. Earlier reviews stay attached to the old revision; agents must run again.</Dialog.Description>
            </div>
            <Dialog.Close className="rounded-lg p-1 text-muted hover:bg-line-2">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <label className="text-[12.5px] font-medium text-ink-2">
              Discount %
              <input type="number" min={0} max={70} value={d} onChange={(e) => setD(Number(e.target.value))} className={cn(input, "mt-1")} disabled={params.promo_type === "INVENTORY_REALLOCATION"} />
            </label>
            <label className="text-[12.5px] font-medium text-ink-2">
              Weeks
              <input type="number" min={1} max={12} value={w} onChange={(e) => setW(Number(e.target.value))} className={cn(input, "mt-1")} />
            </label>
            <label className="text-[12.5px] font-medium text-ink-2">
              Supplier funding %
              <input type="number" min={0} max={100} value={v} onChange={(e) => setV(Number(e.target.value))} className={cn(input, "mt-1")} />
            </label>
          </div>
          <label className="mt-3 block text-[12.5px] font-medium text-ink-2">
            Marketing claim
            <input value={claim} onChange={(e) => setClaim(e.target.value)} maxLength={240} className={cn(input, "mt-1")} />
          </label>
          <label className="mt-3 block text-[12.5px] font-medium text-ink-2">
            What changed and why
            <input value={note} onChange={(e) => setNote(e.target.value)} className={cn(input, "mt-1")} placeholder="e.g. Removed clinical claim per Legal" />
          </label>
          <Button
            className="mt-5 w-full"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await reviseCase(decisionId, { discount_pct: d, duration_weeks: w, vendor_funding_pct: v, claim_text: claim, note });
                if (!r.ok) toast.error(r.error);
                else {
                  toast.success(r.message ?? "Revised");
                  setOpen(false);
                  router.refresh();
                }
              })
            }
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Create revision"}
          </Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
