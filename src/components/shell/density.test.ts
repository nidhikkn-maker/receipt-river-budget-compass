// Density audit SH-1 … SH-8 (lead gate 12 Nov 2026): the shell's size floors are stylesheet rules, so they are checked
// in the stylesheet. Every new rule is scoped to the Signature Flow theme; Classic and the other themes are untouched.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recordsTabOf, showsRecordsSubnav } from "./navigation";

const css = readFileSync("src/styles.css", "utf8");
const MARKER = "Density audit, shared shell SH-1";
const block = css.slice(css.lastIndexOf("/*", css.indexOf(MARKER)));
const SF = 'html[data-theme="signature-flow"]';
const phone = block.slice(block.indexOf("@media (max-width: 767px)"));
/** Declarations of the first rule whose selector is exactly `sel` in `text`. */
const rule = (text: string, sel: string) => {
  const at = text.indexOf(`${SF} ${sel} {`);
  return at < 0 ? "" : text.slice(at, text.indexOf("}", at));
};

describe("density rules (Signature Flow only)", () => {
  it("is at the end of the stylesheet and every selector is theme-scoped", () => {
    expect(css.indexOf(MARKER)).toBeGreaterThan(0);
    const sels = block.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+(?=\{)/g)!.map((s) => s.trim()).filter((s) => !s.startsWith("@"));
    expect(sels.length).toBeGreaterThan(10);
    expect(sels.filter((s) => !s.startsWith(SF))).toEqual([]);
  });
  it("SH-1: on iPhone the Back/Find row has no rule and Find is a 44 x 44 icon with a visually hidden label", () => {
    expect(rule(phone, ".sf-crumbs")).toContain("border-bottom: 0");
    expect(rule(phone, ".sf-find")).toMatch(/width: 44px; min-width: 44px/);
    expect(rule(phone, ".sf-find-label")).toContain("clip: rect(0 0 0 0)");
  });
  it("SH-2: Records row labels are 13 px with an edge fade", () => {
    expect(rule(block, ".sf-subnav a")).toContain("font-size: 13px");
    expect(block).toContain(`${SF} .sf-subnav[data-fade-end]`);
  });
  it("SH-3: bottom-bar labels are 12 px", () => {
    expect(rule(phone, ".sf-tab")).toContain("font-size: 12px");
  });
  it("SH-4: header icon buttons are 44 x 44 on iPhone", () => {
    expect(rule(phone, ".sf-header .sf-icon-btn")).toContain("width: 44px; height: 44px");
  });
  it("SH-5: breadcrumb links are at least 44 px wide", () => {
    expect(rule(block, ".sf-crumbs li a")).toContain("min-width: 44px");
  });
  it("SH-7: below 1024 px a list/detail page is one column until a row is chosen", () => {
    const tablet = block.slice(block.indexOf("@media (min-width: 768px) and (max-width: 1023px)"));
    expect(rule(tablet, ".sf-split:not(.sf-split-has-detail)")).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(rule(tablet, ".sf-split:not(.sf-split-has-detail) .sf-split-detail")).toContain("display: none");
  });
  it("SH-8: key-value money rows are capped at 720 px", () => {
    expect(rule(block, ".money-row")).toContain("max-width: 720px");
  });
  it("never sets a font size below 12 px", () => {
    for (const m of block.matchAll(/font-size: ([\d.]+)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(12);
  });
});

describe("Records row placement (SH-1)", () => {
  it("is shown on module index pages only", () => {
    for (const p of ["/trips", "/trips/", "/travel-inbox", "/vault", "/assets", "/claim-submission", "/trips?status=all"]) expect(showsRecordsSubnav(p), p).toBe(true);
    for (const p of ["/trips/t1", "/trips/t1?section=budget", "/assets/import", "/assets/a1", "/records", "/money", "/home"]) expect(showsRecordsSubnav(p), p).toBe(false);
    expect(recordsTabOf("/trips/t1")).toBe("travel"); // the module itself is still known on detail pages
  });
});

describe("/assets app pages vs the build's /assets/ files", () => {
  it("the offline worker's cache-first file rule never answers a page navigation", () => {
    const config = readFileSync("vite.config.ts", "utf8");
    const rule = config.slice(config.indexOf("runtimeCaching"), config.indexOf('cacheName: "ledgerline-lazy"'));
    expect(rule).toContain('url.pathname.startsWith("/assets/")');
    expect(rule).toContain('request.mode !== "navigate"');
  });
});
