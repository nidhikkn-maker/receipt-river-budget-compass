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
/** The whole Signature Flow part of the stylesheet: from its theme tokens to the end of the file. */
const sfCss = css.slice(css.lastIndexOf("/*", css.indexOf("Signature Flow (Track B, batch B1)")));
/** §3.3 overline-style roles (uppercase, letter-spaced labels), which may be 10-12 px; everything else is at least 12. */
const OVERLINE = /sf-overline|sf-worth-metrics dt|sf-date small/;
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
  it("SH-7 / §4 iPad: at 768-1023 px the list/detail split stays (3:2), with the same columns before and after a choice", () => {
    const tablet = block.slice(block.indexOf("@media (min-width: 768px) and (max-width: 1023px)"));
    expect(rule(tablet, ".sf-split")).toContain("grid-template-columns: minmax(0, 3fr) minmax(0, 2fr)");
    expect(tablet.slice(0, tablet.indexOf("\n}"))).not.toMatch(/display: none|sf-split-has-detail/);
  });
  it("§3.3 page insets: iPhone 20, iPad 28, 1180 px 32, computer 40, on .sf-main and the header", () => {
    const at = (q: string) => block.slice(block.indexOf(q));
    expect(rule(block, ".sf-shell")).toContain("--sf-inset: 20px");
    expect(rule(at("@media (min-width: 768px) { html"), ".sf-shell")).toContain("--sf-inset: 28px");
    expect(rule(at("@media (min-width: 1180px) { html"), ".sf-shell")).toContain("--sf-inset: 32px");
    expect(rule(at("@media (min-width: 1280px) { html"), ".sf-shell")).toContain("--sf-inset: 40px");
    expect(rule(block, ".sf-main")).toContain("padding-left: max(var(--sf-inset), env(safe-area-inset-left))");
  });
  it("SH-8: key-value money rows are capped at 720 px", () => {
    expect(rule(block, ".money-row")).toContain("max-width: 720px");
  });
  it("L6: a long workspace name truncates (full name kept in the accessible name) before the header icons give way", () => {
    expect(rule(block, ".sf-header-tools > .sf-workspace")).toMatch(/flex-shrink: 1; min-width: 0/);
    expect(rule(block, ".sf-workspace-label")).toMatch(/overflow: hidden; text-overflow: ellipsis; white-space: nowrap/);
    expect(rule(block, ".sf-header-tools > *")).toContain("flex-shrink: 0");
    expect(rule(block, ".sf-workspace-label")).not.toContain("font-size");
  });
  it("never sets a font size below 12 px, except overline-style labels (§3.3 overline 10-12 px), in the density block", () => {
    for (const m of block.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{[^{}]*font-size: ([\d.]+)px/g)) expect(Number(m[2]), m[1]!.trim()).toBeGreaterThanOrEqual(OVERLINE.test(m[1]!) ? 10 : 12);
  });
  it("density 3: the whole Signature Flow stylesheet has no text below 10 px, and nothing but overline roles below 12 px", () => {
    // Every rule in the Signature Flow part of the stylesheet (theme tokens to the end), not just the density block, so
    // a calibrated value earlier in the file cannot win the cascade over the floor (e.g. .sf-canvas-alt .sf-link).
    expect(sfCss.length).toBeGreaterThan(block.length * 3);
    const sizes = [...sfCss.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{[^{}]*?font-size: ([\d.]+)px/g)].map((m) => [m[1]!.trim().split("\n").at(-1)!.trim(), Number(m[2])] as const);
    expect(sizes.length).toBeGreaterThan(100);
    expect(sizes.filter(([, px]) => px < 10)).toEqual([]);
    expect(sizes.filter(([sel, px]) => px < 12 && !OVERLINE.test(sel))).toEqual([]);
  });
  it("review L-C: the line under each net-worth metric (dd.sf-worth-sub) is support text at 12 px or more, on every width", () => {
    expect(OVERLINE.test(".sf-worth-metrics dd.sf-worth-sub")).toBe(false);
    const subs = [...sfCss.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/dd\.sf-worth-sub \{[^}]*font-size: ([\d.]+)px/g)].map((m) => Number(m[1]));
    expect(subs.length).toBeGreaterThanOrEqual(4);
    for (const px of subs) expect(px).toBeGreaterThanOrEqual(12);
    expect(rule(sfCss, ".sf-canvas-alt .sf-link")).toContain("font-size: 12px");
  });
  it("density 3 / §3.3: page titles 26-32 px from 768 px and section titles 17-20 px", () => {
    const tablet = sfCss.slice(sfCss.indexOf(`@media (min-width: 768px) {\n  ${SF} .sf-title`));
    expect(rule(tablet, ".sf-title")).toContain("font-size: 32px");
    for (const m of sfCss.matchAll(/\.sf-title \{[^}]*font-size: ([\d.]+)px/g)) expect(Number(m[1])).toBeLessThanOrEqual(32);
    const heads = [...sfCss.matchAll(/\.sf-section-head h2 \{[^}]*font-size: ([\d.]+)px/g)].map((m) => Number(m[1]));
    expect(heads.length).toBeGreaterThanOrEqual(3);
    for (const px of heads) { expect(px).toBeGreaterThanOrEqual(17); expect(px).toBeLessThanOrEqual(20); }
  });
  it("density 3: Plan calendar day cells are at least 44 x 44 with 12 px labels; the grid scrolls inside its own box", () => {
    expect(rule(block, ".plan-cal-grid")).toContain("grid-template-columns: repeat(7, minmax(44px, 1fr))");
    expect(rule(block, ".plan-cal-cell")).toMatch(/min-width: 44px; min-height: 44px/);
    expect(rule(block, ".plan-cal-meta")).toContain("font-size: 12px");
    expect(rule(block, ".plan-cal-scroll")).toMatch(/max-width: 100%; overflow-x: auto/);
    const src = readFileSync("src/components/PlanCalendar.tsx", "utf8");
    expect(src).toContain('<div className="plan-cal-scroll"><div className="plan-cal-grid grid grid-cols-7');
    expect(src).toContain('cn("plan-cal-cell h-20');
    expect(src.match(/className="plan-cal-meta/g)?.length).toBe(2);
    expect(src.match(/text-\[10px\]/g)?.length).toBe(2); // the only 10 px labels, both raised by .plan-cal-meta
  });
  it("§3.3 text roles: shell support text is at least 12 px", () => {
    expect(block).toContain(':is(.sf-back, .sf-crumbs ol, .sf-find, .sf-link, .sf-note, .sf-footnote) { font-size: 12px; }');
    expect(block).toMatch(/:is\(.sf-list-row, .sf-date-row, .sf-task-row, .sf-palette-row, .sf-module-row, .sf-split-row\) small \{ font-size: 12px; \}/);
  });
});

