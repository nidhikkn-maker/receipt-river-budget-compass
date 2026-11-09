// P0-001: archive instead of delete. Pure rules, persistence (load -> save) and accounting integrity.
import { describe, expect, it } from "vitest";
import { ARCHIVE_FIELDS, archiveEventLine, archiveHistory, archiveInList, archiveRecord, isArchived, reasonProblem, restoreInList, restoreRecord, withoutArchiveFields } from "./archive";
import { bookSchedule, shareValue, taxSchedule, type Asset } from "./assets";
import { annualBook, blockSchedule, bookVsTax, monthlyBook, prepareJournals } from "./books/depreciation";
import { depreciationExceptions, dueMonths, eventPostings } from "./books/assets-ledger";
import { dynamicNetWorth, valueHolding } from "./books/market";
import { propertyValue } from "./books/property";
import { taxComputation } from "./books/taxcomp";
import { cleanBooks, type BooksData, type Holding, type Property } from "./books/types";
import { canonical, preserveForSave } from "./preserve-records";
import { normalizePreferences, type FinancePreferences } from "./preferences";
import { PREFERENCE_RETENTION } from "./retention";

const OWNER = "11111111-1111-4111-8111-111111111111";
const AT = "2026-11-09T05:30:00.000Z", LATER = "2026-11-10T06:00:00.000Z";
const laptop: Asset = { id: "laptop", name: "MacBook Pro (office)", kind: "computer", cost: 185000, inUse: "2025-05-12", purchaseDate: "2025-05-10", sharePct: 100, bookMethod: "wdv", bookRatePct: 40, docId: "doc-inv", docIds: ["doc-photo"], tag: "TH-CMP-014", accountId: "acc-fixed", paymentId: "txn-buy", ownerEntityId: "ent-1", adjustments: [{ date: "2026-01-10", amount: 5000, kind: "impairment", note: "screen damage" }] };
const flat: Asset = { id: "flat", name: "Anna Nagar flat", kind: "property", cost: 8500000, inUse: "2019-03-01", sharePct: 50, bookMethod: "slm", bookRatePct: 0, docId: "doc-deed" };
const property: Property = { id: "prop", name: "Anna Nagar flat", address: "2nd Avenue", assetId: "flat", buildings: [], docIds: ["doc-deed"], links: { loanId: "loan-1" } };
const gold: Holding = { id: "gold", kind: "physical_gold", name: "Gold coins", quantity: 1, grams: 40, karat: 24, sharePct: 100, costBasis: 210000, source: "entered by you" };
const who = (reason = "Moved to company books", at = AT) => ({ by: OWNER, at, reason });
const FY = "2026-27";

