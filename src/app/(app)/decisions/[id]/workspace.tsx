"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, FileDown, History, Loader2, PencilLine, Play, RefreshCw, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { reviseCase } from "@/app/actions";
import { Button, buttonClass } from "@/components/ui";
import { cn, relTime } from "@/lib/format";
import type { Persona } from "@/lib/personas";
import type { Lane } from "@/lib/signoff";
import type { AgentOutput, AgentType, CaseStatus, EvidenceItem } from "@/lib/types";
import { AGENTS } from "@/lib/types";
import type { PacketView, RunView } from "@/lib/views";
import { AgentCard } from "./agent-card";
import { DecisionPanel } from "./decision-panel";
import { EvidenceDrawer } from "./evidence-drawer";
import { DecisionBrief } from "./brief";
import { Packet, type PacketData } from "./packet";
import type { NextItem } from "@/components/next-up";
import { useRun } from "./use-run";

const PROVIDER: Record<string, string> = { gemini: "live AI (Gemini)", groq: "live AI (Groq)", replay: "replayed AI answers", "rules-engine": "rules engine" };
const providerWords = (s: string | null) => [...new Set((s ?? "").split(/,\s*/).filter(Boolean).map((x) => PROVIDER[x] ?? x))].join(" and ");

interface Props {
  persona: Persona;
  decisionId: string;
  status: CaseStatus;
  revision: number;
  demoSafe: boolean;
  outputs: Partial<Record<AgentType, AgentOutput>>;
  evidence: EvidenceItem[];
  packet: PacketView | null;
  lanes: Lane[];
  runs: RunView[];
  proposer: string;
  autoSubmit: boolean;
  next?: NextItem | null;
  caseParams: { discount_pct: number; duration_weeks: number; claim_text: string; vendor_funding_pct: number; promo_type: string };
  timeline: React.ReactNode;
}

