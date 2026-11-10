// C2 pure rules: K10 release info + service health, B05 notices, B04 calendar item detail, C03 bank account detail.
import { describe, expect, it } from "vitest";
import { KNOWN_LIMITATIONS, releaseInfo, serviceHealth } from "./release-info";
import { accountHref, buildNotices, groupNotices, loadRead, readStorageKey, saveRead } from "./notification-centre";
import { calendarItemDetail, parseCalendarItemId, type CalendarData } from "./calendar-item";
import { bankAccountDetail, maskedNumber, runningBalance } from "./bank-account-detail";
import { accountBalance, type Account } from "./ledger";
import { defaultPreferences } from "./preferences";
import { normalizeNotificationSettings } from "./notification-settings";
import type { InboxItem } from "./inbox";
import type { Expense } from "./expenses";
import type { Commitment } from "./planning";

describe("K10 release info", () => {
  it("shows only allow-listed build values, never keys or tokens", () => {
    const env = { MODE: "production", PROD: true, DEV: false, VITE_BUILD_COMMIT: "6e532f5", VITE_SUPABASE_PUBLISHABLE_KEY: "eyJhbGciOi.secret", SUPABASE_SERVICE_ROLE_KEY: "service-secret" };
    const info = releaseInfo(env, "thapal.example");
    expect(info).toEqual({ version: "Not recorded in this build", environment: "Production", build: "Production build", commit: "6e532f5", builtAt: "Not recorded in this build" });
    expect(JSON.stringify(info)).not.toMatch(/secret|eyJ/);
    expect(releaseInfo({ MODE: "development", DEV: true, PROD: false, VITE_BUILD_COMMIT: "not a sha; rm -rf" }, "127.0.0.1:8084")).toMatchObject({ environment: "Development (this computer)", build: "Development build", commit: "Not recorded in this build" });
  });
  it("reports health only from what the app checked, and failed reads as not deleted", () => {
    const rows = serviceHealth({ signedIn: true, online: true, loadErrors: ["documents"], pendingCount: 2, jobs: [{ name: "closing-prices", status: "ok", lastSuccess: "2026-11-01T18:00:00Z", reason: null }, { name: "rule-watch", status: "failed", lastSuccess: null, reason: "Source page moved" }], jobsFailed: false, worker: "none", today: "2026-11-10" });
    expect(rows.find((r) => r.key === "data")).toMatchObject({ state: "attention", detail: expect.stringContaining("Nothing has been deleted") });
    expect(rows.find((r) => r.key === "sync")?.state).toBe("attention");
    expect(rows.find((r) => r.key === "job:closing-prices")?.state).toBe("attention"); // 9 days old
    expect(rows.find((r) => r.key === "job:rule-watch")).toMatchObject({ state: "attention", detail: expect.stringContaining("Source page moved") });
    expect(serviceHealth({ signedIn: true, online: true, loadErrors: [], pendingCount: 0, jobs: null, jobsFailed: true, worker: "active", today: "2026-11-10" }).find((r) => r.key === "jobs")?.state).toBe("unknown");
    expect(KNOWN_LIMITATIONS.length).toBeGreaterThan(3);
  });
});

const bank: Account = { id: "bank", name: "HDFC current", kind: "current", openingBalance: 100000, archived: false, lastFour: "4417", issuer: "HDFC Bank" };
const card: Account = { id: "card", name: "Amex", kind: "credit_card", openingBalance: 0, archived: false };
const item = (o: Partial<InboxItem>): InboxItem => ({ key: "k", type: "uncategorised", title: "t", description: "d", amount: null, accountName: null, date: null, priority: "medium", action: "a", ...o });

describe("B05 notices", () => {
  const items = [
    item({ key: "uncategorised:1", transactionId: "1", title: "Swiggy", date: "2026-11-02" }), item({ key: "uncategorised:2", transactionId: "2", title: "Zomato", date: "2026-11-05" }),
    item({ key: "commit:c1:2026-11-12", type: "commitment", title: "Flat rent", description: "Due 2026-11-12", amount: 32000, commitmentId: "c1", date: "2026-11-12", priority: "medium" }),
    item({ key: "stale:bank:never:never", type: "unreconciled_account", title: "HDFC current", accountName: "HDFC current", priority: "high" }),
    item({ key: "dismissed-one", type: "audit", title: "Old check" }),
  ];
  const docs = [{ id: "d1", title: "Car insurance", expiresOn: "2026-11-20" }] as never;
  const notices = buildNotices({ items, dismissed: ["dismissed-one"], accounts: [bank, card], documents: docs, uploads: [{ id: "u1", at: "2026-11-09T10:00:00Z", label: "HDFC Oct", posted: [], reconciled: [], createdAccounts: [], status: "interrupted" }], today: "2026-11-10" });
  it("groups real sources by severity, newest first, with a direct destination; summarises per-entry items; honours dismissals", () => {
    expect(notices.map((n) => [n.group, n.severity, n.link.href])).toEqual([
      ["Statements & balances", "high", "/statements"],
      ["Statements & balances", "high", "/bank-account/bank"],
      ["Documents", "medium", "/vault"],
      ["Bills & payments", "medium", "/calendar-item?id=commitment%3Ac1&date=2026-11-12"],
      ["Entries to review", "medium", "/inbox?section=review&filter=category"],
    ]);
    expect(notices.find((n) => n.group === "Entries to review")?.title).toBe("2 entries need a category");
    expect(notices.some((n) => n.title === "Old check")).toBe(false);
    expect(accountHref(card)).toBe("/cards/card");
  });
  it("read marks are per owner, survive reload, prune notices that cleared, and never throw when storage is blocked", () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
    saveRead("owner-1", storage, new Set([notices[0]!.key, "gone"]), notices);
    expect(JSON.parse(mem.get(readStorageKey("owner-1"))!)).toEqual([notices[0]!.key]);
    expect(loadRead("owner-2", storage).size).toBe(0);
    const groups = groupNotices(notices, loadRead("owner-1", storage));
    expect(groups.find((g) => g.group === "Statements & balances")?.unread).toBe(1);
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(loadRead("owner-1", blocked).size).toBe(0);
    expect(() => saveRead("owner-1", blocked, new Set(["x"]), notices)).not.toThrow();
  });
});

