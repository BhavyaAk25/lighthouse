import "./env";
import { db } from "@/lib/db";

/** Idempotent schema migrations. Safe to run more than once: `npx tsx scripts/migrate.ts` */
async function main() {
  const sql = db();
  // v1: narrative packet + original demo values
  await sql`alter table lighthouse_decisions add column if not exists headline text not null default ''`;
  await sql`alter table lighthouse_decisions add column if not exists narrative jsonb not null default '{}'`;
  await sql`alter table decision_cases add column if not exists original jsonb`;
  await sql`update decision_cases set original = jsonb_build_object('title', title, 'discount_pct', discount_pct, 'duration_weeks', duration_weeks,
              'claim_text', claim_text, 'vendor_funding_pct', vendor_funding_pct)
            where decision_id like 'D-2026-0%' and original is null`;

  // v2: department sign-offs (four leads own their agents; the executive decides)
  await sql`alter table agent_outputs add column if not exists hard_constraint text`;
  await sql`alter table lighthouse_decisions add column if not exists ai_recommendation text`;
  await sql`alter table lighthouse_decisions add column if not exists ai_confidence numeric(4,3)`;
  await sql`alter table lighthouse_decisions add column if not exists analyzed_at timestamptz`;
  await sql`update lighthouse_decisions set ai_recommendation = synthesized_recommendation, ai_confidence = lighthouse_confidence,
              analyzed_at = created_at where ai_recommendation is null`;
  await sql`alter table reviews add column if not exists department text`;
  await sql`alter table reviews add column if not exists ai_recommendation text`;
  await sql`alter table reviews add column if not exists position text`;
  await sql`alter table reviews add column if not exists conditions text[] not null default '{}'`;
  await sql`alter table reviews add column if not exists superseded boolean not null default false`;
  await sql`create index if not exists reviews_decision_rev on reviews (decision_id, revision)`;

  // legacy rows -> sign-off format
  const legacy = await sql`
    update reviews r set
      department = case r.reviewer_role when 'LEGAL_REVIEWER' then 'LEGAL' when 'FINANCE_REVIEWER' then 'FINANCE'
                                        when 'SALES_REVIEWER' then 'SALES' else 'OPERATIONS' end,
      ai_recommendation = coalesce((select o.recommendation from agent_outputs o join lighthouse_decisions l on l.run_id = o.run_id
                                    where l.decision_id = r.decision_id and o.agent_type = case r.reviewer_role when 'LEGAL_REVIEWER' then 'LEGAL'
                                      when 'FINANCE_REVIEWER' then 'FINANCE' when 'SALES_REVIEWER' then 'SALES' else 'OPERATIONS' end limit 1), 'PROCEED'),
      position = case r.disposition when 'APPROVED' then 'PROCEED' when 'APPROVED_WITH_CONDITIONS' then 'PROCEED_WITH_CONDITIONS'
                                    when 'REJECTED' then 'REJECT' when 'CONCERN' then 'HOLD' else null end,
      disposition = case r.disposition when 'APPROVED' then 'CONFIRMED' when 'APPROVED_WITH_CONDITIONS' then 'CONFIRMED'
                                       when 'REJECTED' then 'BLOCKED' when 'CONCUR' then 'CONFIRMED' when 'CONCERN' then 'ADJUSTED' else r.disposition end
    where r.department is null returning review_id`;
  await sql`update reviews set position = ai_recommendation where position is null`;
  console.log(`converted ${legacy.length} legacy reviews`);

  // historical ledger: department leads signed off wherever their agent raised a concern (deterministic pseudo-random)
  const LEAD: Record<string, [string, string]> = {
    SALES: ["Hannah Brooks", "SALES_REVIEWER"],
    FINANCE: ["David Okafor", "FINANCE_REVIEWER"],
    OPERATIONS: ["Luis Moreno", "OPERATIONS_REVIEWER"],
  };
  let added = 0;
  for (const [dept, [name, role]] of Object.entries(LEAD)) {
    const rows = await sql`
      insert into reviews (decision_id, revision, reviewer_role, reviewer_name, disposition, condition_text, created_at,
                           department, ai_recommendation, position)
      select o.decision_id, 1, ${role}, ${name},
             case when h < 72 then 'CONFIRMED' when h < 93 or c.status = 'APPROVED' then 'ADJUSTED' else 'BLOCKED' end,
             case when h < 72 then 'Agent assumptions checked against the department plan; position confirmed.'
                  when h < 93 or c.status = 'APPROVED' then 'Agent is too conservative here; adjusted with a mitigation condition.'
                  else 'Cannot support this from a department view.' end,
             r.started_at + make_interval(hours => 2 + (h % 30)),
             ${dept}, o.recommendation,
             case when h < 72 then (case when o.recommendation = 'REVIEW_REQUIRED' then 'HOLD' else o.recommendation end)
                  when h < 93 or c.status = 'APPROVED' then (case when o.recommendation in ('REJECT','HOLD') then 'PROCEED_WITH_CONDITIONS' else 'HOLD' end)
                  else 'REJECT' end
      from (select o.*, abs(('x' || substr(md5(o.decision_id || o.agent_type), 1, 8))::bit(32)::int) % 100 h
            from agent_outputs o) o
      join lighthouse_decisions l on l.run_id = o.run_id
      join decision_cases c on c.decision_id = o.decision_id
      join agent_runs r on r.run_id = o.run_id
      where o.agent_type = ${dept} and c.decision_id not like 'D-2026-%'
        and c.status in ('APPROVED','REJECTED','REVISION_REQUESTED','READY_FOR_DECISION')
        and (o.recommendation in ('HOLD','REJECT','REVIEW_REQUIRED') or o.confidence < 0.65 or not o.valid)
        and not exists (select 1 from reviews x where x.decision_id = o.decision_id and x.department = ${dept})
      returning review_id`;
    added += rows.length;
  }
  console.log(`added ${added} historical department sign-offs`);

  // status rename: the legal-only queue became department sign-off
  await sql`update decision_cases set status = 'IN_REVIEW' where status = 'AWAITING_LEGAL_REVIEW'`;
  console.log("migrated");
}
main();
