import { describe, expect, it } from "vitest";
import { cancelBy, noticeDeadlines, obligationToCommitment, toObligations } from "./contracts";

let n = 0; const id = () => `o${++n}`;

describe("contract obligations", () => {
  const list = toObligations("doc1", [
    { label: "Annual premium", amount: 18500, frequency: "yearly", dueDate: "2026-12-15", noticeDays: 30, evidence: "Premium ₹18,500 payable yearly" },
    { label: "", amount: 1, frequency: "monthly", dueDate: null, noticeDays: null, evidence: "" },
    { label: "Late fee", amount: -5, frequency: "weird", dueDate: "15/12/2026", noticeDays: 900, evidence: "" },
  ], id);

  it("drops empty rows and cleans unreadable values to blanks", () => {
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({ amount: null, frequency: "once", dueDate: null, noticeDays: null, status: "review" });
  });
  it("works out the last day to give notice", () => {
    expect(cancelBy(list[0]!)).toBe("2026-11-15");
    expect(noticeDeadlines(list, "2026-11-01").map((x) => x.by)).toEqual(["2026-11-15"]);
    expect(noticeDeadlines(list, "2026-11-16")).toHaveLength(0);
  });
  it("needs an amount and due date before it can become a planned payment", () => {
    expect(() => obligationToCommitment(list[1]!, "Policy", "insurance", null)).toThrow();
    expect(obligationToCommitment(list[0]!, "Health policy", "insurance", null)).toMatchObject({ kind: "insurance", amount: 18500, frequency: "yearly", nextDue: "2026-12-15", name: "Annual premium (Health policy)" });
  });
});