describe("B04 calendar item", () => {
  const rent: Commitment = { id: "c1", name: "Office rent", kind: "rent", direction: "out", amount: 32000, frequency: "monthly", intervalDays: null, nextDue: "2026-11-28", accountId: "bank", category: "Rent", confirmed: true, essential: true, status: "active" };
  const data: CalendarData = { commitments: [rent], loans: [{ id: "l1", name: "SBI home", emi: 24000, nextDue: "2026-12-05", status: "active", accountId: null, provider: "SBI" }], documents: [], accounts: [bank], trips: [{ id: "t1", name: "Madurai", destination: "Madurai", start: "2026-12-20", end: "2026-12-23", travellers: ["KK"] }],
    entities: [{ id: "e1", name: "Thapal Ventures", kind: "company", pan: "", gstins: [], booksFrom: "2024-25" }], entityAccounts: { e1: ["bank"] }, reminderDays: 3, notifications: normalizeNotificationSettings({ trips: false }), today: "2026-11-10" };
  it("parses only known kinds and safe ids", () => {
    expect(parseCalendarItemId("commitment:c1")).toEqual({ kind: "commitment", id: "c1" });
    expect(parseCalendarItemId("expense:1")).toBeNull();
    expect(parseCalendarItemId("loan:../x")).toBeNull();
  });
  it("describes owner, source link, recurrence, next dates, reminder schedule; snooze and sync are labelled as not available", () => {
    const d = calendarItemDetail({ kind: "commitment", id: "c1" }, data)!;
    expect(d).toMatchObject({ title: "Office rent", owner: "Thapal Ventures", account: "HDFC current", recurrence: "Monthly", status: "Scheduled", source: { href: "/plan#commitment-c1" } });
    expect(d.upcoming.slice(0, 3)).toEqual(["2026-11-28", "2026-12-28", "2027-01-28"]);
    expect(d.reminder).toEqual({ on: true, text: expect.stringContaining("3 days before") });
    expect(d.snooze).toMatch(/Proposed/);
    expect(calendarItemDetail({ kind: "loan", id: "l1" }, data)).toMatchObject({ recurrence: "Monthly", owner: "You (personal)", upcoming: expect.arrayContaining(["2027-01-05"]) });
    expect(calendarItemDetail({ kind: "trip", id: "t1" }, data)?.reminder.on).toBe(false);
    expect(calendarItemDetail({ kind: "commitment", id: "missing" }, data)).toBeNull();
  });
});

describe("C03 bank account detail", () => {
  const e = (o: Partial<Expense>): Expense => ({ id: "x", title: "Entry", merchant: null, category: "Food", scope: "personal", memberId: null, splits: [], receipts: [], amount: 0, originalAmount: 0, currency: "INR", fxRate: 1, date: "2026-11-01", description: "", paymentMethod: "upi", accountId: "bank", reconciledAt: null, statementRef: null, ...o } as Expense);
  const txns = [e({ id: "a", amount: 32000, date: "2026-11-01", reconciledAt: "2026-11-05T00:00:00Z" }), e({ id: "b", amount: 59000, txnType: "income", date: "2026-11-03" }), e({ id: "c", amount: 10000, txnType: "transfer", accountId: "other", toAccountId: "bank", date: "2026-11-04" })];
  it("masks the number to the last four digits", () => { expect(maskedNumber("4417")).toBe("•••• 4417"); expect(maskedNumber("12345678")).toBe("Not recorded"); expect(maskedNumber(null)).toBe("Not recorded"); });
  it("running balance ends at the ledger balance, and every figure comes from ledger rules", () => {
    const rows = runningBalance(bank, txns);
    expect(rows.map((r) => [r.entry.id, r.effect, r.balanceAfter])).toEqual([["a", -32000, 68000], ["b", 59000, 127000], ["c", 10000, 137000]]);
    expect(rows.at(-1)!.balanceAfter).toBe(accountBalance(bank, txns));
    const d = bankAccountDetail(bank, { transactions: txns, preferences: defaultPreferences(), documents: [{ id: "s", title: "HDFC Oct", accountId: "bank", docType: "bank_statement", docDate: "2026-10-31" }] as never, entities: [], entityAccounts: {}, today: "2026-11-10" });
    expect(d).toMatchObject({ masked: "•••• 4417", institution: "HDFC Bank", owner: "You (personal)", balance: 137000, reconciledBalance: 68000, reconciliation: { matched: 1, total: 3 }, statements: [{ id: "s" }] });
    expect(d.recent.map((r) => r.entry.id)).toEqual(["c", "b", "a"]);
  });
});
