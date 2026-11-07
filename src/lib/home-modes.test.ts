import { describe, expect, it } from "vitest";
import { applyHomeMode, defaultPreferences, normalizePreferences } from "./preferences";

describe("home modes", () => {
  it("minimal shows only summary, recent and upcoming", () => {
    const p = applyHomeMode(defaultPreferences(), "minimal");
    expect(p.homeOrder.filter((x) => !p.homeHidden.includes(x))).toEqual(["overview", "recent", "upcoming"]);
    expect(p.homeMode).toBe("minimal");
  });
  it("daily keeps upcoming payments and recent activity visible", () => {
    const p = applyHomeMode(defaultPreferences(), "daily");
    expect(p.homeHidden).not.toContain("upcoming");
    expect(p.homeHidden).not.toContain("recent");
  });
  it("saved mode survives reload", () => {
    expect(normalizePreferences(applyHomeMode(defaultPreferences(), "executive")).homeMode).toBe("executive");
    expect(normalizePreferences({ homeMode: "bogus" as never }).homeMode).toBe("custom");
  });
});
