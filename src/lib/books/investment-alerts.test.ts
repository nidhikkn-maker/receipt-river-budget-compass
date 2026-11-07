import { describe, expect, it } from "vitest";
import { mergeInvestmentDoc, type InvestDoc, type StoredHolding } from "../investments/demat";
import { statementActionAlerts } from "./investment-alerts";
import { valuationAlerts } from "./market";
import { DEFAULT_ALERTS } from "./types";

const holding: StoredHolding = { isin: "INE002A01018", name: "Reliance", quantity: 100, asOf: "2026-10-31", statementValue: 200000, lots: [], gains: [], sources: [] };
const doc: InvestDoc = { kind: "transactions", broker: "ICICI Direct", dpId: "", clientId: "", holder: "", asOf: null, holdings: [], trades: [], gains: [], events: [{ date: "2026-10-20", isin: holding.isin, name: holding.name, kind: "bonus", quantity: 100, amount: null }] };

describe("saved statement action alerts", () => {
  it("retains a bonus with its original evidence without changing quantity or trades", () => {
    const result = mergeInvestmentDoc([holding], doc, "document-1");
    expect(result.holdings[0]?.events).toEqual([{ ...doc.events?.[0], source: "document-1" }]);
    expect(result.holdings[0]?.quantity).toBe(100);
    expect(result.holdings[0]?.lots).toEqual([]);
    expect(holding.events).toBeUndefined();
  });
  it("reimporting the same action retains one alert and the first source", () => {
    const first = mergeInvestmentDoc([holding], doc, "document-1");
    const second = mergeInvestmentDoc(first.holdings, doc, "document-2");
    expect(second.holdings[0]?.events).toHaveLength(1);
    expect(second.holdings[0]?.events?.[0]?.source).toBe("document-1");
    expect(statementActionAlerts([{ id: "account", holdings: second.holdings }])).toHaveLength(1);
  });
  it("unknown securities remain unmatched rather than creating holdings", () => {
    expect(mergeInvestmentDoc([], doc, "document-1").unmatched).toEqual([{ isin: holding.isin, name: "Reliance" }]);
    expect(mergeInvestmentDoc([], doc, "document-1").holdings).toEqual([]);
  });
  it("surfaces bonuses and dividends only when corporate-action alerts are enabled", () => {
    const merged = mergeInvestmentDoc([holding], { ...doc, events: [...(doc.events ?? []), { date: "2026-10-21", isin: holding.isin, name: holding.name, kind: "dividend", quantity: null, amount: 500 }] }, "document-1");
    const actions = statementActionAlerts([{ id: "account", holdings: merged.holdings }]);
    expect(actions).toHaveLength(2);
    expect(valuationAlerts([], [], DEFAULT_ALERTS, {}, [], actions)).toHaveLength(2);
    expect(valuationAlerts([], [], { ...DEFAULT_ALERTS, corporateActions: false }, {}, [], actions)).toEqual([]);
  });
  it("undo snapshots keep previous events unchanged", () => {
    const before = mergeInvestmentDoc([holding], doc, "document-1").holdings;
    const after = mergeInvestmentDoc(before, { ...doc, events: [{ date: "2026-10-22", isin: holding.isin, name: holding.name, kind: "split", quantity: 200, amount: null }] }, "document-2").holdings;
    expect(before[0]?.events).toHaveLength(1);
    expect(after[0]?.events).toHaveLength(2);
  });
});