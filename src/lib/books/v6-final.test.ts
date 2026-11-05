import { describe, expect, it } from "vitest";
import { businessDaysBetween, marketOpen } from "./market";
import { receiptKind } from "./property";

describe("exchange holidays", () => {
  it("market is closed on Diwali 2026 trading holiday during session hours", () => {
    expect(marketOpen(new Date("2026-11-10T05:00:00Z"))).toBe(false);
    expect(marketOpen(new Date("2026-11-11T05:00:00Z"))).toBe(true);
  });
  it("staleness skips holidays when counting trading days", () => {
    // Mon 9 Nov → Thu 12 Nov 2026: 10th is a holiday, so only 11th and 12th count
    expect(businessDaysBetween(new Date("2026-11-09T00:00:00Z"), new Date("2026-11-12T00:00:00Z"))).toBe(2);
  });
});

describe("uncertain rent receipts", () => {
  const lease = { id: "l", propertyId: "p", tenant: "Ravi", rent: 30000, start: "2026-01-01", deposit: 90000 } as never;
  it("an unlabelled receipt above the rent waits for confirmation", () => {
    expect(receiptKind("NEFT Ravi", 45000, lease)).toBe("unconfirmed");
  });
  it("a receipt that says rent is still rent, and a partial payment is rent", () => {
    expect(receiptKind("Ravi rent Mar+Apr", 60000, lease)).toBe("rent");
    expect(receiptKind("NEFT Ravi", 20000, lease)).toBe("rent");
  });
});
