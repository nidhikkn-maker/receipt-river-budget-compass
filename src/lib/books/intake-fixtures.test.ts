import { describe, expect, it } from "vitest";
import {
  autoName,
  canonicalField,
  matchEntity,
  nameSuggestion,
  proposeAsset,
  proposeEntity,
  proposeFy,
  proposeLease,
  proposeProperty,
  REQUIRED_SCHEDULES,
  type AssetRead,
  type AuditedRead,
  type EntityRead,
  type LeaseRead,
  type PropertyRead,
} from "./intake";
import type { EntityProfile, Property } from "./types";
import { emptyBooks } from "./types";
import { commitIntake, type PrefsSlice } from "./commit";
import { docsFor, linksOf } from "./docrepo";

// Representative document fixtures for the Statement Desk / DocumentIntake pipeline [§3, §13–§16].
// Every fixture asserts three things: identification/matching, extraction of expected fields,
// and missing-field handling with no invented values.

const acme: EntityProfile = {
  id: "ent-acme",
  name: "Acme Traders Private Limited",
  kind: "company",
  pan: "AAACA1234A",
  gstins: ["33AAACA1234A1Z5"],
  booksFrom: "2020-21",
  regNo: "U51909TN2020PTC135790",
} as EntityProfile;

describe("company incorporation document fixture", () => {
  const read: EntityRead = {
    legalName: "Acme Traders Private Limited",
    kind: "company",
    pan: "aaaca1234a",
    gstins: ["33AAACA1234A1Z5"],
    cin: "U51909TN2020PTC135790",
    incorporatedOn: "2020-06-15",
    address: "12, Mount Road, Chennai",
    people: [{ name: "K Karunanithi", role: "Director" }],
    shareholding: [{ name: "K Karunanithi", pct: 100 }],
    activities: ["Trading"],
    fyEnd: "03-31",
  };

  it("matches an existing company by PAN/CIN/GSTIN instead of duplicating it", () => {
    expect(matchEntity([acme], { pan: "AAACA1234A" })?.by).toBe("PAN");
    expect(matchEntity([acme], { cin: "U51909TN2020PTC135790" })?.by).toBe("CIN");
    expect(matchEntity([acme], { gstins: ["33AAACA1234A1Z5"] })?.by).toBe("GSTIN");
    const p = proposeEntity(read, [acme], "new-id", "2026-11-07");
    expect(p.profile.id).toBe("ent-acme");
    expect(p.matchedBy).toBe("PAN");
    expect(p.missing).toEqual([]);
  });

  it("proposes a new company with only printed facts and lists what is missing", () => {
    const sparse: EntityRead = { ...read, pan: null, cin: null, gstins: [], legalName: null };
    const p = proposeEntity(sparse, [], "new-id", "2026-11-07");
    expect(p.matchedBy).toBeNull();
    expect(p.profile.pan).toBe("");
    expect(p.missing).toContain("legal name");
    expect(p.missing).toContain("PAN");
    expect(p.missing).toContain("CIN/LLPIN");
  });

  it("never invents a financial-year start from thin air", () => {
    const noDate: EntityRead = { ...read, incorporatedOn: null };
    const p = proposeEntity(noDate, [], "new-id", "2026-04-10");
    expect(p.profile.booksFrom).toBe("2026-27"); // falls back to the current FY, clearly derived from today
  });
});

