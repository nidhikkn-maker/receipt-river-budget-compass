import { describe, expect, it } from "vitest";
import { emiReconciliation, matchEmiDebit, type EmiTarget , matchEmiFunding } from "./emi-match";

const gls: EmiTarget = { loanId: "L", name: "Mercedes GLS loan", loanAccountId: "LA", payFromAccountId: "IDFC", emi: 313913, dueDay: 5, refs: ["501212020006289", "143001001024894", "CIUB0000143"] };
const debit = (o: Partial<{ date: string; amount: number; accountId: string | null; description: string }>) =>
  ({ date: "2026-11-03", amount: 313900, direction: "debit" as const, accountId: "IDFC", description: "NEFT/ IDFBH26276907100/ Mr", ...o });

describe("GLS EMI matching", () => {
  it("₹3,13,900 from IDFC Krupa two days before the 5th matches, ₹13 short", () => {
    const m = matchEmiDebit(debit({}), [gls]);
    expect([m?.target.loanId, m?.amountDiff, m?.dayDiff, m?.due]).toEqual(["L", -13, -2, "2026-11-05"]);
  });
  it("a gap above ₹1,570 (0.5%) from the usual account is not matched", () => {
    expect(matchEmiDebit(debit({ amount: 311000 }), [gls])).toBeNull();
  });
  it("a narration naming the linked CUB account matches a partial payment within 10%, even from another account", () => {
    const m = matchEmiDebit(debit({ accountId: "OTHER", amount: 290000, description: "NEFT to 143001001024894 CUB" }), [gls]);
    expect([m?.linked, m?.amountDiff]).toEqual([true, -23913]);
  });
  it("a debit more than 7 days before the due date is not an EMI", () => {
    expect(matchEmiDebit(debit({ date: "2026-10-27" }), [gls])).toBeNull();
  });
  it("credits never match", () => {
    expect(matchEmiDebit({ ...debit({}), direction: "credit" }, [gls])).toBeNull();
  });
});

describe("GLS EMI reconciliation", () => {
  const loan = { emi: 313913, dueDay: 5, from: "2026-08-05", nextDue: "2026-11-05", payments: [{ date: "2026-08-05", total: 313913 }] };
  it("flags amount and date differences and a missing month", () => {
    const rows = emiReconciliation(loan, [
      { id: "a", date: "2026-08-03", amount: 313900, title: "" },
      { id: "b", date: "2026-09-10", amount: 313913, title: "" },
      { id: "c", date: "2026-10-05", amount: 300000, title: "" },
    ], "2026-11-04");
    expect(rows.map((r) => [r.due, r.status])).toEqual([
      ["2026-08-05", "matched"], ["2026-09-05", "date"], ["2026-10-05", "amount"], ["2026-11-05", "upcoming"],
    ]);
  });
  it("a month paid per the lender with no bank record is 'lender only', not missing", () => {
    const rows = emiReconciliation({ ...loan, nextDue: "2026-08-05" }, [], "2026-08-20");
    expect(rows[0]!.status).toBe("lender_only");
  });
});

describe("EMI funded by an auto transfer", () => {
  const T: EmiTarget = { loanId: "l", name: "GLS", loanAccountId: "loan", payFromAccountId: "cub", emi: 313913, dueDay: 5, refs: ["143001001024894"], fundingFromAccountId: "idfc", fundingDay: 3 };
  it("IDFC debit on the 3rd is a top-up of CUB, not the EMI", () => {
    const line = { date: "2026-11-03", amount: 313900, direction: "debit" as const, accountId: "idfc", description: "NEFT 143001001024894" };
    expect(matchEmiDebit(line, [T])).toBeNull();
    expect(matchEmiFunding(line, [T])?.target.payFromAccountId).toBe("cub");
  });
  it("CUB debit on the 5th is the EMI", () => {
    expect(matchEmiDebit({ date: "2026-11-05", amount: 313913, direction: "debit", accountId: "cub", description: "EMI" }, [T])?.amountDiff).toBe(0);
  });
  it("funded month without CUB debit is funded_only, not missing", () => {
    const rows = emiReconciliation({ emi: 313913, dueDay: 5, from: "2026-10-01", nextDue: "2026-10-05", payments: [] }, [], "2026-10-20", [{ id: "f", date: "2026-10-03", amount: 313900 }]);
    expect(rows[0]!.status).toBe("funded_only");
  });
});
