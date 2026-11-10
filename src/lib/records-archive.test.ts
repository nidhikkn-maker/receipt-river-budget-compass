// C1 archive rules (P0-007..P0-014, P0-016): table-row archive registry, preservation through the real save path,
// lossless company merge, the scheduled-payment rule, lender-balance supersede, and entity archive fields on load.
import { describe, expect, it } from "vitest";
import { normalizePreferences, type FinancePreferences } from "./preferences";
import { canonical, preserveForSave, unreadableRecords } from "./preserve-records";
import { PREFERENCE_RETENTION } from "./retention";
import { cleanEntities } from "./entities";
import { standaloneLoanBalances, withConfirmedBalance } from "./books/loan-balances";
import { activeOnly, archivedOnly, archivedTableIds, archiveTableRecord, commitmentArchiveProblem, mergeYearsKeepingAll, recordIsArchived, restoreTableRecord, splitByTableArchive, tableArchiveEntries, tableEntry } from "./records-archive";

const who = (reason: string, at = "2026-11-10T05:00:00.000Z") => ({ by: "owner-1", at, reason });
const prefs = (stored: Record<string, unknown> = {}) => normalizePreferences(stored as Partial<FinancePreferences>);

describe("table-row archive registry", () => {
  it("archives and restores a row by id with who/when/why and an append-only history; the row list is untouched", () => {
    const loans = [{ id: "l1", name: "SBI" }, { id: "l2", name: "Bajaj" }];
    let p = archiveTableRecord(prefs(), "loans", "l2", "Bajaj", who("Duplicate entry"));
    expect(archivedTableIds(p, "loans")).toEqual(new Set(["l2"]));
    expect(archivedTableIds(p, "goals").size).toBe(0);
    expect(splitByTableArchive(p, "loans", loans)).toEqual({ active: [loans[0]], archived: [loans[1]] });
    expect(() => archiveTableRecord(p, "loans", "l2", "Bajaj", who("Again please"))).toThrow(/already archived/);
    p = restoreTableRecord(p, "loans", "l2", who("Archived by mistake", "2026-11-11T05:00:00.000Z"));
    expect(archivedTableIds(p, "loans").size).toBe(0);
    p = archiveTableRecord(p, "loans", "l2", "Bajaj", who("Closed with lender", "2026-11-12T05:00:00.000Z"));
    const e = tableEntry(p, "loans", "l2")!;
    expect(e.archiveHistory?.map((x) => `${x.action}:${x.reason}`)).toEqual(["archived:Duplicate entry", "restored:Archived by mistake", "archived:Closed with lender"]);
    expect(tableArchiveEntries(p)).toHaveLength(1);
    expect(loans).toEqual([{ id: "l1", name: "SBI" }, { id: "l2", name: "Bajaj" }]);
  });
  it("needs a reason and refuses to restore what is not archived", () => {
    expect(() => archiveTableRecord(prefs(), "goals", "g1", "Fees", who("x"))).toThrow(/reason/);
    expect(() => restoreTableRecord(prefs(), "goals", "g1", who("Back again"))).toThrow(/not archived/);
  });
  it("is classified as audit data, survives load → save byte-identically, and keeps entries the app cannot read", () => {
    expect(PREFERENCE_RETENTION["recordArchive"]?.class).toBe("audit");
    const p = archiveTableRecord(prefs(), "documents", "d1", "LIC policy", who("Surrendered"));
    const firstSave = preserveForSave({}, p) as unknown as Record<string, unknown>;
    const stored = { ...firstSave, recordArchive: [...(firstSave["recordArchive"] as unknown[]), { weird: true }] };
    const view = prefs(stored);
    expect(tableArchiveEntries(view)).toHaveLength(1);
    const again = preserveForSave(stored, view) as unknown as Record<string, unknown>;
    expect(canonical(again["recordArchive"])).toBe(canonical(stored["recordArchive"]));
    const next = restoreTableRecord(view, "documents", "d1", who("Needed again"));
    const saved = preserveForSave(stored, next) as unknown as Record<string, unknown[]>;
    expect(saved["recordArchive"]).toContainEqual({ weird: true });
    expect(unreadableRecords(stored)).toEqual([]);
  });
});

describe("JSON records", () => {
  it("activeOnly / archivedOnly work on any record type and never drop a record", () => {
    const list = [{ id: "a" }, { id: "b", archivedAt: "2026-11-10T00:00:00Z" }, { id: "c", archivedAt: "" }];
    expect(activeOnly(list).map((x) => x.id)).toEqual(["a", "c"]);
    expect(archivedOnly(list).map((x) => x.id)).toEqual(["b"]);
    expect(recordIsArchived(list[1]!)).toBe(true);
  });
  it("company profiles keep their archive fields through cleanEntities (otherwise an archived company would reappear)", () => {
    const stored = { id: "e1", name: "Co", kind: "company", pan: "AAACT1234F", gstins: [], booksFrom: "2024-25", archivedAt: "2026-11-10T00:00:00Z", archivedBy: "owner-1", archiveReason: "Struck off", archiveHistory: [{ action: "archived", at: "2026-11-10T00:00:00Z", by: "owner-1", reason: "Struck off" }] };
    expect(cleanEntities([stored])[0]).toEqual(stored);
  });
  it("merge keeps a year the target already has with the merged-away company instead of dropping it", () => {
    const years = [{ id: "1", entityId: "a", fy: "2024-25" }, { id: "2", entityId: "a", fy: "2025-26" }, { id: "3", entityId: "b", fy: "2025-26" }];
    expect(mergeYearsKeepingAll(years, "a", "b")).toEqual([{ id: "1", entityId: "b", fy: "2024-25" }, { id: "2", entityId: "a", fy: "2025-26" }, { id: "3", entityId: "b", fy: "2025-26" }]);
  });
  it("a scheduled payment can be archived only after it is cancelled", () => {
    expect(commitmentArchiveProblem({ status: "active" })).toMatch(/Cancel this payment first/);
    expect(commitmentArchiveProblem({ status: "paused" })).not.toBeNull();
    expect(commitmentArchiveProblem({ status: "cancelled" })).toBeNull();
  });
});

describe("lender balance supersede (P0-014)", () => {
  const loan = { id: "L", name: "Bajaj", accountId: null, status: "active" };
  const docs = [{ id: "doc", loanId: "L", docType: "loan_statement" as const }];
  const first = { id: "e1", loanId: "L", amount: 180000, asOf: "2026-09-30", docId: "doc", sourceQuote: "Outstanding 1,80,000", confirmedAt: "2026-10-01T00:00:00Z" };
  const fix = { ...first, id: "e2", amount: 178500, confirmedAt: "2026-10-03T00:00:00Z" };
  it("a same-date confirmation keeps the earlier observation (superseded) and uses the new one — same figure as replace", () => {
    const list = withConfirmedBalance([first], fix);
    expect(list).toEqual([{ ...first, supersededAt: fix.confirmedAt, supersededBy: "e2" }, fix]);
    expect(standaloneLoanBalances([loan], list, docs, "2026-11-10").amount).toBe(standaloneLoanBalances([loan], [fix], docs, "2026-11-10").amount);
    expect(standaloneLoanBalances([loan], list, docs, "2026-11-10").rows[0]!.conflict).toBe(false);
  });
  it("a different date adds a new observation and supersedes nothing", () => {
    const later = { ...fix, id: "e3", asOf: "2026-10-31" };
    expect(withConfirmedBalance([first], later)).toEqual([first, later]);
  });
});
