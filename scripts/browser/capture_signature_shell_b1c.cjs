// Track B batch B1c: iPhone 15 captures of Smart Add Review and Confirm, BEFORE and AFTER at the identical viewport.
// Fixture backend as in capture_signature_shell.cjs; receipt reading answered by a browser-side stand-in whose
// receipt text names a card WITHOUT its last four digits (insufficient evidence for an account). Nothing is saved:
// the run stops on the confirmation screen and never presses "Confirm and save".
//   PHASE=before|after BASE=http://127.0.0.1:8085 OUT=<dir> RECEIPT=<png> NODE_PATH=$(npm root -g) node scripts/browser/capture_signature_shell_b1c.cjs
const { chromium, devices } = require("playwright");
const fs = require("fs");
const { context, settle } = require("./capture_signature_shell.cjs");
const PHASE = process.env.PHASE || "after";
const OUT = process.env.OUT || "/tmp/thapal-b1c"; fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || "http://127.0.0.1:8085";
const RECEIPT = process.env.RECEIPT;
const SHOTS = [];
const extraction = { ok: true, result: {
  title: "Blue Tokai Coffee", merchant: "Blue Tokai Coffee Roasters", date: "2026-11-09", amount: 460, subtotal: 438.1, tax: 21.9, tip: null, round_off: null, charges: [],
  tax_parts: [{ label: "CGST", rate: 2.5, amount: 10.95 }, { label: "SGST", rate: 2.5, amount: 10.95 }],
  confidence: { merchant: "high", date: "high", total: "high" },
  items: [{ name: "Cappuccino", quantity: 2, amount: 380, section: null, confidence: { name: "high", amount: "high" } }, { name: "Almond croissant", quantity: 1, amount: 58.1, section: null, confidence: { name: "high", amount: "high" } }],
  text: "BLUE TOKAI COFFEE ROASTERS Tax invoice BT-20931 TOTAL 460.00 Paid by credit card", currency: "INR", payment_method: "credit_card", description: null, category: "Food", scope: "personal",
} };

async function measure(page) {
  return page.evaluate(() => {
    const c = document.querySelector(".sf-canvas") || document.querySelector('[aria-label="Smart Add"]');
    if (!c) return null;
    const box = (sel) => { const e = c.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return Math.round(r.height); };
    const targets = [...c.querySelectorAll("button, a, input:not([type=file]), [role=tab], [role=radio], [role=combobox]")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; });
    const small = targets.map((e) => ({ t: (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 30), h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width) })).filter((x) => x.h < 44 || x.w < 44);
    const texts = [...c.querySelectorAll("p, small, span, label, dt, dd, li, button")].filter((e) => e.childElementCount === 0 && e.textContent.trim() && e.getBoundingClientRect().height > 0).map((e) => parseFloat(getComputedStyle(e).fontSize));
    return { head: box(".sf-canvas-head"), steps: box(".sf-steps"), chips: box(".sf-chips"), drop: box(".sf-drop"), foot: box(".sf-canvas-foot"), minFont: texts.length ? Math.min(...texts) : null, under44: small, footBottomGap: (() => { const f = c.querySelector(".sf-canvas-foot"); return f ? Math.round(window.innerHeight - f.getBoundingClientRect().bottom) : null; })(), accountState: c.querySelector("form")?.getAttribute("data-account-state") ?? null };
  });
}
async function shot(page, name, note, text) {
  await settle(page, text);
  await page.screenshot({ path: `${OUT}/${PHASE}-${name}.png` });
  const m = await measure(page);
  SHOTS.push({ name: `${PHASE}-${name}`, note, ...m });
  console.log("shot", `${PHASE}-${name}`, JSON.stringify(m));
}
const scrollTo = async (page, locator) => { try { await locator.first().evaluate((e) => e.scrollIntoView({ block: "center" })); await page.waitForTimeout(400); } catch { console.log("  (no scroll target)"); } };

