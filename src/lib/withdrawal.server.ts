// RB-LED-01 server authority for Withdraw / Restore (KK, binding: "For unposted financial records, implement a recoverable Withdraw
// action with reason, retained evidence and audit history. Posted and reconciled records require proper reversal/correction
// workflows. Enforce the distinction server-side.").
// Runs with the signed-in user's own client (RLS applies). With the proposed P10 SQL installed the database functions
// withdraw_entry / restore_entry decide (and the P10 trigger refuses any other change of the withdrawal, and every DELETE by a
// signed-in user). Before P10 the same rules are checked here, and the update is revision-checked so a concurrent edit is never
// overwritten. Either way: no row is deleted and no receipt file is touched.
import { isMissingSchemaObject } from "./statement-pipeline/undo-capability";
import { isWithdrawn, restoreEntry, withdrawEntry, withdrawalOfRow, withdrawReasonProblem, withWithdrawal } from "./withdrawal";

export type WithdrawalAction = "withdraw" | "restore";
export interface WithdrawalResult { ok: true; replayed: boolean }
/** Codes shared with P10 (same wording), so the app shows one message whichever side refused. */
export const WITHDRAW_REFUSAL = {
  notFound: "P10_NOT_FOUND: that entry was not found among your records. Nothing was changed.",
  reason: "P10_REASON: give a reason of at least 5 characters.",
  posted: "P10_POSTED: this entry is posted to your books. Reverse it with a reason instead (Reverse entry); it is never withdrawn.",
  reconciled: "P10_RECONCILED: this entry is matched to a bank statement line. Correct it through the correction workflow (or clear the statement match there first); it is not withdrawn.",
  reversal: "P10_REVERSAL_HISTORY: reversal history is kept as it is; it cannot be withdrawn.",
  linked: "P10_LINKED_TRANSFER: this transfer is linked to its other side. Undo the transfer link first; nothing was changed.",
  notWithdrawn: "P10_NOT_WITHDRAWN: this entry is not withdrawn, so there is nothing to restore.",
  changed: "P10_CHANGED: this entry changed while you were saving. Nothing was changed; open it again and retry.",
} as const;

/** Minimal shape of the user-scoped Supabase client used here (narrow, so the proposed P10 / P7 objects need no type refresh). */
interface Res { data: unknown; error: { message: string; code?: string } | null }
interface Q extends PromiseLike<Res> {
  select(columns: string): Q; eq(column: string, value: unknown): Q; limit(n: number): Q; update(values: Record<string, unknown>): Q;
  maybeSingle(): PromiseLike<Res>;
}
export interface WithdrawalDb { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<Res>; from: (table: string) => Q }
const rows = (d: unknown) => (Array.isArray(d) ? d : []);

export async function changeWithdrawal(db: WithdrawalDb, userId: string, input: { id: string; action: WithdrawalAction; reason: string }): Promise<WithdrawalResult> {
  const reason = input.reason.trim();
  if (withdrawReasonProblem(reason)) throw Error(WITHDRAW_REFUSAL.reason);
  const rpc = await db.rpc(input.action === "withdraw" ? "withdraw_entry" : "restore_entry", { p_entry: input.id, p_reason: reason });
  if (!rpc.error) {
    const d = rpc.data as { replayed?: unknown } | null;
    return { ok: true, replayed: d?.replayed === true };
  }
  if (!isMissingSchemaObject(rpc.error)) throw Error(rpc.error.message);
  // Before P10: the same rules, checked here.
  const cur = await db.from("expenses").select("id,employee_id,receipt_details,correction_revision,transfer_counterpart_of,reconciled_at,statement_ref").eq("id", input.id).eq("employee_id", userId).maybeSingle();
  if (cur.error) throw Error("Couldn't check the entry. Nothing was changed; try again.");
  const row = cur.data as { id: string; receipt_details: unknown; correction_revision: number; transfer_counterpart_of: string | null; reconciled_at: string | null; statement_ref: string | null } | null;
  if (!row) throw Error(WITHDRAW_REFUSAL.notFound);
  const stored = withdrawalOfRow(row);
  const last = stored?.history.at(-1);
  const wanted = input.action === "withdraw" ? "withdrawn" : "restored";
  // A retry of the same request after a lost response: already recorded, nothing is written twice.
  if (last && last.action === wanted && last.by === userId && last.reason === reason) return { ok: true, replayed: true };
  if (input.action === "restore") {
    if (!isWithdrawn(stored)) throw Error(WITHDRAW_REFUSAL.notWithdrawn);
  } else {
    if (isWithdrawn(stored)) return { ok: true, replayed: true };
    const rd = row.receipt_details;
    if (rd && typeof rd === "object" && !Array.isArray(rd) && "reversal" in rd) throw Error(WITHDRAW_REFUSAL.reversal);
    const reversed = await db.from("expenses").select("id").eq("employee_id", userId).eq("receipt_details->reversal->>of", input.id).limit(1);
    if (reversed.error) throw Error("Couldn't check the entry. Nothing was changed; try again.");
    if (rows(reversed.data).length) throw Error(WITHDRAW_REFUSAL.reversal);
    if (row.reconciled_at || row.statement_ref) throw Error(WITHDRAW_REFUSAL.reconciled);
    const linked = await db.from("expenses").select("id").eq("employee_id", userId).eq("transfer_counterpart_of", input.id).limit(1);
    if (linked.error) throw Error("Couldn't check the entry. Nothing was changed; try again.");
    if (row.transfer_counterpart_of || rows(linked.data).length) throw Error(WITHDRAW_REFUSAL.linked);
    // Posted to balanced books (proposed P7): any posting event for the entry means Reverse, never Withdraw. Where P7 is not
    // installed the table does not exist; any other failure refuses (fail closed).
    const posted = await db.from("posting_events").select("id").eq("event_key", `ledger_entry:${input.id}`).limit(1);
    if (posted.error && !isMissingSchemaObject(posted.error)) throw Error("Couldn't check whether this entry is posted. Nothing was changed; try again.");
    if (!posted.error && rows(posted.data).length) throw Error(WITHDRAW_REFUSAL.posted);
  }
  const who = { by: userId, at: new Date().toISOString(), reason };
  const next = input.action === "withdraw" ? withdrawEntry(stored, who) : restoreEntry(stored, who);
  const upd = await db.from("expenses").update({ receipt_details: withWithdrawal(row.receipt_details, next) })
    .eq("id", input.id).eq("employee_id", userId).eq("correction_revision", row.correction_revision).select("id");
  if (upd.error) throw Error(upd.error.message);
  if (!rows(upd.data).length) throw Error(WITHDRAW_REFUSAL.changed);
  return { ok: true, replayed: false };
}
