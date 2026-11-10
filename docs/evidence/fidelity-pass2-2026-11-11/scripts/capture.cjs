// Fidelity pass 2 capture harness (adapted from ../../fidelity-correction-2026-11-10/scripts/capture.cjs).
// Raw PNG + JSON go to $CAPS/<LABEL> (outside the repository); pipeline.sh copies the JSON into ../captures/<LABEL>.
// Extra per-capture data: __contrast (every visible text node: colour, effective background, ratio), __boxes (sticky
// actions, canvas footer, toasts, preview pill, tab bar) and __actions (all visible "Continue to confirmation" buttons).
// Runs Playwright Chromium against the local FIXTURE preview (scripts/dev/local-preview.cjs, PREVIEW_PORT=8088).
// Nothing is saved to any backend; hosted Supabase is blocked; the receipt extraction is stubbed.
//
// LABEL   = before | after          (output folder captures/<LABEL>-<VARIANT>)
// VARIANT = asis                    (fonts exactly as the page loads them)
//         | manrope                 (before only: Manrope injected by the harness, to isolate font from geometry)
// SET     = ref | devices | classic (comma-separated)
// REFTEXT = 1 (default)             Home: replaces the fixture's text and figures with the reference's text in the
//                                   CAPTURE PAGE ONLY (never product code), so pixel diffs isolate typography/spacing.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const BASE = `http://localhost:${process.env.PORT || 8088}`;
const LABEL = process.env.LABEL || "after";
const VARIANT = process.env.VARIANT || "asis";
const REFTEXT = process.env.REFTEXT !== "0";
const OUT = path.join(process.env.CAPS || path.join(__dirname, "..", "captures"), LABEL);
const TRAVEL = process.env.TRAVEL || "/trips";
fs.mkdirSync(OUT, { recursive: true });
const RECEIPT = path.join(__dirname, "..", "sample-receipt.png");
const MAN = path.join(__dirname, "..", "..", "..", "..", "node_modules", "@fontsource-variable", "manrope", "files");
const extraction = { ok: true, result: { title: "Blue Tokai Coffee", merchant: "Blue Tokai Coffee Roasters", date: "2026-11-09", amount: 460, subtotal: 438.1, tax: 21.9, tip: null, round_off: null, charges: [],
  tax_parts: [{ label: "CGST", rate: 2.5, amount: 10.95 }, { label: "SGST", rate: 2.5, amount: 10.95 }], confidence: { merchant: "high", date: "high", total: "high" },
  items: [{ name: "Cappuccino", quantity: 2, amount: 380, section: null, confidence: { name: "high", amount: "high" } }, { name: "Almond croissant", quantity: 1, amount: 58.1, section: null, confidence: { name: "high", amount: "high" } }],
  text: "BLUE TOKAI COFFEE ROASTERS ... TOTAL 460.00", currency: "INR", payment_method: "credit_card", description: null, category: "Food", scope: "personal" } };

