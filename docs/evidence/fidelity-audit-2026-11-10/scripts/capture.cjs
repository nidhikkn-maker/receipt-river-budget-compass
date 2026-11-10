// Fidelity capture of commit 937cfaf via the local fixture preview (port 8086). Read-only: nothing is saved.
// VARIANT=asis (fonts as this Linux box resolves the CSS stack) | manrope (Manrope webfont injected to isolate geometry)
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const BASE = "http://localhost:8086";
const VARIANT = process.env.VARIANT || "asis";
const OUT = path.join(__dirname, "..", "captures", VARIANT);
fs.mkdirSync(OUT, { recursive: true });
const RECEIPT = path.join(__dirname, "..", "..", "sample-receipt.png");
const MAN = path.join(__dirname, "..", "fontpkgs", "fontsource-manrope-5.3.0", "package", "files");
const extraction = { ok: true, result: { title: "Blue Tokai Coffee", merchant: "Blue Tokai Coffee Roasters", date: "2026-11-09", amount: 460, subtotal: 438.1, tax: 21.9, tip: null, round_off: null, charges: [],
  tax_parts: [{ label: "CGST", rate: 2.5, amount: 10.95 }, { label: "SGST", rate: 2.5, amount: 10.95 }], confidence: { merchant: "high", date: "high", total: "high" },
  items: [{ name: "Cappuccino", quantity: 2, amount: 380, section: null, confidence: { name: "high", amount: "high" } }, { name: "Almond croissant", quantity: 1, amount: 58.1, section: null, confidence: { name: "high", amount: "high" } }],
  text: "BLUE TOKAI COFFEE ROASTERS ... TOTAL 460.00", currency: "INR", payment_method: "credit_card", description: null, category: "Food", scope: "personal" } };
