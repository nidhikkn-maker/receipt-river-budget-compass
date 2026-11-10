// P0-023 (KK, binding): "Repeated backup restoration must be detected and never execute silently. Default to no change,
// show previous restore evidence and require explicit authorised action." P0-033: an older backup never resurrects a
// withdrawn entry; the stored withdrawal history is authoritative.
//
// guardedRestore is what Settings → Restore runs after the backup has been planned (backup.ts planRestore) and its files
// staged. With the proposed P11 SQL the database decides (restore_finance_backup_checked: fingerprint, receipts table,
// withdrawal merge, direct restore refused). Before P11 the same rules run here: the restore history lives in owner
// preferences (restoreHistory, written in the SAME restore transaction because the restore saves the payload's
// preferences), and the stored withdrawals are read and merged into the payload before anything is written.
// A restore that was done before returns { status: "previously_restored", changed: false, previous } and writes nothing;
// only an explicit re-restore with a reason (and the step-up the caller already requires) proceeds, and is recorded.
import type { Backup, BackupRow } from "./backup";
import { isMissingFunction } from "./step-up";

export interface RestoreRecord { fingerprint: string; at: string; by: string; records: number; mode: "first" | "again"; reason: string | null }
export type GuardedRestoreResult =
  | { status: "previously_restored"; changed: false; previous: RestoreRecord[] }
  | { status: "restored" | "restored_again"; changed: true; counts: Record<string, number>; previous: RestoreRecord[] };

