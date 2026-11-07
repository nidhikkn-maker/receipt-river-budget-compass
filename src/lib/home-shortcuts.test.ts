import { expect, it } from "vitest";
import { cleanShortcuts, DEFAULT_SHORTCUTS, moveShortcut, primaryShortcuts } from "./home-shortcuts";
it("starts with the six requested defaults and keeps Add expense optional", () => {
  expect(cleanShortcuts(undefined)).toEqual(["scan", "inbox", "travel", "search", "payments", "reports"]);
  expect(DEFAULT_SHORTCUTS).not.toContain("expense");
});
it("can hide all shortcuts without resetting the user's choice", () => expect(cleanShortcuts([])).toEqual([]));
it("preserves chosen order and removes duplicates and unknown actions", () => expect(cleanShortcuts(["travel", "scan", "travel", "unknown"])).toEqual(["travel", "scan"]));
it("shows at most six primary shortcuts", () => expect(primaryShortcuts([...DEFAULT_SHORTCUTS, "create-trip"])).toEqual(DEFAULT_SHORTCUTS));
it("moves travel actions first without losing selected actions", () => expect(moveShortcut(DEFAULT_SHORTCUTS, "travel", 0)).toEqual(["travel", "scan", "inbox", "search", "payments", "reports"]));