import { describe, expect, it } from "vitest";
import { buildStatement, subjectEntries, type Subject } from "./expenditure-statement";
import { renderStatementPdf } from "./expenditure-pdf";
import type { Expense } from "./expenses";
import type { Account } from "./ledger";
import type { PaymentInstrument } from "./payment-instruments";
import type { TravelTrip } from "./travel";

const base = { title: "Item", merchant: "Shop", category: "Hotels", scope: "business", memberId: null, splits: [], currency: "INR", fxRate: 1, paymentMethod: "credit_card", reconciledAt: null, statementRef: null, description: "", receipts: [], tags: ["Trip: Delhi"] } as const;
const e = (id: string, amount: number, x: Partial<Expense> = {}): Expense => ({ ...base, id, amount, originalAmount: amount, date: "2026-10-10", ...x } as Expense);
const accounts = [{ id: "amex", name: "Personal AMEX", kind: "credit_card", openingBalance: 0, archived: false }, { id: "bank", name: "IDFC Bank", kind: "savings", openingBalance: 0, archived: false }] as Account[];
const instruments: PaymentInstrument[] = [{ id: "pa", type: "credit_card", nickname: "Personal AMEX", lastFour: "1234", accountId: "amex" }, { id: "cc", type: "company_card", nickname: "Company Card", lastFour: "9012", accountId: "amex" }];
const trip = { id: "t", name: "Delhi", destination: "Delhi", start: "2026-10-09", end: "2026-10-12", budget: 0, currencies: [] } as TravelTrip;
const tx: Expense[] = [
  e("hotel", 10000, { paymentInstrumentId: "pa", accountId: "amex", reimbursementStatus: "pending", reimbursement: { reimbursable: 10000, receipts: [{ id: "r", date: "2026-10-20", amount: 4000 }] }, receipts: [{ name: "hotel.pdf", type: "application/pdf", path: "u/h.pdf" }, { name: "upi.png", type: "image/png", path: "u/p.png" }],
    receiptDetails: { items: [{ name: "Room", quantity: 2, amount: 8000 }, { name: "Food", quantity: 1, amount: 1000 }], tax: 1000 } }),
  e("cab", 1500, { paymentInstrumentId: "cc", accountId: "amex", paymentMethod: "company_card", reimbursementStatus: "pending" }),
  e("meal", 2000, { paymentMethod: "upi", accountId: "bank", scope: "personal" }),
  e("taxi", 800, { accountId: null, paymentMethod: "cash", tags: ["Trip: Delhi", "Paid by: Client"] }),
  e("refund", 500, { txnType: "refund", accountId: "amex" }),
  e("billpay", 10000, { txnType: "card_payment", accountId: "bank", toAccountId: "amex" }),
  e("rej", 700, { paymentMethod: "upi", accountId: "bank", reimbursementStatus: "pending", reimbursement: { stage: "rejected", reimbursable: 700 } }),
];
const make = (s: Subject = { kind: "trip", id: "t" }) => buildStatement({ subject: s, subjectName: "Delhi", entries: subjectEntries(s, tx, [trip]), trips: [trip], accounts, instruments, memberName: () => "You", today: "2026-10-31", reference: "LL-DES-TEST" });

describe("Detailed Expenditure Statement", () => {
  it("excludes card bill payments and nets refunds", () => {
    const s = make();
    expect(s.rows.map((r) => r.id)).not.toContain("billpay");
    expect(s.summary.total).toBe(10000 + 1500 + 2000 + 800 - 500 + 700);
  });
  it("payer totals and payment sources reconcile with total expenditure", () => {
    const s = make();
    expect(s.summary.personal + s.summary.organisation + s.summary.other).toBe(s.summary.total);
    expect(s.summary.organisation).toBe(1500);
    expect(s.summary.other).toBe(800);
    expect(s.sources.reduce((a, x) => a + x.total, 0)).toBe(s.summary.total);
  });
  it("shows masked card details and Not Recorded for missing accounts", () => {
    const s = make();
    expect(s.rows.find((r) => r.id === "hotel")!.source).toBe("Personal AMEX ending 1234 (Personal AMEX)");
    expect(s.rows.find((r) => r.id === "taxi")!.source).toBe("Not Recorded");
  });
  it("company-paid entries never become personal reimbursement receivables", () => {
    expect(make().rows.find((r) => r.id === "cab")!.eligible).toBe(0);
  });
  it("partial reimbursement leaves the right outstanding; rejected stays separate", () => {
    const s = make();
    expect(s.summary.reimbursed).toBe(4000);
    expect(s.summary.outstanding).toBe(6000);
    expect(s.summary.rejected).toBe(700);
  });
  it("business and personal allocation add up to the total", () => {
    const s = make();
    expect(s.summary.business + s.summary.personalFamily).toBe(s.summary.total);
    expect(s.summary.personalFamily).toBe(2000);
  });
  it("annexures are numbered in register order and missing bills are flagged", () => {
    const s = make();
    expect(s.annexures.map((a) => [a.no, a.row])).toEqual([["A-01", 1], ["A-02", 1]]);
    expect(s.rows[0]!.billRef).toBe("A-01, A-02");
    expect(s.rows.filter((r) => r.billRef === "Bill Not Attached").length).toBe(s.rows.length - 1);
  });
  it("line items reconcile with the bill total", () => expect(make().rows[0]!.itemsReconcile).toBe(true));
  it("supports an individual purchase", () => {
    const s = make({ kind: "entries", ids: ["meal"] });
    expect(s.rows.length).toBe(1); expect(s.summary.total).toBe(2000);
  });
  it("supports an event tag", () => {
    const ev = [e("x", 300, { tags: ["Event: Expo"] })];
    expect(subjectEntries({ kind: "tag", tag: "Event: Expo" }, [...tx, ...ev], []).map((r) => r.id)).toEqual(["x"]);
  });
  it("renders one PDF and marks unreadable bills instead of dropping them", async () => {
    const { blob, missing } = await renderStatementPdf(make(), { "A-01": null, "A-02": null });
    expect(missing).toEqual(["A-01", "A-02"]);
    expect(blob.size).toBeGreaterThan(2000);
  });
  it("does not modify the source records", () => {
    const before = JSON.stringify(tx); make(); expect(JSON.stringify(tx)).toBe(before);
  });
});
