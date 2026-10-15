import { CalendarDays, ChevronLeft, Megaphone, Store, Tag, Timer, Truck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge, SyntheticNotice } from "@/components/domain";
import { Badge } from "@/components/ui";
import { isDemoSafe, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PROMO_LABEL } from "@/lib/engine/common";
import { dateLabel, titleCase } from "@/lib/format";
import { getCase } from "@/lib/repo";
import { loadDecisionBundle } from "@/lib/views";
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
  const [bundle, demoSafe, [cat], [region]] = await Promise.all([
    loadDecisionBundle(id),
    isDemoSafe(),
    db()`select name, provenance, gross_margin_pct from categories where category_id = ${c.category_id}`,
    c.region_id ? db()`select name from regions where region_id = ${c.region_id}` : Promise.resolve([{ name: c.store_count === 50 ? "All regions" : "Custom" }]),
  ]);
  const chips = [
    { i: <Tag className="size-3.5" />, t: cat?.name },
    { i: <Megaphone className="size-3.5" />, t: `${PROMO_LABEL[c.promo_type]}${c.discount_pct ? ` · ${c.discount_pct}% off` : ""}` },
    { i: <Store className="size-3.5" />, t: `${c.store_count} stores · ${region?.name}` },
    { i: <Timer className="size-3.5" />, t: `${c.duration_weeks} weeks` },
    { i: <CalendarDays className="size-3.5" />, t: `Starts ${dateLabel(c.start_date)}` },
    { i: <Truck className="size-3.5" />, t: titleCase(c.channel) },
  ];
  return (
    <div>
      <Link href="/decisions" className="no-print mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> Decisions
      </Link>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[13px] font-medium text-brand-700">{c.decision_id}</span>
            <StatusBadge status={c.status} />
            {c.revision > 1 && <Badge tone="neutral">Revision {c.revision}</Badge>}
            {c.scenario_tag && c.scenario_tag !== "USER_CREATED" && <Badge tone="brand">Demo scenario · {titleCase(c.scenario_tag)}</Badge>}
          </div>
          <h1 className="mt-1.5 text-[24px] leading-tight font-semibold tracking-[-0.025em]">{c.title}</h1>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {chips.map((ch, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[12px] font-medium text-ink-2">
                <span className="text-muted">{ch.i}</span>
                {ch.t}
              </span>
            ))}
          </div>
          {c.claim_text && (
            <p className="mt-2.5 text-[13px] text-ink-2">
              <span className="text-muted">Marketing claim:</span> “{c.claim_text}”
              {c.vendor_funding_pct > 0 && <span className="text-muted"> · Supplier funds {c.vendor_funding_pct}% of markdown</span>}
            </p>
          )}
          <SyntheticNotice className="mt-3" />
        </div>
        <div className="shrink-0 text-left text-[12px] text-muted lg:text-right">
          <div>
            Owner <span className="font-medium text-ink-2">{c.created_by}</span>
          </div>
          <div>Evidence as of {dateLabel(c.data_as_of)}</div>
        </div>
      </div>
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
    </div>
  );
}
