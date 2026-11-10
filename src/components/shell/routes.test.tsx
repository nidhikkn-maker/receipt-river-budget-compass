// Shell routes exist and today's URLs keep matching their pages (no loaders run, nothing rendered).
import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { routeTree } from "@/routeTree.gen";

const local = vi.hoisted(() => ({ mode: "classic" as "classic" | "signature-flow" }));
vi.mock("./use-shell-mode", () => ({ useShellMode: () => ({ mode: local.mode, theme: "signature", override: null }) }));
vi.mock("./pages/HomePage", () => ({ SignatureHome: () => <p>Signature Flow Home</p> }));

afterEach(cleanup);
const router = () => createRouter({ routeTree, context: { queryClient: new QueryClient() } });
const leaf = (path: string) => router().matchRoutes(path).at(-1)?.routeId;

describe("Signature Flow routes (§5.2)", () => {
  it.each(["home", "money", "tasks", "records", "calendar", "notifications", "add"])("/%s is a page", (p) => {
    expect(leaf(`/${p}`)).toBe(`/_authenticated/${p}`);
  });
  it("Reports and Search keep their existing pages", () => {
    expect(leaf("/reports")).toBe("/_authenticated/reports");
    expect(leaf("/search")).toBe("/_authenticated/search");
  });
});

describe("today's URLs keep working", () => {
  it.each(["dashboard", "wealth", "inbox", "vault", "plan", "statements", "expenses", "trips", "assets", "settings", "review", "report-centre", "entities", "claim-submission"])("/%s still matches its page", (p) => {
    const id = leaf(`/${p}`);
    expect(id).not.toBe(rootRouteId);
    expect(id).toBe(p === "trips" ? "/_authenticated/trips/" : `/_authenticated/${p}`);
  });
  it("retired addresses still resolve to their redirect routes", () => {
    for (const p of ["reconcile", "statement-crosscheck", "forex-reconcile"]) expect(leaf(`/${p}`)).toBe(`/_authenticated/${p}`);
  });
  it("/dashboard is an alias: Signature Flow Home when the shell is on", async () => {
    local.mode = "signature-flow";
    const { Route } = await import("@/routes/_authenticated/dashboard");
    const Component = Route.options.component as () => React.ReactElement;
    render(<Component />);
    expect(screen.getByText("Signature Flow Home")).toBeInTheDocument();
  });
});

describe("theme tokens (where testable without a browser)", () => {
  const css = readFileSync("src/styles.css", "utf8");
  it("defines the Signature Flow light and dark token blocks with the approved palette", () => {
    expect(css).toContain('html[data-theme="signature-flow"] {');
    expect(css).toContain('html[data-theme="signature-flow"].dark {');
    for (const hex of ["#222923", "#778178", "#F5F5F0", "#E7E8E1", "#223B35", "#D3E8DC", "#AD7756", "#FBFBF8"]) expect(css).toContain(hex);
  });
  it("keeps the frame from scrolling sideways and grids from growing past the phone width", () => {
    expect(css).toMatch(/\.sf-frame \{[^}]*overflow-x: clip/);
    expect(css).toMatch(/\.sf-home-grid \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
    expect(css).toMatch(/\.sf-module-grid \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
    expect(css).toMatch(/\.sf-split \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  });
  it("uses a sans family for headings in this theme (no serif display)", () => {
    expect(css).toMatch(/html\[data-theme="signature-flow"\] :is\([^)]*\.cmp-serif[^)]*\) \{ font-family: var\(--sf-font\); \}/);
  });
});

describe("B1b safe-area and bottom-bar rules", () => {
  const css = readFileSync("src/styles.css", "utf8");
  it("reserves the bar height plus the bottom inset under iPhone content", () => {
    expect(css).toContain("--sf-safe-bottom: env(safe-area-inset-bottom, 0px)");
    expect(css).toMatch(/\.sf-main \{ padding: 16px [^;]*calc\(var\(--sf-tabbar-h\) \+ var\(--sf-safe-bottom\) \+ 28px\)/);
    expect(css).toMatch(/\.sf-tabbar \{ background: var\(--card\);[^}]*height: calc\(var\(--sf-tabbar-h\) \+ var\(--sf-safe-bottom\)\)/);
  });
  it("the Smart Add canvas footer clears the home indicator", () => {
    expect(css).toMatch(/\.sf-canvas-foot \{[^}]*env\(safe-area-inset-bottom\)/);
  });
});
