import { describe, expect, it } from "vitest";
import { cardUtilisationSeries, loanProgress, savingsTrend, subscriptionSpendSeries } from "./insights";
import type { Account, Txn } from "./ledger";

const t = (id: string, date: string, amount: number, extra: Partial<Txn & { merchant: string; title: string; category: string }> = {}) => ({ id, date, amount, txnType: "expense" as const, accountId: null, merchant: null, title: "x", category: "Other", ...extra });

describe("insights charts", () => {
  it("subscription spend matches subscription names and scheduled monthly cost", () => {
    const s = subscriptionSpendSeries([t("a", "2026-10-03", 649, { merchant: "Netflix India" }), t("b", "2026-10-04", 300, { merchant: "Cafe" })],
      [{ name: "Netflix", kind: "subscription", amount: 649, frequency: "monthly", status: "active" }, { name: "Prime", kind: "subscription", amount: 1500, frequency: "yearly", status: "active" }], "2026-10-31", 2);
    expect(s[1]).toMatchObject({ month: "2026-10", spent: 649, scheduled: 774 });
    expect(s[0]!.spent).toBe(0);
  });
  it("card utilisation is owed / limit at month end; card payments lower it", () => {
    const card = { id: "c", name: "AMEX", kind: "credit_card", openingBalance: 0, creditLimit: 100000 } as Account;
    const tx = [t("1", "2026-09-10", 30000, { accountId: "c" }), { ...t("2", "2026-10-05", 20000), txnType: "transfer" as const, accountId: "bank", toAccountId: "c" }] as Txn[];
    const s = cardUtilisationSeries([card], tx, "2026-10-31", 2);
    expect(s.map((x) => x.AMEX)).toEqual([30, 10]);
  });
  it("loan progress compares outstanding with original", () => {
    expect(loanProgress([{ name: "Car", original: 500000, principal: 375000, status: "active" }, { name: "Bad", original: 0, principal: 1, status: "active" }]))
      .toEqual([{ name: "Car", original: 500000, outstanding: 375000, paid: 125000, pct: 25, closed: false }]);
  });
  it("savings trend is income minus spending, transfers excluded", () => {
    const s = savingsTrend([{ ...t("i", "2026-10-01", 50000), txnType: "income" }, t("e", "2026-10-02", 20000), { ...t("x", "2026-10-03", 9000), txnType: "transfer" }] as Txn[], "2026-10-31", 1);
    expect(s[0]).toMatchObject({ saved: 30000, cumulative: 30000, rate: 60 });
  });
});
