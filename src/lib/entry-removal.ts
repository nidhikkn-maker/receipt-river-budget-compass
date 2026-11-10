// What "remove an entry" does in the app (store.remove), as one testable rule (RB-LED-01, KK decision 1 + the 11 Nov binding
// decision): an entry is NEVER physically removed by the user.
//   * posted to balanced books (P7 active)  -> Reverse with a reason (reverse_ledger_entry: original kept, linked reversal);
//   * not posted                            -> Withdraw with a reason (setEntryWithdrawal: server/P10 decide; refused for
//                                              reconciled entries, which go through correction);
// no DELETE request is sent and no receipt file is removed on any path. Before this change the unposted path sent
// DELETE /expenses?id=eq.<id> and removed the entry's receipt files (store.tsx at c397e1b).
import { isNotPostedError, ReversalReasonRequired, validReason } from "./posting";
import { WithdrawReasonRequired } from "./withdrawal";

export interface RemovalDeps {
  /** "reverse" where the posting layer is active for the owner, else "withdraw". */
  mode: () => Promise<"reverse" | "withdraw">;
  reverse: (p: { entryId: string; reason: string; requestId: string; correctionDate?: string }) => Promise<void>;
  /** The server decision (setEntryWithdrawal). */
  withdraw: (entryId: string, reason: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}

export async function removeEntry(e: { id: string }, opts: { reason?: string; requestId?: string; correctionDate?: string } | undefined, deps: RemovalDeps): Promise<"reversed" | "withdrawn"> {
  const reason = opts?.reason ?? "";
  if ((await deps.mode()) === "reverse") {
    if (!validReason(reason)) throw new ReversalReasonRequired();
    try {
      await deps.reverse({ entryId: e.id, reason, requestId: opts?.requestId ?? crypto.randomUUID(), ...(opts?.correctionDate ? { correctionDate: opts.correctionDate } : {}) });
      return "reversed";
    } catch (err) {
      // A listed exception that never posted is withdrawn with the same reason, never deleted.
      if (!isNotPostedError(err)) throw err;
    }
  }
  if (!validReason(reason)) throw new WithdrawReasonRequired();
  const r = await deps.withdraw(e.id, reason);
  if (!r.ok) {
    if (/^P10_POSTED|P7_POSTED/.test(r.error)) throw new ReversalReasonRequired();
    throw Error(r.error.replace(/^P10_[A-Z_]+: /, ""));
  }
  return "withdrawn";
}
