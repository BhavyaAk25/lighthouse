import { notFound } from "next/navigation";
import { LogoMark } from "@/components/logo";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PROMO_LABEL } from "@/lib/engine/common";
import { REC_LABEL } from "@/lib/engine/reconcile";
import { dateLabel, money, titleCase } from "@/lib/format";
import { getCase } from "@/lib/repo";
import type { AgentType } from "@/lib/types";
import { loadDecisionBundle } from "@/lib/views";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Decision packet" };

const NAMES: Record<AgentType, string> = { SALES: "Sales", FINANCE: "Finance", OPERATIONS: "Operations", LEGAL: "Legal" };

export default async function PacketPage({ params }: PageProps<"/packet/[id]">) {
  const { id } = await params;
  const persona = await requireSession();
  const c = await getCase(id);
  if (!c) notFound();
  const b = await loadDecisionBundle(id);
  const [cat] = await db()`select name from categories where category_id = ${c.category_id}`;
  const p = b.packet;
  const n = p?.narrative ?? {};
  return (
    <div className="mx-auto max-w-[860px] bg-white px-8 py-10 text-[13px] leading-relaxed text-ink print:px-0 print:py-0">
      <div className="no-print mb-6 flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
        <span className="text-[13px] text-muted">Printable decision packet · use “Save as PDF” in the print dialog</span>
        <PrintButton />
      </div>
      <header className="flex items-start justify-between border-b border-line pb-5">
        <div className="flex items-center gap-3">
          <LogoMark size={40} />
          <div>
            <div className="text-[18px] font-semibold tracking-tight">Lighthouse decision packet</div>
            <div className="text-[12px] text-muted">Walmart U.S. pilot · academic capstone prototype · not affiliated with Walmart Inc.</div>
          </div>
        </div>
        <div className="text-right text-[12px] text-muted">
          <div className="font-mono text-[13px] text-ink">{c.decision_id}</div>
          <div>Revision {c.revision}</div>
          <div>Exported {dateLabel(new Date(), true)} by {persona.name}</div>
        </div>
      </header>
      <div className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-[11.5px] text-[#9a5b00]">
        SYNTHETIC PILOT DATA: demand patterns from public Kaggle Walmart datasets (M5, 45-store weekly sales); store IDs, inventory, legal rules and costs are generated
        for the capstone. Legal outputs are compliance-risk indicators, not legal advice.
      </div>

      <section className="mt-6">
        <h1 className="text-[20px] font-semibold tracking-tight">{c.title}</h1>
        <table className="mt-3 w-full text-[12.5px]">
          <tbody>
            {[
              ["Category", cat?.name],
              ["Mechanic", `${PROMO_LABEL[c.promo_type]}${c.discount_pct ? ` · ${c.discount_pct}% off` : ""} · ${titleCase(c.channel)}`],
              ["Scope", `${c.store_count} stores · ${c.states.join(", ")}`],
              ["Window", `${c.duration_weeks} weeks from ${dateLabel(c.start_date)}`],
              ["Marketing claim", c.claim_text ? `“${c.claim_text}”` : "-"],
              ["Supplier funding", `${c.vendor_funding_pct}% of markdown`],
              ["Evidence as of", dateLabel(c.data_as_of)],
              ["Owner", c.created_by],
            ].map(([k, v]) => (
              <tr key={k} className="border-b border-line-2">
                <td className="w-44 py-1.5 text-muted">{k}</td>
                <td className="py-1.5">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {p ? (
        <>
          <section className="mt-7 rounded-xl border border-brand-200 bg-brand-25 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-700">Lighthouse recommendation</div>
            <div className="mt-1 text-[17px] font-semibold">{n.headline || p.headline}</div>
            <div className="mt-1 text-[12.5px]">
              <b>{REC_LABEL[p.synthesized_recommendation]}</b> · confidence {p.lighthouse_confidence.toFixed(2)} · risk {p.risk_level.toLowerCase()} · conflict{" "}
              {p.conflict_severity.toLowerCase().replace("_", " ")} · {money(p.financial_impact)} at stake
            </div>
            <p className="mt-2">{n.summary || p.summary}</p>
            {p.conflicts.length > 0 && (
              <>
                <div className="mt-3 font-semibold">Disagreements surfaced</div>
                <ul className="ml-5 list-disc">
                  {p.conflicts.map((x, i) => (
                    <li key={i}>{x.description}</li>
                  ))}
                </ul>
              </>
            )}
            <div className="mt-3 font-semibold">Governance gates</div>
            <ul className="ml-5 list-disc">
              {p.gates.map((g) => (
                <li key={g.key}>
                  {g.label}: <b>{g.status}</b> - {g.detail}
                </li>
              ))}
            </ul>
            {p.conditions.length > 0 && (
              <>
                <div className="mt-3 font-semibold">Conditions</div>
                <ul className="ml-5 list-disc">
                  {p.conditions.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="mt-7">
            <h2 className="text-[15px] font-semibold">Four agent positions (preserved verbatim)</h2>
            {(["SALES", "FINANCE", "OPERATIONS", "LEGAL"] as AgentType[]).map((a) => {
              const o = b.outputs[a];
              if (!o) return null;
              return (
                <div key={a} className="mt-3 break-inside-avoid rounded-xl border border-line p-3.5">
                  <div className="flex justify-between">
                    <b>{NAMES[a]} Agent</b>
                    <span className="text-[12px] text-muted">
                      {o.provider} · {o.model}
                    </span>
                  </div>
                  <div className="text-[12.5px]">
                    {REC_LABEL[o.recommendation]} · confidence {o.confidence.toFixed(2)} · risk {o.risk_level.toLowerCase()}
                    {!o.valid && " · INVALID EVIDENCE"}
                  </div>
                  <p className="mt-1">{o.rationale}</p>
                  <div className="mt-1 text-[12px] text-muted">
                    Metrics:{" "}
                    {Object.entries(o.key_metrics)
                      .slice(0, 8)
                      .map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`)
                      .join(" · ")}
                  </div>
                  {o.conditions.length > 0 && <div className="mt-1 text-[12px]">Conditions: {o.conditions.join("; ")}</div>}
                  {o.guardrail_adjustments.length > 0 && <div className="mt-1 text-[12px]">Guardrails: {o.guardrail_adjustments.join("; ")}</div>}
                  <div className="mt-1 font-mono text-[11px] text-muted">Evidence: {o.evidence_ids.join(", ")}</div>
                </div>
              );
            })}
          </section>

          <section className="mt-7 break-inside-avoid">
            <h2 className="text-[15px] font-semibold">Human decision</h2>
            {b.reviews.length > 0 && (
              <ul className="mt-2 ml-5 list-disc">
                {b.reviews.map((r) => (
                  <li key={r.review_id}>
                    {r.reviewer_name} ({r.reviewer_role.replace(/_/g, " ").toLowerCase()}, rev {r.revision}): {r.disposition.replace(/_/g, " ").toLowerCase()}
                    {r.condition_text ? ` - “${r.condition_text}”` : ""} · {dateLabel(r.created_at, true)}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2">
              {p.final_decision
                ? `${p.final_decision.replace(/_/g, " ").toLowerCase()} by ${p.decided_by} on ${dateLabel(p.decided_at, true)}${p.override_flag ? " (human override of Lighthouse)" : ""}${p.final_rationale ? ` - “${p.final_rationale}”` : ""}`
                : "Pending decision owner."}
            </p>
          </section>

          <section className="mt-7">
            <h2 className="text-[15px] font-semibold">Evidence register</h2>
            <table className="mt-2 w-full text-[11.5px]">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="py-1">ID</th>
                  <th className="py-1">Evidence</th>
                  <th className="py-1">Source</th>
                  <th className="py-1">Provenance</th>
                </tr>
              </thead>
              <tbody>
                {b.evidence.map((e) => (
                  <tr key={e.evidence_id} className="border-b border-line-2 align-top">
                    <td className="py-1 pr-2 font-mono">{e.evidence_id}</td>
                    <td className="py-1 pr-2">{e.label}</td>
                    <td className="py-1 pr-2">{e.source}</td>
                    <td className="py-1">{e.provenance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : (
        <p className="mt-6 text-muted">Agents have not been run for this revision.</p>
      )}

      <section className="mt-7">
        <h2 className="text-[15px] font-semibold">Audit trail (hash-chained)</h2>
        <table className="mt-2 w-full text-[11.5px]">
          <tbody>
            {b.audit.map((a) => (
              <tr key={a.seq} className="border-b border-line-2 align-top">
                <td className="py-1 pr-2 font-mono">#{a.seq}</td>
                <td className="py-1 pr-2 whitespace-nowrap">{dateLabel(a.ts, true)}</td>
                <td className="py-1 pr-2">{a.actor}</td>
                <td className="py-1 pr-2">{a.action.replace(/_/g, " ").toLowerCase()}</td>
                <td className="py-1 font-mono text-muted">{a.hash.slice(0, 20)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