describe("asset purchase invoice fixture", () => {
  const read: AssetRead = {
    name: "Mercedes GLS 450",
    kind: "vehicle",
    owner: "Acme Traders Private Limited",
    cost: 13200000,
    purchaseDate: "2024-08-20",
    supplier: "Sundaram Motors",
    warrantyUntil: "2027-08-19",
    insurance: "Policy ICICI-7788",
    serial: "WDC1679231A000111",
    putToUseOn: "2024-08-25",
    usefulLifeYears: 8,
    residualPct: 5,
  };

  it("extracts the expected fields and suggests the printed owner", () => {
    const p = proposeAsset(read, [acme], "asset-1", "doc-1");
    expect(p.asset).not.toBeNull();
    expect(p.asset!.name).toBe("Mercedes GLS 450");
    expect(p.asset!.cost).toBe(13200000);
    expect(p.asset!.ownerEntityId).toBe("ent-acme");
    expect(p.ownerSuggested).toBe(true);
    expect(p.asset!.tag).toBe("WDC1679231A000111");
    expect(p.missing).toEqual([]);
  });

  it("refuses to create an asset when name, cost or purchase date is missing", () => {
    const sparse: AssetRead = { name: null, kind: null, owner: null, cost: null, purchaseDate: null, supplier: null, warrantyUntil: null, insurance: null, serial: null };
    const p = proposeAsset(sparse, [], "asset-2", null);
    expect(p.asset).toBeNull();
    expect(p.missing).toEqual(expect.arrayContaining(["asset name", "purchase cost", "purchase date"]));
  });

  it("keeps a printed tax WDV but marks an unprinted book value unknown (-1), never recomputed", () => {
    const wdv: AssetRead = { ...read, openingTaxWdv: 9000000, openingBookWdv: null, wdvFy: "2025-26" };
    const p = proposeAsset(wdv, [], "asset-3", null);
    expect(p.asset!.openingWdv).toEqual({ fy: "2025-26", book: -1, tax: 9000000 });
    expect(p.missing).toContain("opening book value (tax WDV was printed)");
  });
});

describe("property deed fixture", () => {
  const read: PropertyRead = {
    name: "Anna Nagar Plot 44",
    owner: "Acme Traders Private Limited",
    address: "Plot 44, 2nd Avenue, Anna Nagar, Chennai",
    cost: 8500000,
    acquiredOn: "2019-01-10",
    surveyNo: "S.No 112/3",
    valuation: 12000000,
    valuationDate: "2026-01-15",
  };

  it("extracts fields and links the owner by exact name only", () => {
    const p = proposeProperty(read, [acme], "prop-1", "doc-9");
    expect(p.property.name).toBe("Anna Nagar Plot 44");
    expect(p.property.ownerEntityId).toBe("ent-acme");
    expect(p.property.valuation).toEqual({ value: 12000000, date: "2026-01-15", source: "Valuation report" });
    expect(p.missing).toEqual([]);
  });

  it("keeps a valuation only with its printed date — an undated value is dropped, not guessed", () => {
    const p = proposeProperty({ ...read, valuationDate: null }, [], "prop-2", null);
    expect(p.property.valuation).toBeUndefined();
    expect(p.missing).toContain("legal owner");
  });
});

describe("lease agreement fixture", () => {
  const prop: Property = { id: "prop-1", name: "Anna Nagar Plot 44", address: "Plot 44, 2nd Avenue, Anna Nagar, Chennai", buildings: [] } as Property;
  const read: LeaseRead = {
    tenant: "Bright Retail Co",
    property: "Anna Nagar",
    unit: null,
    start: "2026-04-01",
    end: "2029-03-31",
    rent: 75000,
    dueDay: 5,
    escalationPct: 5,
    escalationEveryMonths: 12,
    deposit: 450000,
    noticeDays: 90,
    paymentTerms: "Rent by the 5th",
    gst: true,
  };

  it("links the lease to the property by name and keeps printed terms", () => {
    const p = proposeLease(read, [prop], "lease-1", "doc-7");
    expect(p.lease).not.toBeNull();
    expect(p.lease!.propertyId).toBe("prop-1");
    expect(p.lease!.rent).toBe(75000);
    expect(p.lease!.deposit).toBe(450000);
    expect(p.missing).toEqual([]);
  });

  it("asks for missing pieces instead of guessing them", () => {
    const sparse: LeaseRead = { tenant: null, property: null, unit: null, start: null, end: null, rent: null, dueDay: null, escalationPct: null, escalationEveryMonths: null, deposit: null, noticeDays: null, paymentTerms: null, gst: null };
    const p = proposeLease(sparse, [prop], "lease-2", null);
    expect(p.lease).toBeNull();
    expect(p.missing).toEqual(expect.arrayContaining(["tenant", "monthly rent", "lease start", "lease end", "which property"]));
  });

  it("rejects an out-of-range due day rather than clamping silently", () => {
    const p = proposeLease({ ...read, dueDay: 45 }, [prop], "lease-3", null);
    expect(p.lease!.dueDay).toBeUndefined();
  });
});