function packetFromView(p: PacketView): PacketData {
  return {
    synthesized_recommendation: p.synthesized_recommendation,
    ai_recommendation: p.ai_recommendation,
    lighthouse_confidence: p.lighthouse_confidence,
    ai_confidence: p.ai_confidence,
    confidence_breakdown: p.confidence_breakdown,
    conflict_severity: p.conflict_severity,
    conflicts: p.conflicts,
    gates: p.gates,
    risk_level: p.risk_level,
    conditions: p.conditions,
    headline: p.narrative?.headline || p.headline || p.summary.split(". ")[0],
    signed_headline: p.headline,
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
  const run = useRun(decisionId);
  const { running } = run;
  const [drawer, setDrawer] = useState<AgentType | null>(null);
  const [showAll, setShowAll] = useState(false);

  // show streamed state until the server has persisted this run, then fall back to server data
  const live = running || (!!run.runId && props.packet?.run_id !== run.runId);
  const outputs = live ? run.outputs : props.outputs;
  const evidence = live && run.evidence.length ? run.evidence : props.evidence;
  const packetData: PacketData | null = useMemo(() => {
    if (live && run.rec) {
      const s = run.synth;
      const r = run.rec;
      return {
        synthesized_recommendation: r.synthesized_recommendation,
        ai_recommendation: r.synthesized_recommendation,
        lighthouse_confidence: r.lighthouse_confidence,
        ai_confidence: r.lighthouse_confidence,
        confidence_breakdown: r.confidence_breakdown,
        conflict_severity: r.conflict_severity,
        conflicts: r.conflicts,
        gates: r.gates,
        risk_level: r.risk_level,
        conditions: r.conditions,
        headline: s?.headline ?? r.headline,
        signed_headline: r.headline,
        summary: s?.summary ?? r.summary,
        decisive_factors: s?.decisive_factors ?? r.decisive_factors,
        dissent_summary: s?.dissent_summary ?? "",
        next_steps: s?.next_steps ?? [],
        provider: s?.provider ?? "",
        model: s?.model ?? "",
        financial_impact: r.financial_impact,
        requires_legal_review: r.requires_legal_review,
        expedited_eligible: r.expedited_eligible,
      };
    }
    return props.packet ? packetFromView(props.packet) : null;
  }, [live, run.rec, run.synth, props.packet]);

  const exec = persona.role === "DECISION_OWNER";
  const final = ["APPROVED", "REJECTED"].includes(status);
  const draft = status === "DRAFT" || status === "REVISION_REQUESTED";
  const isProposer = props.proposer === persona.name;
  const canSubmit = draft && (exec || isProposer);
  const hasRun = (Object.keys(props.outputs).length === 4 && !draft) || Object.keys(run.outputs).length > 0;
  const fallbackNotes = Object.values(run.notes).filter((n) => n?.startsWith("AI unavailable"));
  const router = useRouter();
  // a lead who proposed the case stays on the full analysis after submitting (their own lane is one click away)
  const submit = () => run.start(undefined, isProposer && !exec ? () => router.replace(`/decisions/${decisionId}?view=full`, { scroll: false }) : undefined);

  // a brand-new case opens straight into its first run
  const auto = useRef(false);
  useEffect(() => {
    if (props.autoSubmit && canSubmit && !auto.current) {
      auto.current = true;
      void submit();
    }
  }, [props.autoSubmit, canSubmit, submit]);

  return (
    <>
      {/* run bar */}
      <div id={hasRun ? undefined : "act"} className="no-print mb-6 flex scroll-mt-24 flex-col gap-3 rounded-[12px] border border-line bg-white p-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3 px-1">
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", running ? "bg-brand-600 text-[#F4F1EA]" : "bg-canvas text-brass")}>
            {running ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          </span>
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold">
              {running
                ? `${run.only ? `${run.only[0]}${run.only.slice(1).toLowerCase()} agent` : "Four agents"} working · ${run.elapsed.toFixed(1)}s`
                : hasRun
                  ? "Analyzed by all four agents"
                  : draft
                    ? isProposer
                      ? "Ready to submit"
                      : `Not submitted yet · waiting on ${props.proposer}`
                    : "Not analyzed yet"}
            </div>
            <div className="truncate text-[12px] text-muted" suppressHydrationWarning>
              {running
                ? demoSafe
                  ? "Replaying saved AI answers"
                  : "Gathering evidence, then reasoning"
                : hasRun && props.runs[0]
                  ? `${relTime(props.runs[0].started_at)} · ${providerWords(props.runs[0].provider_summary)}${props.runs[0].duration_ms ? ` · ${(props.runs[0].duration_ms / 1000).toFixed(1)}s` : ""}`
                  : "Submitting runs Sales, Finance, Operations and Legal in parallel. Each lead only signs off where their agent raises a concern."}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {props.runs.length > 1 && (
            <span className="hidden items-center gap-1 text-[12px] text-muted md:inline-flex">
              <History className="size-3.5" /> {props.runs.length} runs
            </span>
          )}
          {(exec || isProposer) && !final && <ReviseDialog decisionId={decisionId} params={props.caseParams} onRevised={() => void submit()} />}
          {hasRun && (
            <Link href={`/packet/${decisionId}`} className={buttonClass("secondary", "md")} target="_blank">
              <FileDown className="size-4" /> Export report
            </Link>
          )}
          {canSubmit && (
            <Button onClick={() => submit()} disabled={running} size="md">
              {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {running ? "Running" : "Submit for review"}
            </Button>
          )}
          {exec && !draft && !final && (
            <Button variant="secondary" onClick={() => run.start()} disabled={running} size="md" title="Runs all four agents again; department sign-offs reset">
              {running ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Re-run all
            </Button>
          )}
        </div>
      </div>
      {fallbackNotes.length > 0 && (
        <div className="mb-4 rounded-xl border border-[#EEDCB8] bg-warn-soft px-3.5 py-2.5 text-[12.5px] text-[#8A5A12]">
          No AI provider answered for some agents, so the rules engine filled in. Results are valid and labelled.
        </div>
      )}

      {(() => {
        const agentGrid = (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {AGENTS.map((a, i) => (
              <AgentCard
                key={a}
                index={i}
                agent={a}
                output={outputs[a]}
                running={running && (!run.only || run.only === a)}
                steps={run.steps[a] ?? []}
                note={run.notes[a]}
                onEvidence={() => setDrawer(a)}
              />
            ))}
          </div>
        );
        const settled = hasRun && !live && !!packetData;
        if (!settled)
          // while the agents run (or before they have), the four agents are the story
          return (
            <>
              {agentGrid}
              <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="min-w-0 space-y-6">
                  {packetData && hasRun ? (
                    <Packet p={packetData} synthesizing={running && !!run.rec && !run.synth} />
                  ) : (
                    <div className="rounded-[12px] border border-dashed border-line px-6 py-12 text-center">
                      <p className="font-display text-[19px] text-ink">Lighthouse’s recommendation will appear here.</p>
                    </div>
                  )}
                </div>
                <div id={hasRun ? "act" : undefined} className="scroll-mt-24 space-y-4">
                  <DecisionPanel persona={persona} decisionId={decisionId} status={status} packet={null} lanes={props.lanes} />
                </div>
              </div>
            </>
          );
        // once analyzed: the brief and the decision; the detail is one click away
        return (
          <>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="min-w-0">
                <DecisionBrief p={packetData!} lanes={props.lanes} />
                <button
                  onClick={() => setShowAll((v) => !v)}
                  aria-expanded={showAll}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2 text-[13.5px] text-ink-2 transition hover:border-[#CFC8BA] hover:text-ink"
                >
                  {showAll ? "Hide the full analysis" : "See the full analysis: four agents, evidence and checks"}
                  <ChevronDown className={cn("size-4 transition-transform", showAll && "rotate-180")} />
                </button>
              </div>
              <div id="act" className="scroll-mt-24 space-y-4">
                <DecisionPanel persona={persona} decisionId={decisionId} status={status} packet={props.packet} lanes={props.lanes} next={props.next} />
              </div>
            </div>
            {showAll && (
              <div className="mt-6 space-y-6">
                {agentGrid}
                <Packet p={packetData!} />
                {props.timeline}
              </div>
            )}
          </>
        );
      })()}

      <EvidenceDrawer agent={drawer} open={!!drawer} onClose={() => setDrawer(null)} evidence={evidence} output={drawer ? outputs[drawer] : undefined} decisionId={decisionId} />
    </>
  );
}

function ReviseDialog({ decisionId, params, onRevised }: { decisionId: string; params: Props["caseParams"]; onRevised: () => void }) {
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
              <Dialog.Description className="mt-1 text-[13px] text-muted">Creates a new revision and runs all four agents again. Earlier sign-offs stay on the old revision.</Dialog.Description>
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
                  onRevised();
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
