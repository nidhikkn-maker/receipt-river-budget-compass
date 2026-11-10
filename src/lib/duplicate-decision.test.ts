import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { postingBlock, receiptReuseError, separateDecision, separateReasonError, stampDuplicateReview } from "./duplicate-decision";
import { ReceiptDetailsSchema } from "./receipt-reading";

const entry = (id: string, fingerprint?: string) => (fingerprint ? { id, receiptDetails: { fingerprint } } : { id });

describe("false-positive duplicates need a reason (B1d item 5)", () => {
  it("“It's separate” is refused without a usable reason", () => {
    expect(separateReasonError("")).toMatch(/Say why/);
    expect(separateReasonError("   ok ")).toMatch(/Say why/);
    expect(separateReasonError("x".repeat(301))).toMatch(/under 300/);
    expect(separateReasonError("Second order, new bill BT-20932")).toBeNull();
    expect(() => separateDecision("same_bill", " ", ["a"], "t")).toThrow(/Say why/);
  });
  it("the decision keeps the reason, the matched entries and when; the server sets who", () => {
    const d = separateDecision("same_bill", "  Second order, new bill BT-20932 ", ["e1", "e1", "e2"], "2026-11-10T09:00:00.000Z");
    expect(d).toEqual({ decision: "separate", check: "same_bill", reason: "Second order, new bill BT-20932", matchedIds: ["e1", "e2"], decidedAt: "2026-11-10T09:00:00.000Z" });
    const stamped = stampDuplicateReview({ duplicateReview: [{ ...d, decidedBy: "someone-else" }] }, "owner-1");
    expect(stamped.duplicateReview?.[0]?.decidedBy).toBe("owner-1");
    // The server's metadata validator keeps it (and refuses an empty reason).
    expect(ReceiptDetailsSchema.parse(stamped).duplicateReview).toEqual(stamped.duplicateReview);
    expect(() => ReceiptDetailsSchema.parse({ duplicateReview: [{ ...d, reason: "  " }] })).toThrow();
  });
  it("the server stamps who decided and refuses a reused receipt on new entries (source check)", () => {
    const src = readFileSync("src/lib/fx.functions.ts", "utf8");
    expect(src).toContain("stampDuplicateReview(data.receiptDetails, userId)");
    expect(src).toContain('.eq("receipt_details->>fingerprint", fingerprint)');
    expect(src).toContain("receiptReuseError(fingerprint,");
    expect(src).toContain("receipt_details: receiptDetails");
  });
});

describe("confirmed duplicates stay protected from posting", () => {
  const base = { draftId: "draft-1", editingId: null, fingerprint: "sha256:abc", sameBillIds: [] as string[] };
  it("this draft's own id already saved", () => {
    expect(postingBlock({ ...base, entries: [entry("draft-1", "sha256:abc")] })?.kind).toBe("draft_saved");
  });
  it("the same receipt file already on another entry", () => {
    expect(postingBlock({ ...base, entries: [entry("other", "sha256:abc")] })).toMatchObject({ kind: "same_receipt", ids: ["other"] });
  });
  it("the owner said it IS the same bill", () => {
    expect(postingBlock({ ...base, fingerprint: null, sameBillIds: ["e1"], entries: [] })).toMatchObject({ kind: "same_bill", ids: ["e1"] });
  });
  it("nothing blocks a genuinely new bill, and edits of an existing entry are never blocked here", () => {
    expect(postingBlock({ ...base, entries: [entry("other", "sha256:zzz")] })).toBeNull();
    expect(postingBlock({ ...base, editingId: "draft-1", entries: [entry("draft-1", "sha256:abc"), entry("x", "sha256:abc")] })).toBeNull();
  });
  it("server rule: reuse is allowed only by the same id (an idempotent retry)", () => {
    expect(receiptReuseError("sha256:abc", ["draft-1"], ["draft-1"])).toBeNull();
    expect(receiptReuseError("sha256:abc", ["other"], ["draft-1"])).toMatch(/already attached/);
    expect(receiptReuseError(undefined, ["other"], [undefined])).toBeNull();
  });
});
