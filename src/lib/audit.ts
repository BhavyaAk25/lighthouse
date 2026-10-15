import { db } from "./db";

/** Append an entry to the hash-chained, append-only audit log (hash computed in Postgres). */
export async function appendAudit(actor: string, role: string, action: string, decisionId: string | null, payload: object = {}) {
  const rows = await db()`select seq, hash from append_audit(${actor}, ${role}, ${action}, ${decisionId}, ${JSON.stringify(payload)}::jsonb)`;
  return rows[0] as { seq: number; hash: string };
}
