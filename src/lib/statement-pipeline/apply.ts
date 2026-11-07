// Applies one accepted upload plan through the app's own safe write paths, and can reverse the whole thing.
import type { Expense, ExpenseInput } from "../expenses";
import type { NewAccount } from "../store";
import { decisionInput, type LineDecision } from "./classify";
import type { AccountPlan } from "./plan";
import type { AccountHint, StmtLine } from "./line";
import type { AccountDetails } from "../ledger";

/** Same recipe the statement cross-check already uses, so re-uploading a file never posts it twice. */
export async function stableId(accountId: string, l: StmtLine): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${accountId}|${l.date}|${l.direction}|${l.amount.toFixed(2)}|${(l.balance ?? 0).toFixed(2)}|${l.description}`)),
  ).slice(0, 16);
  digest[6] = ((digest[6] ?? 0) & 0x0f) | 0x50;
  digest[8] = ((digest[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface ApplyApi {
  save: (input: ExpenseInput, opts?: { createId?: string; noRefresh?: boolean; files?: File[] }) => Promise<void>;
  /** Marks a matched receipt draft as used by the posted entry (and reverses that on undo). */
  linkDraft?: (draftId: string, transactionId: string) => Promise<void>;
  unlinkDraft?: (draftId: string) => Promise<void>;
  remove: (e: Expense) => Promise<void>;
  reconcile: (id: string, ref: string | null, opts?: { noRefresh?: boolean }) => Promise<void>;
  addAccount: (a: NewAccount) => Promise<string>;
  setArchived: (id: string, archived: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  transactions: Expense[];
  /** Authoritative owner read; prevents a stale/offline snapshot from certifying Undo absence. */
  readExistingIds?: (ids: string[]) => Promise<string[]>;
  /** Store the private original before the first financial write for this account. */
  prepareSource?: (request: ApplyRequest, accountId: string) => Promise<string>;
  /** Persist confirmed progress before proceeding; failure stops the next financial write. */
  checkpoint?: (result: ApplyResult) => Promise<void>;
}

/** One account's accepted part of an upload: the lines to post, the destination for movements, the records to mark. */
export interface ApplyRequest {
  account: AccountPlan;
  decisions: LineDecision[];
  destination?: string | null;
  reconcileIds: { id: string; ref: string }[];
  /** Receipt drafts paired with lines (by line key); the bank amount and date always stay. */
  draftLinks?: Record<string, DraftLink>;
}

export interface DraftLink { draftId: string; overrides: { [K in "title" | "merchant" | "category" | "description" | "receiptDetails"]?: ExpenseInput[K] | undefined }; files: () => Promise<File[]> }

export interface ApplyResult {
  posted: string[];
  reconciled: string[];
  createdAccounts: { id: string; name: string }[];
  linkedDrafts?: { draftId: string; transactionId: string }[];
  sources?: { documentId: string; accountId: string; file: string }[];
  evidence?: { id: string; ref: string }[];
}

export class PartialUploadError extends Error {
  constructor(message: string, public readonly result: ApplyResult) { super(message); this.name = "PartialUploadError"; }
}

/** Same bytes always identify the same owner-private original, independent of the filename. */
export async function originalId(owner: string, bytes: ArrayBuffer): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${owner}|${Array.from(hash, b => b.toString(16).padStart(2, "0")).join("")}`))).slice(0, 16);
  digest[6] = ((digest[6] ?? 0) & 15) | 80; digest[8] = ((digest[8] ?? 0) & 63) | 128;
  const hex = Array.from(digest, b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

/**
 * Posts exactly what was accepted. Ids are derived from the statement line, so a retry — or the same
 * file uploaded again — cannot create a second copy of an entry.
 */
export async function applyUpload(requests: ApplyRequest[], api: ApplyApi, onProgress?: (msg: string) => void): Promise<ApplyResult> {
  const result: ApplyResult = { posted: [], reconciled: [], createdAccounts: [] };
  const wanted = requests.filter((r) => r.decisions.length || r.reconcileIds.length);
  let done = 0;
  const total = wanted.reduce((s, r) => s + r.decisions.length + r.reconcileIds.length, 0);

  try { for (const r of wanted) {
    let accountId = r.account.accountId;
    if (!accountId) {
      const hint = r.account.hint;
      if (!hint) throw Error(`We couldn't tell which account ${r.account.file.name} belongs to — choose one before posting.`);
      accountId = await api.addAccount(newAccountFromHint(hint, r.account.file.opening));
      result.createdAccounts.push({ id: accountId, name: hint.name });
      // Retain the returned account in the accepted plan even if a subsequent stage fails.
      r.account.accountId = accountId;
      await api.checkpoint?.(structuredClone(result));
    }
    const source = await api.prepareSource?.(r, accountId);
    if (source) (result.sources ??= []).push({ documentId: source, accountId, file: r.account.file.name });
    const refs = new Map<string, string>();
    for (const d of r.decisions) {
      const id = await stableId(accountId, d.line);
      if (source) refs.set(id, `document:${source} · ${d.line.key} · ${d.line.date} · ${d.line.amount.toFixed(2)}`);
    }
    for (const m of r.reconcileIds) refs.set(m.id, source ? `document:${source} · ${m.ref}` : m.ref);
    (result.evidence ??= []).push(...Array.from(refs, ([id, ref]) => ({ id, ref })));
    await api.checkpoint?.(structuredClone(result));
    for (const d of r.decisions) {
      onProgress?.(`Saving ${++done} of ${total}…`);
      if (d.needsDestination && !r.destination) throw Error(`Choose where “${d.line.description.slice(0, 60)}” went before posting.`);
      const input = decisionInput(d, { statementAccountId: accountId, destination: r.destination ?? null });
      if (!input.accountId && !d.needsDestination) input.accountId = accountId;
      const id = await stableId(accountId, d.line);
      const link = r.draftLinks?.[d.line.key];
      if (link) {
        Object.assign(input, Object.fromEntries(Object.entries(link.overrides).filter(([, v]) => v !== undefined && v !== "")));
        await api.save(input, { createId: id, noRefresh: true, files: await link.files() });
        result.posted.push(id);
        await api.checkpoint?.(structuredClone(result));
        if (source) await api.reconcile(id, refs.get(id) ?? null, { noRefresh: true });
        if (api.linkDraft) { await api.linkDraft(link.draftId, id); (result.linkedDrafts ??= []).push({ draftId: link.draftId, transactionId: id }); }
        await api.checkpoint?.(structuredClone(result));
        continue;
      }
      await api.save(input, { createId: id, noRefresh: true });
      result.posted.push(id);
      await api.checkpoint?.(structuredClone(result));
      if (source) await api.reconcile(id, refs.get(id) ?? null, { noRefresh: true });
      await api.checkpoint?.(structuredClone(result));
    }
    for (const m of r.reconcileIds) {
      onProgress?.(`Marking ${++done} of ${total}…`);
      await api.reconcile(m.id, source ? `document:${source} · ${m.ref}` : m.ref, { noRefresh: true });
      result.reconciled.push(m.id);
      await api.checkpoint?.(structuredClone(result));
    }
  } } catch (error) {
    await api.refresh().catch(() => {});
    throw new PartialUploadError(error instanceof Error ? error.message : "Statement saving interrupted", result);
  }
  // Read refresh is not a financial write: its failure must not relabel confirmed saves as failed.
  await api.refresh().catch(() => {});
  return result;
}

/** Reverses one upload: removes what it posted, clears the matching marks, archives accounts it created. */
export async function undoUpload(result: ApplyResult, api: ApplyApi): Promise<{ left: string[] }> {
  const left: string[] = [];
  const planned = [...new Set([...result.posted, ...result.reconciled, ...(result.evidence ?? []).map(e => e.id)])];
  const existing = new Set(api.readExistingIds ? await api.readExistingIds(planned) : api.transactions.map(t => t.id));
  // A planned write with a lost response is not a confirmed undo manifest. Keep its history for review.
  for (const e of result.evidence ?? []) if (!result.posted.includes(e.id) && !result.reconciled.includes(e.id) && existing.has(e.id)) left.push(e.id);
  // Preflight the entire manifest before reversing even one confirmed line. Otherwise a mixed
  // upload loses its confirmed half while an unknown committed operation remains unresolved.
  for (const evidence of result.evidence ?? []) {
    if (!result.posted.includes(evidence.id) && !result.reconciled.includes(evidence.id)) continue;
    const current = api.transactions.find(t => t.id === evidence.id);
    // A confirmed new row whose evidence-link step failed has no prior source to overwrite.
    // Matched existing rows, or a row carrying a different later source, must remain untouched.
    const pendingNewLink = result.posted.includes(evidence.id) && current?.statementRef == null;
    if (existing.has(evidence.id) && (!current || (current.statementRef !== evidence.ref && !pendingNewLink))) left.push(evidence.id);
  }
  if (left.length) return { left: [...new Set(left)] };
  for (const id of result.posted) {
    const e = api.transactions.find((t) => t.id === id);
    if (!e) { if (existing.has(id)) left.push(id); continue; }
    try { await api.remove(e); } catch { left.push(id); }
  }
  for (const id of result.reconciled) { try { await api.reconcile(id, null, { noRefresh: true }); } catch { left.push(id); } }
  for (const l of result.linkedDrafts ?? []) {
    if (left.includes(l.transactionId)) continue;
    try { if (!api.unlinkDraft) throw Error('Draft cleanup unavailable'); await api.unlinkDraft(l.draftId); }
    catch { left.push(`draft:${l.draftId}`); }
  }
  if (!left.length) for (const c of result.createdAccounts) { try { await api.setArchived(c.id, true); } catch { left.push(`account:${c.id}`); } }
  await api.refresh();
  return { left };
}

/** The account a statement describes: printed opening balance (never invented) and its own reference numbers for later matching. */
export function newAccountFromHint(hint: AccountHint, printedOpening: number | null) {
  const refs = [hint.number, hint.lastFour].filter((x): x is string => !!x);
  return {
    name: hint.name, kind: hint.kind, openingBalance: printedOpening != null && Number.isFinite(printedOpening) ? printedOpening : 0,
    issuer: hint.issuer, lastFour: hint.lastFour,
    details: { ...(refs.length ? { matchRefs: [...new Set(refs)] } : {}), ...(hint.ifsc ? { ifsc: hint.ifsc } : {}), ...(hint.holder ? { holder: hint.holder } : {}) } as AccountDetails,
  };
}
