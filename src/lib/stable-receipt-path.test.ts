import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { stableReceiptPath } from "./drafts";
describe("offline receipt retries", () => {
  it("uploads a retried photo to the same place, so no second copy is made", () => {
    expect(stableReceiptPath("u1", "d1", 0, "IMG 1.jpg")).toBe(stableReceiptPath("u1", "d1", 0, "IMG 1.jpg"));
    expect(stableReceiptPath("u1", "d1", 0, "IMG 1.jpg")).toBe("u1/drafts/d1/offline-0-IMG_1.jpg");
  });
});
