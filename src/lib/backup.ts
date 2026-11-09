import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { COLUMN_JSON_REFS, COLUMN_REFS, PREFERENCE_REFS, PREFERENCE_VERBATIM, REMAP_TABLES, emptyReport, remapJson, type RemapContext, type RemapReport, type RemapTable } from "./backup-remap";
import { restoredPostingIds, stableUuid } from "./books/assets-ledger";

export const BACKUP_TABLES = ["finance_preferences", "family_members", "accounts", "category_budgets", "expenses", "expense_drafts", "commitments", "loans", "goals", "asset_valuations", "documents", "period_close_evidence", "imported_period_history", "demat_accounts", "security_holdings"] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];
/** Added in format 3. Older backups do not have them and still restore. */
export const INVESTMENT_TABLES = ["demat_accounts", "security_holdings"] as const satisfies readonly BackupTable[];
/** Format written by this app. 1 and 2 are still read (they simply lack the investment tables). */
export const BACKUP_VERSION = 3;
export const READABLE_VERSIONS: readonly number[] = [1, 2, 3];
/**
 * Owner-scoped tables deliberately NOT in a backup, with the reason. The inventory test fails if an owner-scoped
 * table in the applied schema is neither backed up nor listed here.
 */
export const BACKUP_EXCLUDED_TABLES: Readonly<Record<string, string>> = {
  accountant_contacts: "Accountant e-mail settings; not a financial record",
  accountant_uploads: "Files sit in the private statement-uploads bucket and enter the ledger only through Statement Desk; links are server-bound",
  upload_links: "HMAC-signed upload links are bound to the issuing account; restoring would revive revoked/expired links",
  upload_link_events: "Delivery log of upload links (same reason)",
  category_batches: "Revision-checked bulk-category undo snapshots; restored rows get new revisions, so old undo must not apply",
  financial_corrections: "Revision-checked correction undo snapshots (same reason); the corrected entries themselves are backed up",
  transfer_links: "Transfer pairing undo state with before-snapshots; the paired entries (to_account_id) are backed up. Candidate for format 4",
  claim_preparations: "Revision-checked in-progress claim workspace saved through save_claim_preparation; the claims live on entries. Candidate for format 4",
  demo_sessions: "Visitor demo bookkeeping",
  device_passkeys: "Device credentials must never travel between accounts or devices",
  passkey_challenges: "One-use server challenges",
  push_subscriptions: "Device push endpoints",
  push_reminder_log: "Per-device daily reminder claims",
  document_intake_commits: "Server idempotency records for intake commits",
  document_runs: "Transient AI reading runs",
  preference_approvals: "Server approval audit of preference saves (previous/approved data); stays with the source account. Candidate for archived import",
  reimbursement_config_audit: "Server audit log of reimbursement settings changes",
  statement_checkpoints: "Server idempotency checkpoints for statement batches",
  finance_operations: "Serialized idempotency records for money movements",
  entity_members: "Access grants to other people; restoring would grant access without the owner's fresh consent",
  family_invites: "Invitations bound to other people's e-mail and accounts",
  family_requests: "Requests from other signed-in members (their evidence lives under their own storage)",
  import_ai_state: "Import AI lease/pause state",
  import_audit: "Statement import pipeline audit",
  import_batches: "Statement import pipeline state; originals are in the statement-uploads bucket (not in backups)",
  import_pdf_pages: "Statement import page cache",
  import_posts: "Statement import dedupe fingerprints. Candidate for format 4: without them a re-imported statement relies on statement_ref matching",
  import_rows: "Statement import review rows",
  import_rules: "Import mapping rules (settings). Candidate for format 4",
  statement_line_imports: "Statement line dedupe fingerprints (same as import_posts)",
  monthly_reviews: "Saved AI narratives of derived figures; regenerable, data hash marks them outdated",
  opening_postings: "Opening-balance posting runs; the posted entries are backed up. Undo history is not portable. Candidate for format 4 (txn_ids/source_doc_id remap)",
  receipt_problem_reports: "Device diagnostics, not financial records",
  report_history: "Generated report PDFs (derived outputs in a separate bucket)",
  report_jobs: "Report generation job state",
  transaction_audit: "Server change log keyed to the source account's entries; stays with the source account",
  profiles: "Display name travels as backup.name",
  period_operation_authority: "Transient in-transaction marker used by change_accounting_period",
};
/**
 * Tables with no owner column. Together with BACKUP_TABLES and BACKUP_EXCLUDED_TABLES this covers every table of the
 * applied schema (inventory test), so a new table cannot appear without a backup decision.
 */
