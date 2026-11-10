// P0-022 (KK, binding): "Team users cannot permanently delete financial records or audit history. Allow permission-scoped
// requests for withdrawal or correction, with authorised approval where consequential. Enforce permissions server-side and
// preserve entity separation." Client side of the proposed P13 database functions (request_entry_change,
// decide_entry_change, cancel_entry_change; entry_change_requests readable by the owner, the requester and approvers for that
// company). The database decides every permission; these helpers only call it and explain the answer. Contract for the
// screens: docs/workstreams/contracts/entry-change-requests.md.
import { isMissingFunction } from "./step-up";
import { rpcUntyped } from "./step-up-check";
import { supabase } from "@/integrations/supabase/client";

export type ChangeKind = "withdraw" | "correct";
/** Fields a correction request may change (the database refuses any other). Amount: INR entries without splits only. */
export const CORRECTABLE = ["title", "merchant", "category", "description", "expense_date", "amount"] as const;
export type Correction = Partial<Record<(typeof CORRECTABLE)[number], string | number>>;
export interface ChangeRequest {
  id: string; ownerId: string; entryId: string; entityId: string | null; kind: ChangeKind; reason: string; changes: Correction;
  requestedBy: string; requestedAt: string; status: "pending" | "approved" | "rejected" | "cancelled";
  decidedBy: string | null; decidedAt: string | null; decisionReason: string | null;
}
export const REQUESTS_NOT_INSTALLED = "Team change requests need an approved database update (P13). Nothing was changed; the owner can still withdraw or correct their own entries.";

/** Plain wording for the database's refusal codes. */
export function requestProblem(message: string): string {
  const code = /^(P1[03]_[A-Z_]+):/.exec(message)?.[1];
  return ({
    P13_NOT_PERMITTED: "You can't ask for or decide this change. Requests follow the switches the owner set for that company; the requester never decides their own request.",
    P13_PENDING: "This entry already has a request waiting for a decision.",
    P13_REASON: "Give a reason of at least 5 characters.",
    P13_INVALID: message.replace(/^P13_INVALID: /, "").replace(/^./, (c) => c.toUpperCase()),
    P13_CHANGED: "The entry changed after the request was made. Ask again with the current details.",
    P10_POSTED: "This entry is posted to the books. The owner corrects it by reversal.",
    P10_RECONCILED: "This entry is matched to a bank statement line; it is corrected, not withdrawn.",
    P10_LINKED_TRANSFER: "This transfer is linked to its other side; it is changed by the owner.",
    P10_REVERSAL_HISTORY: "Reversal history is kept as it is.",
  } as Record<string, string>)[code ?? ""] ?? message;
}

async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  const r = await rpcUntyped(name, args);
  if (r.error) throw Error(isMissingFunction(r.error) ? REQUESTS_NOT_INSTALLED : requestProblem(r.error.message));
  return r.data;
}
export const requestEntryChange = async (p: { entryId: string; kind: ChangeKind; reason: string; changes?: Correction }) =>
  String(await call("request_entry_change", { p_entry: p.entryId, p_kind: p.kind, p_reason: p.reason, p_changes: p.kind === "correct" ? p.changes ?? {} : {} }));
export const decideEntryChange = async (p: { requestId: string; approve: boolean; reason: string }) =>
  (await call("decide_entry_change", { p_request: p.requestId, p_approve: p.approve, p_reason: p.reason })) as { request: string; status: ChangeRequest["status"]; replayed: boolean };
export const cancelEntryChange = async (p: { requestId: string; reason: string }) =>
  (await call("cancel_entry_change", { p_request: p.requestId, p_reason: p.reason })) as { request: string; status: ChangeRequest["status"]; replayed: boolean };

/** Requests the caller may see (as owner, requester or approver for that company), newest first. */
export async function listEntryChanges(status?: ChangeRequest["status"]): Promise<ChangeRequest[]> {
  interface Q extends PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> { select(c: string): Q; eq(k: string, v: string): Q; order(c: string, o: { ascending: boolean }): Q }
  const from = supabase.from as unknown as (t: string) => Q; // P13 table: not in the generated types until applied
  const base = from("entry_change_requests").select("*");
  const r = await (status ? base.eq("status", status) : base).order("requested_at", { ascending: false });
  if (r.error) { if (/does not exist|could not find the table/i.test(r.error.message) || r.error.code === "42P01" || r.error.code === "PGRST205") return []; throw Error("Couldn't load change requests"); }
  return (Array.isArray(r.data) ? r.data : []).map((x: Record<string, unknown>) => ({
    id: String(x["id"]), ownerId: String(x["owner_id"]), entryId: String(x["entry_id"]), entityId: (x["entity_id"] as string | null) ?? null,
    kind: x["kind"] === "correct" ? "correct" : "withdraw", reason: String(x["reason"]), changes: (x["changes"] ?? {}) as Correction,
    requestedBy: String(x["requested_by"]), requestedAt: String(x["requested_at"]), status: x["status"] as ChangeRequest["status"],
    decidedBy: (x["decided_by"] as string | null) ?? null, decidedAt: (x["decided_at"] as string | null) ?? null, decisionReason: (x["decision_reason"] as string | null) ?? null,
  }));
}
