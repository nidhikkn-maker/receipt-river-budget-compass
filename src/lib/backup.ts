import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export const BACKUP_TABLES = ["finance_preferences", "family_members", "accounts", "category_budgets", "expenses", "commitments", "loans", "goals", "asset_valuations", "documents"] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];
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
  if (backup.app !== "ledgerline" || ![1, 2].includes(backup.version) || !backup.data || typeof backup.data !== "object") throw Error("That isn't a Ledgerline backup");
  for (const t of BACKUP_TABLES) if (backup.data[t] !== undefined && (!Array.isArray(backup.data[t]) || backup.data[t]?.some(r => !r || typeof r !== "object" || Array.isArray(r)))) throw Error("Backup contains invalid records");
  return { backup, files: Object.fromEntries(Object.entries(files).filter(([p]) => p.startsWith("files/")).map(([p, v]) => [p.slice(6), v])) };
}

/** Preserve IDs on same-account restores; remap every linked ID when importing another account's backup. */
export function prepareRestore(backup: Backup, owner: string, uuid = () => crypto.randomUUID()): { data: Backup["data"]; paths: Map<string, string> } {
  const oldOwner = backup.owner || String(backup.data.expenses?.[0]?.["employee_id"] ?? backup.data.accounts?.[0]?.["owner_id"] ?? "");
  const crossAccount = oldOwner !== owner;
  const ids = new Map<string, string>();
  if (crossAccount) for (const t of BACKUP_TABLES) for (const row of backup.data[t] ?? []) if (typeof row["id"] === "string") ids.set(row["id"], uuid());
  const paths = new Map<string, string>();
  const pathFor = (path: unknown) => {
    if (typeof path !== "string" || !path || path.includes("..") || path.startsWith("/")) throw Error("Backup contains an invalid file path");
    const next = crossAccount ? `${owner}/restored/${uuid()}-${path.split("/").at(-1)}` : path;
    if (!next.startsWith(`${owner}/`)) throw Error("Backup file doesn't belong to this account");
    if (!paths.has(path)) paths.set(path, next);
    return paths.get(path);
  };
  const data: Backup["data"] = {};
  for (const t of BACKUP_TABLES) data[t] = (backup.data[t] ?? []).map(original => {
    const row = { ...original, [t === "expenses" ? "employee_id" : "owner_id"]: owner };
    for (const k of ["id", "account_id", "to_account_id", "member_id", "transaction_id", "loan_id", "source_transaction_id"]) if (typeof row[k] === "string" && ids.has(row[k])) row[k] = ids.get(row[k]);
    if (t === "expenses") {
      row["receipts"] = (Array.isArray(row["receipts"]) ? row["receipts"] : []).map((r: BackupRow) => ({ ...r, path: pathFor(r["path"]) }));
      row["splits"] = (Array.isArray(row["splits"]) ? row["splits"] : []).map((s: BackupRow) => ({ ...s, memberId: typeof s["memberId"] === "string" ? ids.get(s["memberId"]) ?? s["memberId"] : null }));
    }
    if (t === "documents") row["file_path"] = pathFor(row["file_path"]);
    if (crossAccount && t === "finance_preferences" && row["data"] && typeof row["data"] === "object") {
      const p = { ...row["data"] as BackupRow };
      if (Array.isArray(p["budgets"])) p["budgets"] = p["budgets"].map((b: BackupRow) => b["kind"] === "person" && typeof b["value"] === "string" ? { ...b, value: ids.get(b["value"]) ?? b["value"] } : b);
      row["data"] = p;
    }
    return row;
  });
  return { data, paths };
}