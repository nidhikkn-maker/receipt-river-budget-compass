// Phase 3 client for the balanced posting layer (proposed P7). Capability-checked and fail-closed in the
// Phase 1 style: when the database has no posting layer (current production schema) every call reports
// "not installed" and the app keeps today's behaviour; when it exists, removing a POSTED entry is an
// audited reversal (reason + re-confirmation), never a hard delete. The database is the authority: it
// refuses deletes of posted entries (P7_POSTED_ENTRY) whatever the client does.
import { useEffect, useState } from "react";
import { errorMessage, isMissingFunction, withStepUp, type StepUpPrompt } from "./step-up";
import { rpcUntyped } from "./step-up-check";

export interface PostingStatus { installed: boolean; active: boolean; guest: boolean; canPost: boolean; version?: string; features?: string[] }
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
  return {
    installed: d.installed === true, active: d.active === true, guest: d.guest === true, canPost: d.canPost === true,
    ...(typeof d.version === "string" ? { version: d.version } : {}), ...(Array.isArray(d.features) ? { features: d.features.filter((f): f is string => typeof f === "string") } : {}),
  };
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

/** Today's date in India (the app's books), as YYYY-MM-DD: the default correction date (decision 2). */
export const correctionToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const NOT_POSTED = "P7_NOT_POSTED";
/** The entry never posted (a listed exception): it is removed as today, not reversed. */
export const isNotPostedError = (e: unknown) => errorMessage(e).includes(NOT_POSTED);

export interface ReversalResult { entryId: string; reversalEntryId: string; correctionDate: string; replayed: boolean }
const fail = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); };

/**
 * KK decisions 1 + 2. Reverses one POSTED entry through reverse_ledger_entry (step-up, reason, audited,
 * idempotent by request id). The original stays in the ledger unchanged; a linked reversal row is added,
 * dated on the correction date (default today; never before the entry, never in the future, never in a
 * closed period: the database refuses with P7_CLOSED_PERIOD and the screen offers a prior-period
 * adjustment instead). Its postings, audit record and receipts are kept.
 */
export async function reverseLedgerEntry(args: { entryId: string; reason: string; requestId: string; correctionDate?: string }, rpc: Rpc = rpcUntyped, prompt?: StepUpPrompt): Promise<ReversalResult> {
  if (!validReason(args.reason)) throw new ReversalReasonRequired();
  if (args.correctionDate !== undefined && !ISO_DATE.test(args.correctionDate)) throw new Error("Choose a valid correction date");
  const r = await withStepUp(() => rpc("reverse_ledger_entry", { _request: args.requestId, _entry: args.entryId, _reason: args.reason.trim(), ...(args.correctionDate ? { _on: args.correctionDate } : {}) }), prompt);
  fail(r);
  const d = (r.data ?? {}) as Partial<ReversalResult>;
  if (d.entryId !== args.entryId) throw new Error("The reversal could not be confirmed. Retry the same request.");
  forgetPostingStatus();
  return { entryId: d.entryId, reversalEntryId: String(d.reversalEntryId ?? ""), correctionDate: String(d.correctionDate ?? ""), replayed: d.replayed === true };
}

// ---------------------------------------------------------------------------------------------
// P0-005b: one card-payment action (record_card_payment). The request id is the entry id AND the
// operation key, so a lost response followed by a retry with the SAME id records one payment. Create
// the id once per payment form (not per tap) and reuse it for every retry of that payment.
// ---------------------------------------------------------------------------------------------
export interface CardPaymentInput { requestId: string; fromAccountId: string; cardAccountId: string; amount: number; date: string; note?: string }
export interface CardPaymentResult { id: string; amount: number; replayed: boolean; via: "database" | "fallback" }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateCardPayment(p: CardPaymentInput) {
  if (!UUID.test(p.requestId)) throw new Error("Missing payment identifier");
  if (!p.fromAccountId) throw new Error("Choose the account you paid from");
  if (!p.cardAccountId || p.cardAccountId === p.fromAccountId) throw new Error("Choose the card you paid");
  if (!Number.isFinite(p.amount) || p.amount <= 0 || Math.round(p.amount * 100) / 100 !== p.amount || p.amount > 100_000_000) throw new Error("Enter a positive amount with no more than two decimal places");
  if (!ISO_DATE.test(p.date) || p.date > correctionToday()) throw new Error("Payment date cannot be in the future");
}
/**
 * Records a card payment once. Uses the database action where installed; on today's production schema
 * (function missing) it falls back to the caller's save() with createId = requestId, which the server
 * upserts by id, so retries stay idempotent there too.
 */
