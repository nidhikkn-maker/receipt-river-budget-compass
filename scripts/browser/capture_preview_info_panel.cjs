// Preview information panel: iPhone 15 and 1440 x 900 captures, collapsed and expanded, plus bounding-box checks
// that the panel never intersects the tab bar / central Add and sits beneath Smart Add (so its sticky actions stay
// uncovered). Fixture backend as in capture_signature_shell.cjs (https://fixture.supabase.invalid; writes refused).
// The dev server must be started with VITE_PREVIEW_ENV=preview and the VITE_PREVIEW_* variables (see README).
//   BASE=http://127.0.0.1:8085 OUT=<dir> NODE_PATH=$(npm root -g) node scripts/browser/capture_preview_info_panel.cjs
const { chromium, devices } = require("playwright");
const fs = require("fs");
const { context, settle } = require("./capture_signature_shell.cjs");
const OUT = process.env.OUT || "/tmp/thapal-preview-info"; fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || "http://127.0.0.1:8085";
const SHOTS = [];
const intersects = (a, b) => !!a && !!b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const measure = (page) => page.evaluate(() => {
  const rect = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; };
  const pill = document.querySelector("[data-preview-info] > button");
  const card = document.querySelector("[data-preview-info] > section");
  const tabbar = document.querySelector(".sf-tabbar, nav.journal-bottom");
  const add = document.querySelector(".sf-tab-add");
  const foot = document.querySelector(".sf-canvas-foot");
  const toasts = [...document.querySelectorAll("[data-sonner-toast]")].map(rect);
  let pillCovered = null;
  if (pill) { const r = pill.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); pillCovered = !!top && !pill.contains(top); }
  return {
    viewport: { width: innerWidth, height: innerHeight }, pill: rect(pill), pillName: pill?.getAttribute("aria-label") ?? null, card: rect(card), cardText: card?.innerText ?? null,
    tabbar: tabbar && getComputedStyle(tabbar).display !== "none" ? rect(tabbar) : null, add: rect(add), smartAddFooter: rect(foot), toasts, pillBeneathOverlay: pillCovered,
  };
});

async function shot(page, name, note, safe) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const m = await measure(page);
  m.overlaps = {
    pillTabbar: intersects(m.pill, m.tabbar), cardTabbar: intersects(m.card, m.tabbar), pillAdd: intersects(m.pill, m.add),
    pillSmartAddFooter: intersects(m.pill, m.smartAddFooter), pillToasts: m.toasts.some((t) => intersects(t, m.pill)),
  };
  if (safe) m.pillInSafeArea = !!m.pill && (m.pill.y + m.pill.height > m.viewport.height - safe.bottom || m.pill.y < safe.top);
  SHOTS.push({ name, note, ...m });
  console.log("shot", name, JSON.stringify({ pill: m.pill, tabbar: m.tabbar, overlaps: m.overlaps, beneath: m.pillBeneathOverlay }));
}

async function run(browser, label, device, safe, shell) {
  const ctx = await context(browser, device, shell === undefined ? {} : { shell });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  pageerror:", e.message));
  if (safe) { const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: safe.top, bottom: safe.bottom, left: 0, right: 0 } }); }
  await page.goto(`${BASE}/home`); await settle(page, "Coming up");
  const pill = page.locator("[data-preview-info] > button");
  await shot(page, `${label}-01-collapsed`, "Home, panel collapsed", safe);
  if (label.endsWith("classic")) { await ctx.close(); return; }
  await pill.click();
  await shot(page, `${label}-02-expanded`, "Home, panel expanded (tap/click)", safe);
  await page.keyboard.press("Escape");
  if (label === "iphone15") {
    await page.getByRole("button", { name: /Smart Add/ }).first().click();
    await page.locator(".sf-canvas").first().waitFor({ timeout: 15000 }).catch(() => console.log("  (no canvas)"));
    await shot(page, `${label}-03-smart-add-open`, "Smart Add open: the panel stays beneath it, so its sticky actions are uncovered", safe);
  }
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  await run(browser, "iphone15", { ...devices["iPhone 15"] }, { top: 47, bottom: 34 });
  await run(browser, "iphone15-classic", { ...devices["iPhone 15"] }, { top: 47, bottom: 34 }, null);
  await run(browser, "desktop-1440", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, null);
  await browser.close();
  fs.writeFileSync(`${OUT}/index.json`, JSON.stringify(SHOTS, null, 2));
})();
