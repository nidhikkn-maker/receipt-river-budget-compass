import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { normalizeEmail, validateRequest } from "./family-requests";

describe("family requests", () => {
  it("normalises invite emails and rejects invalid ones", () => {
    expect(normalizeEmail("  Asha@Example.COM ")).toBe("asha@example.com");
    expect(() => normalizeEmail("asha")).toThrow();
  });
  it("needs a purpose, a positive amount and evidence under 10 MB", () => {
    expect(() => validateRequest({ title: "", amount: 10, neededBy: null })).toThrow();
    expect(() => validateRequest({ title: "Trip", amount: 0, neededBy: null })).toThrow();
    expect(() => validateRequest({ title: "Trip", amount: 10, neededBy: null, file: { size: 11 * 1024 * 1024 } })).toThrow();
    expect(() => validateRequest({ title: "Trip", amount: 2500, neededBy: "2026-11-20" })).not.toThrow();
  });
});
