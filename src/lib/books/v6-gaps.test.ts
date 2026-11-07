import { describe, expect, it } from "vitest";
import type { Asset } from "../assets";
import type { EntityProfile } from "../entities";
import type { Lease, Property } from "./types";
import { applyEvent, capitalise, depreciationEntry, depreciationExceptions, disposalResult, dueMonths, stableUuid, suggestPayment } from "./assets-ledger";
import { monthlyBook } from "./depreciation";
import { allocateReceipts, receiptKind } from "./property";
import { matchEntity, nameSuggestion } from "./intake";

const asset = (x: Partial<Asset> = {}): Asset => ({ id: "a1", name: "Laptop", kind: "computer", cost: 120000, inUse: "2026-04-01", sharePct: 100, bookMethod: "slm", bookRatePct: 0, usefulLifeYears: 5, residualPct: 0, accountId: "acc-asset", ...x } as Asset);

describe("assets in the shared ledger", () => {
  it("posts one month's depreciation as a non-cash entry on the asset's own account", () => {
    const r = depreciationEntry({ id: "j", assetId: "a1", period: "2026-05", amount: 2000, kind: "book", status: "prepared" }, asset(), []);
    expect(r).toEqual({ ok: true, entry: expect.objectContaining({ accountId: "acc-asset", amount: 2000, date: "2026-05-31", category: "Depreciation" }) });
  });
  it("refuses closed months and assets without a ledger account", () => {
    const j = { id: "j", assetId: "a1", period: "2026-05", amount: 2000, kind: "book" as const, status: "prepared" as const };
    expect(depreciationEntry(j, asset(), [{ id: "p", from: "2026-04-01", to: "2026-06-30", closedOn: "2026-07-01", note: "" }]).ok).toBe(false);
    expect(depreciationEntry(j, asset({ accountId: undefined }), []).ok).toBe(false);
    expect(depreciationExceptions(asset({ accountId: undefined }))).toContain("no ledger asset account to post to");
  });
  it("gives the same entry id for the same asset and month, so a retry never posts twice", async () => {
    expect(await stableUuid("depreciation", "a1", "2026-05")).toBe(await stableUuid("depreciation", "a1", "2026-05"));
    expect(await stableUuid("depreciation", "a1", "2026-05")).not.toBe(await stableUuid("depreciation", "a1", "2026-06"));
    expect(await stableUuid("x")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it("lists only completed months not yet prepared", () => {
    const due = dueMonths(asset(), [{ id: "j", assetId: "a1", period: "2026-04", amount: 2000, kind: "book", status: "posted" }], "2026-07-15");
    expect(due).toEqual(["2026-05", "2026-06"]);
  });
  it("lifecycle events change the register", () => {
    const a = asset();
    expect(applyEvent(a, { id: "e", assetId: "a1", date: "2026-06-01", kind: "custodian", note: "", to: "Priya" }).custodian).toBe("Priya");
    expect(applyEvent(a, { id: "e", assetId: "a1", date: "2026-06-01", kind: "transfer", note: "", to: "Sales" }).department).toBe("Sales");
    expect(applyEvent(a, { id: "e", assetId: "a1", date: "2026-06-01", kind: "missing", note: "" }).condition).toBe("missing");
    const sold = applyEvent(a, { id: "e", assetId: "a1", date: "2026-09-30", kind: "disposal", note: "", value: 100000 });
    expect(sold.soldOn).toBe("2026-09-30");
    expect(disposalResult(sold)?.proceeds).toBe(100000);
  });
  it("an impairment lowers book value from its month", () => {
    const before = monthlyBook(asset(), "2026-06").at(-1)!.nbv;
    const imp = applyEvent(asset(), { id: "e", assetId: "a1", date: "2026-06-10", kind: "impairment", note: "", value: 10000 });
    expect(monthlyBook(imp, "2026-06").at(-1)!.nbv).toBeLessThan(before - 9000);
  });
  it("continues from an imported prior-year written-down value", () => {
    const a = asset({ inUse: "2022-04-01", openingWdv: { fy: "2026-27", book: 50000, tax: 40000 } } as Partial<Asset>);
    expect(monthlyBook(a, "2026-04")[0]).toMatchObject({ month: "2026-04" });
    expect(monthlyBook(a, "2026-04")[0]!.nbv).toBeLessThan(50000);
  });
  it("suggests a payment only when one clearly matches amount, date and supplier", () => {
    const a = asset({ purchaseDate: "2026-04-01", supplier: "Croma Retail" } as Partial<Asset>);
    expect(suggestPayment(a, [{ id: "t1", date: "2026-04-03", amount: 120000, text: "CROMA RETAIL POS" }, { id: "t2", date: "2026-04-20", amount: 120000, text: "NEFT other" }])).toBe("t1");
    expect(suggestPayment(a, [{ id: "t2", date: "2026-06-20", amount: 120000, text: "Croma" }])).toBeNull();
  });
  it("capitalisation follows the approved limit, and asks when none is set", () => {
    expect(capitalise(4000, 5000)).toBe("expense");
    expect(capitalise(5000, 5000)).toBe("capitalise");
    expect(capitalise(5000, undefined)).toBe("ask");
  });
});

describe("rent matching", () => {
  const p: Property = { id: "p1", name: "Anna Nagar flat", address: "", buildings: [], docIds: [] } as unknown as Property;
  const l1: Lease = { id: "l1", propertyId: "p1", tenant: "Ravi", start: "2026-01-01", end: "2027-01-01", rent: 30000, paymentTerms: "" } as Lease;
  const l2: Lease = { id: "l2", propertyId: "p1", tenant: "Meena", start: "2026-01-01", end: "2027-01-01", rent: 30000, paymentTerms: "" } as Lease;
  it("gives each receipt to one lease only", () => {
    const r = allocateReceipts([l1, l2], [p], [{ id: "r1", date: "2026-05-05", amount: 30000, text: "NEFT RAVI rent" }, { id: "r2", date: "2026-05-05", amount: 30000, text: "Anna Nagar flat" }]);
    expect(r.byLease["l1"]!.map((x) => x.id)).toEqual(["r1"]);
    expect(r.byLease["l2"]).toEqual([]);
    expect(r.ambiguous.map((x) => x.id)).toEqual(["r2"]);
  });
  it("a security deposit is never counted as rent", () => {
    expect(receiptKind("Security deposit Ravi", 90000, { ...l1, deposit: 90000 })).toBe("deposit");
  });
});

describe("company matching", () => {
  const e = (x: Partial<EntityProfile>): EntityProfile => ({ id: "e1", name: "Krupa Exports Private Limited", kind: "company", pan: "AABCK1234F", gstins: [], ...x } as EntityProfile);
  it("matches automatically only on PAN, CIN or GSTIN", () => {
    expect(matchEntity([e({})], { pan: "aabck1234f" })?.by).toBe("PAN");
    expect(matchEntity([e({})], { name: "Krupa Exports Private Limited" })).toBeNull();
  });
  it("a same-name company is only a suggestion", () => {
    expect(nameSuggestion([e({})], "Krupa Exports Private Limited")?.id).toBe("e1");
  });
});
