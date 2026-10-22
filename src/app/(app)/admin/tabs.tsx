"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { Activity, Bot, CheckCircle2, Loader2, Lock, PlugZap, RotateCcw, Search, ShieldCheck, SlidersHorizontal, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { resetDemoCases, testProviders, updateRule, updateThresholds } from "@/app/actions";
import { AGENT_META, AgentAvatar } from "@/components/domain";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { cn, dateLabel } from "@/lib/format";
import type { AgentType, LegalRule, Thresholds } from "@/lib/types";

type Registry = Record<string, { name: string; version: string; prompt_version: string; enabled: boolean; owner: string }>;

const TH_META: { k: keyof Thresholds; label: string; unit: string; help: string }[] = [
  { k: "signoff_confidence", label: "Sign-off confidence floor", unit: "share", help: "An agent below this confidence needs its department lead to sign off" },
  { k: "signoff_sla_hours", label: "Sign-off deadline", unit: "hours", help: "After this, a missing Sales/Finance/Ops sign-off escalates to the executive (never Legal)" },
  { k: "financial_impact_threshold", label: "Financial impact threshold", unit: "$", help: "Above this, the report flags mandatory owner approval" },
  { k: "finance_reject_net", label: "Finance rejection line", unit: "$", help: "Net benefit below this (or -2% of baseline) → REJECT" },
  { k: "min_uplift_pct", label: "Minimum unit uplift", unit: "%", help: "Below this the Sales agent recommends HOLD" },
  { k: "strong_uplift_pct", label: "Strong unit uplift", unit: "%", help: "At or above this the Sales agent can PROCEED" },
  { k: "dc_hard_stop_pct", label: "DC hard stop", unit: "%", help: "Launch-week DC utilization that forces HOLD" },
  { k: "dc_warn_pct", label: "DC warning", unit: "%", help: "Adds a staged-replenishment condition" },
  { k: "fulfillment_hard_stop_pct", label: "Online fulfillment hard stop", unit: "%", help: "Forces HOLD for online-heavy promotions" },
  { k: "fill_rate_floor_pct", label: "Fill-rate floor", unit: "%", help: "Projected fill rate below this forces HOLD" },
  { k: "sales_stale_days", label: "Sales evidence max age", unit: "days", help: "Older evidence is flagged stale and downgraded" },
  { k: "ops_stale_days", label: "Operations evidence max age", unit: "days", help: "Older evidence is flagged stale and downgraded" },
  { k: "ops_coverage_min", label: "Minimum store reporting", unit: "share", help: "Below this, Operations output is invalid (no imputation)" },
];

const input = "h-9 w-full rounded-[10px] border border-line bg-white px-3 text-[13px] outline-none focus:border-brand-400 focus:shadow-glow disabled:bg-canvas";

export function AdminTabs({
  isAdmin,
  canReset,
  rules,
  thresholds,
  registry,
  usage,
  changes,
}: {
  isAdmin: boolean;
  canReset: boolean;
  rules: LegalRule[];
  thresholds: Thresholds;
  registry: Registry;
  usage: { agent: string; provider: string; n: number; latency: number; guard: number }[];
  changes: { seq: number; ts: string; actor: string; action: string; payload: Record<string, unknown> }[];
}) {
  const tab = "rounded-[9px] px-3 py-1.5 text-[13px] font-medium text-ink-2 transition data-[state=active]:bg-brand-600 data-[state=active]:text-white data-[state=active]:shadow hover:bg-line-2 data-[state=active]:hover:bg-brand-600";
  return (
    <Tabs.Root defaultValue="rules">
      <Tabs.List className="mb-4 flex w-fit flex-wrap gap-1 rounded-xl border border-line bg-white p-1 shadow-card">
        <Tabs.Trigger value="rules" className={tab}>
          Legal rules
        </Tabs.Trigger>
        <Tabs.Trigger value="thresholds" className={tab}>
          Thresholds
        </Tabs.Trigger>
        <Tabs.Trigger value="agents" className={tab}>
          Agents & AI
        </Tabs.Trigger>
        <Tabs.Trigger value="demo" className={tab}>
          Demo controls
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="rules">
        <RulesTable rules={rules} isAdmin={isAdmin} />
      </Tabs.Content>
      <Tabs.Content value="thresholds">
        <ThresholdForm thresholds={thresholds} isAdmin={isAdmin} changes={changes} />
      </Tabs.Content>
      <Tabs.Content value="agents">
        <AgentsPanel registry={registry} usage={usage} />
      </Tabs.Content>
      <Tabs.Content value="demo">
        <DemoPanel canReset={canReset} />
      </Tabs.Content>
    </Tabs.Root>
  );
}

