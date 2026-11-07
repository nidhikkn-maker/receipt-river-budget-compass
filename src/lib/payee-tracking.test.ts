import { describe, it, expect } from "vitest";
import { recipientAccount, recipientBalances, type Payee } from "./payees";
import type { Account, Txn } from "./ledger";
const payee: Payee = { id: "p1", name: "Ravi", type: "individual", identifiers: [], accountDetails: "", accountVerified: false, organisation: "", preferredCategory: "", archived: false };
const acct = (id: string, kind: Account["kind"]) => ({ id, name: id, kind, openingBalance: 0, archived: false, details: { payeeId: "p1" } }) as unknown as Account;
describe("money lent to / borrowed from outside recipients", () => {
  it("lending creates a receivable asset, borrowing a liability, both starting at 0", () => {
    expect(recipientAccount(payee, "lent")).toMatchObject({ kind: "other_asset", openingBalance: 0, details: { payeeId: "p1" } });
    expect(recipientAccount(payee, "borrowed")).toMatchObject({ kind: "other_liability", openingBalance: 0 });
  });
  it("refuses archived recipients", () => { expect(() => recipientAccount({ ...payee, archived: true }, "lent")).toThrow(); });
  it("outstanding = lent minus repaid", () => {
    const txns = [
      { id: "1", txnType: "transfer", accountId: "bank", toAccountId: "lent", amount: 10000, date: "2026-10-01" },
      { id: "2", txnType: "transfer", accountId: "lent", toAccountId: "bank", amount: 4000, date: "2026-10-20" },
    ] as unknown as Txn[];
    expect(recipientBalances("p1", [acct("lent", "other_asset")], txns).owedToYou).toBe(6000);
  });
});
