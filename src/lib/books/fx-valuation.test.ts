/** v6.1 §2 — relevant currencies: non-INR prices convert only through owner-entered FX rates, never guessed. */
import { describe, expect, it } from "vitest";
import { fxFor, valueHolding } from "./market";
import { cleanBooks, emptyBooks, type FxRate, type Holding, type Quote } from "./types";

const alerts = { portfolioMovePct: 5, staleNavDays: 3, missingPrices: true, corporateActions: true, quantityMismatch: true, unusualValuationPct: 20 };
const now = new Date("2026-11-07T10:00:00Z");
const holding: Holding = { id: "h1", kind: "etf", name: "US Index ETF", symbol: "USIX", exchange: "NSE", quantity: 10, sharePct: 100, source: "entered by you" };
const usdQuote: Quote = { key: "NSE:USIX", price: 82.1, at: "2026-11-06T10:00:00Z", provider: "statement", freshness: "statement", refreshedAt: "2026-11-06T10:00:00Z", currency: "USD" };
const rates: FxRate[] = [{ from: "USD", rate: 83.2, date: "2026-11-06", source: "entered by you" }];

describe("currency-aware valuation", () => {
  it("values a foreign-currency price through the owner-entered rate", () => {
    const v = valueHolding(holding, [usdQuote], undefined, now, alerts, rates);
    expect(v.value).toBe(Math.round(10 * 82.1 * 83.2 * 100) / 100);
    expect(v.note).toContain("USD");
    expect(v.note).toContain("83.2");
  });

  it("never guesses a rate — a foreign price without one stays unvalued", () => {
    const v = valueHolding(holding, [usdQuote], undefined, now, alerts, []);
    expect(v.value).toBeNull();
    expect(v.note).toContain("add a USD→INR rate");
  });

  it("leaves INR prices untouched when no rates exist", () => {
    const q: Quote = { ...usdQuote, currency: undefined };
    const v = valueHolding(holding, [q], undefined, now, alerts, []);
    expect(v.value).toBe(Math.round(10 * 82.1 * 100) / 100);
  });

  it("uses the latest dated rate when several exist", () => {
    const older: FxRate = { from: "USD", rate: 80, date: "2026-10-01", source: "entered by you" };
    expect(fxFor("USD", [older, ...rates])?.rate).toBe(83.2);
    const v = valueHolding(holding, [usdQuote], undefined, now, alerts, [older, ...rates]);
    expect(v.value).toBe(Math.round(10 * 82.1 * 83.2 * 100) / 100);
  });

  it("marks a value stale when its FX rate is over 30 days old", () => {
    const stale: FxRate = { from: "USD", rate: 83.2, date: "2026-09-01", source: "entered by you" };
    const v = valueHolding(holding, [usdQuote], undefined, now, alerts, [stale]);
    expect(v.value).not.toBeNull();
    expect(v.stale).toBe(true);
    expect(v.note).toContain("rate over 30 days old");
  });

  it("respects ownership share after conversion", () => {
    const v = valueHolding({ ...holding, sharePct: 50 }, [usdQuote], undefined, now, alerts, rates);
    expect(v.value).toBe(Math.round(10 * 82.1 * 83.2 * 0.5 * 100) / 100);
  });

  it("cleanBooks keeps valid rates and drops invalid ones", () => {
    const cleaned = cleanBooks({ ...emptyBooks(), fxRates: [...rates, { from: "usd", rate: 1, date: "2026-11-06", source: "x" }, { from: "INR", rate: 1, date: "2026-11-06", source: "x" }, { from: "EUR", rate: -1, date: "2026-11-06", source: "x" }] });
    expect(cleaned.fxRates).toEqual(rates);
  });
});