export const BACKUP_NOT_OWNER_TABLES: Readonly<Record<string, string>> = {
  expense_history: "Approval actions keyed to the source account's entries (actor_id is the approver). Not restorable under another account; period-close evidence already snapshots it",
  app_admins: "Global administrator list, not personal data",
  user_roles: "Role grants decided by administrators; restoring must never grant roles",
  role_permissions: "Global role permission matrix",
  role_permission_audit: "Administrator audit log",
  department_budgets: "Organisation department limits (Finance-managed, not owner records)",
  market_quotes: "Public market prices",
  regulatory_changes: "Global regulatory change feed",
  regulatory_snapshots: "Global regulatory source snapshots",
  job_state: "Scheduler leases",
};
/** Team visibility must never expand a personal backup's ownership scope. */
export function backupOwnerColumn(table: BackupTable): "employee_id" | "owner_id" {
  return table === "expenses" ? "employee_id" : "owner_id";
}
export type BackupRow = Record<string, unknown>;
export interface Backup { app: "ledgerline"; version: number; owner: string; name?: string; exportedAt: string; data: Partial<Record<BackupTable, BackupRow[]>> }
const MAX_BYTES = 150 * 1024 * 1024;
export function createBackupZip(backup: Backup, files: Record<string, Uint8Array>): Uint8Array {
  return zipSync({ "backup.json": strToU8(JSON.stringify(backup)), ...Object.fromEntries(Object.entries(files).map(([path, bytes]) => [`files/${path}`, bytes])) }, { level: 0 });
}
export function readBackup(bytes: Uint8Array, zipped: boolean): { backup: Backup; files: Record<string, Uint8Array> } {
  if (bytes.length > MAX_BYTES) throw Error("Backup must be under 150 MB");
  const files = zipped ? unzipSync(bytes, { filter: (f) => { if (f.originalSize > MAX_BYTES) throw Error("Backup contains an oversized file"); return f.name === "backup.json" || f.name.startsWith("files/"); } }) : { "backup.json": bytes };
  if (Object.values(files).reduce((s, f) => s + f.length, 0) > MAX_BYTES) throw Error("Expanded backup must be under 150 MB");
  const json = files["backup.json"];
  if (!json) throw Error("Backup records are missing");
  const backup = JSON.parse(strFromU8(json)) as Backup;
  if (backup.app !== "ledgerline" || !READABLE_VERSIONS.includes(backup.version) || !backup.data || typeof backup.data !== "object") throw Error("That isn't a Thapal backup");
  for (const t of BACKUP_TABLES) if (backup.data[t] !== undefined && (!Array.isArray(backup.data[t]) || backup.data[t]?.some(r => !r || typeof r !== "object" || Array.isArray(r)))) throw Error("Backup contains invalid records");
  return { backup, files: Object.fromEntries(Object.entries(files).filter(([p]) => p.startsWith("files/")).map(([p, v]) => [p.slice(6), v])) };
}

/** The account a backup came from (older backups may lack `owner`). */
export function backupOwner(backup: Backup): string {
  return backup.owner || String(backup.data.expenses?.[0]?.["employee_id"] ?? backup.data.accounts?.[0]?.["owner_id"] ?? "");
}

export interface RestoreReport extends RemapReport {
  crossAccount: boolean;
  /** Rows per table in the prepared payload. */
  rows: Partial<Record<BackupTable, number>>;
}
export interface RestorePlan { data: Backup["data"]; paths: Map<string, string>; report: RestoreReport }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Preserve IDs on same-account restores (JSON byte-identical); remap every linked ID when importing another
 * account's backup. `opts.ids` supplies the old→new id map (planRestore makes it deterministic so restoring the same
 * backup twice updates the same rows); without it each row gets `uuid()` (legacy behaviour).
 * References that cannot be mapped are kept exactly and listed in `report`.
 */
