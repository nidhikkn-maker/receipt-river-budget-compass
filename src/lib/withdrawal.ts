/**
 * RB-LED-01 / P0-005a (unposted path). KK decision 1 extended to entries that are NOT posted to balanced books: the user never
 * physically removes a financial record. "Withdraw entry" keeps the row byte-for-byte (amounts, accounts, receipt files, statement
 * reference, change history) and records a withdrawal event (reason, who, when) in expenses.receipt_details.withdrawal:
 *   { state: "withdrawn" | "restored", at, by, reason, history: [{ action, at, by, reason }, ...] }   (history is append-only)
 * A withdrawn entry is excluded from every financial figure through the single ledger reader path (ledger.ts ledgerView, fed by
 * txnFromRow / withdrawnAtOfRow in the store, report jobs, assistant facts, MCP tools, push and statement checkpoints). Restore
 * appends a "restored" event and the entry counts again. Pure; no I/O.
 *
 * Why receipt_details (not new columns): it exists on today's applied schema, so the path is safe before any SQL is applied; it is
 * readable by narrow selects (`withdrawal:receipt_details->withdrawal`); every expense UPDATE bumps correction_revision, so revision
 * checked flows (Statement Desk Undo, corrections) refuse to act on an entry withdrawn after their preview. The proposed P10 SQL
 * makes the history database-enforced and refuses DELETE of expenses by signed-in users (see
 * .lovable/staged-sql/proposed/P10_unposted_entry_withdrawal.sql).
 */
export type WithdrawalAction = "withdrawn" | "restored";
export interface WithdrawalEvent { action: WithdrawalAction; at: string; by: string; reason: string }
export interface Withdrawal { state: WithdrawalAction; at: string; by: string; reason: string; history: WithdrawalEvent[] }

export const MIN_WITHDRAW_REASON = 5;
/** A reason of at least five characters (the same rule as reversal reasons, posting.ts validReason, and P9 archive events). */
export const withdrawReasonProblem = (reason: string): string | null =>
  reason.trim().length >= MIN_WITHDRAW_REASON ? null : `Give a reason of at least ${MIN_WITHDRAW_REASON} characters`;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Reads a stored withdrawal; anything malformed reads as "never withdrawn" only when it carries no withdrawn state at all. */
export function parseWithdrawal(v: unknown): Withdrawal | null {
  if (!isObj(v)) return null;
  const history = Array.isArray(v["history"])
    ? v["history"].filter(isObj).map((e) => ({ action: (e["action"] === "restored" ? "restored" : "withdrawn") as WithdrawalAction, at: str(e["at"]), by: str(e["by"]), reason: str(e["reason"]) }))
    : [];
  const state: WithdrawalAction = v["state"] === "restored" ? "restored" : "withdrawn"; // fail closed: an unreadable state stays excluded
  return { state, at: str(v["at"]), by: str(v["by"]), reason: str(v["reason"]), history };
}

/** The withdrawal of a raw database row: the narrow alias `withdrawal`, or receipt_details.withdrawal when selected whole. */
export function withdrawalOfRow(row: object): Withdrawal | null {
  const r = row as { withdrawal?: unknown; receipt_details?: unknown };
  if (r.withdrawal !== undefined) return parseWithdrawal(r.withdrawal);
  return isObj(r.receipt_details) ? parseWithdrawal(r.receipt_details["withdrawal"]) : null;
}
/** When the entry was withdrawn (null = it counts). Readers put this on Txn.withdrawnAt; ledgerView drops those rows. */
export const withdrawnAtOfRow = (row: object): string | null => {
  const w = withdrawalOfRow(row);
  return w && w.state === "withdrawn" ? w.at || "withdrawn" : null;
};
export const isWithdrawn = (w: Withdrawal | null | undefined) => !!w && w.state === "withdrawn";

function next(current: Withdrawal | null, action: WithdrawalAction, who: { by: string; at: string; reason: string }): Withdrawal {
  const problem = withdrawReasonProblem(who.reason);
  if (problem) throw Error(problem);
  if (!who.by) throw Error("Sign in again to record who did this");
  const last = current?.history.at(-1)?.action ?? (current ? current.state : "restored");
  if (last === action) throw Error(action === "withdrawn" ? "This entry is already withdrawn" : "This entry is not withdrawn");
  const event: WithdrawalEvent = { action, at: who.at, by: who.by, reason: who.reason.trim() };
  return { state: action, at: event.at, by: event.by, reason: event.reason, history: [...(current?.history ?? []), event] };
}
export const withdrawEntry = (current: Withdrawal | null, who: { by: string; at: string; reason: string }) => next(current, "withdrawn", who);
export const restoreEntry = (current: Withdrawal | null, who: { by: string; at: string; reason: string }) => next(current, "restored", who);

/** receipt_details with the new withdrawal and every other stored key unchanged (the reading audit, items, tax parts...). */
export function withWithdrawal(receiptDetails: unknown, w: Withdrawal): Record<string, unknown> {
  return { ...(isObj(receiptDetails) ? receiptDetails : {}), withdrawal: w };
}

/** The entry is not posted, so it is withdrawn with a reason (never deleted). */
export class WithdrawReasonRequired extends Error {
  constructor() { super(`Entries are withdrawn, not deleted. Give a reason of at least ${MIN_WITHDRAW_REASON} characters.`); this.name = "WithdrawReasonRequired"; }
}