describe("audited financial statements fixture", () => {
  const read: AuditedRead = {
    entity: "Acme Traders Private Limited",
    pan: "AAACA1234A",
    fy: "2024-25",
    lines: [
      { head: "shareCapital", amount: 100000 },
      { head: "reserves", amount: 2450000 },
    ],
    totalAssets: 9200000,
    totalLiabilities: 3100000,
    schedules: ["balanceSheet", "profitLoss"],
    qualifications: ["None"],
    filedForm: "ITR-6",
    ackNo: "123456789010426",
    filedOn: "2025-10-31",
  };

  it("records printed figures and flags the schedules that were not in the document", () => {
    const p = proposeFy(read, [acme], [], "fy-1", "doc-3");
    expect(p.record).not.toBeNull();
    expect(p.record!.entityId).toBe("ent-acme");
    expect(p.record!.audited.shareCapital).toBe(100000);
    expect(p.record!.filedReturns).toEqual([{ form: "ITR-6", ack: "123456789010426", filedOn: "2025-10-31" }]);
    expect(p.missingSchedules).toEqual(REQUIRED_SCHEDULES.filter((s) => !["balanceSheet", "profitLoss"].includes(s)));
    expect(p.missing).toEqual([]);
  });

  it("refuses the record when the company or financial year cannot be identified", () => {
    const p = proposeFy({ ...read, entity: null, pan: null, fy: "24/25" }, [acme], [], "fy-2", null);
    expect(p.record).toBeNull();
    expect(p.missing).toEqual(expect.arrayContaining(["which company", "financial year"]));
  });

  it("merges a later upload into the same FY record and keeps the replaced version", () => {
    const first = proposeFy(read, [acme], [], "fy-1", "doc-3").record!;
    const again = proposeFy({ ...read, lines: [{ head: "reserves", amount: 2600000 }] }, [acme], [first], "fy-x", "doc-4");
    expect(again.record!.id).toBe("fy-1");
    expect(again.record!.audited.reserves).toBe(2600000);
    expect(again.record!.versions?.length).toBe(1);
    expect(again.record!.docIds).toEqual(["doc-3", "doc-4"]);
  });
});

