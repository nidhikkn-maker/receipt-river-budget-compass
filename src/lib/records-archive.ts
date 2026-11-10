/**
 * Archive instead of delete for the remaining financially significant records (P0-007..P0-014, P0-016), built on
 * the shared P0-001 rules in archive.ts: archive is only a status (who / when / why) plus an append-only history,
 * every other field stays exactly as stored, and archiving never changes a figure.
 *
 * Two kinds of record:
 *   * JSON records in owner preferences (receivables, entities, GST invoices, tax lines, lender evidence, allocation
 *     plans, milestones, itinerary items) carry the archive fields on the record itself (archiveInList).
 *   * Table rows (loans, goals, commitments, asset_valuations, documents) have no archive columns yet. Until Track A
 *     adds them, their archive status is kept in owner preferences under `recordArchive`: one entry per row with the
 *     same archive fields and history. The row itself is never touched, so it stays byte-identical in its table.
 */
import { archiveHistory, archiveRecord, isArchived, restoreRecord, type ArchiveActor, type ArchiveEvent, type ArchiveState } from "./archive";
import type { FinancePreferences } from "./preferences";

/** Any record type with the optional archive fields. */
export type Archivable<T> = T & ArchiveState;

const archivedAtOf = (x: object): unknown => ("archivedAt" in x ? x.archivedAt : undefined);
/** True when this record carries a current archive status (works on any record type). */
export const recordIsArchived = (x: object): boolean => { const at = archivedAtOf(x); return typeof at === "string" && at !== ""; };
/** Records that are not archived (archived ones stay stored and in every figure; they are only listed separately). */
export const activeOnly = <T extends object>(list: readonly T[]): T[] => list.filter((x) => !recordIsArchived(x));
export const archivedOnly = <T extends object>(list: readonly T[]): T[] => list.filter((x) => recordIsArchived(x));

/** The latest archive event and the full history, for the Archived list. */
export function archiveSummary(r: ArchiveState): { current: ArchiveEvent | undefined; history: ArchiveEvent[] } {
  const history = archiveHistory(r);
  return { current: history.filter((e) => e.action === "archived").at(-1), history };
}

// ---------------------------------------------------------------------------------------------------------------
// Table rows (no archive columns yet): status kept in owner preferences.

export const ARCHIVED_TABLES = ["loans", "goals", "commitments", "asset_valuations", "documents"] as const;
export type ArchivedTable = (typeof ARCHIVED_TABLES)[number];
export const RECORD_ARCHIVE_KEY = "recordArchive";

export interface TableArchiveEntry extends ArchiveState {
  /** `${table}:${recordId}` — one entry per row, kept for good once created. */
  id: string;
  table: ArchivedTable;
  recordId: string;
  /** Name shown when the row was archived (the row keeps its own name). */
  name: string;
}

const isEntry = (x: unknown): x is TableArchiveEntry => {
  if (!x || typeof x !== "object") return false;
  const e = x as Record<string, unknown>;
  return typeof e["id"] === "string" && typeof e["recordId"] === "string" && typeof e["name"] === "string" && (ARCHIVED_TABLES as readonly unknown[]).includes(e["table"]) && e["id"] === `${String(e["table"])}:${e["recordId"]}`;
};

/** Every registry entry as stored (archived and restored). Unreadable entries are left in storage untouched. */
export function tableArchiveEntries(p: FinancePreferences): TableArchiveEntry[] {
  const raw: unknown = Reflect.get(p, RECORD_ARCHIVE_KEY);
  return Array.isArray(raw) ? raw.filter(isEntry) : [];
}
const rawEntries = (p: FinancePreferences): unknown[] => { const raw: unknown = Reflect.get(p, RECORD_ARCHIVE_KEY); return Array.isArray(raw) ? raw : []; };

export const tableEntry = (p: FinancePreferences, table: ArchivedTable, recordId: string): TableArchiveEntry | undefined =>
  tableArchiveEntries(p).find((e) => e.table === table && e.recordId === recordId);
/** Ids of rows in this table that are archived now. */
export function archivedTableIds(p: FinancePreferences, table: ArchivedTable): Set<string> {
  return new Set(tableArchiveEntries(p).filter((e) => e.table === table && isArchived(e)).map((e) => e.recordId));
}

function withEntries(p: FinancePreferences, list: unknown[]): FinancePreferences {
  const extra = { [RECORD_ARCHIVE_KEY]: list };
  return { ...p, ...extra };
}

/** Archive one table row by recording its status; the row itself is never changed or deleted. */
export function archiveTableRecord(p: FinancePreferences, table: ArchivedTable, recordId: string, name: string, who: ArchiveActor): FinancePreferences {
  if (!recordId) throw new Error("That record could not be found. Refresh and try again.");
  const id = `${table}:${recordId}`;
  const list = rawEntries(p);
  const at = list.findIndex((x) => isEntry(x) && x.id === id);
  if (at < 0) return withEntries(p, [...list, archiveRecord<TableArchiveEntry>({ id, table, recordId, name: name.trim() || "Unnamed record" }, who)]);
  const current = list[at] as TableArchiveEntry;
  return withEntries(p, list.map((x, i) => (i === at ? archiveRecord(current, who) : x)));
}

/** Restore one archived table row: its entry keeps the history and gains a restore event. */
export function restoreTableRecord(p: FinancePreferences, table: ArchivedTable, recordId: string, who: ArchiveActor): FinancePreferences {
  const id = `${table}:${recordId}`;
  const list = rawEntries(p);
  const at = list.findIndex((x) => isEntry(x) && x.id === id);
  if (at < 0) throw new Error("This record is not archived.");
  return withEntries(p, list.map((x, i) => (i === at ? restoreRecord(x as TableArchiveEntry, who) : x)));
}

/** Split table rows into active and archived, keeping each row exactly as loaded. */
export function splitByTableArchive<T extends { id?: string | undefined }>(p: FinancePreferences, table: ArchivedTable, rows: readonly T[]): { active: T[]; archived: T[] } {
  const ids = archivedTableIds(p, table);
  return { active: rows.filter((r) => !(r.id && ids.has(r.id))), archived: rows.filter((r) => !!r.id && ids.has(r.id)) };
}

// ---------------------------------------------------------------------------------------------------------------
// Rules for particular records.

/** A scheduled payment is archived only once it has ended (Cancel stops it), so an archived one never hides a live payment. */
export function commitmentArchiveProblem(c: { status: string }): string | null {
  return c.status === "cancelled" ? null : "Cancel this payment first. Archive only keeps a record of a payment that has ended.";
}

/** Company merge without loss: years the target already has stay with the (archived) source instead of being dropped. */
export function mergeYearsKeepingAll<T extends { entityId: string; fy: string }>(list: readonly T[] | undefined, from: string, into: string): T[] {
  const all = list ?? [];
  const has = new Set(all.filter((x) => x.entityId === into).map((x) => x.fy));
  return all.map((x) => (x.entityId === from && !has.has(x.fy) ? { ...x, entityId: into } : x));
}
