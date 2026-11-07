import { describe, expect, it } from "vitest";
import { cardBalanceSeries, cardRecency, cardTrendKeys, monthEndPoint, shortCardName, statementCaption, updatedCaption, type CardRecord } from "./card-trend";
import type { Account } from "./ledger";

const card: Account = { id: "c", name: "AMEX", kind: "credit_card", openingBalance: 0, archived: false };
const card2: Account = { id: "c2", name: "AMEX", kind: "credit_card", openingBalance: 0, archived: false };
const bank: Account = { id: "b", name: "HDFC", kind: "savings", openingBalance: 200000, archived: false };

const buy = (id: string, date: string, amount: number, extra: Partial<CardRecord> = {}): CardRecord =>
  ({ id, date, amount, accountId: "c", txnType: "expense", ...extra });
const pay = (id: string, date: string, amount: number, extra: Partial<CardRecord> = {}): CardRecord =>
  ({ id, date, amount, accountId: "b", toAccountId: "c", txnType: "card_payment", ...extra });

describe("card recency", () => {
  it("takes the statement date from the newest imported statement line, not the newest entry", () => {
    const r = cardRecency(card, [buy("p1", "2026-10-31", 100, { statementRef: "amex-2026-10" }), buy("p2", "2026-11-02", 50)], null);
    expect(r).toMatchObject({ statementDate: "2026-10-31", basis: "imported", latestEntry: "2026-11-02" });
  });
  it("prefers a statement balance the owner entered when it is the newer evidence", () => {
    const r = cardRecency(card, [buy("p1", "2026-10-31", 100, { statementRef: "amex-2026-10" })], "2026-11-05");
    expect(r).toMatchObject({ statementDate: "2026-11-05", basis: "entered" });
  });
  it("says the newest entry when no statement was imported or entered", () => {
    const r = cardRecency(card, [buy("p1", "2026-06-12", 100)], null);
    expect(r).toMatchObject({ statementDate: "2026-06-12", basis: "latest_entry" });
    expect(statementCaption(r)).toBe("No statement yet — newest entry 12 Jun 2026");
  });
  it("reports no statement for a card with nothing recorded", () => {
    const r = cardRecency(card, [buy("p1", "2026-06-12", 100, { accountId: "b" })], null);
    expect(r).toMatchObject({ statementDate: null, basis: "none", latestEntry: null });
    expect(statementCaption(r)).toBe("No statement on file yet");
    expect(updatedCaption(r)).toBe("Nothing recorded yet");
  });
  it("keeps the newest write time across the card's records", () => {
    const r = cardRecency(card, [buy("p1", "2026-10-31", 100, { updatedAt: "2026-11-01T12:25:34.432+00:00" }), buy("p2", "2026-10-30", 50, { updatedAt: "2026-11-01T18:29:07.515+00:00" })], null);
    expect(r.lastUpdated).toBe("2026-11-01T18:29:07.515+00:00");
    expect(updatedCaption(r)).toContain("1 Nov 2026");
  });
});

describe("balance series", () => {
  it("shows amount owed above zero and credit below zero at each month end", () => {
    const s = cardBalanceSeries([card], [buy("p1", "2026-08-10", 10000), pay("x1", "2026-09-05", 12000)], 4, "2026-11-15");
    expect(s.map((p) => p.label)).toEqual(["Aug", "Sep", "Oct", "Nov"]);
    expect(s.map((p) => p["AMEX"])).toEqual([10000, -2000, -2000, -2000]);
    expect(s.at(-1)?.date).toBe("2026-11-15");
  });
  it("leaves months before a card's first entry empty instead of guessing a balance", () => {
    const s = cardBalanceSeries([card], [buy("p1", "2026-10-10", 500)], 3, "2026-11-15");
    expect(s.map((p) => p["AMEX"])).toEqual([null, 500, 500]);
  });
  it("ignores other accounts' entries when tracking this card", () => {
    const s = cardBalanceSeries([card], [{ id: "z", date: "2026-10-01", amount: 900, accountId: "b", txnType: "expense" }], 2, "2026-11-15");
    expect(s.map((p) => p["AMEX"])).toEqual([null, null]);
  });
  it("keeps two cards with the same name on separate lines", () => {
    expect(cardTrendKeys([card, card2])).toEqual(["AMEX", "AMEX (2)"]);
    const s = cardBalanceSeries([card, card2], [buy("p1", "2026-10-10", 500), { id: "q", date: "2026-10-11", amount: 700, accountId: "c2", txnType: "expense" }], 1, "2026-11-15");
    expect(s[0]).toMatchObject({ AMEX: 500, "AMEX (2)": 700 });
  });
  it("caps the current month's point at today", () => {
    expect(monthEndPoint("2026-11-15", 0)).toBe("2026-11-15");
    expect(monthEndPoint("2026-11-15", 1)).toBe("2026-10-31");
    expect(monthEndPoint("2026-03-05", 1)).toBe("2026-02-28");
  });
});

describe("chart labels", () => {
  it("shortens a trailing account number to its last four digits", () => {
    expect(shortCardName({ ...card, name: "AMEX 379854902711004" })).toBe("AMEX …1004");
    expect(shortCardName({ ...card, name: "ICICI EMERALD 5524181001631039" })).toBe("ICICI EMERALD …1039");
    expect(shortCardName({ ...card, name: "ICICI Amazon Pay card" })).toBe("ICICI Amazon Pay card");
  });
  it("charts a numbered card under its short label", () => {
    const s = cardBalanceSeries([{ ...card, name: "AMEX 379854902711004" }], [buy("p1", "2026-10-10", 500)], 1, "2026-11-15");
    expect(s[0]).toMatchObject({ "AMEX …1004": 500 });
  });
});
