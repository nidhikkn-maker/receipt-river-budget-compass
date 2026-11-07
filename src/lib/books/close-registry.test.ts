import { describe, it, expect } from "vitest";
import { validateReturnDraft } from "./regulatory";
import { buildCloseEvidence, supersedeEvidence, registerBlocker } from "./periods";

describe("return format registry", () => {
  it("unregistered form is unsupported", () => expect(validateReturnDraft("ITR-9", "2025-26", "individual", {}).status).toBe("unsupported"));
  it("wrong taxpayer type refused", () => expect(validateReturnDraft("ITR-6", "2025-26", "individual", {}).status).toBe("unsupported"));
  it("unpinned schema is never validated", () => {
    const r = validateReturnDraft("GSTR-3B", "2025-11", "company", { gstin: "x" }, ["gstin"]);
    expect(r.status).toBe("working"); expect(r.problems).toEqual([]);
  });
  it("lists missing fields", () => expect(validateReturnDraft("GSTR-1", "2025-11", "company", {}, ["gstin"]).problems).toEqual(["Missing gstin"]));
});

describe("period close evidence", () => {
  const period = { id: "p1", from: "2025-04-01", to: "2025-04-30" };
  const entries: { id: string; date: string; reconciled?: boolean; docId?: string; updatedAt?: string }[] = [{ id: "a", date: "2025-04-02", reconciled: true, docId: "d1" }, { id: "b", date: "2025-05-01" }];
  it("captures only entries inside the period", () => {
    const e = buildCloseEvidence({ id: "e1", period, at: "2025-05-05", entries });
    expect(e.entryCount).toBe(1); expect(e.reconciled).toBe(1); expect(e.sourceDocIds).toEqual(["d1"]);
  });
  it("revision changes when an entry changes", () => {
    const a = buildCloseEvidence({ id: "e1", period, at: "x", entries });
    const b = buildCloseEvidence({ id: "e1", period, at: "x", entries: [{ id: "a", date: "2025-04-02", updatedAt: "later" }] });
    expect(a.ledgerRevision).not.toBe(b.ledgerRevision);
  });
  it("reopening supersedes, keeps the old proof", () => {
    const e = buildCloseEvidence({ id: "e1", period, at: "x", entries });
    const s = supersedeEvidence([e], "p1", "e2");
    expect(s).toHaveLength(1); expect(s[0]?.supersededBy).toBe("e2");
  });
  it("blocks register changes in closed periods", () => {
    const closed = [{ id: "p1", from: "2025-04-01", to: "2025-04-30", closedOn: "x", note: "" }];
    expect(registerBlocker(closed, ["2025-04-10"])).toMatch(/closed period/);
    expect(registerBlocker(closed, ["2025-06-01", null])).toBeNull();
  });
});
