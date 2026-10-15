import { Lock } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRules, getThresholds } from "@/lib/repo";
import { AdminTabs } from "./tabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rules & agents" };

export default async function AdminPage() {
  const persona = await requireSession();
  const [rules, thresholds, [registry], usage, recentChanges] = await Promise.all([
    getRules(false),
    getThresholds(),
    db()`select value from config where key = 'agent_registry'`,
    db()`select agent_type, provider, count(*)::int n, round(avg(latency_ms))::int latency,
                round(100.0 * avg(case when jsonb_array_length(guardrail_adjustments) > 0 then 1 else 0 end), 1)::float guard_pct
         from agent_outputs group by 1, 2 order by 1, 3 desc`,
    db()`select seq, ts, actor, action, payload from audit_log where action in ('RULE_UPDATED','THRESHOLDS_UPDATED','DEMO_CASES_RESET') order by seq desc limit 8`,
  ]);
  const isAdmin = persona.role === "ADMIN";
  return (
    <div>
      <PageHeader
        title="Rules & agents"
        subtitle="The governance configuration behind every recommendation: the legal rule catalog, decision thresholds, the agent registry and AI providers. Every change requires a reason and is written to the audit log."
        actions={
          !isAdmin && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] font-medium text-ink-2">
              <Lock className="size-3.5" /> View only · sign in as the Administrator to edit
            </span>
          )
        }
      />
      <AdminTabs
        isAdmin={isAdmin}
        canReset={isAdmin || persona.role === "DECISION_OWNER"}
        rules={rules}
        thresholds={thresholds}
        registry={(registry?.value ?? {}) as Record<string, { name: string; version: string; prompt_version: string; enabled: boolean; owner: string }>}
        usage={usage.map((u) => ({ agent: String(u.agent_type), provider: String(u.provider), n: Number(u.n), latency: Number(u.latency ?? 0), guard: Number(u.guard_pct) }))}
        changes={recentChanges.map((c) => ({ seq: Number(c.seq), ts: String(c.ts instanceof Date ? c.ts.toISOString() : c.ts), actor: String(c.actor), action: String(c.action), payload: c.payload as Record<string, unknown> }))}
      />
    </div>
  );
}