export async function recordCardPayment(p: CardPaymentInput, rpc: Rpc = rpcUntyped, fallback?: (requestId: string) => Promise<void>): Promise<CardPaymentResult> {
  validateCardPayment(p);
  const r = await rpc("record_card_payment", { _request: p.requestId, _from: p.fromAccountId, _card: p.cardAccountId, _amount: p.amount, _on: p.date, _note: p.note ?? "" });
  if (r.error && isMissingFunction(r.error) && fallback) { await fallback(p.requestId); return { id: p.requestId, amount: p.amount, replayed: false, via: "fallback" }; }
  fail(r);
  const d = (r.data ?? {}) as { id?: string; amount?: number; replayed?: boolean };
  if (d.id !== p.requestId) throw new Error("The payment could not be confirmed. Retry; it will not be recorded twice.");
  return { id: d.id, amount: Number(d.amount), replayed: d.replayed === true, via: "database" };
}

// ---------------------------------------------------------------------------------------------
// Item 5: approval queue (submit_posting_request -> decide_posting_request with step-up). Submitting
// validates and posts nothing; approving posts atomically through the one posting path; rejecting or
// cancelling posts nothing. Owner-only in this release (decision 5).
// ---------------------------------------------------------------------------------------------
export interface JournalLine { code: string; role: "asset" | "liability" | "equity" | "income" | "expense"; debit: number; credit: number; currency?: string; memo?: string }
export interface JournalEvidence { kind: "document" | "receipt"; key: string }
export type PostingRequest =
  | { kind: "journal"; payload: { entityId: string; date: string; lines: JournalLine[]; memo: string; sources: JournalEvidence[] } }
  | { kind: "journal_reversal"; payload: { batchId: string; correctionDate?: string } }
  | { kind: "reversal"; payload: { entryId: string; correctionDate?: string } }
  | { kind: "backfill"; payload: { fingerprint: string } }
  | { kind: "prior_period_adjustment"; payload: { periodId: string; correctionDate?: string } & ({ entityId: string; lines: JournalLine[]; memo: string; sources: JournalEvidence[] } | { entryId: string }) };
export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export interface RequestOverview { request: string; kind: PostingRequest["kind"]; entityId: string | null; payload: Record<string, unknown>; reason: string; requestedAt: string; status: RequestStatus; decidedAt: string | null; note: string | null; result: Record<string, unknown> | null }

/** Journal lines balance per currency, exactly to the paisa, one side each (the database re-checks). */
export function validateJournalLines(lines: JournalLine[]) {
  if (lines.length < 2 || lines.length > 200) throw new Error("A journal needs 2 to 200 lines");
  const by = new Map<string, number>();
  for (const l of lines) {
    const okSide = (x: number) => Number.isFinite(x) && x >= 0 && Math.round(x * 100) === x * 100;
    if (!okSide(l.debit) || !okSide(l.credit) || (l.debit > 0) === (l.credit > 0)) throw new Error("Each line needs either a debit or a credit, exact to the paisa");
    if (l.code.startsWith("account:")) throw new Error("Journals cannot move bank, card or wallet accounts; record the money movement as an entry");
    const c = l.currency ?? "INR";
    by.set(c, (by.get(c) ?? 0) + Math.round(l.debit * 100) - Math.round(l.credit * 100));
  }
  for (const [c, v] of by) if (v !== 0) throw new Error(`Debits and credits differ in ${c}`);
}
export async function submitPostingRequest(args: { requestId: string; reason: string } & PostingRequest, rpc: Rpc = rpcUntyped) {
  if (!validReason(args.reason)) throw new ReversalReasonRequired();
  if (args.kind === "journal") validateJournalLines(args.payload.lines);
  if (args.kind === "prior_period_adjustment" && "lines" in args.payload) validateJournalLines(args.payload.lines);
  const r = await rpc("submit_posting_request", { _request: args.requestId, _kind: args.kind, _payload: args.payload, _reason: args.reason.trim() });
  fail(r);
  return r.data as { request: string; kind: PostingRequest["kind"]; status: RequestStatus; entityId?: string | null; replayed: boolean };
}
export async function decidePostingRequest(args: { requestId: string; decision: "approve" | "reject" | "cancel"; note?: string }, rpc: Rpc = rpcUntyped, prompt?: StepUpPrompt) {
  const r = await withStepUp(() => rpc("decide_posting_request", { _request: args.requestId, _decision: args.decision, _note: args.note ?? "" }), prompt);
  fail(r);
  forgetPostingStatus();
  return r.data as { request: string; kind: PostingRequest["kind"]; status: RequestStatus; result: Record<string, unknown> | null; replayed: boolean };
}
export async function postingRequestsOverview(limit = 100, rpc: Rpc = rpcUntyped): Promise<RequestOverview[]> {
  const r = await rpc("posting_requests_overview", { _limit: limit });
  fail(r);
  return (r.data ?? []) as RequestOverview[];
}

