"use client";

import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { verifyAuditChain } from "@/app/actions";
import { Button } from "@/components/ui";
import { cn } from "@/lib/format";

export function VerifyChain() {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<{ entries: number; first_broken_seq: number | null; last_hash: string; ms: number } | null>(null);
  return (
    <div className={cn("card flex flex-col gap-3 p-4 sm:flex-row sm:items-center", res && (res.first_broken_seq ? "border-[#f9cbc7]" : "border-[#c6ecd9]"))}>
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", res?.first_broken_seq ? "bg-bad-soft text-bad" : "bg-ok-soft text-ok")}>
        {res?.first_broken_seq ? <ShieldAlert className="size-5" /> : <ShieldCheck className="size-5" />}
      </span>
      <div className="min-w-0 flex-1">
        {res ? (
          res.first_broken_seq ? (
            <>
              <div className="text-[14px] font-semibold text-[#b42318]">Chain broken at entry #{res.first_broken_seq}</div>
              <div className="text-[12.5px] text-muted">An entry was altered after it was written.</div>
            </>
          ) : (
            <>
              <div className="text-[14px] font-semibold">Chain intact · {res.entries.toLocaleString()} entries verified in {(res.ms / 1000).toFixed(1)}s</div>
              <div className="truncate font-mono text-[11.5px] text-muted">head {res.last_hash}</div>
            </>
          )
        ) : (
          <>
            <div className="text-[14px] font-semibold">Tamper-evidence check</div>
            <div className="text-[12.5px] text-muted">Recomputes every SHA-256 link from the first entry to the latest inside the database.</div>
          </>
        )}
      </div>
      <Button
        variant={res ? "secondary" : "primary"}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const t = Date.now();
            const r = await verifyAuditChain();
            setRes({ ...r, ms: Date.now() - t });
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} {res ? "Verify again" : "Verify chain"}
      </Button>
    </div>
  );
}
