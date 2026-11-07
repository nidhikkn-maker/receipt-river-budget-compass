import { describe, expect, it } from "vitest";
import { backStep, showBackButton } from "./back-nav";
describe("back button", () => {
  it("hidden on dashboard", () => { expect(showBackButton("/dashboard")).toBe(false); expect(showBackButton("/")).toBe(false); });
  it("shown on other pages", () => { expect(showBackButton("/family")).toBe(true); expect(showBackButton("/trips/abc")).toBe(true); });
  it("uses the app's own history when it knows the previous page", () => {
    expect(backStep(true, 4)).toBe("router");
    expect(backStep(true, 1)).toBe("router");
  });
  it("uses the browser's back step after a refresh or a shared link", () => {
    expect(backStep(false, 4)).toBe("browser");
    expect(backStep(false, 2)).toBe("browser");
  });
  it("goes to the dashboard only when nothing is behind the user", () => {
    expect(backStep(false, 1)).toBe("home");
  });
});

describe("primary tab pages", () => {
  it("My Spaces is a starting point without a Back button", () => {
    expect(showBackButton("/spaces")).toBe(false);
  });
});
