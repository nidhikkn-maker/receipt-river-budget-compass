import { describe, expect, it } from "vitest";
import { essentialsReady, setupStatus } from "./setup-status";
import { defaultPreferences } from "./preferences";
import type { Account } from "./ledger";
import type { Expense } from "./expenses";

const acc = (x: Partial<Account>): Account => ({ id: "a", name: "HDFC", kind: "savings", openingBalance: 0, archived: false, ...x } as Account);
const get = (items: ReturnType<typeof setupStatus>, k: string) => items.find((i) => i.key === k)!.state;

describe("financial setup status", () => {
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