const ROLES = {
  wordmark: ".sf-wordmark", tmark: ".sf-tmark", workspace: ".sf-workspace", avatar: ".sf-avatar", headerIcon: ".sf-header .sf-icon-btn svg",
  overline: ".sf-home-head .sf-overline, .sf-page-head .sf-overline, main .sf-overline", greeting: ".sf-hero-title", pageTitle: ".sf-title", lede: ".sf-lede",
  homeBtnOutline: ".sf-home-head .sf-btn-outline", homeBtnDeep: ".sf-home-head .sf-btn-deep",
  worthPanel: ".sf-worth", worthOverline: ".sf-worth .sf-overline", worthFigure: ".sf-worth-figure", worthNote: ".sf-worth-note", worthNoteBold: ".sf-worth-note b",
  metricLabel: ".sf-worth-metrics dt", metricFigure: ".sf-worth-metrics dd.financial-amount", metricSub: ".sf-worth-metrics dd.sf-worth-sub", metricsGrid: ".sf-worth-metrics", metricCol2: ".sf-worth-metrics > div:nth-child(2)",
  worthBtnLight: ".sf-worth-actions .sf-btn-light", worthBtnGhost: ".sf-worth-actions .sf-btn-ghost-deep",
  sectionTitle: ".sf-section-head h2", sectionLink: ".sf-section-head .sf-link", dateMonth: ".sf-date small", dateDay: ".sf-date b", rowTitle: ".sf-date-row b.block, .sf-list-row b, .sf-module-row b", rowSub: ".sf-date-row small.block, .sf-list-row small, .sf-module-row small", dateRow: ".sf-date-row",
  nextBand: ".sf-next", nextTitle: ".sf-next-title", nextDetail: ".sf-next-detail", nextBtn: ".sf-next .sf-btn",
  railItemActive: ".sf-rail-item[aria-current=page]", railLabel: ".sf-rail-item > span:last-child", railIcon: ".sf-rail-item .sf-nav-icon", railIconSvg: ".sf-rail-item .sf-nav-icon svg", rail: ".sf-rail", header: ".sf-header",
  tabbar: ".sf-tabbar", tabLabel: ".sf-tab:not(.sf-tab-add) > span:last-child", tabIconSvg: ".sf-tab:not(.sf-tab-add) .sf-nav-icon svg", tabAdd: ".sf-tab-add", tabActive: ".sf-tab[aria-current=page]",
  crumbs: ".sf-crumbs", back: ".sf-back", find: ".sf-find", moduleRow: ".sf-module-row", tile: ".sf-tile", main: "main",
  canvas: ".sf-canvas", canvasOverline: ".sf-canvas .sf-overline", canvasTitle: ".sf-canvas-title", canvasClose: ".sf-canvas-close", step: ".sf-steps li", stepCurrent: ".sf-steps li[data-state=current]", canvasLede: ".sf-canvas-lede", chip: ".sf-chip", chipOn: ".sf-chip[aria-checked=true]", drop: ".sf-drop", dropTitle: ".sf-drop-title", dropSub: ".sf-drop-sub", canvasFoot: ".sf-canvas-foot", footBtnDeep: ".sf-canvas-foot .sf-btn-deep", footBtnOutline: ".sf-canvas-foot .sf-btn-outline", confirmCard: ".sf-confirm-card", confirmDt: ".sf-confirm-grid dt", confirmDd: ".sf-confirm-grid dd", canvasInput: ".sf-canvas input:not([type=file]):not([type=checkbox]):not([type=radio])", canvasLabel: ".sf-canvas label",
  toast: "[data-sonner-toast], [role=status]",
};
async function measure(page, cdp, tag) {
  const out = {};
  await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
  for (const [role, sel] of Object.entries(ROLES)) {
    const info = await page.evaluate((sel) => {
      const els = [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      if (!els.length) return null;
      const e = els[0], cs = getComputedStyle(e), r = e.getBoundingClientRect();
      const pick = ["font-family", "font-weight", "font-size", "line-height", "letter-spacing", "font-variant-numeric", "font-feature-settings", "color", "background-color", "border-radius", "border-top-width", "border-top-color", "border-top-style", "padding-top", "padding-right", "padding-bottom", "padding-left", "height", "width", "box-shadow", "stroke-width", "text-transform", "gap"];
      const st = {}; for (const p of pick) st[p] = cs.getPropertyValue(p);
      if (e.tagName === "svg") st["stroke-width-attr"] = e.getAttribute("stroke-width");
      return { count: els.length, text: (e.innerText || "").slice(0, 80), rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }, all: els.slice(0, 6).map((x) => { const q = x.getBoundingClientRect(); return [+q.x.toFixed(1), +q.y.toFixed(1), +q.width.toFixed(1), +q.height.toFixed(1)]; }), style: st };
    }, sel);
    if (!info) continue;
    try {
      const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: sel.split(",")[0] });
      if (nodeId) { const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId }); info.platformFonts = fonts; }
    } catch (e) { info.platformFontsErr = String(e.message || e); }
    out[role] = info;
  }
  out.__fonts = await page.evaluate(() => [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`));
  out.__links = await page.evaluate(() => [...document.querySelectorAll('link[rel=stylesheet], link[rel=preload], link[rel=preconnect]')].map((l) => `${l.rel} ${l.href}`));
  out.__checkInter = await page.evaluate(() => ({ manrope: document.fonts.check('16px Manrope'), inter: document.fonts.check('16px Inter') }));
  out.__smallTargets = await page.evaluate(() => [...document.querySelectorAll("a[href], button, [role=button], [role=tab], input, select, summary")].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && (r.width < 44 || r.height < 44); }).map((e) => { const r = e.getBoundingClientRect(); return `${e.tagName.toLowerCase()} "${(e.getAttribute("aria-label") || e.innerText || "").trim().slice(0, 40)}" ${r.width.toFixed(0)}x${r.height.toFixed(0)} @${r.x.toFixed(0)},${r.y.toFixed(0)}`; }));
  out.__overflow = await page.evaluate(() => ({ docScrollW: document.documentElement.scrollWidth, innerW: innerWidth, truncated: [...document.querySelectorAll("main *")].filter((e) => e.children.length === 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== "visible").slice(0, 20).map((e) => (e.innerText || "").slice(0, 50)) }));
  fs.writeFileSync(`${OUT}/${tag}.json`, JSON.stringify(out, null, 1));
}
async function settle(page, text) { try { await page.waitForLoadState("networkidle", { timeout: 15000 }); } catch {} if (text) { try { await page.getByText(text).first().waitFor({ timeout: 20000 }); } catch { console.log("  text not found", text); } } await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(900); }
async function shot(page, cdp, tag, text) { await settle(page, text); await page.mouse.move(0, 0); await page.screenshot({ path: `${OUT}/${tag}.png` }); await measure(page, cdp, tag); console.log("captured", tag); }
const PLAN = [
  ["desktop", { viewport: { width: 1283, height: 794 }, deviceScaleFactor: 1 }],
  ["iphone", { viewport: { width: 372, height: 793 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" }],
];
async function openCtx(b, dev) {
  const ctx = await b.newContext({ ...dev, locale: "en-IN", timezoneId: process.env.TZID || "Europe/London" });
  await ctx.route(/\/src\/lib\/receipt-extract\.functions\.ts/, (route) => route.fulfill({ contentType: "application/javascript", body: `export const extractReceipt = async () => { await new Promise((r) => setTimeout(r, 400)); return ${JSON.stringify(extraction)}; };` }));
  await ctx.route(/supabase\.co/, (r) => r.abort());
  // keep the fixture owner's inactivity evidence fresh so the device lock does not cover the page (not a visual element under audit)
  await ctx.addInitScript(() => { try { localStorage.setItem("ll-activity-11111111-1111-4111-8111-111111111111", String(Date.now())); } catch {} });
  if (VARIANT === "manrope") {
    await ctx.route(/\/__fid\/manrope-/, (route) => { const m = route.request().url().match(/manrope-(latin(?:-ext)?)-(\d+)\.woff2/); route.fulfill({ contentType: "font/woff2", body: fs.readFileSync(`${MAN}/manrope-${m[1]}-${m[2]}-normal.woff2`) }); });
    let css = ""; for (const w of [300, 400, 500, 600, 700, 800]) { css += `@font-face{font-family:"Manrope";font-weight:${w};src:url(/__fid/manrope-latin-${w}.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;}@font-face{font-family:"Manrope";font-weight:${w};src:url(/__fid/manrope-latin-ext-${w}.woff2) format("woff2");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF;}`; }
    await ctx.addInitScript((css) => { const add = () => { const s = document.createElement("style"); s.id = "fid-manrope"; s.textContent = css; document.head.appendChild(s); }; if (document.head) add(); else document.addEventListener("DOMContentLoaded", add); }, css);
  }
  const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
  await page.goto(`${BASE}/auth?uix=signature-flow`); await settle(page, "Sign in");
  await page.getByLabel("Email", { exact: true }).fill("kk@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("preview-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  try { await page.getByRole("button", { name: "Cancel" }).click({ timeout: 12000 }); } catch {}
  await page.waitForTimeout(1500);
  await page.evaluate(() => localStorage.setItem("ll-uix", "signature-flow"));
  return { ctx, page, cdp };
}
(async () => {
  const b = await chromium.launch();
  for (const phase of (process.env.PHASES || "pages,smart").split(",")) for (const [tag, dev] of PLAN) {
    const { ctx, page, cdp } = await openCtx(b, dev);
    if (phase === "pages") {
      const routes = tag === "desktop" ? [["01-home", "/home", "Coming up"], ["03-money", "/money"], ["04-statement-desk", "/statements"], ["05-records", "/records"], ["06-travel", "/trips"], ["07-reports", "/reports"]] : [["02-home", "/home", "Coming up"], ["02b-home-scrolled", "/home", "Coming up"]];
      for (const [name, url, text] of routes) { await page.goto(`${BASE}${url}`); if (name.includes("scrolled")) { await settle(page, text); await page.evaluate(() => window.scrollTo(0, 560)); } await shot(page, cdp, `${tag}-${name}`, text); }
      await ctx.close(); continue;
    }
    await page.goto(`${BASE}${tag === "desktop" ? "/trips" : "/home"}`); await settle(page);
    if (tag === "desktop") await page.locator(".sf-rail-item-add").first().click(); else await page.locator(".sf-tab-add").first().click();
    await page.waitForTimeout(900);
    await shot(page, cdp, `${tag}-08-smart-add-source`);
    await page.locator('input[type="file"]').first().setInputFiles(RECEIPT);
    const cont = page.getByRole("button", { name: /Continue to review/ }); if (await cont.count()) await cont.first().click();
    await page.waitForTimeout(3000);
    await shot(page, cdp, `${tag}-09-smart-add-review`, /Blue Tokai/);
    fs.writeFileSync(`${OUT}/${tag}-09-buttons.txt`, (await page.evaluate(() => [...document.querySelectorAll(".sf-canvas button, .sf-canvas [role=radio], .sf-canvas [role=tab]")].map((e) => `${e.tagName} ${e.getAttribute("role") || ""} disabled=${e.disabled} "${(e.getAttribute("aria-label") || e.innerText || "").trim().slice(0, 60)}"`))).join("\n"));
    // reach confirmation: accept the reading, choose an account if the gate asks, then the persistent Continue
    try { await page.getByRole("button", { name: "Looks right" }).first().click({ timeout: 4000 }); await page.waitForTimeout(600); } catch (e) { console.log("  no Looks right"); }
    const contC = page.getByRole("button", { name: /Continue to confirmation/ }).last();
    if (await contC.isDisabled()) {
      try { await page.getByRole("combobox", { name: "Account" }).first().click({ timeout: 4000 }); await page.waitForTimeout(400); const opt = page.getByRole("option").filter({ hasText: /Amex|American/ }); await (await opt.count() ? opt.first() : page.getByRole("option").first()).click(); await page.waitForTimeout(600); } catch (e) { console.log("  account pick failed", String(e.message).split("\n")[0]); }
    }
    await page.screenshot({ path: `${OUT}/${tag}-09c-review-before-continue.png` });
    try { await contC.click({ timeout: 6000 }); } catch (e) { console.log("  continue still disabled:", String(e.message).split("\n")[0]); }
    await page.waitForTimeout(1500);
    await shot(page, cdp, `${tag}-10-smart-add-confirm`, "Ready for confirmation.");
    await ctx.close();
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
