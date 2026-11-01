import { describe, expect, it } from "vitest";
import { crossCheck, parseBalanceStatement } from "./statement-crosscheck";

const rows = [
  "Opening Balance  Total Debit  Total Credit  Closing Balance",
  "1,000.00  300.00  50.00  750.00",
  "Opening Balance  1,000.00",
  "UPI/DR/1/Shop",
  "02-Apr-2026  02-Apr-2026  300.00  700.00",
  "UPI/CR/2/Friend",
  "05-Apr-2026  05-Apr-2026  50.00  750.00",
];

describe("statement cross-check", () => {
  it("reads direction from the running balance", () => {
    const p = parseBalanceStatement(rows, "k.pdf");
    expect(p.opening).toBe(1000);
    expect(p.closing).toBe(750);
    expect(p.lines.map((l) => l.direction)).toEqual(["debit", "credit"]);
  });
  it("sets aside records on the home statement and flags wrong kinds on the other", () => {
    const other = parseBalanceStatement(rows, "k.pdf").lines;
    const home = [{ date: "2026-04-10", amount: 99, direction: "debit" as const, balance: 0, description: "", source: "m.pdf" }];
    const { onHome, results } = crossCheck([
      { id: "a", date: "2026-04-10", amount: 99, kind: "expense", name: "home" },
      { id: "b", date: "2026-04-03", amount: 300, kind: "expense", name: "shop" },
      { id: "c", date: "2026-04-05", amount: 50, kind: "expense", name: "friend" },
      { id: "d", date: "2026-04-20", amount: 300, kind: "expense", name: "late" },
    ], home, other);
    expect(onHome).toBe(1);
    expect(results.map((r) => r.result)).toEqual(["found", "found_wrong_kind", "not_found"]);
  });
});
