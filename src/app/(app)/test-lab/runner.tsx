"use client";

import { CheckCircle2, ChevronDown, FlaskConical, Loader2, Play, XCircle } from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";
import { useState, useTransition } from "react";
import { runTests } from "@/app/actions";
import { Badge, Button, Card } from "@/components/ui";
import { cn } from "@/lib/format";
import type { TestResult } from "@/lib/testlab";

export function TestRunner() {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<{ results: TestResult[]; ms: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const passed = res?.results.filter((r) => r.passed).length ?? 0;
  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", res ? (passed === res.results.length ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn") : "bg-brand-50 text-brand-600")}>
          <FlaskConical className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          {res ? (
            <>
              <div className="text-[18px] font-semibold tracking-tight">
                {passed} / {res.results.length} acceptance tests passed
              </div>
              <div className="text-[13px] text-muted">Completed in {(res.ms / 1000).toFixed(1)} s · result written to the audit log</div>
            </>
          ) : (
            <>
              <div className="text-[16px] font-semibold">Run the acceptance suite</div>
              <div className="text-[13px] text-muted">Agreement, conflict, hard stops, legal gate, missing and stale evidence, overrides, audit replay, guardrails, injection screening, performance and scale.</div>
            </>
          )}
        </div>
        <Button size="lg" onClick={() => start(async () => setRes(await runTests()))} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} {res ? "Run again" : "Run all tests"}
        </Button>
      </Card>
      {res && (
        <Card className="overflow-hidden">
          <ul>
            {res.results.map((r, i) => (
              <motion.li key={r.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="border-b border-line-2 last:border-0">
                <button onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-canvas/70">
                  {r.passed ? <CheckCircle2 className="size-5 shrink-0 text-ok" /> : <XCircle className="size-5 shrink-0 text-bad" />}
                  <span className="w-9 shrink-0 font-mono text-[12px] text-muted">{r.id}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium text-ink">{r.name}</span>
                    <span className="block truncate text-[12.5px] text-muted">{r.criterion}</span>
                  </span>
                  <Badge tone="neutral" className="hidden sm:inline-flex">{r.objective}</Badge>
                  <span className="tnum w-14 shrink-0 text-right text-[12px] text-faint">{r.ms} ms</span>
                  <ChevronDown className={cn("size-4 shrink-0 text-faint transition-transform", open === r.id && "rotate-180")} />
                </button>
                {open === r.id && (
                  <div className="border-t border-line-2 bg-canvas/60 px-5 py-3 pl-[76px]">
                    <ul className="space-y-1 text-[12.5px] text-ink-2">
                      {r.details.map((d, j) => (
                        <li key={j} className="font-mono text-[12px]">{d}</li>
                      ))}
                    </ul>
                    {r.caseId && (
                      <Link href={`/decisions/${r.caseId}`} className="mt-2 inline-block text-[12.5px] font-medium text-brand-700 hover:underline">
                        Open {r.caseId} →
                      </Link>
                    )}
                  </div>
                )}
              </motion.li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
