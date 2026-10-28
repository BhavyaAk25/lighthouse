"use client";

import * as Popover from "@radix-ui/react-popover";
import * as Switch from "@radix-ui/react-switch";
import { Check, ChevronDown, KeyRound, Loader2, Lock, LogOut, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { login, logout, resetDemoCases, setDemoSafe } from "@/app/actions";
import { cn } from "@/lib/format";
import { PERSONAS, ROLE_LABEL, type Persona } from "@/lib/personas";

const GROUPS: { label: string; filter: (p: Persona) => boolean }[] = [
  { label: "Decides", filter: (p) => p.role === "DECISION_OWNER" },
  { label: "Department leads", filter: (p) => p.role !== "DECISION_OWNER" && p.role !== "ADMIN" },
  { label: "Keeps the system", filter: (p) => p.role === "ADMIN" },
];

/**
 * One-click "view as" for the demo: switching person keeps you on the same page,
 * so a hand-off (Hannah submits, Priya signs, Maya decides) is one click each.
 * Presenter tools live here too: Live AI / Replay and the demo reset.
 */
export function PersonaSwitcher({ persona, counts, demoSafe }: { persona: Persona; counts: Record<string, number>; demoSafe: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [pinFor, setPinFor] = useState(false);
  const [pin, setPin] = useState("");
  const [replay, setReplay] = useState(demoSafe);

  const go = (p: Persona, pinValue?: string) => {
    if (p.id === persona.id) return setOpen(false);
    setBusy(p.id);
    start(async () => {
      const r = await login(p.id, pinValue);
      setBusy(null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setOpen(false);
      setPinFor(false);
      setPin("");
      toast.success(`Now viewing as ${p.name}`, { description: ROLE_LABEL[p.role] });
      router.refresh();
    });
  };

  return (
    <Popover.Root open={open} onOpenChange={(o) => (setOpen(o), o || (setPinFor(false), setPin("")))}>
      <Popover.Trigger asChild>
        <button
          className="flex items-center gap-2 rounded-full border border-line bg-white py-1 pr-2.5 pl-1 text-[12.5px] text-ink-2 transition hover:border-[#D8D3C7]"
          aria-label="Switch person"
        >
          <span className="grid size-6 place-items-center rounded-full text-[10.5px] text-[#F4F1EA]" style={{ background: persona.color }}>
            {persona.initials}
          </span>
          <span className="hidden sm:inline">{persona.name}</span>
          <ChevronDown className="size-3.5 text-faint" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="z-50 w-[300px] rounded-[14px] border border-line bg-white p-2 shadow-pop">
          {GROUPS.map((g) => (
            <div key={g.label} className="mb-1">
              <div className="px-2.5 pt-2 pb-1 text-[12px] text-muted">{g.label}</div>
              {PERSONAS.filter(g.filter).map((p) => (
                <button
                  key={p.id}
                  disabled={pending}
                  onClick={() => (p.role === "ADMIN" && p.id !== persona.id ? setPinFor(true) : go(p))}
                  className={cn("flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left transition hover:bg-canvas", p.id === persona.id && "bg-canvas")}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-full text-[11px] text-[#F4F1EA]" style={{ background: p.color }}>
                    {p.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 text-[13.5px] text-ink">
                      {p.name} {p.role === "ADMIN" && <Lock className="size-3 text-faint" />}
                    </span>
                    <span className="block text-[11.5px] text-muted">{ROLE_LABEL[p.role]}</span>
                  </span>
                  {busy === p.id ? (
                    <Loader2 className="size-4 animate-spin text-muted" />
                  ) : p.id === persona.id ? (
                    <Check className="size-4 text-brass" />
                  ) : counts[p.id] ? (
                    <span className="tnum min-w-5 rounded-full bg-brand-600 px-1.5 text-center text-[11px] text-[#F4F1EA]" title={`${counts[p.id]} waiting for ${p.name.split(" ")[0]}`}>
                      {counts[p.id]}
                    </span>
                  ) : null}
                </button>
              ))}
              {g.label === "Keeps the system" && pinFor && (
                <form
                  className="mx-2.5 mt-1 mb-2 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    go(PERSONAS.find((x) => x.role === "ADMIN")!, pin);
                  }}
                >
                  <div className="relative flex-1">
                    <KeyRound className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-brass" />
                    <input
                      autoFocus
                      type="password"
                      inputMode="numeric"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      placeholder="Admin PIN"
                      className="h-8 w-full rounded-[8px] border border-line pr-2 pl-8 text-[13px] outline-none focus:border-brass"
                    />
                  </div>
                  <button type="submit" disabled={!pin || pending} className="h-8 rounded-[8px] bg-brand-600 px-3 text-[12.5px] text-[#F4F1EA] disabled:opacity-50">
                    Go
                  </button>
                </form>
              )}
            </div>
          ))}
          <div className="mt-1 border-t border-line-2 px-2.5 pt-2.5 pb-1.5">
            <div className="mb-2 text-[12px] text-muted">Presenter</div>
            <label className="flex cursor-pointer items-center justify-between gap-3 py-1 text-[13px] text-ink-2">
              <span>
                {replay ? "Replay saved AI answers" : "Live AI"}
                <span className="block text-[11.5px] text-muted">{replay ? "Instant and identical every time" : "Gemini, with Groq as backup"}</span>
              </span>
              <Switch.Root
                checked={replay}
                onCheckedChange={(v) => {
                  setReplay(v);
                  start(async () => {
                    await setDemoSafe(v);
                    toast.success(v ? "Replay on: agents replay saved AI answers." : "Live AI on: agents call Gemini, with Groq as backup.");
                    router.refresh();
                  });
                }}
                className="relative h-5 w-9 shrink-0 rounded-full bg-line transition-colors data-[state=checked]:bg-brass"
              >
                <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
              </Switch.Root>
            </label>
            <button
              disabled={pending}
              onClick={() => {
                if (!window.confirm("Reset the 12 demo cases to the starting state? The audit log keeps everything.")) return;
                start(async () => {
                  const r = await resetDemoCases();
                  if (!r.ok) toast.error(r.error);
                  else {
                    toast.success(r.message ?? "Demo reset");
                    setOpen(false);
                    router.refresh();
                  }
                });
              }}
              className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-[8px] border border-line py-1.5 text-[12.5px] text-ink-2 hover:bg-canvas"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />} Reset demo cases
            </button>
          </div>
          <button
            onClick={() => start(() => logout())}
            className="mt-1 flex w-full items-center gap-2 rounded-[9px] px-2.5 py-2 text-[13px] text-muted transition hover:bg-canvas hover:text-ink"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
