// Expense drafts: unfinished entries kept apart from the ledger. They never touch balances,
// reports or reimbursements; only the normal Save path turns one into a transaction.
import { supabase } from "@/integrations/supabase/client";
import { shareInflight } from "./request-dedupe";
import type { Json } from "@/integrations/supabase/types";
import { localDrafts, localToFile, removeLocalDraft, putLocalDraft, type LocalDraft } from "./offline";

export type DraftStatus = "draft" | "uploading" | "processing" | "ready" | "info_required" | "failed" | "saved";
export interface DraftReceipt { name: string; type: string; path: string; fingerprint?: string }
export interface DraftData {
  txnType?: string; amount?: string; currency?: string; date?: string; category?: string; merchant?: string; title?: string;
  accountId?: string; toAccountId?: string; instrumentId?: string; paymentMethod?: string; scope?: string; tripId?: string;
  tags?: string; description?: string; memberId?: string; principal?: string; interest?: string;
  wsSplit?: unknown; splitOn?: boolean; shares?: Record<string, string>; receiptDetails?: unknown; extracted?: boolean; error?: string;
  /** Receipt values read but not yet confirmed, so reopening the draft shows them for review. */
  scan?: { merchant: string; date: string; amount: string; currency: string; category?: string; read?: { merchant: string; date: string; amount: number; currency: string } };
  /** What the read bill proved about the paying account, so a resumed review shows it (the owner confirms again). */
  billEvidence?: unknown;
}
export interface Draft { localOnly?: boolean; id: string; data: DraftData; receipts: DraftReceipt[]; status: DraftStatus; transactionId: string | null; createdAt: string; updatedAt: string }

export const DRAFT_STATUS_LABEL: Record<DraftStatus, string> = {
  draft: "Draft", uploading: "Uploading", processing: "Processing", ready: "Ready for review",
  info_required: "Information required", failed: "Processing failed", saved: "Saved as transaction",
};

/** Opening an empty form must not create a blank draft: something meaningful has to be entered. */
export function hasDraftContent(d: DraftData, receiptCount: number): boolean {
  return receiptCount > 0 || Number(d.amount) > 0 || !!d.merchant?.trim() || !!d.title?.trim() || !!d.description?.trim() || !!d.tags?.trim();
}

/** Status shown on the list, derived from what the draft actually holds. */
export function draftStatus(d: DraftData, receiptCount: number, opts: { uploading?: boolean; processing?: boolean } = {}): DraftStatus {
  if (opts.uploading) return "uploading";
  if (opts.processing) return "processing";
  if (d.error) return "failed";
  if (Number(d.amount) > 0 && (d.category || d.txnType && d.txnType !== "expense")) return "ready";
  if (receiptCount > 0 || d.merchant) return "info_required";
  return "draft";
}

/** Drafts waiting for the user (saved ones are kept only as a link to their transaction). */
export const pendingDrafts = (all: Draft[]) => all.filter((d) => d.status !== "saved");

type Row = { id: string; data: Json; receipts: Json; status: string; transaction_id: string | null; created_at: string; updated_at: string };
const fromRow = (r: Row): Draft => ({ id: r.id, data: (r.data ?? {}) as DraftData, receipts: (Array.isArray(r.receipts) ? r.receipts : []) as unknown as DraftReceipt[], status: r.status as DraftStatus, transactionId: r.transaction_id, createdAt: r.created_at, updatedAt: r.updated_at });

