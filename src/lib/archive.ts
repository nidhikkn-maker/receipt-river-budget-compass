/**
 * Archive instead of delete for financially significant records kept in owner preferences (P0-001).
 *
 * Archiving is only a status on the record: archivedAt / archivedBy (owner user id) / archiveReason, plus an
 * append-only archiveHistory of every archive and restore with who, when and why. Every other field (id, cost,
 * documents, depreciation inputs, ownership, accounting links) stays exactly as it was. Archived records stay in
 * valuation, depreciation, books and net worth: archiving never changes a figure. Disposal, sale, transfer,
 * write-off and scrapping are separate lifecycle workflows and are never reached through Archive.
 */

export interface ArchiveEvent { action: "archived" | "restored"; at: string; by: string; reason: string }
export interface ArchiveState {
  archivedAt?: string | undefined;
  archivedBy?: string | undefined;
  archiveReason?: string | undefined;
  /** Append-only: never rewritten or shortened. */
  archiveHistory?: ArchiveEvent[] | undefined;
}

/** The only fields Archive and Restore may change. */
export const ARCHIVE_FIELDS = ["archivedAt", "archivedBy", "archiveReason", "archiveHistory"] as const;
export const MIN_REASON_LENGTH = 5;

export const isArchived = (r: ArchiveState | null | undefined): boolean => typeof r?.archivedAt === "string" && r.archivedAt !== "";

/** Plain-language problem with a reason, or null when it is acceptable. */
export function reasonProblem(reason: string): string | null {
  return reason.trim().length >= MIN_REASON_LENGTH ? null : `Give a reason (at least ${MIN_REASON_LENGTH} letters).`;
}

export interface ArchiveActor { by: string; at: string; reason: string }

function check(who: ArchiveActor) {
  const problem = reasonProblem(who.reason);
  if (problem) throw new Error(problem);
  if (!who.by.trim()) throw new Error("Sign in again before archiving or restoring.");
  if (!who.at || Number.isNaN(Date.parse(who.at))) throw new Error("Archive time is missing.");
}

/** History as stored; an older record archived without history gets its archive event shown (not stored). */
export function archiveHistory(r: ArchiveState): ArchiveEvent[] {
  const h = Array.isArray(r.archiveHistory) ? r.archiveHistory : [];
  if (h.length || !isArchived(r)) return h;
  return [{ action: "archived", at: r.archivedAt ?? "", by: r.archivedBy ?? "", reason: r.archiveReason ?? "" }];
}

/** Archive one record. Only archive fields change; the rest of the record is returned untouched. */
export function archiveRecord<T extends ArchiveState>(r: T, who: ArchiveActor): T {
  check(who);
  if (isArchived(r)) throw new Error("This record is already archived.");
  const reason = who.reason.trim();
  return { ...r, archivedAt: who.at, archivedBy: who.by, archiveReason: reason, archiveHistory: [...archiveHistory(r), { action: "archived", at: who.at, by: who.by, reason }] };
}

/** Restore one archived record. Removes the current archive status and appends a restore event to the history. */
export function restoreRecord<T extends ArchiveState>(r: T, who: ArchiveActor): T {
  check(who);
  if (!isArchived(r)) throw new Error("This record is not archived.");
  const reason = who.reason.trim();
  const history = [...archiveHistory(r), { action: "restored" as const, at: who.at, by: who.by, reason }];
  const out = { ...r } as Record<string, unknown>;
  delete out["archivedAt"]; delete out["archivedBy"]; delete out["archiveReason"];
  out["archiveHistory"] = history;
  return out as T;
}

type WithId = ArchiveState & { id: string };
function changeInList<T extends WithId>(list: readonly T[], id: string, change: (r: T) => T): T[] {
  if (!list.some((x) => x.id === id)) throw new Error("That record could not be found. Refresh and try again.");
  return list.map((x) => (x.id === id ? change(x) : x));
}
/** Archive the record with this id; every other record (and the order) stays as it is. Never removes anything. */
export const archiveInList = <T extends WithId>(list: readonly T[], id: string, who: ArchiveActor): T[] => changeInList(list, id, (r) => archiveRecord(r, who));
/** Restore the record with this id; every other record stays as it is. */
export const restoreInList = <T extends WithId>(list: readonly T[], id: string, who: ArchiveActor): T[] => changeInList(list, id, (r) => restoreRecord(r, who));

/** The record without its archive fields (for comparing the financial content before and after). */
export function withoutArchiveFields<T extends object>(r: T): Omit<T, (typeof ARCHIVE_FIELDS)[number]> {
  const out = { ...r } as Record<string, unknown>;
  for (const f of ARCHIVE_FIELDS) delete out[f];
  return out as Omit<T, (typeof ARCHIVE_FIELDS)[number]>;
}

/** Copy only the archive fields of `from` onto `onto` (absent fields are removed). Used to keep stored originals. */
export function withArchiveFieldsOf(onto: Record<string, unknown>, from: Record<string, unknown>): Record<string, unknown> {
  const out = { ...onto };
  for (const f of ARCHIVE_FIELDS) { if (from[f] === undefined) delete out[f]; else out[f] = from[f]; }
  return out;
}

const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
/** "Archived by you on 9 Nov 2026" style line. */
export function archiveEventLine(e: ArchiveEvent, currentUser: string): string {
  const who = e.by && e.by === currentUser ? "you" : e.by ? "another user" : "unknown user";
  const when = Number.isNaN(Date.parse(e.at)) ? "an unknown date" : DATE.format(new Date(e.at));
  return `${e.action === "archived" ? "Archived" : "Restored"} by ${who} on ${when}`;
}
