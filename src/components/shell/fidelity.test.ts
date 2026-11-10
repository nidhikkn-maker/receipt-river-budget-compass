// B1d Signature Flow fidelity correction: the new rules must stay inside the Signature Flow theme, so the classic
// UI and the other themes render exactly as before; the typeface must be self-hosted, licensed and subset correctly.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles.css", "utf8");
const MARKER = "B1d: Signature Flow fidelity correction";
const SF = 'html[data-theme="signature-flow"]';
const start = css.lastIndexOf("/*", css.indexOf(MARKER));
const before = css.slice(0, start);
const block = css.slice(start);

/** Selector preludes of every style rule in a CSS text (comments removed; at-rules skipped). */
function preludes(text: string): string[] {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: string[] = [];
  let buf = "";
  for (const ch of src) {
    if (ch === "{") { out.push(buf.trim()); buf = ""; }
    else if (ch === "}" || ch === ";") buf = "";
    else buf += ch;
  }
  return out.filter((p) => p && !p.startsWith("@"));
}
/** Splits a selector list at top-level commas (commas inside :is()/:has() stay). */
function selectors(prelude: string): string[] {
  const parts: string[] = []; let depth = 0; let cur = "";
  for (const ch of prelude) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

describe("B1d fidelity correction is scoped to the Signature Flow theme", () => {
  it("has the block at the end of the stylesheet", () => {
    expect(start).toBeGreaterThan(0);
  });
  it("scopes every selector in the block to html[data-theme=\"signature-flow\"]", () => {
    const sels = preludes(block).flatMap(selectors);
    expect(sels.length).toBeGreaterThan(100);
    const unscoped = sels.filter((s) => !s.startsWith(SF));
    expect(unscoped).toEqual([]);
  });
  it("declares only the three new font faces outside a theme selector, and no classic stack names them", () => {
    const faces = [...block.matchAll(/@font-face\s*\{[^}]*font-family:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(faces)).toEqual(new Set(["Manrope", "Manrope Fallback", "Noto Sans Devanagari"]));
    // Outside the block, these names appear only in the Signature Flow --sf-font stack (and its comment).
    const outside = before.split("\n").filter((l) => /Manrope|Noto Sans Devanagari/.test(l));
    for (const line of outside) expect(line.trim().startsWith("--sf-font:") || line.trim().startsWith("/*")).toBe(true);
  });
});

describe("Manrope is self-hosted, licensed and subset for the rupee sign", () => {
  const faces = [...block.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1] ?? "");
  const manrope = faces.filter((f) => /font-family:\s*"Manrope";/.test(f));
  it("serves latin and latin-ext from the package (no third-party CDN), with font-display: swap", () => {
    expect(manrope).toHaveLength(2);
    for (const f of manrope) {
      expect(f).toContain("font-display: swap");
      expect(f).toMatch(/url\("\.\.\/node_modules\/@fontsource-variable\/manrope\/files\/manrope-latin(-ext)?-wght-normal\.woff2"\)/);
      expect(f).not.toMatch(/https?:/);
    }
    expect(manrope.some((f) => f.includes("U+20AD-20C0"))).toBe(true); // ₹ U+20B9 (latin-ext)
  });
  it("adds a metric-adjusted fallback and keeps ₹ out of the Devanagari range", () => {
    const fallback = faces.find((f) => f.includes('"Manrope Fallback"')) ?? "";
    expect(fallback).toMatch(/size-adjust: \d+%/);
    expect(fallback).toMatch(/ascent-override: [\d.]+%/);
    const deva = faces.find((f) => f.includes('"Noto Sans Devanagari"')) ?? "";
    expect(deva).toContain("U+0900-097F");
    expect(deva).not.toContain("20B9");
    expect(deva).toContain("font-display: swap");
  });
  it("puts Manrope, its fallback, Tamil and Devanagari in the Signature Flow stack", () => {
    const stack = block.match(/--sf-font: ([^;]+);/)?.[1] ?? "";
    expect(stack.startsWith('"Manrope", "Manrope Fallback"')).toBe(true);
    expect(stack).toContain('"Noto Sans Tamil"');
    expect(stack).toContain('"Noto Sans Devanagari"');
  });
  it("ships the SIL OFL 1.1 licence texts", () => {
    for (const f of ["public/fonts/LICENSE-Manrope-OFL.txt", "public/fonts/LICENSE-NotoSansDevanagari-OFL.txt"]) {
      expect(existsSync(f)).toBe(true);
      expect(readFileSync(f, "utf8")).toContain("SIL OPEN FONT LICENSE Version 1.1");
    }
  });
  it("preloads the Manrope file only when Signature Flow is showing", () => {
    const root = readFileSync("src/routes/__root.tsx", "utf8");
    expect(root).toContain('import manropeLatinUrl from "@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2?url"');
    expect(root).toMatch(/if\(\(\(e\.dataset\.theme==="signature-flow"&&u!=="classic"\)\|\|u==="signature-flow"\)&&!document\.querySelector\([^)]*\)\)\{[^}]*p\.rel="preload";p\.as="font"/);
  });
});

describe("B1d keeps the 44 px touch targets", () => {
  it("smaller reference pills are painted inside 44 px boxes", () => {
    expect(block).toMatch(/:is\(\.sf-worth-actions \.sf-btn, \.sf-next \.sf-btn, \.sf-find, \.sf-chips\[role="radiogroup"\] \.sf-chip, \.sf-canvas-foot \.sf-btn, \.sf-canvas-close\) \{[^}]*min-height: 44px !important; height: 44px;/);
    expect(block).toMatch(/\.sf-tab-add \{ width: 44px; height: 44px; min-height: 44px !important;/);
    expect(block).toMatch(/:is\(\.sf-link, \.sf-back\) \{ min-height: 44px; \}/);
    // No rule in the block sets a min-height below 44 px on a control (the step chips are a non-interactive <ol>).
    for (const m of block.matchAll(/([^{}]+)\{[^}]*min-height: (\d+)px/g)) {
      if ((m[1] ?? "").includes(".sf-steps li")) continue;
      expect(Number(m[2]), m[1]).toBeGreaterThanOrEqual(44);
    }
  });
});