export function listDrafts(): Promise<Draft[]> {
  return shareInflight("drafts", async () => {
    const { data, error } = await supabase.from("expense_drafts").select("*").order("updated_at", { ascending: false }).limit(200);
    if (error) throw new Error("Couldn't load your drafts");
    return (data as Row[]).map(fromRow);
  });
}
export async function getDraft(id: string): Promise<Draft | null> {
  const { data } = await supabase.from("expense_drafts").select("*").eq("id", id).maybeSingle();
  return data ? fromRow(data as Row) : null;
}
export async function upsertDraft(id: string, owner: string, data: DraftData, receipts: DraftReceipt[], status: DraftStatus) {
  const { error } = await supabase.from("expense_drafts").upsert({ id, owner_id: owner, data: data as Json, receipts: receipts as unknown as Json, status, updated_at: new Date().toISOString() });
  if (error) throw new Error("Draft not saved");
}
/** Upload a receipt into the owner's private draft folder; returns its stored path. */
/** Fixed storage path for a device-saved photo, so a retried upload reuses the earlier copy instead of adding another. */
export const stableReceiptPath = (owner: string, draftId: string, index: number, name: string) => `${owner}/drafts/${draftId}/offline-${index}-${name.replace(/[^\w.-]+/g, "_").slice(-80)}`;
export async function uploadDraftReceipt(owner: string, draftId: string, f: File, index?: number): Promise<string> {
  const path = index != null ? stableReceiptPath(owner, draftId, index, f.name) : `${owner}/drafts/${draftId}/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]+/g, "_").slice(-80)}`;
  const { error } = await supabase.storage.from("receipts").upload(path, f, { contentType: f.type || "application/octet-stream" });
  // An earlier attempt already stored this exact photo at its fixed path: reuse it rather than adding a copy.
  if (error && index != null && /exists|duplicate|409/i.test(`${error.message} ${(error as { statusCode?: string }).statusCode ?? ""}`)) return path;
  if (error) throw new Error(`Couldn't upload ${f.name}`);
  return path;
}
export async function draftReceiptFile(r: DraftReceipt): Promise<File | null> {
  const { data } = await supabase.storage.from("receipts").download(r.path);
  return data ? new File([data], r.name, { type: r.type || data.type }) : null;
}
export async function draftThumb(r: DraftReceipt): Promise<string | null> {
  const { data } = await supabase.storage.from("receipts").createSignedUrl(r.path, 600);
  return data?.signedUrl ?? null;
}
/** Deletes the draft and its receipt files. Files are removed only after the record is gone. */
export async function deleteDraft(d: Pick<Draft, "id" | "receipts">) {
  const { error } = await supabase.from("expense_drafts").delete().eq("id", d.id);
  if (error) throw new Error("Couldn't delete the draft");
  if (d.receipts.length) await supabase.storage.from("receipts").remove(d.receipts.map((r) => r.path));
}
/** After the real Save: mark linked to the new transaction and drop the now-duplicated draft files. */
export async function completeDraft(d: Pick<Draft, "id" | "receipts">, transactionId: string | null) {
  await supabase.from("expense_drafts").update({ status: "saved", transaction_id: transactionId, receipts: [] as unknown as Json, updated_at: new Date().toISOString() }).eq("id", d.id);
  if (d.receipts.length) await supabase.storage.from("receipts").remove(d.receipts.map((r) => r.path));
}

/** Newer copy wins: a device copy only replaces the synced one when it was edited later. */
export function shouldUploadLocal(local: { updatedAt: string }, server: { updatedAt: string } | null): boolean {
  return !server || local.updatedAt > server.updatedAt;
}

export function localAsDraft(l: LocalDraft): Draft {
  const data = l.data as DraftData;
  const receipts = l.files.map((f) => ({ name: f.name, type: f.type, path: f.path ?? "", ...(f.fingerprint ? { fingerprint: f.fingerprint } : {}) }));
  return { localOnly: true, id: l.id, data, receipts, status: draftStatus(data, receipts.length), transactionId: null, createdAt: l.updatedAt, updatedAt: l.updatedAt };
}

let syncing: Promise<number> | null = null;
/** Push device-only drafts to the account. Safe to repeat: same draft id, receipts reuse their uploaded path. */
export function syncLocalDrafts(owner: string): Promise<number> {
  if (syncing) return syncing;
  syncing = (async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return 0;
    let done = 0;
    for (const l of await localDrafts(owner)) {
      if (l.data["pendingScan"]) continue; // offline receipt photos upload only after they've been read (offline-scan.ts)
      try {
        const server = await getDraft(l.id);
        if (server?.status === "saved") { await removeLocalDraft(owner, l.id); continue; }
        if (!shouldUploadLocal(l, server)) { await removeLocalDraft(owner, l.id); continue; }
        const receipts: DraftReceipt[] = [];
        for (const [i, f] of l.files.entries()) {
          if (!f.path) { f.path = await uploadDraftReceipt(owner, l.id, localToFile(f), i); await putLocalDraft(owner, l); }
          receipts.push({ name: f.name, type: f.type, path: f.path, ...(f.fingerprint ? { fingerprint: f.fingerprint } : {}) });
        }
        const data = l.data as DraftData;
        await upsertDraft(l.id, owner, data, receipts, draftStatus(data, receipts.length));
        await removeLocalDraft(owner, l.id);
        done++;
      } catch { /* stays on device; retried next time */ }
    }
    return done;
  })().finally(() => { syncing = null; });
  return syncing;
}

/** A receipt draft matched to a bank line: marked saved against that entry but its files kept, so Undo can bring it back. */
export async function linkDraftToTransaction(id: string, transactionId: string) {
  const { error } = await supabase.from("expense_drafts").update({ status: "saved", transaction_id: transactionId, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
export async function unlinkDraft(id: string) {
  const { error } = await supabase.from("expense_drafts").update({ status: "ready", transaction_id: null, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
