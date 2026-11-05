import { describe, it, expect } from "vitest";
import { latestByIsin, latestByIsinExchange, pickClose } from "./bhavcopy";
import { dynamicNetWorth } from "@/lib/books/market";
const rows = [
  { exchange: "NSE", isin: "INE002A01018", close: 1400, price_date: "2026-11-04", symbol: "RELIANCE" },
  { exchange: "BSE", isin: "INE002A01018", close: 1401.5, price_date: "2026-11-04", symbol: "500325" },
];
describe("NSE and BSE kept separate", () => {
  it("uses the holding's own exchange", () => {
    const a = latestByIsin(rows), b = latestByIsinExchange(rows);
    expect(pickClose(a, b, "INE002A01018", "BSE")?.close).toBe(1401.5);
    expect(pickClose(a, b, "INE002A01018", "NSE")?.close).toBe(1400);
    expect(pickClose(a, b, "INE002A01018")?.close).toBe(1400);
  });
  it("never borrows the other exchange's price", () => {
    const b = latestByIsinExchange([rows[0]!]);
    expect(pickClose(new Map(), b, "INE002A01018", "BSE")).toBeUndefined();
  });
  it("each net-worth part carries its own as-of date", () => {
    const nw = dynamicNetWorth({ bank: 1, bankBasis: "", investments: [], demat: 0, dematBasis: "", otherAssets: 0, property: 0, propertyBasis: "", liabilities: 0, liabilitiesBasis: "", asOf: { bank: "2026-11-03", investments: "2026-11-04", liabilities: "2026-10-31" } });
    expect(nw.assets[0]!.asOf).toBe("2026-11-03");
    expect(nw.assets[1]!.asOf).toBe("2026-11-04");
    expect(nw.liabilitiesAsOf).toBe("2026-10-31");
  });
});
import { fmtIst } from "@/lib/books/market";
describe("price times", () => {
  it("shows exchange close time in IST", () => { expect(fmtIst("2026-11-04T10:00:00.000Z")).toBe("4 Nov 2026, 15:30 IST"); expect(fmtIst("x")).toBe("unknown"); });
});