describe("archive rules", () => {
  it("requires a real reason and a signed-in actor", () => {
    expect(reasonProblem("")).toMatch(/reason/);
    expect(reasonProblem("  ab  ")).toMatch(/reason/);
    expect(reasonProblem("Sold to staff")).toBeNull();
    expect(() => archiveRecord(laptop, who("   "))).toThrow(/reason/);
    expect(() => archiveRecord(laptop, { by: "", at: AT, reason: "No longer used" })).toThrow(/Sign in/);
    expect(() => archiveRecord(laptop, { by: OWNER, at: "not a date", reason: "No longer used" })).toThrow(/time/);
  });

  it("archives as a status: every other field stays byte-identical, and who/when/why are recorded", () => {
    const a = archiveRecord(laptop, who("  Moved to company books  "));
    expect(isArchived(a)).toBe(true);
    expect(a).toMatchObject({ archivedAt: AT, archivedBy: OWNER, archiveReason: "Moved to company books" });
    expect(a.archiveHistory).toEqual([{ action: "archived", at: AT, by: OWNER, reason: "Moved to company books" }]);
    expect(canonical(withoutArchiveFields(a))).toBe(canonical(laptop));
    expect(Object.keys(a).filter((k) => !(k in laptop)).sort()).toEqual([...ARCHIVE_FIELDS].sort());
    expect(laptop).not.toHaveProperty("archivedAt"); // input not mutated
    expect(() => archiveRecord(a, who())).toThrow(/already archived/);
  });

  it("restores with its own reason, keeps the append-only history and returns the original record", () => {
    const a = archiveRecord(laptop, who());
    expect(() => restoreRecord(laptop, who())).toThrow(/not archived/);
    expect(() => restoreRecord(a, who(""))).toThrow(/reason/);
    const r = restoreRecord(a, who("Archived by mistake", LATER));
    expect(isArchived(r)).toBe(false);
    expect(r).not.toHaveProperty("archivedAt"); expect(r).not.toHaveProperty("archivedBy"); expect(r).not.toHaveProperty("archiveReason");
    expect(r.archiveHistory).toEqual([{ action: "archived", at: AT, by: OWNER, reason: "Moved to company books" }, { action: "restored", at: LATER, by: OWNER, reason: "Archived by mistake" }]);
    expect(canonical(withoutArchiveFields(r))).toBe(canonical(laptop));
    const again = archiveRecord(r, who("Retired after audit", "2026-12-01T00:00:00.000Z"));
    expect(again.archiveHistory?.map((e) => e.action)).toEqual(["archived", "restored", "archived"]);
    expect(again.archiveHistory?.slice(0, 2)).toEqual(r.archiveHistory);
  });

  it("never removes a record from a list and leaves every other record untouched", () => {
    const list = [laptop, flat];
    const next = archiveInList(list, "laptop", who());
    expect(next).toHaveLength(2);
    expect(next.map((x) => x.id)).toEqual(["laptop", "flat"]);
    expect(next[1]).toBe(flat);
    expect(() => archiveInList(list, "missing", who())).toThrow(/could not be found/);
    const back = restoreInList(next, "laptop", who("Archived by mistake", LATER));
    expect(back).toHaveLength(2);
    expect(back[1]).toBe(flat);
  });

  it("shows legacy archive status as history and words events plainly", () => {
    const legacy = { ...laptop, archivedAt: AT, archivedBy: OWNER, archiveReason: "Old record" };
    expect(archiveHistory(legacy)).toEqual([{ action: "archived", at: AT, by: OWNER, reason: "Old record" }]);
    expect(archiveEventLine({ action: "archived", at: AT, by: OWNER, reason: "x" }, OWNER)).toBe("Archived by you on 9 Nov 2026");
    expect(archiveEventLine({ action: "restored", at: LATER, by: "someone-else", reason: "x" }, OWNER)).toBe("Restored by another user on 10 Nov 2026");
  });
});

/** Every figure the app derives from an asset/holding/property register (books, tax, depreciation, net worth). */
function figures(assets: Asset[], books: BooksData) {
  const now = new Date("2026-11-09T00:00:00Z");
  const valued = books.holdings.map((h) => valueHolding(h, books.quotes, books.goldRate, now, books.alerts, books.fxRates ?? []));
  const linked = new Set(books.properties.map((p) => p.assetId).filter(Boolean));
  const property = books.properties.reduce((s, p) => { const a = assets.find((x) => x.id === p.assetId); return s + (propertyValue(p, a ? shareValue(a, FY) : null).value ?? 0); }, 0)
    + assets.filter((a) => !a.soldOn && !linked.has(a.id)).reduce((s, a) => s + shareValue(a, FY), 0);
  const nw = dynamicNetWorth({ bank: 1000, bankBasis: "", investments: valued, demat: 0, dematBasis: "", otherAssets: 0, property, propertyBasis: "", liabilities: 0, liabilitiesBasis: "" });
  const dep = assets.filter((a) => a.kind !== "property");
  return {
    book: assets.map((a) => [bookSchedule(a, FY), taxSchedule(a, FY), shareValue(a, FY), annualBook(a, FY), monthlyBook(a, "2026-11"), depreciationExceptions(a), dueMonths(a, books.journals, "2026-11-09"), eventPostings(a, books.closedPeriods)]),
    blocks: blockSchedule(dep, FY), bookVsTax: bookVsTax(dep, FY),
    journals: prepareJournals(dep, "2026-10", books.journals, books.closedPeriods, () => "fixed-id"),
    tax: taxComputation(FY, [], assets, books.leases, [], books.fyRecords),
    netWorth: nw.net, parts: nw.assets.map((x) => [x.label, x.value]), valued: valued.map((v) => v.value),
  };
}

