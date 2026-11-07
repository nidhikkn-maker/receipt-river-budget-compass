import { describe, expect, it } from "vitest";
import { essentialsReady, setupStatus } from "./setup-status";
import { defaultPreferences } from "./preferences";
import type { Account } from "./ledger";
import type { Expense } from "./expenses";

const acc = (x: Partial<Account>): Account => ({ id: "a", name: "HDFC", kind: "savings", openingBalance: 0, archived: false, ...x } as Account);
const get = (items: ReturnType<typeof setupStatus>, k: string) => items.find((i) => i.key === k)!.state;

describe("financial setup status", () => {
  it('reimbursement configuration stays optional and depends on saved profiles', () => {
    const p = defaultPreferences();
    expect(get(setupStatus({ accounts: [], expenses: [], preferences: p }), 'reimbursements')).toBe('not_configured');
    expect(setupStatus({ accounts: [], expenses: [], preferences: p }).find(i => i.key === 'reimbursements')?.essential).toBe(false);
  });
  it("no accounts means accounts not configured and essentials missing", () => {
    const s = setupStatus({ accounts: [], expenses: [], preferences: defaultPreferences() });
    expect(get(s, "accounts")).toBe("not_configured");
    expect(essentialsReady(s)).toBe(false);
  });
  it("archived accounts don't count; adding a usable account makes it ready", () => {
    expect(get(setupStatus({ accounts: [acc({ archived: true })], expenses: [], preferences: defaultPreferences() }), "accounts")).toBe("not_configured");
    const s = setupStatus({ accounts: [acc({})], expenses: [], preferences: defaultPreferences() });
    expect(get(s, "accounts")).toBe("ready");
    expect(essentialsReady(s)).toBe(true);
  });
  it("credit card without limit or due day requires attention", () => {
    expect(get(setupStatus({ accounts: [acc({ kind: "credit_card" })], expenses: [], preferences: defaultPreferences() }), "accounts")).toBe("attention");
  });
  it("organisations are optional unless business/official expenses exist", () => {
    const p = { ...defaultPreferences(), tags: [] };
    expect(get(setupStatus({ accounts: [], expenses: [], preferences: p }), "organisations")).toBe("optional");
    expect(get(setupStatus({ accounts: [], expenses: [{ scope: "business" } as Expense], preferences: p }), "organisations")).toBe("partial");
  });
  it("payment method linked to a missing account requires attention", () => {
    const p = { ...defaultPreferences(), paymentInstruments: [{ id: "i", type: "upi", nickname: "GPay", accountId: "gone" }] } as never;
    expect(get(setupStatus({ accounts: [acc({})], expenses: [], preferences: p }), "methods")).toBe("attention");
  });
});

import { duplicateAccount, organisationUsage } from "./master-data";
import { validateInstrument } from "./payment-instruments";
describe("master record duplicates", () => {
  it("blocks a second active account with the same name (case/space-insensitive) but allows archived names and self-rename", () => {
    const list = [acc({ id: "1", name: "HDFC Savings" }), acc({ id: "2", name: "Old", archived: true })];
    expect(duplicateAccount(list, { name: " hdfc  savings", kind: "savings" })?.id).toBe("1");
    expect(duplicateAccount(list, { name: "Old", kind: "savings" })).toBeNull();
    expect(duplicateAccount(list, { id: "1", name: "HDFC Savings", kind: "savings" })).toBeNull();
  });
  it("blocks the same card last-4 twice", () => {
    expect(duplicateAccount([acc({ id: "c", name: "Amex", kind: "credit_card", lastFour: "1234" })], { name: "Amex Gold", kind: "credit_card", lastFour: "1234" })?.id).toBe("c");
  });
  it("blocks a duplicate UPI ID", () => {
    const a = [acc({ id: "a" })];
    const first = { id: "p1", type: "upi", nickname: "GPay", handle: "me@okhdfc", accountId: "a" } as never;
    expect(() => validateInstrument({ id: "p2", type: "upi", nickname: "PhonePe", handle: "ME@okhdfc", accountId: "a" } as never, a, [first])).toThrow(/already saved/);
  });
  it("organisation usage counts entries that reference it", () => {
    expect(organisationUsage([{ group: "Organisation", name: "Acme" }, { group: "Person", name: "X" }], [{ tags: ["Organisation: Acme"] }, { tags: [] }])).toEqual([{ name: "Acme", uses: 1 }]);
  });
});
