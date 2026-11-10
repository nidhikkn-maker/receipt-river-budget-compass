import { describe, expect, it } from "vitest";
import { activeDestination, backTarget, BOTTOM_BAR, breadcrumbs, emptyTrail, IPHONE_REPORTS_PATH, ownsHeader, RAIL, sectionOf, showsBack, stepTrail, titleOf, trailFrom } from "./navigation";

describe("Signature Flow destinations", () => {
  it("desktop and iPad rail: Home, Money, To-do, Records, Reports, Add (capture 01)", () => {
    expect(RAIL.map((d) => d.label)).toEqual(["Home", "Money", "To-do", "Records", "Reports", "Add"]);
    expect(RAIL.map((d) => d.to)).toEqual(["/home", "/money", "/tasks", "/records", "/reports", "/add"]);
  });
  it("iPhone bar: Home, Money, central Add, To-do, Records (capture 02)", () => {
    expect(BOTTOM_BAR.map((d) => d.label)).toEqual(["Home", "Money", "Add", "To-do", "Records"]);
    expect(BOTTOM_BAR[2]?.id).toBe("add");
  });
  it("Reports is two taps from Home on iPhone: Records in the bar, then the Reports row", () => {
    expect(BOTTOM_BAR.some((d) => d.to === IPHONE_REPORTS_PATH[0])).toBe(true);
    expect(IPHONE_REPORTS_PATH).toHaveLength(2);
    expect(IPHONE_REPORTS_PATH[1]).toBe("/reports");
  });
});

describe("today's URLs keep their place", () => {
  it.each([
    ["/dashboard", "home"], ["/wealth", "money"], ["/cards/abc", "money"], ["/plan", "money"], ["/inbox?section=review", "tasks"],
    ["/vault", "records"], ["/statements", "records"], ["/trips/t1", "records"], ["/assets", "records"], ["/report-centre", "reports"],
    ["/tax", "reports"], ["/settings", "settings"], ["/search", "search"], ["/new", "add"],
  ])("%s sits under %s", (path, section) => { expect(sectionOf(path)).toBe(section); });
  it("highlights the bar item for old and new addresses", () => {
    expect(activeDestination("/dashboard")).toBe("home");
    expect(activeDestination("/inbox")).toBe("tasks");
    expect(activeDestination("/calendar")).toBeNull();
    expect(activeDestination("/unknown-page")).toBeNull();
  });
  it("gives plain titles", () => {
    expect(titleOf("/inbox?section=review")).toBe("Financial Inbox");
    expect(titleOf("/cards/abc")).toBe("Card");
    expect(titleOf("/something-new")).toBe("Something new");
  });
});

describe("breadcrumbs follow the real path (§5.1)", () => {
  it("Home has none and no Back", () => {
    expect(breadcrumbs("/home")).toEqual([]);
    expect(breadcrumbs("/dashboard")).toEqual([]);
    expect(showsBack("/home")).toBe(false);
    expect(showsBack("/money")).toBe(true);
  });
  it("a hub shows Home › hub", () => {
    expect(breadcrumbs("/money")).toEqual([{ label: "Home", to: "/home" }, { label: "Money" }]);
  });
  it("a page opened from Reports shows Reports, not its usual hub", () => {
    expect(breadcrumbs("/cards/abc", "/reports")).toEqual([{ label: "Home", to: "/home" }, { label: "Reports", to: "/reports" }, { label: "Card" }]);
  });
  it("a deep link with no history falls back to its destination", () => {
    expect(breadcrumbs("/cards/abc")).toEqual([{ label: "Home", to: "/home" }, { label: "Money", to: "/money" }, { label: "Card" }]);
    expect(breadcrumbs("/cards/abc", "/home")).toEqual([{ label: "Home", to: "/home" }, { label: "Money", to: "/money" }, { label: "Card" }]);
  });
  it("Back returns to the origin with its filters, else the destination, else Home", () => {
    expect(backTarget("/cards/abc", "/inbox?section=review")).toEqual({ to: "/inbox?section=review", label: "Financial Inbox" });
    expect(backTarget("/cards/abc")).toEqual({ to: "/money", label: "Money" });
    expect(backTarget("/money")).toEqual({ to: "/home", label: "Home" });
  });
  it("shell pages own their header; other pages get the shell's breadcrumb row", () => {
    expect(ownsHeader("/money")).toBe(true);
    expect(ownsHeader("/wealth")).toBe(false);
  });
});

describe("navigation trail", () => {
  it("records pushes, steps back and forward, and replaces", () => {
    let t = emptyTrail("/home");
    t = stepTrail(t, "PUSH", "/money");
    t = stepTrail(t, "PUSH", "/cards/a");
    expect(trailFrom(t)).toBe("/money");
    t = stepTrail(t, "BACK", "/money");
    expect(trailFrom(t)).toBe("/home");
    t = stepTrail(t, "FORWARD", "/cards/a");
    expect(trailFrom(t)).toBe("/money");
    t = stepTrail(t, "REPLACE", "/cards/b");
    expect(t.entries).toEqual(["/home", "/money", "/cards/b"]);
    t = stepTrail(t, "BACK", "/money");
    t = stepTrail(t, "PUSH", "/records");
    expect(t.entries).toEqual(["/home", "/money", "/records"]);
  });
  it("ignores a repeated push of the same page and keeps at most 50 entries", () => {
    let t = emptyTrail("/home");
    t = stepTrail(t, "PUSH", "/home");
    expect(t.entries).toEqual(["/home"]);
    for (let i = 0; i < 80; i++) t = stepTrail(t, "PUSH", `/p${i}`);
    expect(t.entries).toHaveLength(50);
    expect(trailFrom(emptyTrail("/x"))).toBeNull();
  });
});
