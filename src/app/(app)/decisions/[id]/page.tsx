import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/domain";
import { isDemoSafe, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PROMO_LABEL } from "@/lib/engine/common";
import { dateLabel, titleCase } from "@/lib/format";
import { getCase } from "@/lib/repo";
import { loadDecisionBundle } from "@/lib/views";
import { JourneyBar } from "@/components/journey";
import { buildJourney } from "@/lib/journey";
import { DEPT_OF } from "@/lib/personas";
import { loadPipeline, workFor } from "@/lib/work";
import { FocusView } from "./focus-view";
import { Timeline } from "./timeline";
import { Workspace } from "./workspace";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/decisions/[id]">) {
  const { id } = await params;
  return { title: id };
}

export default async function DecisionPage({ params, searchParams }: PageProps<"/decisions/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const autoSubmit = sp.submit === "1";
  const persona = await requireSession();
  const c = await getCase(id);
  if (!c) notFound();
  const [bundle, demoSafe, [cat]] = await Promise.all([
    loadDecisionBundle(id),
    isDemoSafe(),
    db()`select name from categories where category_id = ${c.category_id}`,
  ]);
  const dept = DEPT_OF[persona.role];
  const draft = c.status === "DRAFT" || c.status === "REVISION_REQUESTED";
  // leads see their own lane; the proposer (or executive) sees the full workspace while the case is a draft
  const isProposer = c.created_by === persona.name;
  // the proposer can also follow the whole analysis of their own case (and lands there right after submitting)
  const fullView = isProposer && !draft && (sp.view === "full" || (sp.submit === "1" && sp.view !== "lane"));
  const focusAgent = dept && !(draft && isProposer) && !fullView ? dept : null;
  const facts = [
    cat?.name,
    `${PROMO_LABEL[c.promo_type]}${c.discount_pct ? ` ${c.discount_pct}%` : ""}`,
    `${c.store_count} stores`,
    `${c.duration_weeks} weeks from ${dateLabel(c.start_date)}`,
    titleCase(c.channel),
    c.vendor_funding_pct ? `${c.vendor_funding_pct}% supplier-funded` : null,
  ].filter(Boolean);
  const steps = buildJourney({
    status: c.status,
    revision: c.revision,
    created_at: c.created_at,
    created_by: c.created_by,
    hasPacket: !!bundle.packet,
    analyzedAt: bundle.packet?.analyzed_at ?? null,
    lanes: bundle.lanes,
    final: bundle.packet?.final_decision ? { decision: bundle.packet.final_decision, by: bundle.packet.decided_by, at: bundle.packet.decided_at } : null,
  });
  const myWork = persona.role === "ADMIN" ? null : workFor(persona, await loadPipeline());
  const myTask = myWork?.now.find((w) => w.c.decision_id === id)?.action ?? null;
  const nextWork = myWork?.now.find((w) => w.c.decision_id !== id);
  const next = nextWork ? { id: nextWork.c.decision_id, title: nextWork.c.title, action: nextWork.action } : null;
  const back = persona.role === "ADMIN" ? { href: "/decisions", label: "Decisions" } : { href: "/home", label: "My desk" };

  return (
    <div>
      <Link href={back.href} className="no-print mb-6 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> {back.label}
      </Link>
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-[12px] text-faint">{c.decision_id}</span>
          <StatusBadge status={c.status} />
          {c.revision > 1 && <span className="text-[12px] text-muted">Revision {c.revision}</span>}
        </div>
        <h1 className="font-display mt-3 max-w-4xl text-[28px] leading-[1.08] text-ink">{c.title.replace(/ - /g, " · ")}</h1>
        <p className="mt-3 text-[14px] text-muted">{facts.join("  ·  ")}</p>
        {focusAgent !== "LEGAL" && c.claim_text && <p className="mt-1.5 text-[14px] text-ink-2">“{c.claim_text}”</p>}
        <p className="mt-1.5 text-[12.5px] text-faint">Proposed by {c.created_by === persona.name ? "you" : c.created_by}</p>
      </div>
      <JourneyBar steps={steps} viewer={persona} task={myTask} className="no-print mb-8" />
      {dept && isProposer && !draft && (
        <div className="no-print mb-6 inline-flex rounded-full border border-line bg-white p-1 text-[13px]">
          <Link href={`/decisions/${id}?view=lane`} className={`rounded-full px-3.5 py-1.5 ${!fullView ? "bg-brand-600 text-[#F4F1EA]" : "text-muted hover:text-ink"}`}>
            My {dept === "OPERATIONS" ? "Operations" : dept[0] + dept.slice(1).toLowerCase()} sign-off
          </Link>
          <Link href={`/decisions/${id}?view=full`} className={`rounded-full px-3.5 py-1.5 ${fullView ? "bg-brand-600 text-[#F4F1EA]" : "text-muted hover:text-ink"}`}>
            Full analysis (my proposal)
          </Link>
        </div>
      )}
      {focusAgent ? (
        <FocusView
          persona={persona}
          agent={focusAgent}
          decisionId={id}
          status={c.status}
          output={bundle.packet ? bundle.outputs[focusAgent] : undefined}
          evidence={bundle.evidence}
          lane={bundle.lanes.find((l) => l.dept === focusAgent)!}
          lanes={bundle.lanes}
          claim={c.claim_text}
          decidedBy={bundle.packet?.decided_by ?? null}
          final={bundle.packet?.final_decision ?? null}
          next={next}
        />
      ) : (
        <Workspace
          persona={persona}
          decisionId={id}
          status={c.status}
          revision={c.revision}
          demoSafe={demoSafe}
          outputs={bundle.outputs}
          evidence={bundle.evidence}
          packet={bundle.packet}
          lanes={bundle.lanes}
          runs={bundle.runs}
          proposer={c.created_by}
          next={persona.role === "ADMIN" ? undefined : next}
          autoSubmit={autoSubmit}
          caseParams={{ discount_pct: c.discount_pct, duration_weeks: c.duration_weeks, claim_text: c.claim_text, vendor_funding_pct: c.vendor_funding_pct, promo_type: c.promo_type }}
          timeline={<Timeline entries={bundle.audit} />}
        />
      )}
    </div>
  );
}
