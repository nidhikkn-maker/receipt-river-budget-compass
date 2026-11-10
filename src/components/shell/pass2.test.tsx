// Fidelity pass 2 (KK decisions, 11 Nov 2026): reference colours as Signature Flow tokens with every text pair at
// WCAG AA, tabular money figures, a working compact sync status, and labelled Coming up amounts.
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const local = vi.hoisted(() => ({ store: {} as Record<string, unknown>, navigate: vi.fn() }));
vi.mock("@/lib/store", () => ({ useStore: () => local.store }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => local.navigate }));

import { SyncStatus } from "./SyncStatus";
import { amountCaption, comingUpLabel } from "./pages/HomePage";

const css = readFileSync("src/styles.css", "utf8");
const pass2 = css.slice(css.indexOf("B1e: Signature Flow fidelity pass 2"));
const token = (name: string) => new RegExp(`html\\[data-theme="signature-flow"\\]:not\\(\\.dark\\) \\{[^}]*${name}:\\s*(#[0-9A-F]{6})`).exec(pass2)?.[1];

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h: string) => { const [r, g, b] = hex(h).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };

describe("decision 2: reference colours as Signature Flow tokens", () => {
  it.each([["--sf-canvas", "#F9F9F7"], ["--sf-deep", "#26565A"], ["--sf-panel", "#29493E"], ["--sf-action-deep", "#2C5341"], ["--sf-rail-active", "#E0EEEE"], ["--sf-step-on", "#DFEDE0"], ["--sf-step-off", "#EDF2EC"], ["--sf-add", "#223B35"]])("%s is %s in the light appearance", (name, value) => {
    expect(token(name)).toBe(value);
  });
  it("dark appearance keeps its own values (the light reference tokens apply only without .dark)", () => {
    expect(pass2).toMatch(/html\[data-theme="signature-flow"\]:not\(\.dark\) \{/);
    expect(pass2).not.toMatch(/signature-flow"\]\.dark[^{]*\{[^}]*#29493E/);
  });
});

describe("decision 6: text on the new colours meets WCAG AA", () => {
  const MUTED = "#646D65"; const INK = "#222923";
  it.each([
    ["ink on canvas", INK, "#F9F9F7", 4.5], ["muted on canvas", MUTED, "#F9F9F7", 4.5], ["muted on later step", MUTED, "#EDF2EC", 4.5],
    ["teal on canvas (links, active labels)", "#26565A", "#F9F9F7", 4.5], ["teal on active tile", "#26565A", "#E0EEEE", 4.5], ["teal on current step", "#26565A", "#DFEDE0", 4.5],
    ["canvas on teal buttons", "#F9F9F7", "#26565A", 4.5], ["canvas on Review now", "#F9F9F7", "#2C5341", 4.5], ["canvas on the panel", "#F9F9F7", "#29493E", 4.5], ["canvas on the iPhone Add", "#F9F9F7", "#223B35", 3],
    ["panel muted (72 % canvas) on the panel", "#BFC8C3", "#29493E", 4.5],
  ])("%s", (_name, fg, bg, need) => { expect(ratio(fg, bg)).toBeGreaterThanOrEqual(need); });
  it("keeps the AA muted text instead of the reference #778178, which fails on the canvas", () => {
    expect(ratio("#778178", "#F9F9F7")).toBeLessThan(4.5);
    expect(css).not.toMatch(/--sf-muted:\s*#778178/);
  });
});

describe("decision 1: tabular money figures", () => {
  it("hero, panel metrics and row amounts use tabular numerals; no proportional override is left in force", () => {
    expect(pass2).toMatch(/:is\(\.sf-worth-figure, \.sf-worth-metrics dd, \.sf-row-amount\) \{ font-variant-numeric: tabular-nums; \}/);
    expect(css.lastIndexOf("font-variant-numeric: tabular-nums")).toBeGreaterThan(css.lastIndexOf("font-variant-numeric: normal"));
  });
});

describe("decision 3: header sync status reflects the real state", () => {
  beforeEach(() => { local.navigate.mockReset(); });
  afterEach(cleanup);
  const set = (x: Record<string, unknown>) => { local.store = { syncState: "synced", lastSyncedAt: new Date().toISOString(), pendingCount: 0, refresh: vi.fn(), ...x }; };

  it("up to date: a 44 px icon button named by its state; tapping refreshes", () => {
    set({});
    render(<SyncStatus compact />);
    const b = screen.getByRole("button", { name: "Up to date" });
    expect(b).toHaveClass("sf-sync-btn");
    expect(b).not.toHaveAttribute("data-attention");
    fireEvent.click(b);
    expect(local.store["refresh"]).toHaveBeenCalledTimes(1);
  });
  it("offline with waiting entries shows the words and opens the sync queue", () => {
    set({ syncState: "offline", pendingCount: 2 });
    render(<SyncStatus compact />);
    const b = screen.getByRole("button", { name: "Offline · 2 waiting" });
    expect(b).toHaveAttribute("data-attention", "true");
    expect(b).toHaveAttribute("data-sync-state", "offline");
    expect(screen.getByText("Offline · 2 waiting")).toHaveClass("sf-sync-label");
    fireEvent.click(b);
    expect(local.navigate).toHaveBeenCalledWith({ to: "/sync-queue" });
  });
  it("offline without waiting entries and failures are shown too", () => {
    set({ syncState: "offline" });
    const { unmount } = render(<SyncStatus compact />);
    expect(screen.getByRole("button", { name: "Offline · saved copy" })).toHaveAttribute("data-attention", "true");
    unmount();
    set({ syncState: "error" });
    render(<SyncStatus compact />);
    expect(screen.getByRole("button", { name: /Couldn't update/ })).toHaveAttribute("data-sync-state", "error");
  });
});

describe("decision 4: Coming up amounts say what they are", () => {
  const today = "2026-11-09";
  it("speaks one sentence per row and captions the amount", () => {
    expect(comingUpLabel({ name: "SIP — Parag Parikh Flexi Cap", date: "2026-11-11", amount: 25000, direction: "out" }, today)).toBe("SIP — Parag Parikh Flexi Cap. Payment ₹25,000.00 due 11 Nov.");
    expect(comingUpLabel({ name: "Rent", date: "2026-11-15", amount: 42000, direction: "in" }, today)).toBe("Rent. Money in ₹42,000.00 expected 15 Nov.");
    expect(comingUpLabel({ name: "LIC", date: "2026-11-05", amount: 18650, direction: "out", overdue: true }, today)).toBe("LIC. Payment ₹18,650.00 overdue since 5 Nov.");
    expect(amountCaption({ name: "x", date: today, amount: 1, direction: "out" }, today)).toBe("Due today");
    expect(amountCaption({ name: "x", date: "2026-11-11", amount: 1, direction: "out" }, today)).toBe("Due");
    expect(amountCaption({ name: "x", date: "2026-11-11", amount: 1, direction: "in" }, today)).toBe("Expected");
  });
  it("the amount column is right-aligned with tabular figures and titles wrap to two lines on every size", () => {
    expect(pass2).toMatch(/\.sf-coming-amount \{[^}]*justify-items: end;[^}]*text-align: right;/);
    expect(pass2).toMatch(/\.sf-clamp-2 \{[^}]*-webkit-line-clamp: 2;/);
  });
});
