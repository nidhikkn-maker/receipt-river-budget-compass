import type { Account } from "./ledger";
import type { Expense } from "./expenses";
import type { StatementStatusEvidence } from "./account-statement-status";
import { canonicalEvidence } from "./statement-evidence";
export interface StatementCheckpoint { id: string; batch_id: string; evidence_hash: string; created_at: string; result: { reconciliation: string; balance: string; difference: number | null; unresolved: number; matched: number } }
export function checkpointSnapshot(evidence: StatementStatusEvidence, account: Account, transactions: Expense[]) {
  const b = evidence.batch;
  const expected = { batch: { account_id: b.account_id, status: b.status, period_from: b.period_from, period_to: b.period_to, currency: b.currency, opening_balance: b.opening_balance == null ? null : Number(b.opening_balance), closing_balance: b.closing_balance == null ? null : Number(b.closing_balance), statement_review: b.statement_review ?? {}, balance_verification: b.balance_verification ?? {}, statement_identity: b.statement_identity ?? [] }, account: { id: account.id, name: account.name, kind: account.kind, opening_balance: account.openingBalance, archived: account.archived } };
  const ledger = transactions.filter(t => t.accountId === account.id || t.toAccountId === account.id).map(t => ({ id: t.id, revision: t.correctionRevision ?? 0 })).sort((a, b) => a.id.localeCompare(b.id));
  const rows = evidence.rows.map(r => ({ id: r.id, line: r.line, proposal: r.proposal, decision: r.decision, duplicate_kind: r.duplicate_kind, duplicate_id: r.duplicate_id, fingerprint: r.fingerprint })).sort((a, b) => a.id.localeCompare(b.id));
  const posts = [...evidence.posted].sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
  return { expected, ledger, rows, posts };
}
export async function checkpointHash(snapshot: ReturnType<typeof checkpointSnapshot>) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalEvidence(snapshot)));
  return Array.from(new Uint8Array(hash), v => v.toString(16).padStart(2, "0")).join("");
}
export function checkpointCurrent(evidence: StatementStatusEvidence) {
  return !!evidence.checkpoint && !!evidence.currentHash && evidence.checkpoint.evidence_hash === evidence.currentHash;
}