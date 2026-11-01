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