// ---------------------------------------------------------------------------------------------
// Read models and the direct owner paths the screens call.
// ---------------------------------------------------------------------------------------------
export interface PriorPeriodRow {
  periodId: string; from: string; to: string; entityId: string; entityKey: string;
  /** Figures of the closed period as closed (code -> debit-signed amount); they never change. */
  asClosed: Record<string, number>; unchangedSinceClose: boolean;
  adjustments: { batchId: string; kind: string; postedOn: string; reason: string | null; request: string | null; lines: JournalLine[] }[];
  /** As closed + adjustments relating to the period (shown separately; nothing is posted inside it). */
  restated: Record<string, number>;
}
export async function priorPeriodAdjustmentReport(rpc: Rpc = rpcUntyped): Promise<PriorPeriodRow[]> {
  const r = await rpc("prior_period_adjustment_report"); fail(r);
  return ((r.data ?? {}) as { periods?: PriorPeriodRow[] }).periods ?? [];
}
export async function postingReconciliationReport(rpc: Rpc = rpcUntyped) { const r = await rpc("posting_reconciliation_report"); fail(r); return r.data as Record<string, unknown>; }
export async function previewPostingBackfill(rpc: Rpc = rpcUntyped) { const r = await rpc("preview_posting_backfill"); fail(r); return r.data as { fingerprint: string; proposals: unknown[]; exceptions: unknown[]; skippedClosed: unknown[]; counts: Record<string, number>; active: boolean }; }
export async function undoPostingBackfill(args: { runId: string; reason: string }, rpc: Rpc = rpcUntyped, prompt?: StepUpPrompt) {
  if (!validReason(args.reason)) throw new ReversalReasonRequired();
  const r = await withStepUp(() => rpc("undo_posting_backfill", { _run: args.runId, _reason: args.reason.trim() }), prompt); fail(r);
  forgetPostingStatus(); return r.data as { reversed: number; run: string; replayed?: boolean };
}
export async function postJournalBatch(args: { requestId: string; entityId: string; date: string; lines: JournalLine[]; memo: string; sources?: JournalEvidence[] }, rpc: Rpc = rpcUntyped) {
  validateJournalLines(args.lines);
  const r = await rpc("post_journal_batch", { _request: args.requestId, _entity: args.entityId, _on: args.date, _lines: args.lines, _memo: args.memo, _sources: args.sources ?? [] }); fail(r);
  return String(r.data);
}
export async function reverseJournalBatch(args: { requestId: string; batchId: string; reason: string; correctionDate?: string }, rpc: Rpc = rpcUntyped, prompt?: StepUpPrompt) {
  if (!validReason(args.reason)) throw new ReversalReasonRequired();
  const r = await withStepUp(() => rpc("reverse_journal_batch", { _request: args.requestId, _batch: args.batchId, _reason: args.reason.trim(), ...(args.correctionDate ? { _on: args.correctionDate } : {}) }), prompt); fail(r);
  return String(r.data);
}