interface Res { data: unknown; error: { message: string; code?: string } | null }
interface Q extends PromiseLike<Res> { select(c: string): Q; eq(k: string, v: unknown): Q; in(k: string, v: unknown[]): Q; maybeSingle(): PromiseLike<Res> }
export interface RestoreDb { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<Res>; from: (table: string) => Q }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const canonical = (v: unknown): unknown => (Array.isArray(v) ? v.map(canonical) : isObj(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v);
/** Staged file paths and the restore history itself differ between two plans of the same backup; they are not part of it. */
function comparable(row: BackupRow): BackupRow {
  const { receipts: _r, file_path: _f, ...rest } = row;
  if (isObj(rest["data"]) && "restoreHistory" in rest["data"]) { const { restoreHistory: _h, ...d } = rest["data"]; return { ...rest, data: d }; }
  return rest;
}
/** SHA-256 of the planned payload without staged paths: the same backup planned again for the same owner gives the same value. */
export async function payloadFingerprint(data: Backup["data"]): Promise<string> {
  const tables = Object.keys(data).sort().map((t) => [t, (data[t as keyof typeof data] ?? []).map((r) => JSON.stringify(canonical(comparable(r)))).sort()]);
  const bytes = new TextEncoder().encode(JSON.stringify(tables));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}
const parseRecords = (v: unknown): RestoreRecord[] => (Array.isArray(v) ? v.filter(isObj).map((x) => ({ fingerprint: String(x["fingerprint"] ?? ""), at: String(x["at"] ?? ""), by: String(x["by"] ?? ""), records: Number(x["records"] ?? 0), mode: x["mode"] === "again" ? "again" as const : "first" as const, reason: typeof x["reason"] === "string" ? x["reason"] : null })) : []);

/** P0-033 merge (same rule as P11 keep_withdrawals): a withdrawn entry stays exactly as stored; a restored one keeps its history. */
export function keepStoredWithdrawals(data: Backup["data"], stored: Map<string, BackupRow>): Backup["data"] {
  const rows = data["expenses"];
  if (!rows?.length) return data;
  return { ...data, expenses: rows.map((e) => {
    const s = typeof e["id"] === "string" ? stored.get(e["id"]) : undefined;
    const w = s && isObj(s["receipt_details"]) ? s["receipt_details"]["withdrawal"] : undefined;
    if (!s || w === undefined || w === null) return e;
    if (isObj(w) && w["state"] === "withdrawn") { const { correction_revision: _c, updated_at: _u, created_at: _t, ...keep } = s; return keep; }
    return { ...e, receipt_details: { ...(isObj(e["receipt_details"]) ? e["receipt_details"] : {}), withdrawal: w } };
  }) };
}

const reasonOk = (r: string | null) => !!r && r.trim().length >= 5;

export async function guardedRestore(p: { owner: string; data: Backup["data"]; displayName?: string | undefined; rerestoreReason?: string | null; now?: string }, db: RestoreDb): Promise<GuardedRestoreResult> {
  const why = p.rerestoreReason?.trim() || null;
  if (why && !reasonOk(why)) throw Error("Give a reason of at least 5 characters for restoring again");
  const checked = await db.rpc("restore_finance_backup_checked", { payload: p.data, ...(p.displayName ? { display_name: p.displayName } : {}), ...(why ? { rerestore_reason: why } : {}) });
  if (!checked.error) {
    const r = checked.data as { status?: string; counts?: Record<string, number>; previous?: unknown[] } | null;
    const previous = parseRecords((r?.previous ?? []).map((x) => (isObj(x) ? { ...x, fingerprint: "" } : x)));
    if (r?.status === "previously_restored") return { status: "previously_restored", changed: false, previous };
    if (r?.status === "restored" || r?.status === "restored_again") return { status: r.status, changed: true, counts: r.counts ?? {}, previous };
    throw Error("Restore was not confirmed. Your records are as they were; try again.");
  }
  if (!isMissingFunction(checked.error)) throw Error(checked.error.message);

  // Before P11: the same rules, here.
  const prefs = await db.from("finance_preferences").select("data").eq("owner_id", p.owner).maybeSingle();
  if (prefs.error) throw Error("Couldn't check earlier restores. Nothing was changed; try again.");
  const current = isObj(prefs.data) && isObj(prefs.data["data"]) ? prefs.data["data"] : {};
  const history = parseRecords(current["restoreHistory"]);
  const fingerprint = await payloadFingerprint(p.data);
  const previous = history.filter((h) => h.fingerprint === fingerprint);
  if (previous.length && !why) return { status: "previously_restored", changed: false, previous };
  const mode: RestoreRecord["mode"] = previous.length ? "again" : "first";

  const ids = (p.data["expenses"] ?? []).map((r) => r["id"]).filter((x): x is string => typeof x === "string");
  const stored = new Map<string, BackupRow>();
  for (let i = 0; i < ids.length; i += 200) {
    const r = await db.from("expenses").select("*").eq("employee_id", p.owner).in("id", ids.slice(i, i + 200));
    if (r.error) throw Error("Couldn't check the entries this backup would change. Nothing was changed; try again.");
    for (const row of (Array.isArray(r.data) ? r.data : []) as BackupRow[]) if (typeof row["id"] === "string") stored.set(row["id"], row);
  }
  const merged = keepStoredWithdrawals(p.data, stored);
  const records = Object.values(merged).reduce((s, rows) => s + (rows?.length ?? 0), 0);
  const record: RestoreRecord = { fingerprint, at: p.now ?? new Date().toISOString(), by: p.owner, records, mode, reason: mode === "again" ? why : null };
  // The restore saves the payload's preferences: carry the CURRENT history plus this restore (a backup's own copy is older).
  const prefRows = merged["finance_preferences"] ?? [];
  const payload: Backup["data"] = { ...merged, finance_preferences: prefRows.length
    ? prefRows.map((r, i) => (i === 0 ? { ...r, data: { ...(isObj(r["data"]) ? r["data"] : {}), restoreHistory: [...history, record] } } : r))
    : [{ owner_id: p.owner, data: { ...current, restoreHistory: [...history, record] } }] }; // no preferences in the backup: keep the current ones
  const res = await db.rpc("restore_finance_backup", { payload, ...(p.displayName ? { display_name: p.displayName } : {}) });
  if (res.error) throw Error(res.error.message);
  const counts = (isObj(res.data) && isObj(res.data["counts"]) ? res.data["counts"] : {}) as Record<string, number>;
  return { status: mode === "again" ? "restored_again" : "restored", changed: true, counts, previous };
}

/** "Already restored on 10 Nov 2026, 14:05 by you (152 records)." for the Settings message. */
export function previousRestoreLine(previous: RestoreRecord[], me: string): string {
  return previous.map((r) => `${r.mode === "again" ? "Restored again" : "Restored"} on ${new Date(r.at).toLocaleString()} by ${r.by === me ? "you" : "another member"} (${r.records} records)${r.reason ? ` · reason: ${r.reason}` : ""}`).join("; ");
}
