import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge, SyntheticNotice } from "@/components/domain";
import { isDemoSafe, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { REVIEWER_AGENT } from "@/lib/desk";
import { PROMO_LABEL } from "@/lib/engine/common";
import { dateLabel, titleCase } from "@/lib/format";
import { getCase } from "@/lib/repo";
import { loadDecisionBundle } from "@/lib/views";
import { JourneyBar } from "@/components/journey";
import { buildJourney } from "@/lib/journey";
import { FocusView } from "./focus-view";
import { Timeline } from "./timeline";
import { Workspace } from "./workspace";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/decisions/[id]">) {
  const { id } = await params;
  return { title: id };
}

export default async function DecisionPage({ params }: PageProps<"/decisions/[id]">) {
  const { id } = await params;
  const persona = await requireSession();
  const c = await getCase(id);
  if (!c) notFound();
  const [bundle, demoSafe, [cat]] = await Promise.all([
    loadDecisionBundle(id),
    isDemoSafe(),
    db()`select name from categories where category_id = ${c.category_id}`,
  ]);
  const focusAgent = persona.role === "LEGAL_REVIEWER" ? "LEGAL" : REVIEWER_AGENT[persona.role];
  const facts = [
    cat?.name,
    `${PROMO_LABEL[c.promo_type]}${c.discount_pct ? ` ${c.discount_pct}%` : ""}`,
    `${c.store_count} stores`,
    `${c.duration_weeks} weeks from ${dateLabel(c.start_date)}`,
    titleCase(c.channel),
    c.vendor_funding_pct ? `${c.vendor_funding_pct}% supplier-funded` : null,
  ].filter(Boolean);
  const legalReview = [...bundle.reviews].reverse().find((r) => r.reviewer_role === "LEGAL_REVIEWER" && r.revision === c.revision) ?? null;
  const steps = buildJourney({
    status: c.status,
    revision: c.revision,
    created_at: c.created_at,
    created_by: c.created_by,
    hasPacket: !!bundle.packet,
    analyzedAt: bundle.packet?.created_at ?? null,
    requiresLegal: bundle.packet?.requires_legal_review ?? null,
    legalBlocked: bundle.packet?.gates.some((g) => g.key === "LEGAL_REVIEW" && g.status === "BLOCKED") ?? false,
    legal: legalReview,
    final: bundle.packet?.final_decision ? { decision: bundle.packet.final_decision, by: bundle.packet.decided_by, at: bundle.packet.decided_at } : null,
  });
  const back = persona.role === "DECISION_OWNER" || persona.role === "ADMIN" ? { href: "/decisions", label: "Decisions" } : { href: "/home", label: "My desk" };

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
          <SyntheticNotice />
        </div>
        <h1 className="font-display mt-3 max-w-4xl text-[28px] leading-[1.08] text-ink">{c.title.replace(/ - /g, " · ")}</h1>
        <p className="mt-3 text-[14px] text-muted">{facts.join("  ·  ")}</p>
        {!focusAgent && c.claim_text && <p className="mt-1.5 text-[14px] text-ink-2">“{c.claim_text}”</p>}
      </div>
      <JourneyBar steps={steps} viewer={persona} className="no-print mb-8" />
      {focusAgent ? (
        <FocusView
          persona={persona}
          agent={focusAgent}
          decisionId={id}
          status={c.status}
          revision={c.revision}
          output={bundle.outputs[focusAgent]}
          evidence={bundle.evidence}
          packet={bundle.packet}
          reviews={bundle.reviews}
          claim={c.claim_text}
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
          reviews={bundle.reviews}
          runs={bundle.runs}
          caseParams={{ discount_pct: c.discount_pct, duration_weeks: c.duration_weeks, claim_text: c.claim_text, vendor_funding_pct: c.vendor_funding_pct, promo_type: c.promo_type }}
          timeline={<Timeline entries={bundle.audit} />}
        />
      )}
    </div>
  );
}
