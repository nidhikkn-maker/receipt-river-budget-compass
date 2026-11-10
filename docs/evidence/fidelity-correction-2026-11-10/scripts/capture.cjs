// Fidelity-correction capture harness (adapted from ../../fidelity-audit-2026-11-10/scripts/capture.cjs).
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
const OUT = path.join(__dirname, "..", "captures", `${LABEL}-${VARIANT}`);
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
  body: "body", classicH1: "main h1",
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
async function smartAdd(page, cdp, tag, opener, full) {
  await page.goto(`${BASE}${opener}`); await settle(page);
  const add = page.locator(".sf-rail-item-add:visible, .sf-tab-add:visible").first(); await add.click();
  await page.waitForTimeout(900);
  await shot(page, cdp, `${tag}-08-smart-add-source`);
  if (!full) return;
  await page.locator('input[type="file"]').first().setInputFiles(RECEIPT);
  const cont = page.getByRole("button", { name: /Continue to review/ }); if (await cont.count()) await cont.first().click();
  await page.waitForTimeout(3000);
  await shot(page, cdp, `${tag}-09-smart-add-review`, /Blue Tokai/);
  try { await page.getByRole("button", { name: "Looks right" }).first().click({ timeout: 4000 }); await page.waitForTimeout(600); } catch { console.log("  no Looks right"); }
  const contC = page.getByRole("button", { name: /Continue to confirmation/ }).last();
  if (await contC.isDisabled()) {
    try { await page.getByRole("combobox", { name: "Account" }).first().click({ timeout: 4000 }); await page.waitForTimeout(400); const opt = page.getByRole("option").filter({ hasText: /Amex|American/ }); await (await opt.count() ? opt.first() : page.getByRole("option").first()).click(); await page.waitForTimeout(600); } catch (e) { console.log("  account pick failed", String(e.message).split("\n")[0]); }
  }
  try { await contC.click({ timeout: 6000 }); } catch (e) { console.log("  continue still disabled:", String(e.message).split("\n")[0]); }
  await page.waitForTimeout(1500);
  await shot(page, cdp, `${tag}-10-smart-add-confirm`, "Ready for confirmation.");
}
(async () => {
  const b = await chromium.launch();
  for (const set of (process.env.SET || "ref").split(",")) {
    if (set === "ref") {
      // All page captures first, then the Smart Add flows (a flow can leave a draft, which adds a banner to pages).
      for (const dev of ["desktop", "iphone"]) {
        const { ctx, page, cdp } = await openCtx(b, DEV[dev], "signature-flow");
        const routes = dev === "desktop"
          ? [["01-home", "/home", "Coming up", { home: true }], ["03-money", "/money"], ["04-statement-desk", "/statements"], ["05-records", "/records"], ["06-travel", "/trips"], ["07-reports", "/reports"]]
          : [["02-home", "/home", "Coming up", { home: true }], ["02b-home-scrolled", "/home", "Coming up", { home: true, scrollY: 560 }]];
        for (const [name, url, text, opts] of routes) { await page.goto(`${BASE}${url}`); await shot(page, cdp, `${dev}-${name}`, text, opts || {}); }
        await ctx.close();
      }
      for (const dev of ["desktop", "iphone"]) {
        const { ctx, page, cdp } = await openCtx(b, DEV[dev], "signature-flow");
        await smartAdd(page, cdp, dev, dev === "desktop" ? "/trips" : "/home", true);
        await ctx.close();
      }
    }
    if (set === "home") {
      for (const dev of ["desktop", "iphone"]) {
        const { ctx, page, cdp } = await openCtx(b, DEV[dev], "signature-flow");
        await page.goto(`${BASE}/home`); await shot(page, cdp, `${dev}-${dev === "desktop" ? "01" : "02"}-home`, "Coming up", { home: true });
        if (dev === "desktop") { await page.goto(`${BASE}/money`); await shot(page, cdp, "desktop-03-money"); await smartAdd(page, cdp, dev, "/trips", false); }
        await ctx.close();
      }
    }
    if (set === "devices") {
      for (const dev of ["iphone15", "ipadpro11", "d1440"]) {
        const { ctx, page, cdp } = await openCtx(b, DEV[dev], "signature-flow");
        for (const [name, url, text] of [["home", "/home", "Coming up"], ["money", "/money"], ["todo", "/tasks"], ["records", "/records"]]) { await page.goto(`${BASE}${url}`); await shot(page, cdp, `${dev}-${name}`, text, { home: false }); }
        await ctx.close();
      }
      for (const dev of ["iphone15", "ipadpro11", "d1440"]) {
        const { ctx, page, cdp } = await openCtx(b, DEV[dev], "signature-flow");
        await smartAdd(page, cdp, dev, "/home", false);
        await ctx.close();
      }
    }
    if (set === "classic") {
      for (const dev of ["desktop", "iphone"]) {
        const { ctx, page, cdp } = await openCtx(b, DEV[dev], "classic");
        for (const [name, url] of [["dashboard", "/dashboard"], ["expenses", "/expenses"], ["reports", "/reports"]]) { await page.goto(`${BASE}${url}`); await shot(page, cdp, `classic-${dev}-${name}`); }
        await ctx.close();
      }
    }
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
