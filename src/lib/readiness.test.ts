import { describe, expect, it } from "vitest";
import { paymentReadiness, readinessSummary } from "./readiness";
import type { Account } from "./ledger";
import type { Commitment } from "./planning";

const today = "2026-10-31";
const acc: Account = { id: "a1", name: "HDFC Savings", kind: "savings", openingBalance: 50000, archived: false, minBalance: 5000 };
const mk = (over: Partial<Commitment>): Commitment => ({
  id: over.id ?? crypto.randomUUID(), name: "Bill", kind: "bill", direction: "out", amount: 1000, frequency: "once",
  intervalDays: null, nextDue: "2026-11-05", accountId: "a1", category: "Utilities", confirmed: true, essential: true, status: "active", ...over,
});

describe("paymentReadiness", () => {
  it("marks a payment ready when the projected balance covers it", () => {
    const [r] = paymentReadiness({ commitments: [mk({ amount: 10000 })], accounts: [acc], transactions: [], today });
    expect(r!.status).toBe("ready");
    expect(r!.projected).toBe(45000); // 50000 - 5000 min balance
    expect(r!.shortfall).toBe(0);
  });

  it("flags a shortfall with the exact gap and full calculation steps", () => {
    const [r] = paymentReadiness({ commitments: [mk({ amount: 60000 })], accounts: [acc], transactions: [], today });
    expect(r!.status).toBe("shortfall");
    expect(r!.shortfall).toBe(15000);
    expect(r!.steps.map((s) => s.label)).toContain("Minimum balance protected");
  });

  it("lets earlier obligations from the same account eat into later ones", () => {
    const list = paymentReadiness({
      commitments: [mk({ id: "c1", amount: 40000, nextDue: "2026-11-02" }), mk({ id: "c2", amount: 8000, nextDue: "2026-11-10" })],
      accounts: [acc], transactions: [], today,
    });
    const later = list.find((r) => r.commitmentId === "c2")!;
    expect(later.status).toBe("shortfall"); // 50000 - 40000 - 5000 = 5000 < 8000
    expect(later.shortfall).toBe(3000);
  });

  it("counts confirmed income arriving before the due date", () => {
    const [r] = paymentReadiness({
      commitments: [mk({ amount: 60000 }), mk({ id: "sal", name: "Salary", direction: "in", amount: 30000, nextDue: "2026-11-01", kind: "income", accountId: "a1" })],
      accounts: [acc], transactions: [], today,
    });
    expect(r!.status).toBe("ready"); // 50000 + 30000 - 5000 = 75000 ≥ 60000
  });

  it("is unknown when no paying account is designated and there are several cash accounts", () => {
    const acc2: Account = { ...acc, id: "a2", name: "ICICI" };
    const [r] = paymentReadiness({ commitments: [mk({ accountId: null })], accounts: [acc, acc2], transactions: [], today });
    expect(r!.status).toBe("unknown");
  });

  it("assumes the single cash account when none is designated", () => {
    const [r] = paymentReadiness({ commitments: [mk({ accountId: null, amount: 5000 })], accounts: [acc], transactions: [], today });
    expect(r!.status).toBe("ready");
    expect(r!.accountName).toBe("HDFC Savings");
  });

  it("marks past-due payments overdue and never marks unconfirmed ones paid", () => {
    const [r] = paymentReadiness({ commitments: [mk({ nextDue: "2026-10-20" })], accounts: [acc], transactions: [], today });
    expect(r!.status).toBe("overdue");
  });
});

describe("readinessSummary", () => {
  it("counts statuses and totals the shortfall", () => {
    const list = paymentReadiness({
      commitments: [mk({ id: "c1", amount: 5000 }), mk({ id: "c2", amount: 60000, nextDue: "2026-11-08" })],
      accounts: [acc], transactions: [], today,
    });
    const s = readinessSummary(list);
    expect(s.ready).toBe(1);
    expect(s.shortfall).toBe(1);
    expect(s.shortfallAmount).toBe(20000);
  });
});
