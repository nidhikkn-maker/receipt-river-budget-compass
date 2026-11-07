import { describe, it, expect } from "vitest";
import { auditFindings } from "./audit-dashboard";
import type { Expense } from "./expenses";

describe("auditFindings", () => {
  it("collects profile, year, invoice and asset findings with high first", () => {
    const entries = [{ id: "e", scope: "business", amount: 20000, receipts: [], date: "2026-05-01", title: "x", statementRef: "s" } as unknown as Expense];
    const f = auditFindings("2026-11-04", [{ id: "p", name: "Me", kind: "individual", pan: "BAD", gstins: [], booksFrom: "2025-26" }],
      [{ id: "a", name: "Flat", kind: "property", cost: 1, inUse: "2025-04-01", sharePct: 100, bookMethod: "slm", bookRatePct: 0 }], entries, []);
    expect(f.map((x) => x.key)).toEqual(["pan:p", "inv", "asset:a", "fy:p:2025-26"]);
  });
});
