// Track B batch B1b: BEFORE/AFTER captures of the proposed Signature Flow shell at identical viewports.
// Same fixture backend as capture_signature_shell.cjs (non-existent Supabase host; every request answered here).
// Receipt reading is answered by a browser-side stand-in for the extraction server function, so no AI or hosted
// service is called. Nothing is saved: captures stop at the confirmation step.
//   PHASE=before|after BASE=http://127.0.0.1:8085 OUT=<dir> RECEIPT=<png> NODE_PATH=$(npm root -g) node scripts/browser/capture_signature_shell_b1b.cjs
const { chromium, devices } = require("playwright");
const fs = require("fs");
const { context, settle } = require("./capture_signature_shell.cjs");
const PHASE = process.env.PHASE || "after";
const OUT = process.env.OUT || "/tmp/thapal-b1b"; fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || "http://127.0.0.1:8085";
const RECEIPT = process.env.RECEIPT;
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const SAFE_BOTTOM = 34; // iPhone home-indicator inset
const SHOTS = [];

const extraction = { ok: true, result: {
  title: "Blue Tokai Coffee", merchant: "Blue Tokai Coffee Roasters", date: "2026-11-09", amount: 460, subtotal: 438.1, tax: 21.9, tip: null, round_off: null, charges: [],
  tax_parts: [{ label: "CGST", rate: 2.5, amount: 10.95 }, { label: "SGST", rate: 2.5, amount: 10.95 }],
  confidence: { merchant: "high", date: "high", total: "high" },
  items: [{ name: "Cappuccino", quantity: 2, amount: 380, section: null, confidence: { name: "high", amount: "high" } }, { name: "Almond croissant", quantity: 1, amount: 58.1, section: null, confidence: { name: "high", amount: "high" } }],
  text: "BLUE TOKAI COFFEE ROASTERS ... TOTAL 460.00", currency: "INR", payment_method: "credit_card", description: null, category: "Food", scope: "personal",
} };

async function withExtractionStub(ctx) {
  await ctx.route(/\/src\/lib\/receipt-extract\.functions\.ts/, (route) => route.fulfill({
    contentType: "application/javascript",
    body: `export const extractReceipt = async () => { await new Promise((r) => setTimeout(r, 500)); return ${JSON.stringify(extraction)}; };`,
  }));
}

