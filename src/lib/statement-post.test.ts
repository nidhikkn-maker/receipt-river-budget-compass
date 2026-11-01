import { describe, expect, it } from "vitest";
import { balanceGate, lineId, missingLines, pairTransfers, type BalanceLine } from "./statement-crosscheck";
const L = (date: string, amount: number, direction: "debit" | "credit", balance = 0, source = "a"): BalanceLine => ({ date, amount, direction, balance, description: "x", source });
describe("statement posting", () => {
  it("only unrecorded lines are missing", () => {
    const m = missingLines([{ date: "2026-05-02", amount: 100 }], [L("2026-05-01", 100, "debit"), L("2026-05-03", 100, "debit")]);
    expect(m).toHaveLength(1);
  });
  it("pairs a transfer only with one unique opposite line", () => {
    const p = pairTransfers([L("2026-09-03", 5000000, "credit")], [L("2026-09-03", 5000000, "debit", 0, "krna")]);
    expect(p[0]!.transferWith?.source).toBe("krna");
    const q = pairTransfers([L("2026-09-03", 500, "credit")], [L("2026-09-03", 500, "debit"), L("2026-09-04", 500, "debit")]);
    expect(q[0]!.transferWith).toBeUndefined();
  });
  it("blocks when the balance does not reach the statement closing", () => {
    expect(balanceGate(1000, [L("2026-05-01", 200, "credit")], 1200).ok).toBe(true);
    expect(balanceGate(1000, [L("2026-05-01", 200, "credit")], 1200.5).ok).toBe(false);
  });
  it("same line gives the same id", async () => {
    expect(await lineId("acc", L("2026-05-01", 1, "debit", 5))).toBe(await lineId("acc", L("2026-05-01", 1, "debit", 5)));
  });
});
import { parseAmexStatement } from "./statement-crosscheck";
describe("amex", () => {
  it("reads charges and CR credits and reconciles to the closing balance", () => {
    const rows = ["Previous Balance", "238,096.06 -   1,000.00 +   500.00 =   237,596.06", "received by August 20, 2026", "July 28  PAYMENT RECEIVED. THANK YOU  1,000.00", "Card Number XXXX CR", "August 2  LOUIS PHILIPPE  500.00", "Total of new transactions  500.00"];
    const p = parseAmexStatement(rows, "a");
    expect(p.lines.map((l) => l.direction)).toEqual(["credit", "debit"]);
    expect(p.lines.at(-1)!.balance).toBe(237596.06);
  });
  it("card credits lower the amount owed in the balance check", () => {
    expect(balanceGate(1000, [{ date: "2026-07-28", amount: 400, direction: "credit", balance: 0, description: "", source: "" }], 600, true).ok).toBe(true);
  });
});
