import { describe, expect, it } from "vitest";
import { normalizePreferences, sanitizeSavedViews } from "./preferences";

describe("saved transaction views", () => {
  it("survive reload with their filters", () => {
    const p = normalizePreferences({ savedViews: [{ id: "a", name: "Fuel", filters: { category: "Fuel", scope: "business" } }] });
    expect(p.savedViews).toEqual([{ id: "a", name: "Fuel", filters: { category: "Fuel", scope: "business" } }]);
  });
  it("drops unnamed views and keeps at most 20", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ id: String(i), name: `V${i}`, filters: {} }));
    expect(sanitizeSavedViews([{ id: "x", name: " ", filters: {} }, ...many])).toHaveLength(20);
  });
});
