"use client";

import * as Switch from "@radix-ui/react-switch";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ChevronsUpDown, FlaskConical, Gauge, History, Inbox, LayoutDashboard, Layers, LogOut, Menu, ShieldCheck, SlidersHorizontal, Workflow, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { logout, setDemoSafe } from "@/app/actions";
import { cn } from "@/lib/format";
import { ROLE_LABEL, type Persona } from "@/lib/personas";
import { Wordmark } from "./logo";

type NavItem = { href: string; label: string; icon: typeof Inbox; badge?: boolean; match?: string[] };
const HOME: NavItem = { href: "/home", label: "My desk", icon: Inbox, badge: true };
const FLOW: NavItem = { href: "/flow", label: "Flow", icon: Workflow };
const INSIGHTS: NavItem = { href: "/overview", label: "Insights", icon: LayoutDashboard, match: ["/overview", "/data", "/roi"] };
const NAV_BY_ROLE: Record<Persona["role"], NavItem[]> = {
  DECISION_OWNER: [HOME, FLOW, { href: "/decisions", label: "Decisions", icon: Layers }, INSIGHTS, { href: "/audit", label: "Audit", icon: ShieldCheck }],
  LEGAL_REVIEWER: [HOME, FLOW, { href: "/history", label: "My reviews", icon: History }],
  FINANCE_REVIEWER: [HOME, FLOW, { href: "/history", label: "My notes", icon: History }],
  SALES_REVIEWER: [HOME, FLOW, { href: "/history", label: "My notes", icon: History }],
  OPERATIONS_REVIEWER: [HOME, FLOW, { href: "/history", label: "My notes", icon: History }],
  ADMIN: [
    { href: "/home", label: "System", icon: Gauge },
    FLOW,
    { href: "/admin", label: "Rules & agents", icon: SlidersHorizontal },
    { href: "/audit", label: "Audit", icon: ShieldCheck },
    { href: "/test-lab", label: "Test lab", icon: FlaskConical },
    INSIGHTS,
  ],
};

export function Sidebar({ persona, queueCount, open, onClose }: { persona: Persona; queueCount: number; open: boolean; onClose: () => void }) {
  const path = usePathname();
  return (
    <>
      <div className={cn("fixed inset-0 z-30 bg-ink/30 backdrop-blur-[2px] transition-opacity lg:hidden", open ? "opacity-100" : "pointer-events-none opacity-0")} onClick={onClose} />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[232px] flex-col border-r border-line bg-white transition-transform duration-200 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link href="/home" onClick={onClose}>
            <Wordmark />
          </Link>
          <button className="rounded-lg p-1.5 text-muted hover:bg-line-2 lg:hidden" onClick={onClose} aria-label="Close menu">
            <X className="size-4" />
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4 scrollbar-thin">
          {NAV_BY_ROLE[persona.role].map((n) => {
            const active = (n.match ?? [n.href]).some((h) => path === h || path.startsWith(`${h}/`));
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={onClose}
                className={cn(
                  "group relative flex h-9 items-center gap-3 rounded-[8px] px-3 text-[14px] transition-colors",
                  active ? "bg-canvas text-ink" : "text-muted hover:bg-canvas hover:text-ink",
                )}
              >
                {active && <span className="absolute top-2 bottom-2 left-0 w-[2px] rounded-full bg-brass" />}
                <Icon className={cn("size-[16px]", active ? "text-ink" : "text-faint group-hover:text-muted")} strokeWidth={1.6} />
                <span className="flex-1">{n.label}</span>
                {n.badge && queueCount > 0 && (
                  <span className="tnum min-w-5 rounded-full bg-brand-600 px-1.5 text-center text-[11px] font-medium text-[#F4F1EA]">{queueCount}</span>
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
    <div className="rounded-[10px] p-1.5">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full text-[12.5px] font-medium text-[#F4F1EA]" style={{ background: persona.color }}>
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
          className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-line bg-white text-[12px] text-ink-2 hover:bg-canvas"
        >
          <ChevronsUpDown className="size-3.5" /> Switch
        </button>
        <button
          disabled={pending}
          onClick={() => start(() => logout())}
          className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-line bg-white text-[12px] text-ink-2 hover:bg-canvas"
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
    <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-line bg-canvas/85 px-4 backdrop-blur-md sm:px-8">
      <button className="rounded-lg p-1.5 text-muted hover:bg-line-2 lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu className="size-5" />
      </button>
      <div className="flex-1" />
      <Tooltip.Provider delayDuration={150}>
        <span className="hidden text-[12px] text-faint sm:inline">Pilot clock · {pilotClock}</span>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <label className="flex cursor-pointer items-center gap-2 rounded-full border border-line bg-white py-1 pr-1 pl-3 text-[12px] text-ink-2">
              <span className={cn("size-1.5 rounded-full", on ? "bg-brass" : "bg-ok animate-pulse-soft")} />
              {on ? "Replay" : "Live AI"}
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
                className="relative h-5 w-9 rounded-full bg-line transition-colors data-[state=checked]:bg-brass"
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
      <div className="lg:pl-[232px]">
        <Topbar demoSafe={demoSafe} pilotClock={pilotClock} onMenu={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-8 lg:py-12">{children}</main>
      </div>
    </div>
  );
}
