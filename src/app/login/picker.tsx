"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, Check, KeyRound, Loader2, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { login } from "@/app/actions";
import { Button } from "@/components/ui";
import { cn } from "@/lib/format";
import { ROLE_LABEL, type Persona } from "@/lib/personas";

export function PersonaPicker({ personas, currentId }: { personas: Persona[]; currentId?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [pinFor, setPinFor] = useState<Persona | null>(null);
  const [pin, setPin] = useState("");

  const go = (p: Persona, pinValue?: string) => {
    setBusy(p.id);
    start(async () => {
      const r = await login(p.id, pinValue);
      if (!r.ok) {
        toast.error(r.error);
        setBusy(null);
        return;
      }
      toast.success(`Signed in as ${p.name}`);
      router.push(p.role === "LEGAL_REVIEWER" ? "/review" : p.role === "ADMIN" ? "/admin" : "/overview");
      router.refresh();
    });
  };

  return (
    <>
      <div className="mt-6 space-y-2.5">
        {personas.map((p) => (
          <button
            key={p.id}
            disabled={pending}
            onClick={() => (p.role === "ADMIN" ? setPinFor(p) : go(p))}
            className={cn(
              "group flex w-full items-center gap-3.5 rounded-[14px] border bg-white p-3.5 text-left shadow-card transition-all hover:-translate-y-[1px] hover:border-brand-300 hover:shadow-pop",
              currentId === p.id ? "border-brand-400 ring-4 ring-brand-50" : "border-line",
            )}
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-full text-[14px] font-semibold text-white" style={{ background: p.color }}>
              {p.initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-[14.5px] font-semibold text-ink">{p.name}</span>
                <span className="rounded-full bg-line-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-2">{ROLE_LABEL[p.role]}</span>
                {p.role === "ADMIN" && <Lock className="size-3.5 text-faint" />}
              </span>
              <span className="mt-0.5 block text-[12.5px] text-muted">{p.title}</span>
              <span className="mt-1 block text-[12.5px] leading-snug text-ink-2">{p.blurb}</span>
            </span>
            <span className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600">
              {busy === p.id ? <Loader2 className="size-4 animate-spin" /> : currentId === p.id ? <Check className="size-4 text-brand-600" /> : <ArrowRight className="size-4" />}
            </span>
          </button>
        ))}
      </div>

      <Dialog.Root open={!!pinFor} onOpenChange={(o) => !o && (setPinFor(null), setPin(""))}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px]" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[92vw] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-pop">
            <div className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <KeyRound className="size-5" />
            </div>
            <Dialog.Title className="mt-3 text-[17px] font-semibold">Administrator verification</Dialog.Title>
            <Dialog.Description className="mt-1 text-[13.5px] text-muted">
              Rule and threshold changes are restricted to the AI Governance Administrator. Enter the admin PIN. Every attempt is written to the audit log.
            </Dialog.Description>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (pinFor) go(pinFor, pin);
              }}
              className="mt-4 space-y-3"
            >
              <input
                autoFocus
                inputMode="numeric"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="PIN"
                className="h-11 w-full rounded-xl border border-line px-3.5 text-center font-mono text-lg tracking-[0.4em] outline-none focus:border-brand-400 focus:shadow-glow"
              />
              <Button type="submit" className="w-full" size="lg" disabled={!pin || pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : "Verify and continue"}
              </Button>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
