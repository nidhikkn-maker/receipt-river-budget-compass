import { describe, expect, it } from "vitest";
import { decisionState, dueForReview, memorySummary, validateDecision, type DecisionMemory } from "./memory";
import { buildGraph, neighbours, unlinked } from "./graph";

const d = (o: Partial<DecisionMemory>): DecisionMemory => ({ id: "1", title: "Switched phone plan", decidedOn: "2026-08-01", reason: "", expected: 500, reviewOn: "2026-11-01", actual: null, lesson: "", reviewedAt: null, ...o });

describe("financial memory", () => {
  it("is waiting before the review date and due on it", () => {
    expect(decisionState(d({}), "2026-10-31")).toBe("waiting");
    expect(decisionState(d({}), "2026-11-01")).toBe("due");
    expect(dueForReview([d({ id: "a", reviewOn: "2026-10-20" }), d({ id: "b" })], "2026-11-01").map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("compares the actual result with the expectation (10% or ₹100 tolerance)", () => {
    expect(decisionState(d({ actual: 560 }), "2026-11-01")).toBe("as_expected");
    expect(decisionState(d({ actual: 800 }), "2026-11-01")).toBe("better");
    expect(decisionState(d({ actual: 200 }), "2026-11-01")).toBe("worse");
    expect(memorySummary([d({ actual: 800 }), d({})])).toEqual({ reviewed: 1, expectedTotal: 500, actualTotal: 800 });
  });
  it("rejects a review date before the decision", () => {
    expect(() => validateDecision({ title: "x", decidedOn: "2026-08-01", reviewOn: "2026-07-01", expected: 0 })).toThrow();
  });
});

describe("knowledge graph", () => {
  const g = buildGraph({
    accounts: [{ id: "hdfc", name: "HDFC Savings" }, { id: "old", name: "Old", archived: true }],
    methods: [{ id: "gpay", nickname: "GPay", accountId: "hdfc", memberId: "m1" }],
    members: [{ id: "m1", name: "Asha" }],
    loans: [{ id: "car", name: "Car loan", accountId: "hdfc" }],
    commitments: [{ id: "rent", name: "Rent", accountId: null }],
    documents: [{ id: "doc", title: "Car loan agreement", accountId: null, loanId: "car" }],
  });
  it("links methods, people, loans and documents to accounts and skips archived ones", () => {
    expect(g.nodes.some((n) => n.label === "Old")).toBe(false);
    expect(neighbours(g, "account:hdfc").map((x) => x.node.label).sort()).toEqual(["Car loan", "GPay"]);
    expect(neighbours(g, "loan:car").map((x) => x.node.label).sort()).toEqual(["Car loan agreement", "HDFC Savings"]);
  });
  it("flags records not linked to anything", () => {
    expect(unlinked(g).map((n) => n.label)).toEqual(["Rent"]);
  });
});
