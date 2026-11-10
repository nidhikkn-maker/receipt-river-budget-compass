// P0-025: Statement Inbox registration is idempotent per statement line.
// - Each line's entry id is stable (owner + account fingerprint), so the id-upsert save can never add a second
//   entry for a line that was already registered, even if the "already imported" read was lost or the line was
//   forgotten and imported again.
// - With the proposed P9 SQL installed, claim_statement_lines records the line and its entry id in
//   statement_line_imports before anything is saved (unique owner + account + fingerprint, ON CONFLICT DO NOTHING)
//   and tells the caller which lines are new, still pending (claimed but the save never confirmed) or already
//   registered. Without P9 the caller falls back to the fully read "known" set; a failed read never falls back.
import { supabase } from "@/integrations/supabase/client";
import { draftToInput, type StatementDraft } from "./statement-auto";
import { filePattern, statementLineSourceRef } from "./statement-fingerprint";
import type { ExpenseInput } from "./expenses";
import { isMissingFunction } from "./step-up";
import { rpcUntyped } from "./step-up-check";

const rowsOf = (data: unknown): Record<string, unknown>[] => (Array.isArray(data) ? data.filter((r): r is Record<string, unknown> => !!r && typeof r === "object") : []);
const text = (v: unknown) => (typeof v === "string" ? v : "");

export interface ImportedLines { known: Set<string>; upTo: string | null; lastBatch: string | null }
export type ClaimOutcome = "claimed" | "pending" | "registered";
export interface LineClaim { entryId: string; outcome: ClaimOutcome }

/** Every line already imported for this account. Throws on any failed read: a partial set is never returned. */
export async function loadImportedLines(accountKey: string): Promise<ImportedLines> {
  const known = new Set<string>(); let upTo: string | null = null; let lastBatch: string | null = null; let latest = "";
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("statement_line_imports").select("fingerprint,line_date,batch_id,created_at").eq("account_key", accountKey).order("id").range(from, from + 999);
    if (error) throw Error("Couldn't check earlier uploads");
    for (const r of data) { known.add(r.fingerprint); if (!upTo || r.line_date > upTo) upTo = r.line_date; if (r.created_at > latest) { latest = r.created_at; lastBatch = r.batch_id; } }
    if (data.length < 1000) break;
  }
  // Claimed lines whose entry was never confirmed are offered again (and retried with the same entry id).
  const pending = await rpcUntyped("pending_statement_lines", { p_account_key: accountKey });
  if (pending.error && !isMissingFunction(pending.error)) throw Error("Couldn't check earlier uploads");
  for (const r of rowsOf(pending.data)) known.delete(text(r["fingerprint"]));
  return { known, upTo, lastBatch };
}

