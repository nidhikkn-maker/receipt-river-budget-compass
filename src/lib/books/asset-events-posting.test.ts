import { describe, expect, it } from "vitest";
import { eventPostings } from "./assets-ledger";
import type { Asset } from "../assets";

const base = { id: "a1", name: "Laptop", kind: "computer", cost: 100000, inUse: "2026-04-01", accountId: "acc1", sharePct: 100, bookMethod: "slm", bookRatePct: 20 } as unknown as Asset;

describe("impairment and disposal postings", () => {
  it("posts an impairment write-down on the asset's own account", () => {
    const r = eventPostings({ ...base, adjustments: [{ date: "2026-06-30", amount: -5000, kind: "impairment", note: "damage" }] }, []);
    expect(r.postings).toHaveLength(1);
    expect(r.postings[0]!).toMatchObject({ kind: "impairment", amount: 5000, accountId: "acc1", date: "2026-06-30" });
  });
  it("disposal removes the remaining book value, keyed once per asset", () => {
    const r = eventPostings({ ...base, soldOn: "2026-09-30", saleValue: 60000 } as Asset, []);
    const d = r.postings.find((p) => p.kind === "disposal")!;
    expect(d.key).toEqual(["disposal", "a1", "2026-09-30"]);
    expect(d.amount).toBeGreaterThan(0);
    expect(d.amount).toBeLessThanOrEqual(100000);
  });
  it("refuses closed periods and assets without a ledger account", () => {
    const closed = [{ id: "p", from: "2026-04-01", to: "2026-06-30" }] as never;
    expect(eventPostings({ ...base, adjustments: [{ date: "2026-06-30", amount: -5000, kind: "impairment", note: "" }] }, closed).postings).toEqual([]);
    expect(eventPostings({ ...base, accountId: undefined, soldOn: "2026-09-30" } as Asset, []).problems[0]).toMatch(/link a ledger/);
  });
});
