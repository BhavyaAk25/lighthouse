"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { screenText } from "@/lib/ai/screen";
import { appendAudit } from "@/lib/audit";
import { adminPin, clearSessionCookie, DEMO_SAFE_COOKIE, requireRole, requireSession, setSessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { PROMO_LABEL } from "@/lib/engine/common";
import { decisionCheck } from "@/lib/governance";
import { personaById, ROLE_LABEL } from "@/lib/personas";
import { computeFacts, getCase, getPilotClock } from "@/lib/repo";
import { DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/types";

export type ActionResult = { ok: true; message?: string; id?: string } | { ok: false; error: string };

// ---------------------------------------------------------------- session
export async function login(personaId: string, pin?: string): Promise<ActionResult> {
  const p = personaById(personaId);
  if (!p) return { ok: false, error: "Unknown persona" };
  if (p.role === "ADMIN" && pin !== adminPin()) {
    await appendAudit(p.name, p.role, "ADMIN_SIGN_IN_FAILED", null, { reason: "invalid PIN" });
    return { ok: false, error: "Incorrect administrator PIN" };
  }
  await setSessionCookie(p.id);
  await appendAudit(p.name, p.role, "SIGNED_IN", null, { role: ROLE_LABEL[p.role] });
  return { ok: true };
}

export async function logout() {
  await clearSessionCookie();
  redirect("/login");
}

export async function setDemoSafe(on: boolean) {
  const p = await requireSession();
  (await cookies()).set(DEMO_SAFE_COOKIE, on ? "1" : "0", { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
  await appendAudit(p.name, p.role, on ? "DEMO_SAFE_ENABLED" : "DEMO_SAFE_DISABLED", null, {});
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------- cases
const CaseInput = z.object({
  category_id: z.string().regex(/^C\d{2}$/),
  promo_type: z.enum(["PRICE_ROLLBACK", "BOGO", "DIGITAL_COUPON", "ENDCAP_FEATURE", "BUNDLE_DISCOUNT", "CLEARANCE_MARKDOWN", "INVENTORY_REALLOCATION", "ONLINE_FLASH_DEAL"]),
  discount_pct: z.coerce.number().min(0).max(70),
  duration_weeks: z.coerce.number().int().min(1).max(12),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  channel: z.enum(["OMNICHANNEL", "STORE_ONLY", "ONLINE_ONLY"]),
  scope: z.string().min(2),
  claim_text: z.string().max(240).default(""),
  vendor_funding_pct: z.coerce.number().min(0).max(100).default(0),
  reallocation_units: z.coerce.number().int().min(0).max(500000).default(0),
  flags: z.array(z.string()).default([]),
  title: z.string().max(140).optional(),
});

export async function createCase(input: z.input<typeof CaseInput>): Promise<ActionResult> {
  const p = await requireRole("DECISION_OWNER");
  const parsed = CaseInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const v = parsed.data;
  const sql = db();
  const stores =
    v.scope === "ALL"
      ? await sql`select store_id, state from stores order by store_id`
      : await sql`select store_id, state from stores where region_id = ${v.scope} order by store_id`;
  if (!stores.length) return { ok: false, error: "No stores in scope" };
  const [cat] = await sql`select name from categories where category_id = ${v.category_id}`;
  const [region] = v.scope === "ALL" ? [{ name: "All 50 pilot stores" }] : await sql`select name from regions where region_id = ${v.scope}`;
  const [{ n }] = await sql`select count(*)::int as n from decision_cases where decision_id like 'D-2026-1%'`;
  const id = `D-2026-${String(101 + Number(n)).padStart(3, "0")}`;
  const flags = [...new Set([...v.flags, ...(v.vendor_funding_pct > 0 ? ["supplier_funded"] : []), ...(v.promo_type === "DIGITAL_COUPON" ? ["uses_customer_data"] : [])])];
  const discount = v.promo_type === "INVENTORY_REALLOCATION" ? 0 : v.discount_pct;
  const title =
    v.title?.trim() ||
    `${PROMO_LABEL[v.promo_type]}${discount ? ` ${discount}%` : ""} - ${cat.name} - ${v.scope === "ALL" ? region.name : `${region.name} region`}, ${v.duration_weeks} wk`;
  const clock = await getPilotClock();
  const [{ data_end }] = await sql`select max(date)::text as data_end from sales_daily`;
  const states = [...new Set(stores.map((s) => String(s.state)))].sort();
  await sql`insert into decision_cases (decision_id, title, category_id, promo_type, discount_pct, duration_weeks, start_date, channel,
              claim_text, flags, vendor_funding_pct, reallocation_units, scope_kind, region_id, store_ids, store_count, states,
              data_as_of, created_at, created_by, scenario_tag, status)
            values (${id}, ${title}, ${v.category_id}, ${v.promo_type}, ${discount}, ${v.duration_weeks}, ${v.start_date}, ${v.channel},
              ${v.claim_text.trim()}, ${flags}, ${v.vendor_funding_pct}, ${v.reallocation_units}, ${v.scope === "ALL" ? "ALL" : "REGION"},
              ${v.scope === "ALL" ? null : v.scope}, ${stores.map((s) => String(s.store_id))}, ${stores.length}, ${states},
              ${data_end}, ${`${clock}T15:00:00Z`}, ${p.name}, 'USER_CREATED', 'DRAFT')`;
  await computeFacts(id);
  const screen = screenText(v.claim_text);
  await appendAudit(p.name, p.role, "CASE_CREATED", id, { title, category: v.category_id, stores: stores.length, input_screening: screen.flagged ? screen.reasons : "clean" });
  revalidatePath("/decisions");
  return { ok: true, id };
}

export async function reviseCase(decisionId: string, changes: { discount_pct?: number; duration_weeks?: number; claim_text?: string; vendor_funding_pct?: number; note?: string }): Promise<ActionResult> {
  const p = await requireRole("DECISION_OWNER");
  const c = await getCase(decisionId);
  if (!c) return { ok: false, error: "Case not found" };
  if (c.status === "APPROVED" || c.status === "REJECTED") return { ok: false, error: "Final decisions cannot be revised" };
  const discount = changes.discount_pct ?? c.discount_pct;
  const weeks = changes.duration_weeks ?? c.duration_weeks;
  const claim = (changes.claim_text ?? c.claim_text).slice(0, 240);
  const vendor = changes.vendor_funding_pct ?? c.vendor_funding_pct;
  const title = c.title.replace(/ \d+% - /, discount ? ` ${discount}% - ` : " - ").replace(/, \d+ wk$/, `, ${weeks} wk`);
  await db()`update decision_cases set discount_pct = ${discount}, duration_weeks = ${weeks}, claim_text = ${claim}, vendor_funding_pct = ${vendor},
               title = ${title}, revision = revision + 1, status = 'DRAFT', updated_at = now() where decision_id = ${decisionId}`;
  await db()`delete from lighthouse_decisions where decision_id = ${decisionId}`;
  await computeFacts(decisionId);
  await appendAudit(p.name, p.role, "CASE_REVISED", decisionId, {
    revision: c.revision + 1,
    before: { discount_pct: c.discount_pct, duration_weeks: c.duration_weeks, claim_text: c.claim_text, vendor_funding_pct: c.vendor_funding_pct },
    after: { discount_pct: discount, duration_weeks: weeks, claim_text: claim, vendor_funding_pct: vendor },
    note: changes.note ?? "",
  });
  revalidatePath(`/decisions/${decisionId}`);
  return { ok: true, message: `Revision ${c.revision + 1} created. Run the agents again.` };
}

// ---------------------------------------------------------------- decisions & reviews
export async function recordDecision(decisionId: string, decision: "APPROVED" | "REJECTED" | "REVISION_REQUESTED", rationale: string): Promise<ActionResult> {
  const p = await requireRole("DECISION_OWNER");
  const sql = db();
  const c = await getCase(decisionId);
  if (!c) return { ok: false, error: "Case not found" };
  const [pk] = await sql`select * from lighthouse_decisions where decision_id = ${decisionId}`;
  if (!pk) return { ok: false, error: "Run the agents before deciding." };
  if (["APPROVED", "REJECTED"].includes(c.status)) return { ok: false, error: "A final decision is already recorded." };
  const rec = String(pk.synthesized_recommendation);
  const reviews = await sql`select * from reviews where decision_id = ${decisionId} and revision = ${c.revision} and reviewer_role = 'LEGAL_REVIEWER' order by created_at desc`;
  const legal = reviews[0];
  const check = decisionCheck(
    { synthesized_recommendation: rec, requires_legal_review: Boolean(pk.requires_legal_review), risk_level: String(pk.risk_level), gates: pk.gates as { key: string; status: string }[] },
    legal ? String(legal.disposition) : null,
    decision,
    rationale,
  );
  if (!check.ok) return check;
  const override = check.override;
  const text = rationale.trim();
  await sql.transaction([
    sql`update lighthouse_decisions set approval_status = ${decision}, final_decision = ${decision}, final_rationale = ${text || null},
          decided_by = ${p.name}, decided_at = now(), override_flag = ${override} where decision_id = ${decisionId}`,
    sql`update decision_cases set status = ${decision}, updated_at = now() where decision_id = ${decisionId}`,
  ]);
  await appendAudit(p.name, p.role, override ? "DECISION_OVERRIDE_RECORDED" : "DECISION_RECORDED", decisionId, {
    decision,
    lighthouse_recommendation: rec,
    override,
    rationale: text,
    revision: c.revision,
    legal_disposition: legal?.disposition ?? null,
  });
  revalidatePath(`/decisions/${decisionId}`);
  revalidatePath("/review");
  return { ok: true, message: override ? "Override recorded with rationale." : "Decision recorded." };
}

export async function recordLegalReview(decisionId: string, disposition: "APPROVED" | "APPROVED_WITH_CONDITIONS" | "REJECTED", note: string): Promise<ActionResult> {
  const p = await requireRole("LEGAL_REVIEWER");
  const c = await getCase(decisionId);
  if (!c) return { ok: false, error: "Case not found" };
  const [pk] = await db()`select requires_legal_review from lighthouse_decisions where decision_id = ${decisionId}`;
  if (!pk) return { ok: false, error: "Agents have not been run for this case." };
  if (note.trim().length < 10) return { ok: false, error: "Add a review note (10+ characters)." };
  await db()`insert into reviews (decision_id, revision, reviewer_role, reviewer_name, disposition, condition_text)
             values (${decisionId}, ${c.revision}, 'LEGAL_REVIEWER', ${p.name}, ${disposition}, ${note.trim()})`;
  if (c.status === "AWAITING_LEGAL_REVIEW") await db()`update decision_cases set status = 'READY_FOR_DECISION', updated_at = now() where decision_id = ${decisionId}`;
  await appendAudit(p.name, p.role, "LEGAL_REVIEW_RECORDED", decisionId, { disposition, note: note.trim(), revision: c.revision });
  revalidatePath(`/decisions/${decisionId}`);
  revalidatePath("/review");
  return { ok: true, message: "Legal disposition recorded. The decision owner can now decide." };
}

export async function addReviewerNote(decisionId: string, disposition: "CONCUR" | "CONCERN", note: string): Promise<ActionResult> {
  const p = await requireRole("FINANCE_REVIEWER", "SALES_REVIEWER", "OPERATIONS_REVIEWER");
  const c = await getCase(decisionId);
  if (!c) return { ok: false, error: "Case not found" };
  if (note.trim().length < 5) return { ok: false, error: "Add a short note." };
  await db()`insert into reviews (decision_id, revision, reviewer_role, reviewer_name, disposition, condition_text)
             values (${decisionId}, ${c.revision}, ${p.role}, ${p.name}, ${disposition}, ${note.trim()})`;
  await appendAudit(p.name, p.role, "REVIEWER_NOTE_ADDED", decisionId, { disposition, note: note.trim() });
  revalidatePath(`/decisions/${decisionId}`);
  return { ok: true, message: "Note added to the packet." };
}

// ---------------------------------------------------------------- administration
export async function updateRule(ruleId: string, patch: { enabled?: boolean; severity?: string; review_required?: boolean }, reason: string): Promise<ActionResult> {
  const p = await requireRole("ADMIN");
  if (reason.trim().length < 10) return { ok: false, error: "A change reason (10+ characters) is required for the audit log." };
  const [before] = await db()`select enabled, severity, review_required from legal_rules where rule_id = ${ruleId}`;
  if (!before) return { ok: false, error: "Rule not found" };
  const after = { ...before, ...patch };
  if (!["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(String(after.severity))) return { ok: false, error: "Invalid severity" };
  await db()`update legal_rules set enabled = ${after.enabled}, severity = ${after.severity}, review_required = ${after.review_required},
               updated_at = now(), updated_by = ${p.name} where rule_id = ${ruleId}`;
  await appendAudit(p.name, p.role, "RULE_UPDATED", null, { rule_id: ruleId, before, after, reason: reason.trim() });
  revalidatePath("/admin");
  return { ok: true, message: `${ruleId} updated.` };
}

export async function updateThresholds(values: Partial<Thresholds>, reason: string): Promise<ActionResult> {
  const p = await requireRole("ADMIN");
  if (reason.trim().length < 10) return { ok: false, error: "A change reason (10+ characters) is required for the audit log." };
  const [row] = await db()`select value from config where key = 'thresholds'`;
  const before = { ...DEFAULT_THRESHOLDS, ...((row?.value as object) ?? {}) } as Thresholds;
  const after = { ...before };
  for (const [k, v] of Object.entries(values)) {
    if (!(k in DEFAULT_THRESHOLDS)) continue;
    const n = Number(v);
    if (!Number.isFinite(n)) return { ok: false, error: `Invalid value for ${k}` };
    (after as unknown as Record<string, number>)[k] = n;
  }
  await db()`insert into config (key, value, description, updated_by) values ('thresholds', ${JSON.stringify(after)}::jsonb, 'Governance thresholds', ${p.name})
             on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`;
  const changed = Object.fromEntries(Object.keys(after).filter((k) => (after as never)[k] !== (before as never)[k]).map((k) => [k, { from: (before as never)[k], to: (after as never)[k] }]));
  await appendAudit(p.name, p.role, "THRESHOLDS_UPDATED", null, { changed, reason: reason.trim() });
  revalidatePath("/admin");
  return { ok: true, message: `${Object.keys(changed).length} threshold(s) updated.` };
}

export async function verifyAuditChain() {
  await requireSession();
  const [r] = await db()`select * from verify_audit_chain()`;
  return { entries: Number(r.entries), first_broken_seq: r.first_broken_seq ? Number(r.first_broken_seq) : null, last_hash: String(r.last_hash ?? "") };
}

/** Reset the 12 curated demo cases to DRAFT (keeps saved AI answers for demo-safe replay; audit log is append-only). */
export async function resetDemoCases(): Promise<ActionResult> {
  const p = await requireRole("ADMIN", "DECISION_OWNER");
  const sql = db();
  const curated = (await sql`select decision_id from decision_cases where scenario_tag <> '' and scenario_tag <> 'USER_CREATED' and decision_id like 'D-2026-0%'`).map((r) => String(r.decision_id));
  await sql.transaction([
    sql`delete from lighthouse_decisions where decision_id = any(${curated})`,
    sql`delete from reviews where decision_id = any(${curated})`,
    sql`delete from agent_runs where decision_id = any(${curated})`,
    sql`delete from agent_outputs where decision_id = any(${curated})`,
    sql`delete from evidence where decision_id = any(${curated})`,
    sql`update decision_cases set status = 'DRAFT', revision = 1, updated_at = now(),
          title = coalesce(original->>'title', title), discount_pct = coalesce((original->>'discount_pct')::numeric, discount_pct),
          duration_weeks = coalesce((original->>'duration_weeks')::int, duration_weeks), claim_text = coalesce(original->>'claim_text', claim_text),
          vendor_funding_pct = coalesce((original->>'vendor_funding_pct')::numeric, vendor_funding_pct)
        where decision_id = any(${curated})`,
    sql`update decision_cases set facts = compute_case_facts(decision_id) where decision_id = any(${curated})`,
  ]);
  await appendAudit(p.name, p.role, "DEMO_CASES_RESET", null, { cases: curated });
  revalidatePath("/", "layout");
  return { ok: true, message: `${curated.length} demo cases reset to draft.` };
}

// ---------------------------------------------------------------- acceptance tests
export async function runTests() {
  const p = await requireSession();
  const { runAcceptanceTests } = await import("@/lib/testlab");
  const t = Date.now();
  const results = await runAcceptanceTests();
  const passed = results.filter((r) => r.passed).length;
  await appendAudit(p.name, p.role, "ACCEPTANCE_TESTS_RUN", null, { passed, total: results.length, ms: Date.now() - t });
  return { results, ms: Date.now() - t };
}

export async function testProviders() {
  const p = await requireSession();
  const { providerStatus } = await import("@/lib/ai/providers");
  const status = await providerStatus();
  await appendAudit(p.name, p.role, "AI_PROVIDERS_TESTED", null, { status: status.map((s) => ({ provider: s.provider, ok: s.ok, model: s.model })) });
  return status;
}
