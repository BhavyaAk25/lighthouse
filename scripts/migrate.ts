import "./env";
import { db } from "@/lib/db";
async function main() {
  const sql = db();
  await sql`alter table lighthouse_decisions add column if not exists headline text not null default ''`;
  await sql`alter table lighthouse_decisions add column if not exists narrative jsonb not null default '{}'`;
  await sql`alter table decision_cases add column if not exists original jsonb`;
  await sql`update decision_cases set original = jsonb_build_object('title', title, 'discount_pct', discount_pct, 'duration_weeks', duration_weeks,
              'claim_text', claim_text, 'vendor_funding_pct', vendor_funding_pct)
            where decision_id like 'D-2026-0%' and original is null`;
  console.log("migrated");
}
main();
