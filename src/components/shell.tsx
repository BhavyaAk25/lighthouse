"use client";

import * as Switch from "@radix-ui/react-switch";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  CalendarClock,
  ChevronsUpDown,
  Database,
  FlaskConical,
  Inbox,
  LayoutDashboard,
  Layers,
  LogOut,
  Menu,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { logout, setDemoSafe } from "@/app/actions";
import { cn } from "@/lib/format";
import { ROLE_LABEL, type Persona } from "@/lib/personas";
import { Wordmark } from "./logo";

const NAV = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/decisions", label: "Decisions", icon: Layers },
  { href: "/review", label: "Review queue", icon: Inbox, badge: true },
  { href: "/audit", label: "Audit log", icon: ShieldCheck },
  { href: "/data", label: "Data & evidence", icon: Database },
  { href: "/roi", label: "ROI model", icon: TrendingUp },
  { href: "/test-lab", label: "Test lab", icon: FlaskConical },
  { href: "/admin", label: "Rules & agents", icon: SlidersHorizontal },
];

export function Sidebar({ persona, queueCount, open, onClose }: { persona: Persona; queueCount: number; open: boolean; onClose: () => void }) {
  const path = usePathname();
  return (
    <>
      <div className={cn("fixed inset-0 z-30 bg-ink/30 backdrop-blur-[2px] transition-opacity lg:hidden", open ? "opacity-100" : "pointer-events-none opacity-0")} onClick={onClose} />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-line bg-white transition-transform duration-200 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between px-4">
          <Link href="/overview" onClick={onClose}>
            <Wordmark />
          </Link>
          <button className="rounded-lg p-1.5 text-muted hover:bg-line-2 lg:hidden" onClick={onClose} aria-label="Close menu">
            <X className="size-4" />
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2 scrollbar-thin">
          {NAV.map((n) => {
            const active = path === n.href || path.startsWith(`${n.href}/`);
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={onClose}
                className={cn(
                  "group flex h-9 items-center gap-2.5 rounded-[9px] px-2.5 text-[14px] font-medium transition-colors",
                  active ? "bg-brand-50 text-brand-700" : "text-ink-2 hover:bg-line-2 hover:text-ink",
                )}
              >
                <Icon className={cn("size-[17px]", active ? "text-brand-600" : "text-faint group-hover:text-muted")} />
                <span className="flex-1">{n.label}</span>
                {n.badge && queueCount > 0 && (
                  <span className={cn("tnum rounded-full px-1.5 text-[11px] font-semibold", active ? "bg-brand-600 text-white" : "bg-brand-100 text-brand-700")}>{queueCount}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line p-3">
          <PersonaCard persona={persona} />
        </div>
      </aside>
    </>
  );
}

function PersonaCard({ persona }: { persona: Persona }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="rounded-xl border border-line bg-canvas p-2.5">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-semibold text-white" style={{ background: persona.color }}>
          {persona.initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold text-ink">{persona.name}</div>
          <div className="truncate text-[12px] text-muted">{ROLE_LABEL[persona.role]}</div>
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
        <button
          onClick={() => router.push("/login")}
          className="inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-line bg-white text-[12px] font-medium text-ink-2 hover:bg-line-2"
        >
          <ChevronsUpDown className="size-3.5" /> Switch role
        </button>
        <button
          disabled={pending}
          onClick={() => start(() => logout())}
          className="inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-line bg-white text-[12px] font-medium text-ink-2 hover:bg-line-2"
        >
          <LogOut className="size-3.5" /> Sign out
        </button>
      </div>
    </div>
  );
}

export function Topbar({ demoSafe, pilotClock, onMenu }: { demoSafe: boolean; pilotClock: string; onMenu: () => void }) {
  const [pending, start] = useTransition();
  const [on, setOn] = useState(demoSafe);
  return (
    <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-white/80 px-4 backdrop-blur-md sm:px-6">
      <button className="rounded-lg p-1.5 text-muted hover:bg-line-2 lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu className="size-5" />
      </button>
      <div className="flex-1" />
      <Tooltip.Provider delayDuration={150}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <div className="hidden items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[12px] font-medium text-ink-2 sm:flex">
              <CalendarClock className="size-3.5 text-muted" /> Pilot clock · {pilotClock}
            </div>
          </Tooltip.Trigger>
          <Tooltip.Content sideOffset={6} className="z-50 max-w-[260px] rounded-lg bg-ink px-3 py-2 text-[12px] text-white shadow-pop">
            Evidence freshness is measured against the pilot clock. The data snapshot ends one day earlier.
          </Tooltip.Content>
        </Tooltip.Root>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <label className="flex cursor-pointer items-center gap-2 rounded-full border border-line bg-white py-1 pr-1 pl-2.5 text-[12px] font-medium text-ink-2">
              <span className={cn("size-2 rounded-full", on ? "bg-warn" : "bg-ok animate-pulse-soft")} />
              {on ? "Demo-safe replay" : "Live AI"}
              <Switch.Root
                checked={on}
                disabled={pending}
                onCheckedChange={(v) => {
                  setOn(v);
                  start(async () => {
                    await setDemoSafe(v);
                    toast.success(v ? "Demo-safe mode on: agent runs replay saved AI answers." : "Live AI on: agents call Gemini / Groq.");
                  });
                }}
                className="relative h-5 w-9 rounded-full bg-line transition-colors data-[state=checked]:bg-warn"
              >
                <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
              </Switch.Root>
            </label>
          </Tooltip.Trigger>
          <Tooltip.Content sideOffset={6} className="z-50 max-w-[280px] rounded-lg bg-ink px-3 py-2 text-[12px] text-white shadow-pop">
            Live AI calls Gemini (free tier) with automatic Groq fallback. Demo-safe replays the last saved AI answers, so the demo never depends on Wi-Fi.
          </Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>
    </header>
  );
}

export function AppFrame({ persona, queueCount, demoSafe, pilotClock, children }: { persona: Persona; queueCount: number; demoSafe: boolean; pilotClock: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen">
      <Sidebar persona={persona} queueCount={queueCount} open={open} onClose={() => setOpen(false)} />
      <div className="lg:pl-[248px]">
        <Topbar demoSafe={demoSafe} pilotClock={pilotClock} onMenu={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