async function shot(page, name, note, opts = {}) {
  await settle(page, opts.text);
  if (opts.end) { await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(500); }
  const file = `${OUT}/${PHASE}-${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  const m = await page.evaluate(() => {
    const bar = document.querySelector(".sf-tabbar, .journal-bottom");
    const barTop = bar && getComputedStyle(bar).display !== "none" ? bar.getBoundingClientRect().top : null;
    const main = document.querySelector("main");
    const last = main ? [...main.querySelectorAll("a,button,p,li,h2")].filter((e) => e.getBoundingClientRect().height > 0).pop() : null;
    return {
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      barTop, barHeight: bar && barTop != null ? bar.getBoundingClientRect().height : null,
      lastContentBottom: last ? last.getBoundingClientRect().bottom : null,
      atEnd: Math.abs(window.scrollY + window.innerHeight - document.documentElement.scrollHeight) < 2,
      header: (document.querySelector(".sf-header, .uix-header")?.getBoundingClientRect().height) ?? null,
      comingUpTop: [...document.querySelectorAll("h2")].find((h) => h.textContent?.trim() === "Coming up")?.getBoundingClientRect().top ?? null,
    };
  });
  SHOTS.push({ name: `${PHASE}-${name}`, note, ...m });
  console.log("shot", `${PHASE}-${name}`, JSON.stringify(m));
}

async function emulateSafeArea(page, bottom) {
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, bottom, left: 0, right: 0 } });
    return "cdp";
  } catch {
    await page.addInitScript((b) => { document.documentElement.style.setProperty("--sf-safe-bottom", `${b}px`); }, bottom);
    return "css-var";
  }
}

async function smartAdd(page, tag) {
  await page.goto(`${BASE}/home`); await settle(page, "Coming up");
  await page.getByRole("button", { name: /^\+?\s*Smart Add$|Smart Add/ }).first().click();
  await page.waitForTimeout(600);
  await shot(page, `${tag}-smart-add-1-add`, "Smart Add step 1 (Add)");
  if (!RECEIPT) return;
  await page.locator('input[type="file"][aria-label="Choose files"]').first().setInputFiles(RECEIPT);
  if (PHASE === "after") { const cont = page.getByRole("button", { name: /Continue to review/ }); if (await cont.count()) await cont.first().click(); }
  await page.waitForTimeout(2500);
  await shot(page, `${tag}-smart-add-2-review`, "Smart Add step 2 (Review): automatic reading beside the source", { text: /Blue Tokai/ });
  if (PHASE === "after") {
    const toggle = page.getByRole("tab", { name: "Original" });
    if (await toggle.count() && await toggle.first().isVisible()) { await toggle.first().click(); await shot(page, `${tag}-smart-add-2b-source`, "iPhone step 2: source/data toggle on the original"); await page.getByRole("tab", { name: "Details" }).first().click(); }
    const looks = page.getByRole("button", { name: "Looks right" });
    if (await looks.count()) { await looks.first().click(); await page.waitForTimeout(800); }
    const save = page.locator(".sf-canvas form button[type=submit]").last();
    await save.scrollIntoViewIfNeeded(); await save.click();
    await page.waitForTimeout(800);
    await shot(page, `${tag}-smart-add-3-confirm`, "Smart Add step 3 (Confirm): nothing posted until Confirm", { text: "Ready for confirmation." });
  } else {
    const save = page.getByRole("button", { name: /^Save / }).last();
    if (await save.count()) { await save.scrollIntoViewIfNeeded(); await page.waitForTimeout(400); }
    await shot(page, `${tag}-smart-add-3-save-button`, "B1 had no separate step 3: the review's own Save posts directly");
  }
}

const IPHONE = { ...devices["iPhone 15"] };
const IPAD_P = { ...devices["iPad Pro 11"] };
const IPAD_L = { ...devices["iPad Pro 11 landscape"] };
const SPLIT = (w) => ({ ...devices["iPad Pro 11"], viewport: { width: w, height: 1194 }, screen: { width: w, height: 1194 } });
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };

const PLAN = [
  ["iphone", IPHONE, ["home", "home-end", "money", "todo", "records", "smart"]],
  ["ipad-portrait", IPAD_P, ["home", "money", "money-split", "smart"]],
  ["ipad-landscape", IPAD_L, ["home", "money", "money-split", "smart"]],
  ["ipad-split-507", SPLIT(507), ["home", "money", "money-split"]],
  ["ipad-split-694", SPLIT(694), ["home", "money", "money-split"]],
  ["desktop", DESK, ["home", "money", "records", "smart"]],
];

(async () => {
  const browser = await chromium.launch();
  for (const [tag, device, screens] of PLAN) {
    if (ONLY && !ONLY.includes(tag)) continue;
    const ctx = await context(browser, device);
    await withExtractionStub(ctx);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("  pageerror:", e.message));
    let safe = null;
    if (tag === "iphone") safe = await emulateSafeArea(page, SAFE_BOTTOM);
    if (safe) console.log("  safe-area emulation:", safe);
    for (const s of screens) {
      if (s === "home") { await page.goto(`${BASE}/home`); await shot(page, `${tag}-home`, "Home", { text: "Coming up" }); }
      if (s === "home-end") { await page.goto(`${BASE}/home`); await shot(page, `${tag}-home-end-of-scroll`, "Home scrolled to the end: last content must sit above the bar", { text: "Coming up", end: true }); }
      if (s === "money") { await page.goto(`${BASE}/money`); await shot(page, `${tag}-money`, "Money", { text: "Your money, connected." }); }
      if (s === "money-split") { await page.goto(`${BASE}/money`); await settle(page, "Your money, connected."); await page.getByRole("button", { name: /HDFC Savings/ }).first().click(); await page.getByText("Latest entries").first().scrollIntoViewIfNeeded().catch(() => {}); await shot(page, `${tag}-money-account`, "Money: account list/detail"); }
      if (s === "todo") { await page.goto(`${BASE}/tasks`); await shot(page, `${tag}-todo`, "To-do", { text: "Needs your review" }); }
      if (s === "records") { await page.goto(`${BASE}/records`); await shot(page, `${tag}-records`, "Records", { text: "Everything in its place." }); }
      if (s === "smart") await smartAdd(page, tag);
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(`${OUT}/${PHASE}-index.json`, JSON.stringify(SHOTS, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
