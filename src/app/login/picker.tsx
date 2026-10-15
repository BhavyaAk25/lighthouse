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
      router.push("/home");
      router.refresh();
    });
  };

  return (
    <>
      <div className="mt-8 divide-y divide-line-2 border-y border-line-2">
        {personas.map((p) => (
          <button
            key={p.id}
            disabled={pending}
            onClick={() => (p.role === "ADMIN" ? setPinFor(p) : go(p))}
            className="group flex w-full items-center gap-4 py-3.5 text-left transition-colors"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full text-[13px] text-[#F4F1EA]" style={{ background: p.color }}>
              {p.initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[15px] text-ink group-hover:text-brand-700">
                {p.name}
                {p.role === "ADMIN" && <Lock className="size-3 text-faint" />}
              </span>
              <span className="block text-[12.5px] text-muted">{ROLE_LABEL[p.role]}</span>
            </span>
            <span className={cn("shrink-0 transition", currentId === p.id ? "text-brass" : "text-faint group-hover:translate-x-0.5 group-hover:text-ink")}>
              {busy === p.id ? <Loader2 className="size-4 animate-spin" /> : currentId === p.id ? <Check className="size-4" /> : <ArrowRight className="size-4" />}
            </span>
          </button>
        ))}
      </div>

      <Dialog.Root open={!!pinFor} onOpenChange={(o) => !o && (setPinFor(null), setPin(""))}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px]" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[92vw] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-pop">
            <KeyRound className="size-5 text-brass" />
            <Dialog.Title className="font-display mt-3 text-[22px] leading-none">Administrator PIN</Dialog.Title>
            <Dialog.Description className="mt-2 text-[13px] text-muted">Every attempt is logged.</Dialog.Description>
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
                className="h-11 w-full rounded-[8px] border border-line px-3.5 text-center font-mono text-lg tracking-[0.4em] outline-none focus:border-brass focus:shadow-glow"
              />
              <Button type="submit" className="w-full" size="lg" disabled={!pin || pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : "Continue"}
              </Button>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