export function prepareRestore(backup: Backup, owner: string, uuid: () => string = () => crypto.randomUUID(), stageFiles = false, opts: { ids?: ReadonlyMap<string, string> } = {}): RestorePlan {
  const crossAccount = backupOwner(backup) !== owner;
  const ids = new Map<string, string>();
  const tables = new Map<RemapTable, Set<string>>();
  for (const t of REMAP_TABLES) {
    const set = new Set<string>(); tables.set(t, set);
    for (const row of backup.data[t] ?? []) if (typeof row["id"] === "string") { set.add(row["id"]); if (crossAccount && !ids.has(row["id"])) ids.set(row["id"], opts.ids?.get(row["id"]) ?? uuid()); }
  }
  const report: RestoreReport = { ...emptyReport(), crossAccount, rows: {} };
  const ctx: RemapContext = { ids, tables, report };
  const paths = new Map<string, string>();
  const pathFor = (path: unknown) => {
    if (typeof path !== "string" || !path || path.includes("..") || path.startsWith("/")) throw Error("Backup contains an invalid file path");
    const next = crossAccount || stageFiles ? `${owner}/restored/${uuid()}-${path.split("/").at(-1)}` : path;
    if (!next.startsWith(`${owner}/`)) throw Error("Backup file doesn't belong to this account");
    if (!paths.has(path)) paths.set(path, next);
    return paths.get(path);
  };
  const receiptsOf = (v: unknown) => (Array.isArray(v) ? v.map((r: BackupRow) => ({ ...r, path: pathFor(r["path"]) })) : v ?? []);
  const data: Backup["data"] = {};
  for (const t of BACKUP_TABLES) {
    const columnRefs = COLUMN_REFS[t] ?? {};
    const jsonRefs = COLUMN_JSON_REFS[t] ?? [];
    const remapRow = (REMAP_TABLES as readonly string[]).includes(t);
    data[t] = (backup.data[t] ?? []).map((original, i) => {
      let row: BackupRow = { ...original, [backupOwnerColumn(t)]: owner };
      if (crossAccount) {
        if (remapRow && typeof row["id"] === "string") row["id"] = ids.get(row["id"]) ?? row["id"];
        for (const [col, table] of Object.entries(columnRefs)) {
          const v = row[col];
          if (typeof v !== "string" || !v) continue;
          const next = ids.get(v);
          if (next !== undefined) { row[col] = next; report.remapped++; } else report.unmapped.push({ path: `${t}[${i}].${col}`, value: v, expected: table });
        }
      }
      // File paths first: a staged path never carries an old id, so the reference scan below sees only links.
      if ((t === "expenses" || t === "expense_drafts") && "receipts" in row) row["receipts"] = receiptsOf(row["receipts"]);
      if (t === "documents") row["file_path"] = pathFor(row["file_path"]);
      if (crossAccount) {
        if (jsonRefs.length) row = remapJson(row, jsonRefs, [], `${t}[${i}]`, ctx) as BackupRow;
        if (t === "finance_preferences" && isObj(row["data"])) row["data"] = remapJson(row["data"], PREFERENCE_REFS, PREFERENCE_VERBATIM, `${t}[${i}].data`, ctx);
      }
      return row;
    });
    report.rows[t] = data[t]?.length ?? 0;
  }
  return { data, paths, report };
}

/**
 * The restore the app performs. Same account: ids and JSON unchanged. Another account: every row gets a
 * deterministic id derived from (restoring owner, original id), so restoring the same backup twice updates the same
 * rows instead of duplicating them; asset-derived postings get the restoring owner's own posting ids.
 */
export async function planRestore(backup: Backup, owner: string, opts: { stageFiles?: boolean; uuid?: () => string } = {}): Promise<RestorePlan> {
  const from = backupOwner(backup);
  if (from === owner) return prepareRestore(backup, owner, opts.uuid, opts.stageFiles ?? false);
  const ids = new Map<string, string>();
  for (const t of REMAP_TABLES) for (const row of backup.data[t] ?? []) if (typeof row["id"] === "string" && !ids.has(row["id"])) ids.set(row["id"], await stableUuid("restore", owner, row["id"]));
  const entryIds = new Set((backup.data.expenses ?? []).map((e) => e["id"]).filter((x): x is string => typeof x === "string"));
  for (const prefs of backup.data.finance_preferences ?? []) for (const [old, next] of await restoredPostingIds(prefs["data"], entryIds, from, owner)) ids.set(old, next);
  return prepareRestore(backup, owner, opts.uuid, opts.stageFiles ?? false, { ids });
}

/** Investment tables the server restore did not write (older restore functions only know the original tables). */
export function investmentTablesToWrite(data: Backup["data"], serverCounts: Record<string, number>): (typeof INVESTMENT_TABLES)[number][] {
  return INVESTMENT_TABLES.filter((t) => (data[t]?.length ?? 0) > 0 && serverCounts[t] === undefined);
}

/** One-line restore summary for the confirmation and result messages. */
export function describeRestoreReport(r: RestoreReport): string {
  const parts: string[] = [];
  if (r.crossAccount) parts.push(`${r.remapped} links moved to the new record ids`);
  if (r.unmapped.length) parts.push(`${r.unmapped.length} link${r.unmapped.length === 1 ? "" : "s"} point to records not in this backup and are kept unchanged for review`);
  if (r.unclassified.length) parts.push(`${r.unclassified.length} unrecognised reference${r.unclassified.length === 1 ? "" : "s"} kept unchanged`);
  return parts.join("; ");
}