describe("accounting integrity: archive and restore change no figure", () => {
  const books = cleanBooks({ properties: [property], holdings: [gold], goldRate: { perGram24k: 7600, date: "2026-11-08", source: "entered by you" } });
  const base = figures([laptop, flat], books);

  it("asset: net worth, book value, depreciation, journals and tax are identical before, after archive and after restore", () => {
    const archived = archiveInList([laptop, flat], "laptop", who());
    expect(canonical(figures(archived, books))).toBe(canonical(base));
    const restored = restoreInList(archived, "laptop", who("Archived by mistake", LATER));
    expect(canonical(figures(restored, books))).toBe(canonical(base));
    expect(base.netWorth).toBeGreaterThan(4_250_000); // flat share + laptop + gold actually counted
  });

  it("property and holding: archived records are still valued and counted", () => {
    const b2 = { ...books, properties: archiveInList(books.properties, "prop", who()), holdings: archiveInList(books.holdings, "gold", who()) };
    expect(canonical(figures([laptop, flat], b2))).toBe(canonical(base));
    const b3 = { ...b2, properties: restoreInList(b2.properties, "prop", who("Archived by mistake", LATER)), holdings: restoreInList(b2.holdings, "gold", who("Archived by mistake", LATER)) };
    expect(canonical(figures([laptop, flat], b3))).toBe(canonical(base));
    expect(base.valued).toEqual([valueHolding(gold, [], books.goldRate, new Date("2026-11-09T00:00:00Z"), books.alerts).value]);
  });
});

describe("persistence: archive fields survive load -> save and keep stored originals", () => {
  it("assets, properties and holdings are financial registers (never capped)", () => {
    expect(PREFERENCE_RETENTION["assets"]).toMatchObject({ class: "financial", cap: null });
  });

  it("normalising keeps archive fields on assets, properties and holdings", () => {
    const stored = { assets: [archiveRecord(laptop, who())], books: { properties: [archiveRecord(property, who())], holdings: [archiveRecord(gold, who())] } };
    const view = normalizePreferences(stored as Partial<FinancePreferences>);
    expect(view.assets?.[0]).toMatchObject({ archivedAt: AT, archivedBy: OWNER, archiveReason: "Moved to company books" });
    expect(view.books?.properties[0]).toMatchObject({ archivedAt: AT, archivedBy: OWNER });
    expect(view.books?.holdings[0]).toMatchObject({ archivedAt: AT, archiveHistory: [{ action: "archived", at: AT, by: OWNER, reason: "Moved to company books" }] });
  });

  it("an unrelated save writes archived records back exactly as stored", () => {
    const stored = { assets: [archiveRecord(laptop, who()), flat], books: { holdings: [archiveRecord(gold, who())], properties: [property] } } as unknown as Record<string, unknown>;
    const view = normalizePreferences(stored as Partial<FinancePreferences>);
    const out = preserveForSave(stored, { ...view, assets: (view.assets ?? []).map((a) => (a.id === "flat" ? { ...a, location: "Chennai" } : a)) }, AT) as unknown as Record<string, unknown>;
    const assets = out["assets"] as Asset[];
    expect(assets).toHaveLength(2);
    expect(canonical(assets[0])).toBe(canonical((stored["assets"] as Asset[])[0]));
    expect(canonical((out["books"] as { holdings: unknown[] }).holdings)).toBe(canonical((stored["books"] as { holdings: unknown[] }).holdings));
  });

  it("archiving a record whose display was tidied stores the untouched original plus archive fields only", () => {
    // Stored share 150% is clamped to 100% for display; the archive must not write the clamped value.
    const raw = { ...laptop, sharePct: 150, legacyNote: "kept from an older app version" };
    const stored = { assets: [raw, flat] } as unknown as Record<string, unknown>;
    const view = normalizePreferences(stored as Partial<FinancePreferences>);
    expect(view.assets?.[0]?.sharePct).toBe(100);
    const next = { ...view, assets: archiveInList(view.assets ?? [], "laptop", who()) };
    const out = preserveForSave(stored, next, AT) as unknown as Record<string, unknown>;
    const saved = (out["assets"] as Record<string, unknown>[])[0]!;
    expect(canonical(withoutArchiveFields(saved))).toBe(canonical(raw));
    expect(saved).toMatchObject({ archivedAt: AT, archivedBy: OWNER, archiveReason: "Moved to company books" });
    expect(out["preservedRecords"] ?? []).toEqual([]); // nothing needed copying aside: the original stayed in place
    // Restore the same way: original back, history kept.
    const view2 = normalizePreferences(out as Partial<FinancePreferences>);
    const out2 = preserveForSave(out, { ...view2, assets: restoreInList(view2.assets ?? [], "laptop", who("Archived by mistake", LATER)) }, LATER) as unknown as Record<string, unknown>;
    const back = (out2["assets"] as Record<string, unknown>[])[0]!;
    expect(canonical(withoutArchiveFields(back))).toBe(canonical(raw));
    expect(back["archivedAt"]).toBeUndefined();
    expect((back["archiveHistory"] as unknown[]).length).toBe(2);
  });
});