const ROLES = {
  wordmark: ".sf-wordmark", tmark: ".sf-tmark", workspace: ".sf-workspace", avatar: ".sf-avatar", overline: "main .sf-overline", greeting: ".sf-hero-title", pageTitle: ".sf-title", lede: ".sf-lede",
  homeBtnDeep: ".sf-home-head .sf-btn-deep", worthPanel: ".sf-worth", worthFigure: ".sf-worth-figure", worthNote: ".sf-worth-note", metricLabel: ".sf-worth-metrics dt", metricFigure: ".sf-worth-metrics dd.financial-amount",
  metricSub: ".sf-worth-metrics dd.sf-worth-sub", worthBtnLight: ".sf-worth-actions .sf-btn-light", sectionTitle: ".sf-section-head h2", sectionLink: ".sf-section-head .sf-link", dateRow: ".sf-date-row",
  rowTitle: ".sf-date-row b.block, .sf-list-row b, .sf-module-row b", nextBand: ".sf-next", nextBtn: ".sf-next .sf-btn", rail: ".sf-rail", railLabel: ".sf-rail-item > span:last-child", header: ".sf-header",
  tabbar: ".sf-tabbar", tabAdd: ".sf-tab-add", back: ".sf-back", find: ".sf-find", canvas: ".sf-canvas", canvasTitle: ".sf-canvas-title", chip: ".sf-chip", drop: ".sf-drop", footBtnDeep: ".sf-canvas-foot .sf-btn-deep",
  body: "body", classicH1: "main h1", sync: ".sf-header .sf-sync", headerSearch: ".sf-header-search", headerIcon: ".sf-header .sf-icon-btn svg", comingAmount: ".sf-coming .sf-row-amount",
  comingTitle: ".sf-coming .sf-date-row b.block", canvasLede: ".sf-canvas-lede", canvasHint: ".sf-canvas-hint", footNote: ".sf-foot-note", canvasFoot: ".sf-canvas-foot", previewPill: "[data-preview-info] > button",
  railActive: ".sf-rail-item[aria-current=page] .sf-nav-icon", stepCurrent: ".sf-steps li[data-state=current]", stepNext: ".sf-steps li[data-state=next]", recordsTabs: ".sf-subnav",
};
// WCAG 2.x contrast for every visible text node: computed colour composited over the nearest painted backgrounds.
function contrastScan() {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) { const o = c.match(/oklab|oklch|color\(/); return o ? null : null; } const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const toRgb = (() => { const cv = document.createElement("canvas"); cv.width = cv.height = 1; const cx = cv.getContext("2d", { willReadFrequently: true }); return (c) => { const d = parse(c); if (d) return d; cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const v = cx.getImageData(0, 0, 1, 1).data; return [v[0], v[1], v[2], v[3] / 255]; }; })();
  const over = (f, b) => [f[0] * f[3] + b[0] * (1 - f[3]), f[1] * f[3] + b[1] * (1 - f[3]), f[2] * f[3] + b[2] * (1 - f[3]), 1];
  const lum = (c) => { const ch = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]; };
  const hex = (c) => "#" + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
  // Painted pills (44 px rule): a ::before with a background, drawn under the element's text, counts as a layer above
  // the element's own background.
  const bgOf = (el) => { const stack = []; let image = false; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage !== "none" && !/url\(/.test(cs.backgroundImage)) image = true; const ps = getComputedStyle(e, "::before"); if (ps.content !== "none" && ps.content !== "normal" && ps.position === "absolute") { const pc = toRgb(ps.backgroundColor); if (pc[3] > 0) { stack.push(pc); if (pc[3] >= 1) break; } } const c = toRgb(cs.backgroundColor); if (c[3] > 0) { stack.push(c); if (c[3] >= 1) break; } } let b = [255, 255, 255, 1]; for (let i = stack.length - 1; i >= 0; i--) b = over(stack[i], b); return { b, image }; };
  const out = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.trim(); if (!t) continue; const el = n.parentElement; if (!el) continue;
    const cs = getComputedStyle(el); if (cs.visibility === "hidden" || +cs.opacity === 0 || parseFloat(cs.fontSize) < 1) continue;
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > innerHeight * 3) continue;
    if (el.closest(".sr-only, [aria-hidden=true] svg, script, style, [hidden]")) continue;
    if (cs.clip === "rect(0px, 0px, 0px, 0px)" || (r.width <= 1 && r.height <= 1)) continue;
    let op = 1; for (let e = el; e; e = e.parentElement) op *= +getComputedStyle(e).opacity;
    if (op < 0.15) continue; // hidden (e.g. the collapsed toasts behind the front one)
    const { b, image } = bgOf(el); const f0 = toRgb(cs.color); const f = over([f0[0], f0[1], f0[2], f0[3] * op], b);
    const L1 = lum(f), L2 = lum(b); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize), weight = +cs.fontWeight; const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const disabled = !!el.closest("button:disabled, [aria-disabled=true]");
    const cls = (el.className && typeof el.className === "string" ? el.className.split(/\s+/).filter((c) => /^(sf-|cmp-|text-|financial)/.test(c)).slice(0, 3).join(".") : "");
    const owner = el.closest("[class*=sf-]"); const ocls = owner && typeof owner.className === "string" ? owner.className.split(/\s+/).find((c) => c.startsWith("sf-")) : "";
    const key = `${hex(f)}|${hex(b)}|${size}|${weight}|${ocls}`;
    const prev = out.get(key);
    if (prev) { prev.count++; continue; }
    out.set(key, { fg: hex(f), bg: hex(b), ratio: +ratio.toFixed(2), size, weight, large, need: large ? 3 : 4.5, pass: ratio >= (large ? 3 : 4.5), disabled, bgImage: image, el: `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}`, owner: ocls || "", sample: t.slice(0, 40), count: 1 });
  }
  // Text drawn by a ::before (the painted avatar initials).
  for (const el of document.querySelectorAll(".sf-avatar")) {
    const ps = getComputedStyle(el, "::before"); const r = el.getBoundingClientRect(); if (r.width < 1 || !/^"/.test(ps.content)) continue;
    const f = toRgb(ps.color), b0 = toRgb(ps.backgroundColor); const b = over(b0, bgOf(el).b); const L1 = lum(f), L2 = lum(b); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    out.set("avatar", { fg: hex(f), bg: hex(b), ratio: +ratio.toFixed(2), size: parseFloat(ps.fontSize), weight: +ps.fontWeight, large: false, need: 4.5, pass: ratio >= 4.5, disabled: false, bgImage: false, el: "button.sf-avatar::before", owner: "sf-avatar", sample: ps.content.replace(/"/g, ""), count: 1 });
  }
  return [...out.values()].sort((a, b) => a.ratio - b.ratio);
}
async function measure(page, cdp, tag) {
  const out = {};
  await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
  for (const [role, sel] of Object.entries(ROLES)) {
    const info = await page.evaluate((sel) => {
      const els = [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      if (!els.length) return null;
      const e = els[0], cs = getComputedStyle(e), r = e.getBoundingClientRect();
      const st = {}; for (const p of ["font-family", "font-weight", "font-size", "line-height", "letter-spacing", "font-variant-numeric", "border-radius", "padding-top", "padding-left", "height", "width", "background-color", "color"]) st[p] = cs.getPropertyValue(p);
      return { count: els.length, text: (e.innerText || "").slice(0, 80), rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }, style: st };
    }, sel);
    if (!info) continue;
    try {
      const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: sel.split(",")[0] });
      if (nodeId) { const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId }); info.platformFonts = fonts; }
    } catch (e) { info.platformFontsErr = String(e.message || e); }
    out[role] = info;
  }
  out.__fonts = await page.evaluate(() => [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status} ${f.unicodeRange.slice(0, 24)}`));
  out.__preloads = await page.evaluate(() => [...document.querySelectorAll('link[rel=preload]')].map((l) => `${l.as} ${l.href}`));
  out.__fontRequests = page.__fontRequests ? [...page.__fontRequests] : [];
  out.__smallTargets = await page.evaluate(() => [...document.querySelectorAll("a[href], button, [role=button], [role=tab], [role=radio], input, select, summary")].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && (r.width < 44 || r.height < 44); }).map((e) => { const r = e.getBoundingClientRect(); return `${e.tagName.toLowerCase()} "${(e.getAttribute("aria-label") || e.innerText || "").trim().slice(0, 40)}" ${r.width.toFixed(0)}x${r.height.toFixed(0)}`; }));
  out.__contrast = await page.evaluate(contrastScan);
  out.__boxes = await page.evaluate(() => {
    const box = (e) => { const r = e.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), bottom: +r.bottom.toFixed(1) }; };
    const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
    const pick = (sel) => [...document.querySelectorAll(sel)].filter(vis).map((e) => ({ text: (e.getAttribute("aria-label") || e.innerText || "").trim().slice(0, 60), ...box(e) }));
    return { viewport: { w: innerWidth, h: innerHeight, vvH: window.visualViewport ? visualViewport.height : null },
      continueButtons: [...document.querySelectorAll("button")].filter((b) => vis(b) && /Continue to confirmation|Confirm and save/.test(b.innerText)).map((b) => ({ text: b.innerText.trim(), inFooter: !!b.closest(".sf-canvas-foot"), disabled: b.disabled, ...box(b) })),
      canvasFoot: pick(".sf-canvas-foot"), toasts: pick("[data-sonner-toast]"), previewPill: pick("[data-preview-info] > button"), previewRoot: pick("[data-preview-info]"),
      tabbar: pick(".sf-tabbar"), comingHead: pick(".sf-coming .sf-section-head"), header: pick(".sf-header"), footNote: pick(".sf-foot-note"), canvas: pick(".sf-canvas") };
  });
  out.__overflow = await page.evaluate(() => ({ docScrollW: document.documentElement.scrollWidth, innerW: innerWidth }));
  fs.writeFileSync(`${OUT}/${tag}.json`, JSON.stringify(out, null, 1));
}
async function settle(page, text) {
  try { await page.waitForLoadState("networkidle", { timeout: 15000 }); } catch {}
  if (text) { try { await page.getByText(text).first().waitFor({ timeout: 20000 }); } catch { console.log("  text not found", text); } }
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(900);
}
// Reference text (01 / 02) for the Home page — capture page only.
async function refText(page) {
  if (!REFTEXT) return;
  await page.evaluate(() => {
    const q = (s) => document.querySelector(s); const qa = (s) => [...document.querySelectorAll(s)];
    const set = (el, t) => { if (el) el.textContent = t; };
    set(q(".sf-home-head .sf-overline"), "Monday, 9 November 2026 · Personal");
    set(q(".sf-hero-title"), "Good morning, KK.");
    set(q("#sf-worth-label"), "Your estimated net worth · demo");
    set(q(".sf-worth-figure"), "₹31,84,920");
    const note = q(".sf-worth-note:not(.sf-worth-quality)");
    if (note) { const svg = note.querySelector("svg"); note.textContent = ""; if (svg) note.appendChild(svg); const b = document.createElement("b"); b.textContent = "Account-linked view"; note.appendChild(b); note.appendChild(document.createTextNode(" · balances and investments are dated")); }
    qa(".sf-worth-quality").forEach((e) => e.remove());
    const M = [["Available money", "₹3,42,180", "Statement confirmed"], ["Card payment", "₹3,50,800", "Due 7 Dec"], ["Needs attention", "6 items", "2 approvals"]];
    qa(".sf-worth-metrics > div").forEach((d, i) => { if (!M[i]) return; set(d.querySelector("dt"), M[i][0]); const dds = d.querySelectorAll("dd"); set(dds[0], M[i][1]); set(dds[1], M[i][2]); });
    const acts = qa(".sf-worth-actions .sf-btn");
    if (acts[0]) { const svg = acts[0].querySelector("svg"); acts[0].textContent = "Explore your money"; if (svg) acts[0].appendChild(svg); }
    if (acts[1]) acts[1].textContent = "Download overview";
    const R = [["10", "Card payment", "Personal · Payment reminder"], ["12", "Business travel", "Dubai trip · Itinerary"], ["15", "Property insurance", "Property Manager · Renewal"]];
    qa(".sf-coming .sf-rows > li").forEach((li, i) => { if (!R[i]) { li.remove(); return; } const row = li.querySelector(".sf-date-row"); if (!row) return; set(row.querySelector(".sf-date small"), "Nov"); set(row.querySelector(".sf-date b"), R[i][0]); set(row.querySelector("b.block"), R[i][1]); set(row.querySelector("small.block"), R[i][2]); });
    set(q(".sf-next-detail"), "Two reimbursement approvals are ready to review · linked to trip and accounts");
    const nb = q(".sf-next .sf-btn"); if (nb) { const svg = nb.querySelector("svg"); nb.textContent = "Review now"; if (svg) nb.appendChild(svg); }
  });
  await page.waitForTimeout(200);
}
async function shot(page, cdp, tag, text, opts = {}) {
  await settle(page, text);
  if (opts.home) await refText(page);
  if (opts.scrollY) { await page.evaluate((y) => window.scrollTo(0, y), opts.scrollY); await page.waitForTimeout(300); }
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${OUT}/${tag}.png`, fullPage: !!opts.full });
  await measure(page, cdp, tag); console.log("captured", tag);
}
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_UA = "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const DEV = {
  desktop: { viewport: { width: 1283, height: 794 }, deviceScaleFactor: 1 },
  iphone: { viewport: { width: 372, height: 793 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: IPHONE_UA },
  iphone15: { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IPHONE_UA },
  ipadpro11: { viewport: { width: 834, height: 1194 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPAD_UA },
  d1440: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};
async function openCtx(b, dev, uix) {
  const ctx = await b.newContext({ ...dev, locale: "en-IN", timezoneId: "Asia/Kolkata" });
  await ctx.route(/\/src\/lib\/receipt-extract\.functions\.ts/, (route) => route.fulfill({ contentType: "application/javascript", body: `export const extractReceipt = async () => { await new Promise((r) => setTimeout(r, 400)); return ${JSON.stringify(extraction)}; };` }));
  await ctx.route(/supabase\.co/, (r) => r.abort());
  await ctx.addInitScript(() => { try { localStorage.setItem("ll-activity-11111111-1111-4111-8111-111111111111", String(Date.now())); } catch {} });
  if (VARIANT === "manrope") {
    await ctx.route(/\/__fid\/manrope-/, (route) => { const m = route.request().url().match(/manrope-(latin(?:-ext)?)\.woff2/); route.fulfill({ contentType: "font/woff2", body: fs.readFileSync(`${MAN}/manrope-${m[1]}-wght-normal.woff2`) }); });
    const css = `@font-face{font-family:"Manrope";font-weight:200 800;src:url(/__fid/manrope-latin.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;}@font-face{font-family:"Manrope";font-weight:200 800;src:url(/__fid/manrope-latin-ext.woff2) format("woff2");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF;}`;
    await ctx.addInitScript((css) => { const add = () => { const s = document.createElement("style"); s.id = "fid-manrope"; s.textContent = css; document.head.appendChild(s); }; if (document.head) add(); else document.addEventListener("DOMContentLoaded", add); }, css);
  }
  if (process.env.CLOCK === "1") await ctx.clock.install();
  const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
  page.__fontRequests = new Set();
  page.on("request", (r) => { if (r.resourceType() === "font" || /\.woff2?(\?|$)/.test(r.url())) page.__fontRequests.add(r.url().replace(BASE, "")); });
  for (let i = 0; i < 4; i++) { // a freshly restarted dev server can need a few attempts
    try { await page.goto(`${BASE}/auth?uix=${uix}`); await page.getByLabel("Email", { exact: true }).waitFor({ timeout: 30000 }); break; } catch (e) { console.log("  retry sign-in page", i + 1); await page.waitForTimeout(3000); }
  }
  await settle(page, "Sign in");
  await page.getByLabel("Email", { exact: true }).fill("kk@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("preview-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  try { await page.getByRole("button", { name: "Cancel" }).click({ timeout: 12000 }); } catch {}
  await page.waitForTimeout(1500);
  await page.evaluate((u) => localStorage.setItem("ll-uix", u), uix);
  return { ctx, page, cdp };
}
// Raise a real Sonner toast through the page's own module instance (dev server: the optimized dep URL), for bbox checks.
async function toast(page, text) {
  return page.evaluate(async (text) => {
    const url = performance.getEntriesByType("resource").map((e) => e.name).find((n) => /\/deps\/sonner\.js/.test(n));
    if (!url) return "no sonner module";
    const m = await import(url); m.toast(text, { duration: 60000 }); return "ok";
  }, text);
}
async function smartAdd(page, cdp, tag, opener, full, opts = {}) {
  await page.goto(`${BASE}${opener}`); await settle(page);
  const add = page.locator(".sf-rail-item-add:visible, .sf-tab-add:visible").first(); await add.click();
  await page.waitForTimeout(900);
  await shot(page, cdp, `${tag}-08-smart-add-source`);
  if (!full) return;
  await page.locator('input[type="file"]').first().setInputFiles(RECEIPT);
  const cont = page.getByRole("button", { name: /Continue to review/ }); if (await cont.count()) await cont.first().click();
  await page.waitForTimeout(3000);
  await shot(page, cdp, `${tag}-09-smart-add-review`, /Blue Tokai/);
  if (opts.extras) {
    await page.locator(".sf-canvas-body").evaluate((e) => e.scrollTo(0, e.scrollHeight)).catch(() => {});
    await page.waitForTimeout(400);
    await shot(page, cdp, `${tag}-09b-review-scrolled`);
    console.log("  toast:", await toast(page, "Saved draft · nothing is entered yet"));
    await page.waitForTimeout(800);
    await shot(page, cdp, `${tag}-09c-review-toast`);
    const orig = page.getByRole("tab", { name: "Original" }); if (await orig.count()) { await orig.first().click(); await page.waitForTimeout(700); await shot(page, cdp, `${tag}-09d-review-original`); await page.getByRole("tab", { name: "Details" }).first().click(); await page.waitForTimeout(400); }
    await page.locator(".sf-canvas-body").evaluate((e) => e.scrollTo(0, 0)).catch(() => {});
  }
  try { await page.getByRole("button", { name: "Looks right" }).first().click({ timeout: 4000 }); await page.waitForTimeout(600); } catch { console.log("  no Looks right"); }
  const contC = page.locator(".sf-canvas-foot").getByRole("button", { name: /Continue to confirmation/ });
  if (await contC.isDisabled()) {
    try { await page.getByRole("combobox", { name: "Account" }).first().click({ timeout: 4000 }); await page.waitForTimeout(400); const opt = page.getByRole("option").filter({ hasText: /Amex|American/ }); await (await opt.count() ? opt.first() : page.getByRole("option").first()).click(); await page.waitForTimeout(600); } catch (e) { console.log("  account pick failed", String(e.message).split("\n")[0]); }
  }
  try { await contC.click({ timeout: 6000 }); } catch (e) { console.log("  continue still disabled:", String(e.message).split("\n")[0]); }
  await page.waitForTimeout(1500);
  await shot(page, cdp, `${tag}-10-smart-add-confirm`, "Ready for confirmation.");
}
// P0-029 lock evidence: Smart Add open + a toast at lock time, idle lock by fast-forwarding the clock, then Tab order,
// accessibility tree, Back/Forward, a toast raised while locked, a deep link opened while locked and unlock.
async function lockRun(b, dev, uix, tag) {
  const { ctx, page, cdp } = await openCtx(b, DEV[dev], uix);
  const res = { device: dev, shell: uix };
  await page.goto(`${BASE}/home`); await settle(page);
  // In-app history (/home -> /money|/expenses -> /home) so Back/Forward while locked are in-app pops.
  const other = uix === "signature-flow" ? "/money" : "/expenses";
  await page.locator(`a[href="${other}"]:visible`).first().click(); await page.waitForTimeout(1500);
  await page.locator(`a[href="${uix === "signature-flow" ? "/home" : "/dashboard"}"]:visible`).first().click(); await page.waitForTimeout(1500);
  res.history = await page.evaluate(() => ({ length: history.length, path: location.pathname }));
  if (uix === "signature-flow") { await page.locator(".sf-rail-item-add:visible, .sf-tab-add:visible").first().click(); await page.waitForTimeout(800); }
  res.toastBefore = await toast(page, "Paid ₹25,000.00 to HDFC card");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${tag}-1-before-lock.png` });
  const urlBefore = page.url();
  await ctx.clock.fastForward("16:00"); await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${tag}-2-locked.png` });
  const inspect = async () => page.evaluate(() => {
    const lock = document.querySelector("[data-app-lock]");
    const txt = (document.body.innerText || "");
    const outside = [...document.body.children].filter((e) => e !== lock && !e.contains(lock) && !["SCRIPT", "STYLE", "LINK", "TEMPLATE"].includes(e.tagName));
    return { lockShown: !!lock, lockText: lock ? lock.innerText.slice(0, 400) : null, outsideAllInert: outside.every((e) => e.hasAttribute("inert") && e.getAttribute("aria-hidden") === "true"),
      notInert: outside.filter((e) => !(e.hasAttribute("inert") && e.getAttribute("aria-hidden") === "true")).map((e) => e.tagName + "." + (e.className || "") + "#" + e.id), shellInDom: !!document.querySelector(".sf-header, .sf-tabbar, .sf-rail, .uix-header, .journal-bottom, .journal-rail"), canvasOpen: !!document.querySelector(".sf-canvas-layer:not([hidden])"),
      toastsInDom: document.querySelectorAll("[data-sonner-toast]").length, rupeeVisibleOutsideLock: /₹/.test(txt) && !(lock && /₹/.test(lock.innerText)), url: location.pathname };
  });
  res.locked = await inspect();
  res.aria = await page.locator("body").ariaSnapshot();
  const tabs = [];
  for (let i = 0; i < 14; i++) { await page.keyboard.press("Tab"); tabs.push(await page.evaluate(() => { const a = document.activeElement; return { inLock: !!a?.closest("[data-app-lock]"), browserChrome: !a || a === document.body, tag: a?.tagName, name: (a?.getAttribute("aria-label") || a?.innerText || "").trim().slice(0, 40) }; })); }
  res.tabOrder = tabs;
  res.toastWhileLocked = await toast(page, "Salary ₹2,45,000.00 received"); await page.waitForTimeout(600);
  res.afterToast = await inspect();
  await page.goBack().catch(() => {}); await page.waitForTimeout(2500);
  res.afterBack = await inspect();
  await page.goForward().catch(() => {}); await page.waitForTimeout(2500);
  res.afterForward = await inspect();
  res.urlBefore = new URL(urlBefore).pathname;
  // Deep link while locked: a fresh load of /trips shows only the lock, then the page after a verified unlock.
  await page.goto(`${BASE}/trips`); await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/${tag}-3-deeplink-locked.png` });
  res.deepLink = await inspect();
  try {
    await page.getByRole("button", { name: "Use account password" }).click({ timeout: 8000 });
    await page.getByLabel("Account password").fill("preview-only");
    await page.getByRole("button", { name: "Verify password and unlock" }).click();
    await page.waitForTimeout(3000);
  } catch (e) { res.unlockError = String(e.message).split("\n")[0]; }
  await page.screenshot({ path: `${OUT}/${tag}-4-after-unlock.png` });
  res.afterUnlock = await page.evaluate(() => ({ url: location.pathname, lockShown: !!document.querySelector("[data-app-lock]"), shellInDom: !!document.querySelector(".sf-header, .sf-tabbar, .sf-rail, .uix-header, .journal-bottom, .journal-rail"), heading: (document.querySelector("main h1")?.textContent || "").slice(0, 60) }));
  fs.writeFileSync(`${OUT}/${tag}.json`, JSON.stringify(res, null, 1)); console.log("captured", tag);
  await ctx.close();
}
const PAGES = [["home", "/home", "Coming up"], ["money", "/money"], ["todo", "/tasks"], ["records", "/records"], ["travel", TRAVEL]];
(async () => {
  const b = await chromium.launch();
  for (const set of (process.env.SET || "ref").split(",")) {
    if (set === "ref") {
      for (const dev of ["desktop", "iphone"]) {
        const { ctx, page, cdp } = await openCtx(b, DEV[dev], "signature-flow");
        const routes = dev === "desktop"
          ? [["01-home", "/home", "Coming up", { home: true }], ["03-money", "/money"], ["04-statement-desk", "/statements"], ["05-records", "/records"], ["06-travel", TRAVEL], ["07-reports", "/reports"]]
          : [["02-home", "/home", "Coming up", { home: true }], ["02b-home-scrolled", "/home", "Coming up", { home: true, scrollY: 560 }], ["02-home-native", "/home", "Coming up", {}]];
        for (const [name, url, text, opts] of routes) { await page.goto(`${BASE}${url}`); await shot(page, cdp, `${dev}-${name}`, text, opts || {}); }
        await ctx.close();
      }
      for (const dev of ["desktop", "iphone"]) {
        const { ctx, page, cdp } = await openCtx(b, DEV[dev], "signature-flow");
        await smartAdd(page, cdp, dev, dev === "desktop" ? TRAVEL : "/home", true, { extras: true });
        await ctx.close();
      }
    }
    if (set === "devices") {
      for (const dev of ["iphone15", "ipadpro11", "d1440"]) {
        const { ctx, page, cdp } = await openCtx(b, DEV[dev], "signature-flow");
        for (const [name, url, text] of PAGES) { await page.goto(`${BASE}${url}`); await shot(page, cdp, `${dev}-${name}`, text, { home: false }); }
        await ctx.close();
      }
      for (const dev of ["iphone15", "ipadpro11", "d1440"]) {
        const { ctx, page, cdp } = await openCtx(b, DEV[dev], "signature-flow");
        await smartAdd(page, cdp, dev, "/home", true, { extras: dev === "iphone15" });
        await ctx.close();
      }
    }
    if (set === "pill") {
      // Needs a preview started with VITE_PREVIEW_ENV=preview: the development-only build-identity pill is showing.
      for (const dev of ["iphone", "iphone15"]) {
        const { ctx, page, cdp } = await openCtx(b, DEV[dev], "signature-flow");
        await page.goto(`${BASE}/home`); await shot(page, cdp, `pill-${dev}-home`, "Coming up");
        const dismiss = page.getByRole("button", { name: /Hide preview/ });
        if (await dismiss.count()) { await dismiss.first().click(); await page.waitForTimeout(400); await shot(page, cdp, `pill-${dev}-home-dismissed`); await page.goto(`${BASE}/money`); await shot(page, cdp, `pill-${dev}-money-after-dismiss`); await page.evaluate(() => sessionStorage.clear()); }
        await smartAdd(page, cdp, `pill-${dev}`, "/home", true, { extras: true });
        await ctx.close();
      }
    }
    if (set === "lock") {
      for (const dev of ["iphone15", "ipadpro11", "d1440"]) await lockRun(b, dev, "signature-flow", `lock-sf-${dev}`);
      for (const dev of ["iphone15", "d1440"]) await lockRun(b, dev, "classic", `lock-classic-${dev}`);
    }
    if (set === "classic") {
      for (const dev of ["desktop", "iphone"]) {
        const { ctx, page, cdp } = await openCtx(b, DEV[dev], "classic");
        for (const [name, url] of [["dashboard", "/dashboard"], ["expenses", "/expenses"], ["reports", "/reports"], ["trips", "/trips"], ["records", "/records"]]) { await page.goto(`${BASE}${url}`); await shot(page, cdp, `classic-${dev}-${name}`); }
        await ctx.close();
      }
    }
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
