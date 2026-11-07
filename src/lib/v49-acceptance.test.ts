// Version 4.9 acceptance scenarios that can be proven from shared rules (see requirements-v4.9 §34).
import { describe, expect, it } from "vitest";
import { accountBalance, type Account } from "./ledger";
import { defaultPreferences, normalizePreferences } from "./preferences";
import { duplicateAccount, organisationUsage, renameTagIn } from "./master-data";
import { upsertInstrument, validateInstrument } from "./payment-instruments";
import { essentialsReady, setupStatus } from "./setup-status";

const acc = (x: Partial<Account>): Account => ({ id: "a", name: "HDFC", kind: "savings", openingBalance: 1000, archived: false, ...x } as Account);
const txns = [{ id: "t", date: "2026-10-01", amount: 200, txnType: "expense", accountId: "a" }] as never[];

describe("V4.9 acceptance", () => {
  it("4: UPI links only to a suitable account", () => {
    expect(() => validateInstrument({ id: "u", type: "upi", nickname: "GPay", handle: "me@okhdfc", accountId: "a" } as never, [acc({})])).not.toThrow();
    expect(() => validateInstrument({ id: "u", type: "upi", nickname: "GPay", handle: "me@okhdfc", accountId: "c" } as never, [acc({ id: "c", kind: "credit_card" })])).toThrow();
  });
  it("7: archived accounts can't receive new payment methods", () => {
    expect(() => validateInstrument({ id: "u", type: "upi", nickname: "G", handle: "me@okhdfc", accountId: "a" } as never, [acc({ archived: true })])).toThrow(/Link it/);
  });
  it("8 & 24: renaming or archiving an account keeps its history and balance", () => {
    const before = accountBalance(acc({}), txns);
    expect(accountBalance(acc({ name: "HDFC Regalia" }), txns)).toBe(before);
    expect(accountBalance(acc({ archived: true }), txns)).toBe(before);
    expect(before).toBe(800);
  });
  it("10 & 12: renaming an organisation updates entries without duplicating tags", () => {
    expect(renameTagIn(["Organisation: Acme", "Organisation: Acme Ltd"], "Organisation: Acme", "Organisation: Acme Ltd")).toEqual(["Organisation: Acme Ltd"]);
    expect(organisationUsage([{ group: "Organisation", name: "Acme" }], [{ tags: ["Organisation: Acme"] }, { tags: ["Organisation: Acme"] }])[0]!.uses).toBe(2);
  });
  it("14–16: entry, report-guide and theme preferences persist through save/load", () => {
    const saved = normalizePreferences(JSON.parse(JSON.stringify({ ...defaultPreferences(), defaultCurrency: "USD", themeName: "forest", theme: "dark", setupAssistant: "done" })));
    expect([saved.defaultCurrency, saved.theme, saved.setupAssistant]).toEqual(["USD", "dark", "done"]);
    expect(normalizePreferences({}).setupAssistant).toBe("pending");
  });
  it("19 & 20: setup status follows real records and the warning clears once fixed", () => {
    const empty = setupStatus({ accounts: [], expenses: [], preferences: defaultPreferences() });
    expect(essentialsReady(empty)).toBe(false);
    expect(essentialsReady(setupStatus({ accounts: [acc({})], expenses: [], preferences: defaultPreferences() }))).toBe(true);
  });
  it("21: archived names can be reused while archived records stay intact", () => {
    expect(duplicateAccount([acc({ id: "old", archived: true })], { name: "HDFC", kind: "savings" })).toBeNull();
  });
  it("22: duplicate master records are prevented", () => {
    expect(duplicateAccount([acc({})], { name: "hdfc", kind: "current" })).not.toBeNull();
    const one = upsertInstrument([], { id: "1", type: "upi", nickname: "GPay", handle: "me@okhdfc", accountId: "a" } as never, [acc({})]);
    expect(() => upsertInstrument(one, { id: "2", type: "upi", nickname: "Other", handle: "me@okhdfc", accountId: "a" } as never, [acc({})])).toThrow();
  });
});
