import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { draftStatus, hasDraftContent, pendingDrafts, type Draft } from "./drafts";

describe("expense drafts", () => {
  it("an empty form is not a draft", () => {
    expect(hasDraftContent({ category: "Groceries", date: "2026-10-31" }, 0)).toBe(false);
  });
  it("a receipt alone makes a draft", () => {
    expect(hasDraftContent({}, 1)).toBe(true);
  });
  it("a receipt with no amount needs information", () => {
    expect(draftStatus({}, 1)).toBe("info_required");
  });
  it("amount plus category is ready for review", () => {
    expect(draftStatus({ amount: "120", category: "Fuel" }, 0)).toBe("ready");
  });
  it("a failed read is flagged", () => {
    expect(draftStatus({ error: "x", amount: "5", category: "Fuel" }, 1)).toBe("failed");
  });
  it("saved drafts leave the pending list", () => {
    const d = (status: Draft["status"]) => ({ id: status, data: {}, receipts: [], status, transactionId: null, createdAt: "", updatedAt: "" });
    expect(pendingDrafts([d("saved"), d("draft")]).map((x) => x.id)).toEqual(["draft"]);
  });
});