describe("Records row placement (SH-1)", () => {
  it("is shown on module index pages only", () => {
    for (const p of ["/trips", "/trips/", "/travel-inbox", "/vault", "/assets", "/claim-submission", "/trips?status=all"]) expect(showsRecordsSubnav(p), p).toBe(true);
    for (const p of ["/trips/t1", "/trips/t1?section=budget", "/assets/future-detail", "/records", "/money", "/home"]) expect(showsRecordsSubnav(p), p).toBe(false);
    expect(recordsTabOf("/trips/t1")).toBe("travel"); // the module itself is still known on detail pages
  });
});

describe("/assets app pages vs the build's hashed files", () => {
  // /assets is the Asset register's page (and /assets/<id> any future Asset detail route). The host's one-year
  // "immutable" Cache-Control is written for /<build.assetsDir>/*, and the worker's cache-first rule matched /assets/,
  // so the build files must live under a prefix that is not a route.
  const config = readFileSync("vite.config.ts", "utf8");
  it("the client build's hashed files go to /_build/, not /assets/", () => {
    expect(config).toContain('const BUILD_ASSETS_DIR = "_build";');
    expect(config).toContain("build: { assetsDir: BUILD_ASSETS_DIR }, environments: { client: { build: { assetsDir: BUILD_ASSETS_DIR } } }");
  });
  it("the offline worker's cache-first file rule covers /_build/ only and never answers a page navigation", () => {
    const rule = config.slice(config.indexOf("runtimeCaching"), config.indexOf('cacheName: "ledgerline-lazy"'));
    expect(rule).toContain('url.pathname.startsWith("/_build/")');
    expect(rule).not.toContain("/assets");
    expect(rule).toContain('request.mode !== "navigate"');
  });
  it("keeps the precache 'client/' prefix strip (without it every entry 404s and the worker never installs)", () => {
    expect(config).toContain('modifyURLPrefix: { "client/": "" }');
  });
});
