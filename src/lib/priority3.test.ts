import { describe, expect, it } from "vitest";
import { decisionState, dueForReview, memorySummary, validateDecision, type DecisionMemory } from "./memory";
import { buildGraph, filterGraph, neighbours, unlinked, validateCustomLink } from "./graph";

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
  it("shows credit cards separately, explains each link and filters by type", () => {
    const g2 = buildGraph({ accounts: [{ id: "a", name: "HDFC", kind: "savings" }, { id: "c", name: "Amex", kind: "credit_card" }], methods: [], members: [], loans: [],
      commitments: [{ id: "r", name: "Rent", accountId: "a", amount: 20000, frequency: "monthly" }], documents: [], custom: [{ id: "x", from: "card:c", to: "account:a", note: "Autopay from HDFC" }] });
    expect(g2.nodes.find((n) => n.label === "Amex")?.kind).toBe("card");
    expect(g2.edges.find((e) => e.field === "commitment.account")?.reason).toContain("₹20,000");
    expect(g2.edges.find((e) => e.field === "custom")?.reason).toBe("Autopay from HDFC");
    const f = filterGraph(g2, ["card", "account"]);
    expect(f.nodes.map((n) => n.label).sort()).toEqual(["Amex", "HDFC"]);
    expect(f.edges).toHaveLength(1);
  });
  it("rejects self links and duplicate links in either direction", () => {
    expect(() => validateCustomLink({ from: "a", to: "a", note: "" }, [])).toThrow();
    expect(() => validateCustomLink({ from: "b", to: "a", note: "" }, [{ id: "1", from: "a", to: "b", note: "" }])).toThrow();
  });
});