(async () => {
  const browser = await chromium.launch();
  const ctx = await context(browser, { ...devices["iPhone 15"] });
  await ctx.route(/\/src\/lib\/receipt-extract\.functions\.ts/, (route) => route.fulfill({ contentType: "application/javascript", body: `export const extractReceipt = async () => { await new Promise((r) => setTimeout(r, 400)); return ${JSON.stringify(extraction)}; };` }));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  pageerror:", e.message));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, bottom: 34, left: 0, right: 0 } });
  await page.goto(`${BASE}/home`); await settle(page, "Coming up");
  await page.getByRole("button", { name: /Smart Add/ }).first().click();
  await shot(page, "01-add", "Step 1 · Add");
  await page.locator('input[type="file"][aria-label="Choose files"]').first().setInputFiles(RECEIPT);
  await page.getByRole("button", { name: /Continue to review/ }).first().click();
  await page.waitForTimeout(2500);
  await shot(page, "02-review-details", "Step 2 · Review (Details tab), top", /Blue Tokai/);
  await scrollTo(page, page.locator(".sf-canvas").getByText(/^Date$/));
  await shot(page, "03-review-date", "Step 2 · read date shown unambiguously");
  const looks = page.getByRole("button", { name: "Looks right" });
  if (await looks.count()) { await looks.first().click(); await page.waitForTimeout(800); }
  await scrollTo(page, page.locator('.sf-canvas [aria-label="Account"]'));
  await shot(page, "04-review-account", "Step 2 · account state after reading (card named without last four digits)");
  await page.getByRole("tab", { name: "Original" }).first().click();
  await shot(page, "05-review-original", "Step 2 · Original tab");
  await page.getByRole("tab", { name: "Details" }).first().click();
  await page.waitForTimeout(400);
  await shot(page, "06-review-details-again", "Step 2 · back on Details: edits and position kept");
  // The fixture already holds a Blue Tokai entry for the same day and amount: the review's own duplicate check asks first.
  const separate = page.getByRole("button", { name: /separate/i });
  if (await separate.count()) { await scrollTo(page, separate); await shot(page, "06b-review-duplicate-check", "Step 2 · the review's existing duplicate check (unchanged) holds Continue until answered"); await separate.first().click(); await page.waitForTimeout(500); }
  const cont = page.getByRole("button", { name: /Continue to confirmation/ });
  if (PHASE === "after" && await cont.count()) { await shot(page, "06c-review-continue-ready", "Step 2 · persistent Continue to confirmation, enabled"); await cont.last().click(); }
  else { const save = page.locator(".sf-canvas form button[type=submit]").last(); await save.scrollIntoViewIfNeeded(); await save.click(); }
  await page.waitForTimeout(800);
  await shot(page, "07-confirm", PHASE === "after" ? "Step 3 · blocked: account needs confirmation" : "Step 3 · B1b showed the habit account as if settled", "Ready for confirmation.");
  if (PHASE === "after") {
    await page.getByRole("button", { name: /Choose the account/ }).first().click();
    await page.waitForTimeout(600);
    const trigger = page.locator('.sf-canvas [aria-label="Account"]').first();
    await trigger.evaluate((e) => e.scrollIntoView({ block: "center" }));
    await trigger.click();
    await page.getByRole("option", { name: /Amex Platinum Travel/ }).click();
    await page.waitForTimeout(400);
    await shot(page, "08-review-account-chosen", "Step 2 · account chosen by the owner");
    const again = page.getByRole("button", { name: /separate/i });
    if (await again.count() && await again.first().isEnabled()) { await again.first().click(); await page.waitForTimeout(500); }
    await page.getByRole("button", { name: /Continue to confirmation/ }).last().click();
    await page.waitForTimeout(800);
    await shot(page, "09-confirm-enabled", "Step 3 · account confirmed: Confirm and save enabled (not pressed)", "Ready for confirmation.");
  }
  await browser.close();
  fs.writeFileSync(`${OUT}/${PHASE}-index.json`, JSON.stringify(SHOTS, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
