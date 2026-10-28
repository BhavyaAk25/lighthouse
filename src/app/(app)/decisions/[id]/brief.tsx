"use client";

import { ArrowRight, CheckCircle2, ShieldAlert, UserRound } from "lucide-react";
import { RiskBadge } from "@/components/domain";
import { LogoMark } from "@/components/logo";
import { ConfidenceRing } from "@/components/ui";
import { cn, firstSentences, money, plainMoney } from "@/lib/format";
import { DEPT_NAME, REC_WORD, type Lane } from "@/lib/signoff";
import { openChecks, REC_TEXT, type PacketData } from "./packet";

/** "Hold: economics do not work." under a "Hold" headline reads twice; keep only the explanation. */
function stripHeadline(sentence: string, rec: string) {
  const m = sentence.match(/^([^:]{2,60}):\s+(.+)$/);
  if (m && m[1].toLowerCase().startsWith(rec.toLowerCase().split(" ")[0])) return m[2].charAt(0).toUpperCase() + m[2].slice(1);
  return sentence;
}

/**
 * The decision brief: what Lighthouse recommends, in one bold line, and only what matters
 * to decide it. Everything else lives under "See the full analysis".
 */
export function DecisionBrief({ p, lanes }: { p: PacketData; lanes: Lane[] }) {
  const changed = !!p.ai_recommendation && p.ai_recommendation !== p.synthesized_recommendation;
  const headline = REC_TEXT[p.synthesized_recommendation];
  const people = lanes.filter((l) => l.signoff && l.signoff.disposition !== "CONFIRMED" && l.dept !== "LEGAL");
  const checks = openChecks(p.gates);
  const reasons = p.decisive_factors
    .filter((f) => !/\bgate\b/i.test(f))
    .slice(0, changed ? 2 : 3)
    .map(plainMoney);
  const lead = changed
    ? `The agents alone said ${REC_WORD[p.ai_recommendation!]}. After the departments signed off, Lighthouse recommends ${REC_WORD[p.synthesized_recommendation]}.`
    : stripHeadline(firstSentences(plainMoney(p.summary), 1), REC_TEXT[p.synthesized_recommendation]);

  return (
    <section className="card p-6 md:p-7" aria-label="Decision brief">
      <div className="flex items-start gap-4">
        <LogoMark size={30} className="mt-1" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-brass-dark">Lighthouse recommends{changed ? ", after sign-off" : ""}</div>
          <h2 className="font-display mt-1 text-[28px] leading-[1.1] text-ink">{headline}</h2>
          <p className="mt-2.5 max-w-[62ch] text-[15px] leading-relaxed text-ink-2">{lead}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13.5px] text-muted">
            <span className="tnum">{money(p.financial_impact)} at stake</span>
            <RiskBadge risk={p.risk_level} />
          </div>
        </div>
        <ConfidenceRing value={p.lighthouse_confidence} size={60} stroke={5} />
      </div>

      {people.length > 0 && (
        <div className="mt-6">
          <h3 className="text-[14px] text-ink">What people changed</h3>
          <ul className="mt-2 space-y-2">
            {people.map((l) => (
              <li key={l.dept} className="flex gap-2.5 text-[14px] text-ink-2">
                <UserRound className="mt-0.5 size-4 shrink-0 text-brass" strokeWidth={1.7} />
                <span>
                  <span className="text-ink">{l.lead.name}</span> ({DEPT_NAME[l.dept]}) {l.state === "BLOCKED" ? "blocked it" : `changed “${REC_WORD[l.signoff!.ai_recommendation]}” to “${REC_WORD[l.signoff!.position]}”`}
                  {l.signoff?.condition_text && <span className="text-muted">: “{l.signoff.condition_text}”</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {reasons.length > 0 && (
        <div className="mt-6">
          <h3 className="text-[14px] text-ink">{changed ? "What the agents found" : "Why"}</h3>
          <ul className="mt-2 space-y-2">
            {reasons.map((r, i) => (
              <li key={i} className="flex gap-2.5 text-[14px] text-ink-2">
                <ArrowRight className="mt-1 size-3.5 shrink-0 text-brass" /> {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={cn("mt-6 rounded-[12px] px-4 py-3.5 text-[14px]", checks.open.length ? "bg-warn-soft/70" : "bg-ok-soft/70")}>
        {checks.open.length === 0 ? (
          <span className="flex items-center gap-2 text-ok">
            <CheckCircle2 className="size-4" /> All checks clear.
          </span>
        ) : (
          <div className="space-y-1.5">
            {checks.open.map((g) => (
              <div key={g.key} className="flex gap-2.5">
                <ShieldAlert className={cn("mt-0.5 size-4 shrink-0", g.status === "BLOCKED" ? "text-bad" : "text-warn")} strokeWidth={1.8} />
                <span className="text-ink-2">
                  <span className="text-ink">{g.label}:</span> {firstSentences(plainMoney(g.detail), 1)}
                </span>
              </div>
            ))}
          </div>
        )}
        {p.conditions.length > 0 && (
          <div className="mt-2 text-[13.5px] text-muted">
            {p.conditions.length} condition{p.conditions.length === 1 ? "" : "s"} to launch, starting with: {plainMoney(p.conditions[0])}
          </div>
        )}
      </div>
    </section>
  );
}
