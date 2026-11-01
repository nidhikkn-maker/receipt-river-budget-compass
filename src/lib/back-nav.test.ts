import { describe, expect, it } from "vitest";
import { showBackButton } from "./back-nav";
describe("back button", () => {
  it("hidden on dashboard", () => { expect(showBackButton("/dashboard")).toBe(false); expect(showBackButton("/")).toBe(false); });
  it("shown on other pages", () => { expect(showBackButton("/family")).toBe(true); expect(showBackButton("/trips/abc")).toBe(true); });
});
