import type { AgentAnalysis, DecisionCase, LegalRule, Recommendation, RiskLevel } from "../types";
import { RISK_ORDER, maxRisk } from "../types";
import { evidenceFactory } from "./common";
import type { EngineContext } from "./context";

export interface RuleHit {
  rule: LegalRule;
  matched: string[];
}

/** Deterministic rule matching: a rule fires when every condition it declares matches the case. */
export function matchRules(c: DecisionCase, rules: LegalRule[]): RuleHit[] {
  const claim = (c.claim_text || "").toLowerCase();
  const hits: RuleHit[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const t = rule.trigger || {};
    const matched: string[] = [];
    if (rule.jurisdiction !== "FED" && !c.states.includes(rule.jurisdiction)) continue;
    if (t.states && !t.states.some((s) => c.states.includes(s))) continue;
    if (t.categories) {
      if (!t.categories.includes(c.category_id)) continue;
      matched.push(`category ${c.category_id}`);
    }
    if (t.promo_types) {
      if (!t.promo_types.includes(c.promo_type)) continue;
      matched.push(`promotion ${c.promo_type}`);
    }
    if (t.channels) {
      if (!t.channels.includes(c.channel)) continue;
      matched.push(`channel ${c.channel}`);
    }
    if (t.min_discount !== undefined) {
      if (Number(c.discount_pct) < t.min_discount) continue;
      matched.push(`discount ≥ ${t.min_discount}%`);
    }
    if (t.min_weeks !== undefined) {
      if (c.duration_weeks < t.min_weeks) continue;
      matched.push(`duration ≥ ${t.min_weeks} wk`);
    }
    if (t.max_weeks !== undefined && c.duration_weeks > t.max_weeks) continue;
    // flags_any and claim_any: when both are present either may satisfy the rule
    if (t.flags_any || t.claim_any) {
      const flagHit = t.flags_any?.find((fl) => c.flags.includes(fl));
      let claimHit: string | undefined;
      if (t.claim_any) {
        for (const pat of t.claim_any) {
          try {
            const m = claim.match(new RegExp(pat, "i"));
            if (m) {
              claimHit = m[0];
              break;
            }
          } catch {
            /* ignore malformed pattern */
          }
        }
      }
      if (!flagHit && !claimHit) continue;
      if (flagHit) matched.push(`flag ${flagHit}`);
      if (claimHit) matched.push(`claim text "${claimHit}"`);
    }
    if (rule.jurisdiction !== "FED") matched.push(`jurisdiction ${rule.jurisdiction}`);
    hits.push({ rule, matched });
  }
  return hits.sort((a, b) => RISK_ORDER[b.rule.severity] - RISK_ORDER[a.rule.severity]);
}

export function analyzeLegal(ctx: EngineContext): AgentAnalysis {
  const { c, rules, dq } = ctx;
  const ev = evidenceFactory(ctx.runId, "LEGAL", null);
  const hits = matchRules(c, rules);
  const e0 = ev.add(
    "Case attributes screened",
    { category: c.category_id, promotion: c.promo_type, channel: c.channel, states: c.states, discount_pct: c.discount_pct, flags: c.flags, claim_text: c.claim_text },
    "decision_cases",
    "GENERATED",
  );
  const ids = [e0];
  // collapse state variants of the same base rule into one evidence item
  const byBase = new Map<string, RuleHit[]>();
  for (const h of hits) byBase.set(h.rule.base_key, [...(byBase.get(h.rule.base_key) ?? []), h]);
  for (const group of byBase.values()) {
    const top = group[0].rule;
    ids.push(
      ev.add(
        `Rule ${group.map((g) => g.rule.rule_id).join(", ")}: ${top.title}`,
        {
          severity: top.severity,
          review_required: top.review_required,
          prohibited: top.prohibited,
          jurisdictions: group.map((g) => g.rule.jurisdiction),
          matched_on: group[0].matched,
          citation: top.citation,
          condition: top.condition_text,
        },
        "legal_rules",
        "ASSUMPTION",
      ),
    );
  }
  const prohibited = hits.filter((h) => h.rule.prohibited);
  const review = hits.filter((h) => h.rule.review_required && !h.rule.prohibited);
  const risk: RiskLevel = hits.length ? maxRisk(...hits.map((h) => h.rule.severity)) : "LOW";
  let rec: Recommendation;
  let conf: number;
  let hardReason: string | null = null;
  if (prohibited.length) {
    rec = "REJECT";
    conf = 0.97;
    hardReason = `Prohibited condition: ${prohibited[0].rule.title} (${prohibited[0].rule.rule_id}).`;
  } else if (review.length) {
    rec = "REVIEW_REQUIRED";
    conf = 0.94;
    hardReason = `${review.length} rule(s) require human legal/compliance review.`;
  } else if (hits.length) {
    rec = "PROCEED_WITH_CONDITIONS";
    conf = 0.9;
  } else {
    rec = "PROCEED";
    conf = 0.9;
  }
  const conditions = [...new Set(hits.map((h) => h.rule.condition_text))].slice(0, 6);
  const rationale = !hits.length
    ? "No rules in the catalog are triggered by this case in the in-scope jurisdictions."
    : `${hits.length} rule(s) triggered across ${new Set(hits.map((h) => h.rule.jurisdiction)).size} jurisdiction(s); highest severity ${risk}.` +
      (prohibited.length ? ` PROHIBITED: ${prohibited[0].rule.title}.` : "") +
      (review.length ? ` Human review required for: ${[...new Set(review.map((h) => h.rule.title))].slice(0, 3).join("; ")}.` : "") +
      " Compliance-risk indicator only; not legal advice.";

  return {
    agent_type: "LEGAL",
    evidence: ev.items,
    metrics: {
      rules_triggered: hits.length,
      distinct_rules: byBase.size,
      review_required_rules: review.length,
      prohibited_rules: prohibited.length,
      highest_severity: risk,
      jurisdictions: c.states.join(", "),
      top_rule: hits[0]?.rule.title ?? null,
    },
    baseline: {
      agent_type: "LEGAL",
      recommendation: rec,
      confidence: conf,
      risk_level: prohibited.length ? "CRITICAL" : risk,
      evidence_ids: ids,
      key_metrics: {},
      conditions: prohibited.length ? [prohibited[0].rule.condition_text] : conditions,
      dissent_reason: null,
      rationale,
      provider: "rules-engine",
      model: "lighthouse-rules-v1",
      latency_ms: null,
      valid: true,
      validation_issues: [],
      guardrail_adjustments: [],
      data_quality: dq,
      hard_constraint: hardReason,
    },
    hard: prohibited.length
      ? { allowed: ["REJECT"], min_risk: "CRITICAL", reason: hardReason }
      : review.length
        ? { allowed: ["REVIEW_REQUIRED"], min_risk: risk, reason: hardReason }
        : { min_risk: risk },
    policy: [
      "REJECT when any triggered rule is marked prohibited.",
      "REVIEW_REQUIRED when any triggered rule requires human legal/compliance review; you may not downgrade this.",
      "PROCEED_WITH_CONDITIONS when only informational rules fire; list their conditions.",
      "PROCEED when no rules fire.",
      "Risk level must be at least the highest triggered rule severity. Outputs are compliance-risk indicators, not legal advice.",
    ],
  };
}
