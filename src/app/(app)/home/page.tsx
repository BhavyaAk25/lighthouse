import { ArrowRight, Check, Hourglass, Plus } from "lucide-react";
import Link from "next/link";
import { LaneDots, RecBadge } from "@/components/domain";
import { Card, LinkButton } from "@/components/ui";
import type { AgentType } from "@/lib/types";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { cn, money } from "@/lib/format";
import { DEPT_OF, ROLE_LABEL } from "@/lib/personas";
import { DEPT_NAME } from "@/lib/signoff";
import type { Recommendation } from "@/lib/types";
import { loadPipeline, myProcess, workFor, type WorkItem } from "@/lib/work";

export const dynamic = "force-dynamic";
export const metadata = { title: "My desk" };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function YourPart({ steps }: { steps: { label: string; you: boolean }[] }) {
  return (
    <div className="mb-12">
      <div className="mb-3 text-[11.5px] tracking-[0.14em] text-muted uppercase">Your part in the process</div>
      <ol className="grid gap-2 sm:auto-cols-fr sm:grid-flow-col">
        {steps.map((s, i) => (
          <li
            key={i}
            className={cn(
              "flex items-start gap-3 rounded-[12px] border px-4 py-3.5 text-[13.5px] leading-snug",
              s.you ? "border-brass bg-brass-soft text-ink" : "border-line bg-white text-muted",
            )}
          >
            <span className={cn("tnum mt-px grid size-5 shrink-0 place-items-center rounded-full text-[11px]", s.you ? "bg-brass text-white" : "bg-canvas text-faint")}>{i + 1}</span>
            <span>
              {s.label}
              {s.you && <span className="mt-1 block text-[11px] tracking-[0.12em] text-brass-dark uppercase">You</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function NowRow({ w }: { w: WorkItem }) {
  return (
    <Link href={`/decisions/${w.c.decision_id}#act`} className="group flex flex-col gap-3 px-5 py-4 hover:bg-canvas/70 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[11.5px] text-faint">{w.c.decision_id}</span>
          {w.c.rec && <RecBadge rec={w.c.rec as Recommendation} short />}
          {w.c.impact !== null && <span className="tnum text-[12px] text-faint">{money(w.c.impact)} at stake</span>}
        </div>
        <div className="mt-1 text-[15px] text-ink">{w.c.title}</div>
        <div className="mt-1 text-[13px] text-muted">{w.why}</div>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-[8px] bg-brand-600 px-3 py-2 text-[13px] text-[#F4F1EA] transition group-hover:bg-brand-700 sm:self-center">
        {w.action} <ArrowRight className="size-3.5" />
      </span>
    </Link>
  );
}

function WaitRow({ w, highlight }: { w: WorkItem; highlight?: AgentType }) {
  return (
    <Link href={`/decisions/${w.c.decision_id}`} className="flex items-start gap-3 px-5 py-3.5 hover:bg-canvas/70">
      <Hourglass className="mt-0.5 size-4 shrink-0 text-brass" strokeWidth={1.6} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] text-ink">{w.c.title}</div>
        <div className="text-[12.5px] text-muted">
          Waiting on <span className="text-ink-2">{w.waitingOn}</span> · {w.why}
        </div>
      </div>
      {w.c.lanes.some((l) => l.state !== "NOT_STARTED") && <LaneDots lanes={w.c.lanes.map((l) => ({ dept: l.dept, state: l.state, lead: l.lead.name }))} highlight={highlight} className="hidden sm:inline-flex" />}
      <span className="font-mono text-[11.5px] text-faint">{w.c.decision_id}</span>
    </Link>
  );
}

function Section({ title, count, children, empty }: { title: string; count: number; children: React.ReactNode; empty: string }) {
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-[11.5px] tracking-[0.14em] text-muted uppercase">{title}</h2>
        <span className="tnum text-[12px] text-faint">{count}</span>
      </div>
      {count === 0 ? <p className="rounded-[12px] border border-dashed border-line px-5 py-5 text-[13.5px] text-muted">{empty}</p> : <div className="card divide-y divide-line-2 overflow-hidden">{children}</div>}
    </section>
  );
}

export default async function Home() {
  const persona = await requireSession();
  const first = persona.name.split(" ")[0];

  if (persona.role === "ADMIN") {
    const [s] = await db()`select (select count(*) from legal_rules where enabled)::int rules, (select count(*) from agent_runs where mode = 'LIVE_AI')::int live_runs,
                  (select count(*) from agent_outputs where jsonb_array_length(guardrail_adjustments) > 0)::int guarded, (select count(*) from audit_log)::int audit`;
    const tiles = [
      ["Active legal rules", s.rules, "/admin"],
      ["Live AI runs", s.live_runs, "/audit?action=AGENTS_RUN_COMPLETED"],
      ["Guardrail corrections", s.guarded, "/audit?action=GUARDRAIL_APPLIED"],
      ["Audit entries", Number(s.audit).toLocaleString(), "/audit"],
    ] as const;
    return (
      <div className="mx-auto max-w-[960px]">
        <div className="mb-10">
          <div className="text-[11.5px] tracking-[0.14em] text-brass-dark uppercase">{ROLE_LABEL[persona.role]}</div>
          <h1 className="font-display mt-2 text-[36px] leading-[1.05]">
            {greeting()}, {first}.
          </h1>
          <p className="mt-3 text-[15px] text-muted">You don’t decide cases. You keep the rules, thresholds, AI settings and audit trail trustworthy.</p>
        </div>
        <YourPart steps={myProcess(persona.role)} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map(([l, v, href]) => (
            <Link key={l} href={href}>
              <Card className="p-4 transition hover:border-[#D8D3C7]">
                <div className="text-[12.5px] text-muted">{l}</div>
                <div className="font-display tnum mt-1.5 text-[28px] leading-none">{v}</div>
              </Card>
            </Link>
          ))}
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <LinkButton href="/admin" variant="secondary">Edit rules & thresholds</LinkButton>
          <LinkButton href="/audit" variant="secondary">Verify the audit trail</LinkButton>
          <LinkButton href="/test-lab" variant="secondary">Run acceptance tests</LinkButton>
        </div>
      </div>
    );
  }

  const work = workFor(persona, await loadPipeline());
  const dept = DEPT_OF[persona.role];
  const exec = persona.role === "DECISION_OWNER";
  const n = work.now.length;
  const line = n
    ? `${n} ${n === 1 ? "thing needs" : "things need"} you.${exec && work.waiting.length ? ` ${work.waiting.length} more ${work.waiting.length === 1 ? "is" : "are"} in department sign-off.` : ""}`
    : exec && work.waiting.length
      ? `Nothing needs you yet. ${work.waiting.length} ${work.waiting.length === 1 ? "case is" : "cases are"} in department sign-off.`
      : "Nothing needs you right now.";

  return (
    <div className="mx-auto max-w-[960px]">
      <div className="mb-10 flex items-start justify-between gap-4">
        <div>
          <div className="text-[11.5px] tracking-[0.14em] text-brass-dark uppercase">{ROLE_LABEL[persona.role]}</div>
          <h1 className="font-display mt-2 text-[36px] leading-[1.05]">
            {greeting()}, {first}.
          </h1>
          <p className="mt-3 text-[15px] text-muted">{line}</p>
        </div>
        <LinkButton href="/decisions/new" variant="secondary" className="mt-6 shrink-0">
          <Plus className="size-4" /> {exec ? "New case" : "Propose a case"}
        </LinkButton>
      </div>

      <YourPart steps={myProcess(persona.role)} />

      <Section title="Needs you now" count={n} empty="You’re clear. New work will appear here.">
        {work.now.map((w) => (
          <NowRow key={w.c.decision_id} w={w} />
        ))}
      </Section>

      {work.waiting.length > 0 && (
        <Section title={exec ? "In department sign-off" : "Your proposals"} count={work.waiting.length} empty="">
          {work.waiting.slice(0, 6).map((w) => (
            <WaitRow key={w.c.decision_id} w={w} highlight={dept} />
          ))}
          {work.waiting.length > 6 && (
            <Link href="/flow" className="block px-5 py-3 text-[13px] text-muted hover:bg-canvas/70 hover:text-ink">
              {work.waiting.length - 6} more in Flow →
            </Link>
          )}
        </Section>
      )}

      {dept && work.autoCleared > 0 && (
        <Link href="/flow#signoff" className="card mb-10 flex items-center gap-4 px-5 py-4 hover:border-[#D8D3C7]">
          <Check className="size-4 shrink-0 text-ok" />
          <span className="min-w-0 flex-1 text-[14px] text-ink-2">
            {work.autoCleared} {work.autoCleared === 1 ? "case" : "cases"} cleared without you: your {DEPT_NAME[dept]} agent found no concern, so no sign-off was needed.
          </span>
          <span className="shrink-0 text-[13px] text-muted">See Flow →</span>
        </Link>
      )}

      {work.done.length > 0 && (
        <Section title="Done" count={work.done.length} empty="">
          {work.done.slice(0, 6).map((w) => (
            <Link key={w.c.decision_id} href={`/decisions/${w.c.decision_id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-canvas/70">
              <Check className="size-4 shrink-0 text-ok" />
              <span className="min-w-0 flex-1 truncate text-[14px] text-ink-2">{w.c.title}</span>
              <span className="text-[12.5px] text-muted">{w.why}</span>
            </Link>
          ))}
        </Section>
      )}
    </div>
  );
}
