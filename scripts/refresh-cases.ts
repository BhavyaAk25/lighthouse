import "./env";
import { refreshCase } from "@/lib/caseflow";
import { db } from "@/lib/db";
// Recompute lanes + signed recommendation for live cases (after a rule change). `npx tsx --conditions=react-server scripts/refresh-cases.ts`
(async () => {
  const ids = (await db()`select decision_id from decision_cases where decision_id like 'D-2026-%' and status in ('IN_REVIEW','READY_FOR_DECISION')`).map((r) => String(r.decision_id));
  for (const id of ids) console.log(id, (await refreshCase(id))?.status);
})();
