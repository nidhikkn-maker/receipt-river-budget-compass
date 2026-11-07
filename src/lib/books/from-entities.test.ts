import { describe, expect, it } from "vitest";
import { fromEntities, remunerationCap, withEntityIncome } from "./from-entities";
import { stubEntity, effectiveEntity, affectedByMove } from "./entity-accounts";
import { companySummary } from "../company-summary";

const paid = { salary: 0, remuneration: 0, capitalInterest: 0, dividend: 0, loans: 0, rent: 0, interest: 0 };
const ent = (kind: "proprietorship" | "partnership" | "company") => ({ ...stubEntity("X", kind, "2026-11-05"), id: kind });

describe("business income in personal tax", () => {
  it("proprietorship profit is added as business income", () => {
    const l = fromEntities([{ entity: ent("proprietorship"), profit: 800000, paid }]);
    expect(l).toEqual([expect.objectContaining({ head: "business", amount: 800000 })]);
  });
  it("partnership share exempt, remuneration taxed within s.40(b)", () => {
    expect(remunerationCap(1000000)).toBe(540000 + 240000);
    const l = fromEntities([{ entity: ent("partnership"), profit: 1000000, paid: { ...paid, remuneration: 900000, capitalInterest: 150000 }, capital: 1000000 }]);
    expect(l.find((x) => x.basis.startsWith("Partner remuneration"))?.amount).toBe(780000);
    expect(l.find((x) => x.basis.startsWith("Interest on capital"))?.amount).toBe(120000);
    expect(l.find((x) => x.head === "exempt")?.amount).toBe(1000000);
  });
  it("company profit excluded, dividend included", () => {
    const l = fromEntities([{ entity: ent("company"), profit: 5000000, paid: { ...paid, dividend: 200000 } }]);
    expect(l.filter((x) => x.head !== "flag").map((x) => [x.head, x.amount])).toEqual([["otherSources", 200000]]);
  });
  it("deemed dividend only with ≥10% holding and known accumulated profits", () => {
    expect(fromEntities([{ entity: ent("company"), profit: 0, paid: { ...paid, loans: 500000 }, holdingPct: 50, accumulatedProfits: 300000 }])[0]?.amount).toBe(300000);
    expect(fromEntities([{ entity: ent("company"), profit: 0, paid: { ...paid, loans: 500000 } }])[0]?.head).toBe("flag");
  });
  it("adds into personal heads", () => {
    const c = { salary: 0, houseProperty: { rent: 0, standardDeduction: 0, homeLoanInterest: 0, net: 0 }, business: { receipts: 0, expenses: 0, depreciation: 0, net: 0 }, capitalGains: { short: 0, long: 0 }, otherSources: 0, gross: 0, lossesSetOff: 0, total: 0, notes: [] };
    expect(withEntityIncome(c, fromEntities([{ entity: ent("proprietorship"), profit: 100, paid }])).total).toBe(100);
  });
});

describe("company on entries", () => {
  const map = { c1: ["a1"] };
  it("hand-picked company kept when account moves; others follow the account", () => {
    expect(effectiveEntity({ accountId: "a1", entitySource: "manual", entityId: "c2" }, map)).toBe("c2");
    expect(effectiveEntity({ accountId: "a1" }, map)).toBe("c1");
    expect(affectedByMove([{ accountId: "a1" }, { accountId: "a1", entitySource: "manual" }], "a1")).toBe(1);
  });
  it("transfers between own companies are not spending", () => {
    const rows = companySummary([
      { id: "1", date: "2026-05-01", amount: 100, category: "Rent", accountId: "a1" },
      { id: "2", date: "2026-05-02", amount: 50, category: "", txnType: "transfer", accountId: "a1", toAccountId: "p1" },
    ], map, "2026-04-01", "2027-03-31");
    expect(rows).toEqual([expect.objectContaining({ key: "c1", spent: 100, interCompany: 50 })]);
  });
});