describe("reviewed save to DocuRepo with module links", () => {
  const blank = (): PrefsSlice => ({ entities: [], assets: [], books: emptyBooks() });
  const doc = { id: "doc-1", title: "Uploaded original", docType: "other" as const, fieldLabels: ["GSTIN", "Mystery label"] };
  let seq = 0;
  const newId = () => `gen-${++seq}`;

  it("a confirmed company lands in entities, linked to its source document", () => {
    const read: EntityRead = { legalName: "New Co LLP", kind: "llp", pan: "AAAFN9999K", gstins: [], cin: "AAN-1234", incorporatedOn: "2021-02-01", address: null, people: [], shareholding: [], activities: [], fyEnd: null };
    const { profile } = proposeEntity(read, [], "ent-new", "2026-11-07");
    const out = commitIntake(blank(), { route: "entity", profile }, doc, "2026-11-07", newId);
    expect(out.entities.map((e) => e.id)).toContain("ent-new");
    expect(linksOf(out.books.docLinks, "doc-1").some((l) => l.kind === "entity" && l.targetId === "ent-new")).toBe(true);
    // Unknown printed labels are kept as proposed fields, never dropped or forced into a column.
    expect(out.books.proposedFields.some((f) => f.label === "Mystery label")).toBe(true);
  });

  it("a confirmed asset lands in the register with a received event and document links", () => {
    const read: AssetRead = { name: "Lathe Machine", kind: "machinery", owner: null, cost: 450000, purchaseDate: "2025-09-01", supplier: "Tools India", warrantyUntil: null, insurance: null, serial: "LT-009", putToUseOn: "2025-09-03", usefulLifeYears: 15, residualPct: 5 };
    const { asset } = proposeAsset(read, [], "asset-9", "doc-1");
    const out = commitIntake(blank(), { route: "asset", asset: asset! }, doc, "2026-11-07", newId);
    expect(out.assets.map((a) => a.id)).toContain("asset-9");
    expect(out.books.assetEvents.some((e) => e.assetId === "asset-9" && e.kind === "received" && e.docId === "doc-1")).toBe(true);
    expect(docsFor(out.books.docLinks, "asset", "asset-9")).toEqual(["doc-1"]);
  });

  it("a confirmed lease lands under its property with both links, and a re-upload never duplicates it", () => {
    const prop: Property = { id: "prop-1", name: "Anna Nagar Plot 44", address: "Chennai", buildings: [], docIds: [] } as Property;
    const slice = blank();
    slice.books = { ...slice.books, properties: [prop] };
    const read: LeaseRead = { tenant: "Bright Retail Co", property: "Anna Nagar", unit: null, start: "2026-04-01", end: "2029-03-31", rent: 75000, dueDay: 5, escalationPct: null, escalationEveryMonths: null, deposit: null, noticeDays: null, paymentTerms: null, gst: null };
    const { lease } = proposeLease(read, [prop], "lease-1", "doc-1");
    const once = commitIntake(slice, { route: "lease", lease: lease! }, doc, "2026-11-07", newId);
    expect(once.books.leases).toHaveLength(1);
    expect(linksOf(once.books.docLinks, "doc-1").some((l) => l.kind === "property" && l.targetId === "prop-1")).toBe(true);
    const twice = commitIntake({ ...slice, books: once.books }, { route: "lease", lease: { ...lease!, id: "lease-other" } }, doc, "2026-11-07", newId);
    expect(twice.books.leases).toHaveLength(1);
    expect(twice.books.leases[0]!.id).toBe("lease-1");
  });

  it("a confirmed audited FY record lands under its company, linked to the document", () => {
    const slice = blank();
    slice.entities = [acme];
    const read: AuditedRead = { entity: null, pan: "AAACA1234A", fy: "2024-25", lines: [{ head: "shareCapital", amount: 100000 }], totalAssets: null, totalLiabilities: null, schedules: ["balanceSheet"], qualifications: [], filedForm: null, ackNo: null, filedOn: null };
    const { record } = proposeFy(read, [acme], [], "fy-1", "doc-1");
    const out = commitIntake(slice, { route: "fy", record: record! }, doc, "2026-11-07", newId);
    expect(out.books.fyRecords).toHaveLength(1);
    expect(out.books.fyRecords[0]!.entityId).toBe("ent-acme");
    expect(linksOf(out.books.docLinks, "doc-1").some((l) => l.kind === "entity" && l.targetId === "ent-acme")).toBe(true);
  });
});

describe("naming and field labels", () => {
  it("builds the descriptive document name without dropping the original filename", () => {
    expect(autoName({ entity: "Acme Traders Private Limited", date: "2025-06-01", typeLabel: "Bank statement", identifier: "IDFC 1234" })).toBe("Acme Traders Private Limited / FY 2025-26 / Bank statement / IDFC 1234");
    expect(autoName({ entity: null, date: null, typeLabel: "Receipt" })).toBe("Personal / Receipt");
  });

  it("maps known labels to stored fields and leaves unknown labels as proposed fields", () => {
    expect(canonicalField("GSTIN")).toBeTruthy();
    expect(canonicalField("something never seen before")).toBeNull();
  });

  it("suggests a same-name company but never auto-matches on the name alone", () => {
    expect(nameSuggestion([acme], "Acme Traders Private Limited")?.id).toBe("ent-acme");
    expect(matchEntity([acme], { name: "Acme Traders Private Limited" })).toBeNull();
  });
});
