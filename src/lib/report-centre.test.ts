import { describe, expect, it } from "vitest";
import { buildReportDoc, emptyFilters, periodRange, shareIn, type ReportData } from "./report-centre";
import { renderReportPdf } from "./report-pdf";
import type { Expense } from "./expenses";
import type { Account } from "./ledger";

const base = { title: "x", merchant: null, category: "Food", scope: "personal", memberId: null, splits: [], currency: "INR", fxRate: 1, paymentMethod: "upi", reconciledAt: null, statementRef: null, description: "", receipts: [] } as const;
const e = (id: string, amount: number, extra: Partial<Expense> = {}): Expense => ({ ...base, id, amount, originalAmount: amount, date: "2026-10-10", ...extra } as Expense);
const acct = (id: string, kind: Account["kind"]): Account => ({ id, name: id, kind, openingBalance: 0, archived: false } as Account);
const data = (transactions: Expense[]): ReportData => ({ transactions, accounts: [acct("bank", "savings"), acct("card", "credit_card")], valuations: [], commitments: [], loans: [], budgets: {}, trips: [], drafts: [{ id: "d", status: "ready", updatedAt: "2026-10-11", data: { amount: 999 } }], memberName: () => "Me", accountName: (id) => id ?? "None", today: "2026-10-31" });
const f = emptyFilters("2026-10-01", "2026-10-31");
const val = (doc: ReturnType<typeof buildReportDoc>, label: string) => doc.summary.find((s) => s[0] === label)?.[1];

describe("Reports Centre totals", () => {
  const list = [
    e("salary", 50000, { txnType: "income", accountId: "bank" }),
    e("dinner", 1000, { accountId: "card" }),
    e("billpay", 1000, { txnType: "card_payment", accountId: "bank", toAccountId: "card" }),
    e("move", 5000, { txnType: "transfer", accountId: "bank", toAccountId: "card" }),
    e("split", 600, { workspaceAllocations: [{ workspace: "personal", amount: 200 }, { workspace: "business", amount: 400 }] }),
  ];
  it("transfers and card bill payments never count as income or spending", () => {
    const d = buildReportDoc("monthly", f, data(list));
    expect(val(d, "Total income")).toBe("INR 50,000.00");
    expect(val(d, "Total expenses")).toBe("INR 1,600.00");
  });
  it("workspace splits count only the selected share", () => {
    expect(shareIn(list[4]!, ["business"])).toBe(400);
    const d = buildReportDoc("ws-business", f, data(list));
    expect(val(d, "Total expenses")).toBe("INR 400.00");
  });
  it("consolidated report counts a split entry once", () => {
    const d = buildReportDoc("consolidated", { ...f, workspaces: ["business"] }, data(list));
    expect(val(d, "Total expenses")).toBe("INR 1,600.00");
  });
  it("drafts never enter ledger totals", () => {
    const d = buildReportDoc("monthly", f, data(list));
    expect(d.notes.join(" ")).toContain("Drafts");
    expect(val(d, "Total expenses")).toBe("INR 1,600.00");
  });
  it("last month covers the whole previous month", () => {
    expect(periodRange("last_month", "2026-03-15")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
  it("renders a multi-page PDF for large reports", async () => {
    const many = Array.from({ length: 400 }, (_, i) => e(`x${i}`, 10 + i));
    const blob = await renderReportPdf(buildReportDoc("expense", f, data(many)), "mono", new Date());
    const text = await new Promise<string>((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result)); fr.readAsText(blob); });
    expect(text.length).toBeGreaterThan(0); expect(text).toMatch(/Page 4 of \d+/);
  });
});
