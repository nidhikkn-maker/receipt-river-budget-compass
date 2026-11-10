// Coordinator check (Track D, KK 10 Nov 2026): archived account, closed account and disposed asset treatment, driven by
// actual accounting events and compared with INDEPENDENTLY hand-calculated net worth on every net-worth reader:
// Home/assistant (position), the Wealth report (buildReportDoc 'wealth') and the Books/Wealth page (computeNetWorth).
// Rule: archiving never changes a figure; only a real event (closing transfer, disposal) does. Fixture data only.
import { describe, expect, it } from "vitest";
import { computeNetWorth } from "@/components/books/useBooks";
import { emptyBooks } from "@/lib/books/types";
import { position } from "./position";
import { buildReportDoc, emptyFilters, type ReportData } from "./report-centre";
import type { Account, Txn } from "./ledger";

const acc = (id: string, name: string, kind: Account["kind"], openingBalance: number, archived = false): Account => ({ id, name, kind, openingBalance, archived });
const ACCOUNTS: Account[] = [
  acc("sb", "HDFC Savings", "savings", 100000),
  // Closed account: its whole balance was moved out by a real closing transfer, THEN it was archived.
  acc("old", "SBI Savings (closed)", "savings", 50000, true),
  // Archived but never closed or redeemed: still owned.
  acc("fd", "SBI fixed deposit", "fixed_deposit", 200000, true),
  // Archived card that still owes 10,000 (no payment yet): the debt stays in net worth and in card dues.
  acc("oldcard", "Old Amex", "credit_card", 10000, true),
];
const tx = (id: string, date: string, txnType: Txn["txnType"], amount: number, accountId: string, extra: Partial<Txn> & Record<string, unknown> = {}) =>
  ({ id, date, txnType, amount, accountId, title: id, merchant: null, category: "Other", paymentMethod: "upi", receipts: [], tags: [], currency: "INR", originalAmount: amount, ...extra });
const TXNS = [
  tx("close-old", "2026-10-01", "transfer", 50000, "old", { toAccountId: "sb", category: "Transfer" }), // closing event
  tx("sale", "2026-10-15", "income", 1200000, "sb", { category: "Asset sale" }), // disposal proceeds received
];
const archived = { archivedAt: "2026-10-20T10:00:00Z", archivedBy: "owner", archiveReason: "No longer reviewing monthly", archiveHistory: [] };
const ASSETS = [
  // Jointly owned flat, archived from the active list but never sold: 40,00,000 × 50% = 20,00,000 stays.
  { id: "flat", name: "Flat (joint)", kind: "property" as const, cost: 4000000, inUse: "2020-04-01", sharePct: 50, bookMethod: "slm" as const, bookRatePct: 0, ...archived },
  // Plot sold on 15 Oct 2026 for 12,00,000: a real disposal — removed from assets, proceeds now in the bank.
  { id: "plot", name: "Plot", kind: "property" as const, cost: 1000000, inUse: "2018-04-01", sharePct: 100, bookMethod: "slm" as const, bookRatePct: 0, soldOn: "2026-10-15", saleValue: 1200000 },
];

// ---------- Hand-calculated ----------
// HDFC Savings: 1,00,000 + 50,000 (closing transfer in) + 12,00,000 (sale proceeds) = 13,50,000
const SB = 1350000;
const OLD = 0; // 50,000 − 50,000 closing transfer
const FD = 200000; // archived, not redeemed
const FLAT = 2000000; // archived, not sold: 50% of 40,00,000
const CARD = 10000; // archived card, still owed
const ACCOUNTS_ASSETS = SB + OLD + FD; // 15,50,000
const ACCOUNTS_NET = ACCOUNTS_ASSETS - CARD; // 15,40,000 — Home and Wealth report (accounts only)
const BOOKS_NET = SB + FD + FLAT - CARD; // 35,40,000 — Books/Wealth page (accounts + asset register); the sold plot contributes 0

describe("archived, closed and disposed: net worth follows real events, not the archive flag", () => {
  it("Home/assistant net worth counts the archived deposit and the closed account's zero", () => {
    const p = position({ accounts: ACCOUNTS, transactions: TXNS as never, commitments: [], goals: [], loans: [], today: "2026-11-10", days: 30 });
    expect(p.netWorth).toEqual({ assets: ACCOUNTS_ASSETS, liabilities: CARD, net: ACCOUNTS_NET });
    expect(p.cards.map((c) => [c.name, c.due])).toEqual([["Old Amex", CARD]]);
  });

  it("the Wealth report agrees and marks the archived account", () => {
    const d = { transactions: TXNS, accounts: ACCOUNTS, valuations: [], commitments: [], loans: [], budgets: {}, trips: [], drafts: [], today: "2026-11-10",
      memberName: () => "Me", accountName: (id: string | null) => ACCOUNTS.find((a) => a.id === id)?.name ?? "No account" } as unknown as ReportData;
    const doc = buildReportDoc("wealth", emptyFilters("2026-11-01", "2026-11-30"), d);
    expect(doc.summary.find(([k]) => k === "Net worth")?.[1]).toBe("INR 15,40,000.00");
    const names = doc.sections[0]!.rows.map((r) => r[0]);
    expect(names).toContain("SBI fixed deposit (archived)");
    expect(names).not.toContain("SBI Savings (closed) (archived)"); // closed with a zero balance: nothing to list
  });

  it("Books/Wealth page: archived deposit and archived (unsold) flat count; the sold plot does not", () => {
    const nw = computeNetWorth({
      accounts: ACCOUNTS, transactions: TXNS as never, valuations: [], loans: [], documents: [], books: emptyBooks(), assets: ASSETS as never,
      demat: null as never, dematHoldings: [], closes: { byIsin: new Map(), byIsinEx: new Map(), job: null, failed: false, retry: () => {} },
    });
    const part = (label: string) => nw.assets.find((a) => a.label === label)?.value;
    expect(part("Bank & cash")).toBe(SB);
    expect(part("Investments")).toBe(FD);
    expect(part("Property")).toBe(FLAT);
    expect(nw.net).toBe(BOOKS_NET);
  });
});
