import { Plus } from "lucide-react";
import Link from "next/link";
import { DeskRow, DeskSection, Greeting, WaitingNote, WaitingRow } from "@/components/desk";
import { AGENT_META } from "@/components/domain";
import { Card, LinkButton } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { legalDesk, ownerDesk, reviewerDesk } from "@/lib/desk";
import { ROLE_LABEL } from "@/lib/personas";

export const dynamic = "force-dynamic";
export const metadata = { title: "My desk" };

export default async function Home() {
  const persona = await requireSession();

  if (persona.role === "DECISION_OWNER") {
    const d = await ownerDesk(persona.name);
    const need = d.ready.length + d.toRun.length;
    return (
      <div className="mx-auto max-w-[880px]">
        <div className="flex items-start justify-between gap-4">
          <Greeting
            name={persona.name}
            eyebrow={ROLE_LABEL[persona.role]}
            line={need ? `${d.readyCount} ${d.readyCount === 1 ? "decision is" : "decisions are"} ready for you, and ${d.toRun.length} ${d.toRun.length === 1 ? "case needs" : "cases need"} the agents.` : "You’re all caught up."}
          />
          <LinkButton href="/decisions/new" variant="secondary" className="mt-6 shrink-0">
            <Plus className="size-4" /> New decision
          </LinkButton>
        </div>
        <DeskSection title="Run the agents" count={d.toRun.length} empty={d.toRun.length ? undefined : "No drafts."}>
          {d.toRun.map((i) => (
            <DeskRow key={i.decision_id} item={i} action="Analyze" sub={i.note} />
          ))}
        </DeskSection>
        <DeskSection title="Ready for your decision" count={d.readyCount} empty={d.ready.length ? undefined : "Nothing waiting for a decision."}>
          {d.ready.map((i) => (
            <DeskRow key={i.decision_id} item={i} action="Decide" sub={i.note && i.note.includes(":") ? i.note : undefined} />
          ))}
        </DeskSection>
        <DeskSection title="Waiting on others" count={d.waitingCount} empty={d.waiting.length ? undefined : "Nobody is holding up your decisions."}>
          {d.waiting.map((i) => (
            <WaitingRow key={i.decision_id} item={i} who="Priya Raman · Legal review" />
          ))}
        </DeskSection>
      </div>
    );
  }

  if (persona.role === "LEGAL_REVIEWER") {
    const d = await legalDesk();
    return (
      <div className="mx-auto max-w-[880px]">
        <Greeting
          name={persona.name}
          eyebrow={ROLE_LABEL[persona.role]}
          line={d.total ? `${d.total} ${d.total === 1 ? "case needs" : "cases need"} your legal review before anyone can approve.` : "No cases need legal review."}
        />
        <DeskSection title="Needs your review" count={d.total} empty={d.todo.length ? undefined : "Nothing to review right now."}>
          {d.todo.map((i) => (
            <DeskRow key={i.decision_id} item={i} action="Review" sub={i.note ? `Flagged: ${i.note}` : undefined} showRec={false} />
          ))}
        </DeskSection>
        {d.upstream > 0 && <WaitingNote>{d.upstream} new cases are waiting on Maya Chen to run the agents. Any that need legal review will appear here.</WaitingNote>}
      </div>
    );
  }

  if (persona.role === "ADMIN") {
    const [[s]] = await Promise.all([
      db()`select (select count(*) from legal_rules where enabled)::int rules, (select count(*) from agent_runs where mode = 'LIVE_AI')::int live_runs,
                  (select count(*) from agent_outputs where jsonb_array_length(guardrail_adjustments) > 0)::int guarded,
                  (select count(*) from audit_log)::int audit`,
    ]);
    const tiles = [
      ["Active rules", s.rules, "/admin"],
      ["Live AI runs", s.live_runs, "/admin"],
      ["Guardrail corrections", s.guarded, "/audit?action=GUARDRAIL_APPLIED"],
      ["Audit entries", Number(s.audit).toLocaleString(), "/audit"],
    ] as const;
    return (
      <div className="mx-auto max-w-[880px]">
        <Greeting name={persona.name} eyebrow={ROLE_LABEL[persona.role]} line="Rules, thresholds and the audit trail. You can observe every decision but not make one." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map(([l, v, href]) => (
            <Link key={l} href={href}>
              <Card className="p-4 transition hover:border-[#D8D3C7]">
                <div className="text-[12.5px] text-muted">{l}</div>
                <div className="font-display tnum mt-1.5 text-[34px] leading-none">{v}</div>
              </Card>
            </Link>
          ))}
        </div>
        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          <LinkButton href="/admin" variant="secondary">Edit rules & thresholds</LinkButton>
          <LinkButton href="/audit" variant="secondary">Verify audit chain</LinkButton>
          <LinkButton href="/test-lab" variant="secondary">Run acceptance tests</LinkButton>
        </div>
      </div>
    );
  }

  // functional reviewers
  const d = await reviewerDesk(persona);
  const agentName = AGENT_META[d.agent].name;
  return (
    <div className="mx-auto max-w-[880px]">
      <Greeting
        name={persona.name}
        eyebrow={ROLE_LABEL[persona.role]}
        line={d.todo.length ? `The ${agentName} agent raised conditions or concerns on ${d.todo.length} open ${d.todo.length === 1 ? "case" : "cases"}.` : `Nothing from the ${agentName} agent needs your eyes.`}
      />
      <DeskSection title={`${agentName} concerns to validate`} count={d.todo.length} empty={d.todo.length ? undefined : "All clear."}>
        {d.todo.map((i) => (
          <DeskRow key={i.decision_id} item={i} action="Validate" sub={i.note} />
        ))}
      </DeskSection>
      {d.upstream > 0 && <WaitingNote>{d.upstream} new cases are waiting on Maya Chen to run the agents.</WaitingNote>}
    </div>
  );
}
