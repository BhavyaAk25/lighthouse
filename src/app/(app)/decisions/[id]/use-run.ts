"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { RunEvent } from "@/lib/runs";
import type { SynthesisResult } from "@/lib/ai/synthesis";
import type { AgentOutput, AgentType, EvidenceItem, Reconciliation } from "@/lib/types";
import type { ToolStep } from "./agent-card";

/** Streams an agent run from /api/decisions/:id/run (all four agents, or one with `agent`). */
export function useRun(decisionId: string) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [only, setOnly] = useState<AgentType | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<Partial<Record<AgentType, AgentOutput>>>({});
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [steps, setSteps] = useState<Record<string, ToolStep[]>>({});
  const [notes, setNotes] = useState<Partial<Record<AgentType, string>>>({});
  const [rec, setRec] = useState<Reconciliation | null>(null);
  const [synth, setSynth] = useState<SynthesisResult | null>(null);
  const startedAt = useRef(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((Date.now() - startedAt.current) / 1000), 100);
    return () => clearInterval(t);
  }, [running]);

  const start = async (agent?: AgentType) => {
    setRunning(true);
    setOnly(agent ?? null);
    setOutputs({});
    setEvidence([]);
    setSteps({});
    setNotes({});
    setRec(null);
    setSynth(null);
    startedAt.current = Date.now();
    setElapsed(0);
    try {
      const res = await fetch(`/api/decisions/${decisionId}/run${agent ? `?agent=${agent}` : ""}`, { method: "POST" });
      if (!res.ok || !res.body) {
        toast.error((await res.text()) || "Run failed");
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
          if (ev.type === "run_started") setRunId(ev.run_id);
          else if (ev.type === "tool") setSteps((s) => ({ ...s, [ev.agent]: [...(s[ev.agent] ?? []), { name: ev.name, detail: ev.detail, ms: ev.ms }] }));
          else if (ev.type === "agent_output") {
            setOutputs((o) => ({ ...o, [ev.agent]: ev.output }));
            setEvidence((e) => [...e.filter((x) => x.agent_type !== ev.agent), ...ev.evidence]);
            if (ev.note) setNotes((n) => ({ ...n, [ev.agent]: ev.note }));
          } else if (ev.type === "reconciled") setRec(ev.reconciliation);
          else if (ev.type === "synthesis") setSynth(ev.synthesis);
          else if (ev.type === "done") {
            const s = (ev.duration_ms / 1000).toFixed(1);
            toast.success(
              agent
                ? `Agent re-run in ${s}s. Sign off on its new answer.`
                : ev.status === "READY_FOR_DECISION"
                  ? `Analyzed in ${s}s. No department needs to sign off, so it went straight to Maya.`
                  : `Analyzed in ${s}s. Sent to the departments that need to sign off.`,
            );
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

  return { running, only, runId, outputs, evidence, steps, notes, rec, synth, elapsed, start };
}
