import { describe, expect, it } from "vitest";
import { correctedFields, learnedShopName, unconfirmedFields } from "./receipt-reading";

describe("Receipt corrections before confirming", () => {
  const read = { merchant: "Crem Centr", date: "2026-11-01", amount: 2265 };
  it("lists only the fields the owner changed", () => {
    expect(correctedFields(read, { merchant: "Cream Centre", date: "2026-11-01", amount: "2265" })).toEqual(["merchant"]);
    expect(correctedFields(read, { merchant: "crem centr ", date: "2026-11-02", amount: "2,265".replace(",", "") })).toEqual(["date"]);
    expect(correctedFields(read, { merchant: "Crem Centr", date: "2026-11-01", amount: "2256" })).toEqual(["total"]);
  });
  it("a corrected low-confidence field no longer needs a separate check", () => {
    const now = { merchant: "Cream Centre", date: "2026-11-01", amount: "2265" };
    const changed = correctedFields(read, now);
    const left = unconfirmedFields({ merchant: "low", total: "low" }, { merchant: now.merchant, date: now.date, total: now.amount }, {}).filter((f) => !changed.includes(f));
    expect(left).toEqual(["total"]);
  });
  it("remembers a corrected shop name for the next bill, using the saved spelling", () => {
    expect(learnedShopName("CREM CENTR", { "crem centr": "cream centre" }, ["Cream Centre"])).toBe("Cream Centre");
    expect(learnedShopName("Other Shop", { "crem centr": "cream centre" }, [])).toBeNull();
  });
});