function RulesTable({ rules, isAdmin }: { rules: LegalRule[]; isAdmin: boolean }) {
  const [q, setQ] = useState("");
  const [juris, setJuris] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [edit, setEdit] = useState<LegalRule | null>(null);
  const list = useMemo(
    () =>
      rules.filter(
        (r) =>
          (showOld || r.enabled || r.version === 2) &&
          (!juris || r.jurisdiction === juris) &&
          (!q || `${r.rule_id} ${r.title} ${r.citation} ${r.rule_type}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [rules, q, juris, showOld],
  );
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-line p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search rules, citations…" className={cn(input, "pl-9")} />
        </div>
        <select value={juris} onChange={(e) => setJuris(e.target.value)} className={cn(input, "sm:w-40")}>
          <option value="">All jurisdictions</option>
          {["FED", "CA", "TX", "WI", "VA", "GA"].map((j) => (
            <option key={j}>{j}</option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 text-[12.5px] text-ink-2">
          <input type="checkbox" checked={showOld} onChange={(e) => setShowOld(e.target.checked)} className="accent-brand-600" /> Show superseded versions
        </label>
        <span className="text-[12px] text-muted">{list.length} rules</span>
      </div>
      <div className="max-h-[620px] overflow-auto scrollbar-thin">
        <table className="w-full min-w-[860px] text-left text-[12.5px]">
          <thead className="sticky top-0 z-10 bg-canvas">
            <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
              <th className="px-4 py-2">Rule</th>
              <th className="px-3 py-2">Jurisdiction</th>
              <th className="px-3 py-2">Severity</th>
              <th className="px-3 py-2">Human review</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.rule_id} className={cn("border-b border-line-2 align-top last:border-0", !r.enabled && "opacity-60")}>
                <td className="max-w-[420px] px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11.5px] text-brand-700">{r.rule_id}</span>
                    <span className="text-[11px] text-muted">{r.rule_type.toLowerCase().replace("_", " ")} · v{r.version}</span>
                  </div>
                  <div className="font-medium text-ink">{r.title}</div>
                  <div className="text-[11.5px] text-muted">{r.citation}</div>
                </td>
                <td className="px-3 py-2.5 font-mono text-[12px]">{r.jurisdiction}</td>
                <td className="px-3 py-2.5">
                  <Badge tone={r.severity === "LOW" ? "neutral" : r.severity === "MEDIUM" ? "warn" : "bad"}>{r.severity.toLowerCase()}</Badge>
                  {r.prohibited && <div className="mt-1 text-[11px] font-semibold text-bad">prohibited</div>}
                </td>
                <td className="px-3 py-2.5">{r.review_required ? <Badge tone="violet">required</Badge> : <span className="text-muted">no</span>}</td>
                <td className="px-3 py-2.5">{r.enabled ? <Badge tone="ok">active</Badge> : <Badge tone="neutral">disabled</Badge>}</td>
                <td className="px-3 py-2.5 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setEdit(r)} disabled={!isAdmin} title={isAdmin ? "Edit" : "Administrator only"}>
                    {isAdmin ? "Edit" : <Lock className="size-3.5" />}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <RuleDialog rule={edit} onClose={() => setEdit(null)} />
    </Card>
  );
}

function RuleDialog({ rule, onClose }: { rule: LegalRule | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [enabled, setEnabled] = useState(true);
  const [severity, setSeverity] = useState("MEDIUM");
  const [review, setReview] = useState(false);
  const [reason, setReason] = useState("");
  const [loaded, setLoaded] = useState<string | null>(null);
  if (rule && loaded !== rule.rule_id) {
    setLoaded(rule.rule_id);
    setEnabled(rule.enabled);
    setSeverity(rule.severity);
    setReview(rule.review_required);
    setReason("");
  }
  return (
    <Dialog.Root open={!!rule} onOpenChange={(o) => !o && (onClose(), setLoaded(null))}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[94vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-pop">
          {rule && (
            <>
              <Dialog.Title className="text-[17px] font-semibold">
                Edit {rule.rule_id}: {rule.title}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-[13px] text-muted">{rule.description}</Dialog.Description>
              <div className="mt-4 grid grid-cols-3 gap-3 text-[12.5px] font-medium text-ink-2">
                <label>
                  Severity
                  <select value={severity} onChange={(e) => setSeverity(e.target.value)} className={cn(input, "mt-1")}>
                    {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col">
                  Human review
                  <span className="mt-1 flex h-9 items-center gap-2">
                    <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} className="accent-brand-600" /> required
                  </span>
                </label>
                <label className="flex flex-col">
                  Status
                  <span className="mt-1 flex h-9 items-center gap-2">
                    <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-brand-600" /> active
                  </span>
                </label>
              </div>
              <label className="mt-3 block text-[12.5px] font-medium text-ink-2">
                Reason for change (written to the audit log)
                <input value={reason} onChange={(e) => setReason(e.target.value)} className={cn(input, "mt-1")} placeholder="e.g. Counsel guidance updated for Q4 holiday claims" />
              </label>
              <div className="mt-5 flex justify-end gap-2">
                <Dialog.Close asChild>
                  <Button variant="secondary">Cancel</Button>
                </Dialog.Close>
                <Button
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await updateRule(rule.rule_id, { enabled, severity, review_required: review }, reason);
                      if (!r.ok) toast.error(r.error);
                      else {
                        toast.success(r.message ?? "Saved");
                        onClose();
                        setLoaded(null);
                        router.refresh();
                      }
                    })
                  }
                >
                  {pending ? <Loader2 className="size-4 animate-spin" /> : "Save change"}
                </Button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ThresholdForm({ thresholds, isAdmin, changes }: { thresholds: Thresholds; isAdmin: boolean; changes: { seq: number; ts: string; actor: string; action: string; payload: Record<string, unknown> }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState<Record<string, number>>(thresholds as unknown as Record<string, number>);
  const [reason, setReason] = useState("");
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card>
        <CardHeader title="Decision thresholds" subtitle="Applied by the agents' deterministic tools and Lighthouse's governance rules on the next run." icon={<SlidersHorizontal className="size-4" />} />
        <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
          {TH_META.map((t) => (
            <label key={t.k} className="block rounded-xl border border-line p-3">
              <div className="flex items-center justify-between text-[12.5px] font-medium text-ink">
                {t.label}
                <span className="text-[11px] text-muted">{t.unit}</span>
              </div>
              <input type="number" value={v[t.k]} disabled={!isAdmin} onChange={(e) => setV({ ...v, [t.k]: Number(e.target.value) })} className={cn(input, "mt-1.5 tnum")} />
              <div className="mt-1 text-[11.5px] text-muted">{t.help}</div>
            </label>
          ))}
        </div>
        {isAdmin && (
          <div className="flex flex-col gap-2 border-t border-line px-5 py-4 sm:flex-row">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for change (required)" className={cn(input, "flex-1")} />
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await updateThresholds(v as unknown as Partial<Thresholds>, reason);
                  if (!r.ok) toast.error(r.error);
                  else {
                    toast.success(r.message ?? "Saved");
                    setReason("");
                    router.refresh();
                  }
                })
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Save thresholds"}
            </Button>
          </div>
        )}
      </Card>
      <Card>
        <CardHeader title="Recent configuration changes" icon={<Activity className="size-4" />} />
        <ul className="space-y-2.5 px-5 pb-5">
          {changes.length === 0 && <li className="text-[13px] text-muted">No changes since the pilot was configured.</li>}
          {changes.map((c) => (
            <li key={c.seq} className="rounded-xl border border-line p-2.5 text-[12.5px]">
              <div className="font-medium text-ink">{c.action.replace(/_/g, " ").toLowerCase()}</div>
              <div className="text-muted">
                {c.actor} · {dateLabel(c.ts, true)}
              </div>
              {"reason" in c.payload && <div className="mt-1 text-ink-2">“{String(c.payload.reason)}”</div>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function AgentsPanel({ registry, usage }: { registry: Registry; usage: { agent: string; provider: string; n: number; latency: number; guard: number }[] }) {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<Awaited<ReturnType<typeof testProviders>> | null>(null);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(["SALES", "FINANCE", "OPERATIONS", "LEGAL"] as AgentType[]).map((a) => {
          const r = registry[a];
          const u = usage.filter((x) => x.agent === a);
          return (
            <Card key={a} className="p-4">
              <div className="flex items-center gap-2.5">
                <AgentAvatar agent={a} />
                <div>
                  <div className="text-[14px] font-semibold">{r?.name ?? `${AGENT_META[a].name} Agent`}</div>
                  <div className="text-[12px] text-muted">{AGENT_META[a].focus}</div>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-[12.5px]">
                <div className="flex justify-between">
                  <span className="text-muted">Version / prompt</span>
                  <span className="font-mono text-[12px]">
                    {r?.version} / {r?.prompt_version}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Business owner</span>
                  <span>{r?.owner}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Status</span>
                  <Badge tone="ok" dot>
                    {r?.enabled ? "enabled" : "disabled"}
                  </Badge>
                </div>
              </div>
              <div className="mt-3 border-t border-line-2 pt-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Outputs by engine</div>
                {u.map((x) => (
                  <div key={x.provider} className="mt-1 flex justify-between text-[12px]">
                    <span className="text-ink-2">{x.provider}</span>
                    <span className="tnum text-muted">
                      {x.n.toLocaleString()}
                      {x.provider !== "rules-engine" ? ` · ${(x.latency / 1000).toFixed(1)}s · ${x.guard}% guarded` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
      <Card>
        <CardHeader
          title="AI providers (free tiers)"
          subtitle="Gemini is primary; Groq (gpt-oss-120b, Qwen, gpt-oss-20b) takes over automatically. The deterministic rules engine is the final fallback, so a run always completes."
          icon={<PlugZap className="size-4" />}
          action={
            <Button variant="secondary" disabled={pending} onClick={() => start(async () => setStatus(await testProviders()))}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Bot className="size-4" />} Test providers
            </Button>
          }
        />
        <div className="grid gap-3 px-5 pb-5 md:grid-cols-3">
          {(status ?? [
            { provider: "gemini", configured: true, ok: false, detail: "Not tested yet" },
            { provider: "groq", configured: true, ok: false, detail: "Not tested yet" },
          ]).map((s) => (
            <div key={s.provider} className="rounded-xl border border-line p-3">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold capitalize">{s.provider}</span>
                {status ? s.ok ? <CheckCircle2 className="size-4 text-ok" /> : <XCircle className="size-4 text-bad" /> : null}
              </div>
              <div className="mt-1 text-[12.5px] text-muted">
                {s.ok ? `${s.model} · ${((s.latency_ms ?? 0) / 1000).toFixed(1)}s` : s.detail}
              </div>
            </div>
          ))}
          <div className="rounded-xl border border-line p-3">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold">Rules engine</span>
              <ShieldCheck className="size-4 text-ok" />
            </div>
            <div className="mt-1 text-[12.5px] text-muted">Always available · deterministic · used for guardrails and fallback</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function DemoPanel({ canReset }: { canReset: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Card className="max-w-2xl p-5">
      <div className="flex gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <RotateCcw className="size-5" />
        </span>
        <div>
          <h3 className="text-[15px] font-semibold">Reset the 12 demo cases</h3>
          <p className="mt-1 text-[13px] text-muted">
            Sets up the class demo: D-2026-001 waits for Hannah to submit it live, the rest are analyzed and waiting on department sign-offs, D-2026-006 is overdue on
            Operations, and D-2026-012 is approved. Do this within a day of the demo (the sign-off deadline is real time). The audit log is append-only, so the reset is
            recorded rather than erasing history.
          </p>
          <Button
            className="mt-3"
            variant="secondary"
            disabled={!canReset || pending}
            onClick={() =>
              start(async () => {
                const r = await resetDemoCases();
                if (!r.ok) toast.error(r.error);
                else {
                  toast.success(r.message ?? "Reset");
                  router.refresh();
                }
              })
            }
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Reset demo cases
          </Button>
        </div>
      </div>
    </Card>
  );
}
