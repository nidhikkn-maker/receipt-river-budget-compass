// Phase 3 client for the balanced posting layer (proposed P7). Capability-checked and fail-closed in the
// Phase 1 style: when the database has no posting layer (current production schema) every call reports
// "not installed" and the app keeps today's behaviour; when it exists, removing a POSTED entry is an
// audited reversal (reason + re-confirmation), never a hard delete. The database is the authority: it
// refuses deletes of posted entries (P7_POSTED_ENTRY) whatever the client does.
import { useEffect, useState } from "react";
import { errorMessage, isMissingFunction, withStepUp, type StepUpPrompt } from "./step-up";
import { rpcUntyped } from "./step-up-check";

export interface PostingStatus { installed: boolean; active: boolean; guest: boolean; canPost: boolean }
export const NOT_INSTALLED: PostingStatus = { installed: false, active: false, guest: false, canPost: false };

type Rpc = (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;

/** Reads posting_status(). Missing function = not installed; any other failure is reported, never guessed. */
export async function readPostingStatus(rpc: Rpc = rpcUntyped): Promise<PostingStatus> {
  const r = await rpc("posting_status");
  if (r.error) {
    if (isMissingFunction(r.error)) return NOT_INSTALLED;
    throw new Error(r.error.message || "Couldn't check the accounting status");
  }
  const d = (r.data ?? {}) as Partial<PostingStatus>;
  return { installed: d.installed === true, active: d.active === true, guest: d.guest === true, canPost: d.canPost === true };
}

let cached: { owner: string; at: number; value: Promise<PostingStatus> } | null = null;
/** Status for the signed-in owner, shared by screens for 60 s (a reversal or activation refreshes it). */
export function postingStatus(owner: string, rpc: Rpc = rpcUntyped): Promise<PostingStatus> {
  if (cached && cached.owner === owner && Date.now() - cached.at < 60_000) return cached.value;
  const value = readPostingStatus(rpc);
  cached = { owner, at: Date.now(), value };
  value.catch(() => { if (cached?.value === value) cached = null; });
  return value;
}
export function forgetPostingStatus() { cached = null; }

export function usePostingStatus(owner: string | null | undefined): PostingStatus | null {
  const [status, setStatus] = useState<PostingStatus | null>(null);
  useEffect(() => {
    let live = true;
    if (!owner) { setStatus(NOT_INSTALLED); return; }
    postingStatus(owner).then((s) => { if (live) setStatus(s); }).catch(() => { if (live) setStatus(null); });
    return () => { live = false; };
  }, [owner]);
  return status;
}

/** How "remove this entry" must work for this status. */
export type RemovalMode = "delete" | "reverse";
export const removalMode = (s: PostingStatus): RemovalMode => (s.installed && s.active ? "reverse" : "delete");

export const POSTED_ENTRY = "P7_POSTED_ENTRY";
export const isPostedEntryError = (e: unknown) => errorMessage(e).includes(POSTED_ENTRY);

export class ReversalReasonRequired extends Error {
  constructor() { super("Posted entries are reversed, not deleted. Give a reason of at least five characters."); this.name = "ReversalReasonRequired"; }
}
export const validReason = (reason: string | undefined) => (reason ?? "").trim().length >= 5;

/**
 * Reverses one posted entry through reverse_ledger_entry (step-up, reason, audited, idempotent by request
 * id). The entry leaves the working ledger; its postings, archived row and receipts are kept.
 */
export async function reverseLedgerEntry(args: { entryId: string; reason: string; requestId: string }, rpc: Rpc = rpcUntyped, prompt?: StepUpPrompt) {
  if (!validReason(args.reason)) throw new ReversalReasonRequired();
  const r = await withStepUp(() => rpc("reverse_ledger_entry", { _request: args.requestId, _entry: args.entryId, _reason: args.reason.trim() }), prompt);
  if (r.error) throw new Error(r.error.message);
  const d = (r.data ?? {}) as { entryId?: string };
  if (d.entryId !== args.entryId) throw new Error("The reversal could not be confirmed. Retry the same request.");
  forgetPostingStatus();
  return d;
}
