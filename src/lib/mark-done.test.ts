import { describe, expect, it } from "vitest";
import { bulkTotals, markableUpcoming } from "./mark-done";

const cs = [{ id: "emi", nextDue: "2026-11-05", status: "active", amount: 313913 }, { id: "amex", nextDue: "2026-11-08", status: "active", amount: 50000 }, { id: "old", nextDue: "2026-11-01", status: "paused", amount: 10 }];
describe("Marking upcoming payments done", () => {
  it("only the current due date of an active commitment can be marked, once each", () => {
    const up = [
      { commitmentId: "emi", date: "2026-11-05", amount: 313913, direction: "out" as const },
      { commitmentId: "emi", date: "2026-12-05", amount: 313913, direction: "out" as const },
      { commitmentId: "amex", date: "2026-11-08", amount: 50000, direction: "out" as const },
      { commitmentId: "old", date: "2026-11-01", amount: 10, direction: "out" as const },
      { commitmentId: null, date: "2026-11-02", amount: 5, direction: "out" as const },
    ];
    expect(markableUpcoming(up, cs).map((u) => `${u.commitmentId}@${u.date}`)).toEqual(["emi@2026-11-05", "amex@2026-11-08"]);
  });
  it("bulk total separates money out from money in", () => {
    expect(bulkTotals([{ date: "", amount: 313913, direction: "out" }, { date: "", amount: 50000, direction: "out" }, { date: "", amount: 100, direction: "in" }])).toEqual({ count: 3, out: 363913, in: 100 });
  });
});