/** Name-based (version 5 layout) UUID from SHA-256 of owner + line fingerprint: the same line always gets the same entry id. */
export async function stableLineEntryId(owner: string, fingerprint: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`thapal.statement-line|${owner}|${fingerprint}`)));
  const b = digest.slice(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x50;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Claims lines before any entry is saved. With P9 the database decides (one row per owner/account/fingerprint);
 * without it the decision uses the fully read known set. Any other failure throws, so nothing is saved.
 */
export async function claimStatementLines(p: { accountKey: string; batchId: string; fileLabel: string; known: Set<string>; lines: { fingerprint: string; lineDate: string; entryId: string }[] }): Promise<{ claims: Map<string, LineClaim>; enforced: boolean }> {
  const claims = new Map<string, LineClaim>();
  for (let i = 0; i < p.lines.length; i += 500) {
    const chunk = p.lines.slice(i, i + 500);
    const r = await rpcUntyped("claim_statement_lines", { p_account_key: p.accountKey, p_batch_id: p.batchId, p_file_label: p.fileLabel, p_lines: chunk.map((l) => ({ fingerprint: l.fingerprint, line_date: l.lineDate, entry_id: l.entryId })) });
    if (r.error) {
      if (i === 0 && isMissingFunction(r.error)) {
        for (const l of p.lines) claims.set(l.fingerprint, { entryId: l.entryId, outcome: p.known.has(l.fingerprint) ? "registered" : "claimed" });
        return { claims, enforced: false };
      }
      throw Error("Couldn't check which statement lines are new — nothing more was registered. Try again.");
    }
    for (const row of rowsOf(r.data)) {
      const outcome = row["outcome"] === "claimed" || row["outcome"] === "pending" ? row["outcome"] : "registered";
      claims.set(text(row["fingerprint"]), { entryId: text(row["entry_id"]), outcome });
    }
  }
  return { claims, enforced: true };
}

export interface RegisterResult {
  /** Lines saved and reconciled by this attempt (new lines and retried pending lines). */
  registered: string[];
  /** Of `registered`, the lines whose entry did not exist before this attempt: what the user sees as "added". */
  added: string[];
  alreadyImported: string[];
  failed: { ref: string; title: string }[];
}

/**
 * P0-027 / RB-STM-01: the statement reference stored on the entry (expenses.statement_ref, also P7's statement_row source key) is
 * the line's stable source identity: statement account + content evidence (date, direction, amount, bank reference or normalised
 * narration, #n for identical same-day lines), never the file name (statementLineSourceRef). Identical lines in two accounts'
 * statements are two sources; a re-download of the same line under a new file name is the same source. A line keeps the reference
 * its entry already holds, so older stored references (file-name prefixed) are never rewritten (see registerStatementDrafts).
 */
export function statementLineRef(fingerprint: string): string {
  return statementLineSourceRef(fingerprint);
}

/** The reference each entry already holds (null = the entry exists without one; absent = no entry yet). Throws on a failed read. */
async function existingRefs(ids: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 200) {
    const r = await supabase.from("expenses").select("id,statement_ref").in("id", ids.slice(i, i + 200));
    if (r.error) throw Error("Couldn't check the earlier attempt — nothing more was registered. Try again.");
    for (const row of r.data ?? []) out.set(row.id, row.statement_ref ?? null);
  }
  return out;
}

/** Registers each draft once: claim first, save with the claimed entry id, then confirm the saved ids. */
export async function registerStatementDrafts(p: { owner: string; accountKey: string; fileName: string; drafts: StatementDraft[]; fingerprints: Map<string, string>; known: Set<string> }, deps: { save: (input: ExpenseInput, entryId: string) => Promise<void>; reconcile: (entryId: string, ref: string) => Promise<void> }): Promise<RegisterResult> {
  const lines = await Promise.all(p.drafts.map(async (d) => {
    const fingerprint = p.fingerprints.get(d.line.ref);
    if (!fingerprint) throw Error("A statement line has no fingerprint");
    return { draft: d, fingerprint, lineDate: d.line.date, entryId: await stableLineEntryId(p.owner, fingerprint) };
  }));
  const { claims, enforced } = await claimStatementLines({ accountKey: p.accountKey, batchId: crypto.randomUUID(), fileLabel: filePattern(p.fileName), known: p.known, lines });
  const out: RegisterResult = { registered: [], added: [], alreadyImported: [], failed: [] };
  const saved: string[] = [];
  // Entries that already exist for these lines (a pending retry, a re-import after "Forget last upload", a pre-P9 repeat) keep the
  // statement reference they hold, so a line's source key never moves and older stored references stay recognised.
  const toSave = lines.filter((l) => { const c = claims.get(l.fingerprint); return !!c && c.outcome !== "registered" && !!c.entryId; });
  const before = await existingRefs(toSave.map((l) => claims.get(l.fingerprint)!.entryId));
  for (const l of lines) {
    const claim = claims.get(l.fingerprint);
    if (!claim || claim.outcome === "registered" || !claim.entryId) { out.alreadyImported.push(l.draft.line.ref); continue; }
    try {
      const existed = before.has(claim.entryId);
      const existingRef = before.get(claim.entryId) ?? null;
      await deps.save(draftToInput(l.draft), claim.entryId);
      if (!existingRef) await deps.reconcile(claim.entryId, statementLineRef(l.fingerprint));
      out.registered.push(l.draft.line.ref); saved.push(claim.entryId);
      if (!existed) out.added.push(l.draft.line.ref);
    } catch { out.failed.push({ ref: l.draft.line.ref, title: l.draft.title }); }
  }
  // A lost confirmation is safe: the line stays pending and the next attempt reuses the same entry id.
  if (enforced && saved.length) await rpcUntyped("confirm_statement_lines", { p_entry_ids: saved }).then(() => undefined, () => undefined);
  return out;
}
