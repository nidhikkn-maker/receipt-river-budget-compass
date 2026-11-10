import { describe, expect, it } from "vitest";
import { cleanAppearance, cleanThemeName, resolveAppearance, THEME_FAMILIES, THEME_STYLES } from "./themes";
import { defaultPreferences, HOME_SECTIONS, normalizePreferences } from "./preferences";

describe("theme catalog (V4.3)", () => {
  it("offers five approved families and seven selectable styles, plus the proposed Signature Flow", () => {
    expect(THEME_FAMILIES).toHaveLength(6);
    expect(THEME_STYLES).toHaveLength(8);
    expect(THEME_STYLES.filter((t) => !t.proposed)).toHaveLength(7);
    expect(THEME_STYLES.filter((t) => t.proposed).map((t) => t.name)).toEqual(["signature-flow"]);
  });
  it("the Apple-inspired family has exactly three variations", () => {
    expect(THEME_STYLES.filter((t) => t.family === "Apple-Inspired Minimal").map((t) => t.name)).toEqual(["apple-classic", "apple-ledgerline", "apple-glass"]);
  });
  it("Signature Blue & Gold is the default theme", () => {
    expect(defaultPreferences().themeName).toBe("signature");
  });
  it("every style has a four-colour preview swatch", () => {
    for (const t of THEME_STYLES) expect(t.swatch).toHaveLength(4);
  });
});

describe("theme preference cleaning", () => {
  it("accepts known styles and rejects unknown ones", () => {
    expect(cleanThemeName("midnight")).toBe("midnight");
    expect(cleanThemeName("neon-punk")).toBe("signature");
    expect(cleanThemeName(undefined)).toBe("signature");
  });
  it("validates appearance values", () => {
    expect(cleanAppearance("dark")).toBe("dark");
    expect(cleanAppearance("blue")).toBe("system");
  });
  it("resolves follow-system against the OS preference", () => {
    expect(resolveAppearance("system", true)).toBe("dark");
    expect(resolveAppearance("system", false)).toBe("light");
    expect(resolveAppearance("light", true)).toBe("light");
  });
});

describe("preference normalisation", () => {
  it("keeps a saved theme and repairs a broken one", () => {
    expect(normalizePreferences({ themeName: "forest" }).themeName).toBe("forest");
    expect(normalizePreferences({ themeName: "bogus" as never }).themeName).toBe("signature");
  });
  it("validates the home workspace filter", () => {
    expect(normalizePreferences({ homeScope: "business" }).homeScope).toBe("business");
    expect(normalizePreferences({ homeScope: "moon" as never }).homeScope).toBe("all");
  });
  it("supports a custom overview range and sorts swapped dates", () => {
    const p = normalizePreferences({ homePeriod: "custom", homeCustomStart: "2026-10-31", homeCustomEnd: "2026-10-01" });
    expect(p.homePeriod).toBe("custom");
    expect(p.homeCustomStart).toBe("2026-10-01");
    expect(p.homeCustomEnd).toBe("2026-10-31");
  });
  it("drops malformed custom dates", () => {
    expect(normalizePreferences({ homeCustomStart: "31/10/2026" }).homeCustomStart).toBe("");
  });
  it("exposes the redesigned home sections in order", () => {
    expect([...HOME_SECTIONS]).toEqual(["overview", "readiness", "metrics", "insights", "upcoming", "briefing", "travel", "recent"]);
  });
  it("migrates old home layouts by dropping removed sections and appending new ones", () => {
    const p = normalizePreferences({ homeOrder: ["quick", "recent", "alerts"] as never });
    expect(p.homeOrder[0]).toBe("recent");
    expect(p.homeOrder).toContain("overview");
    expect(p.homeOrder).not.toContain("quick");
  });
});
