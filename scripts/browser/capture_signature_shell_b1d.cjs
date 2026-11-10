// Track B batch B1d: iPhone 15 captures of Smart Add with the sample Blue Tokai receipt (printed "Credit card ****1006").
// Fixture backend as in capture_signature_shell.cjs (writes are refused). Receipt reading is answered in the browser by a
// LABELLED STAND-IN for src/lib/receipt-extract.functions.ts that returns what the real reader returns for this bill,
// including the new card fields (card_network null — no network is printed — and card_last_four "1006"). A second,
// labelled variant returns a bill text printed "AMEX ****1006" to show the network wording. Nothing is saved: the run
// stops with "Confirm and save" enabled and never presses it.
//   BASE=http://127.0.0.1:8085 OUT=<dir> RECEIPT=<png> NODE_PATH=$(npm root -g) node scripts/browser/capture_signature_shell_b1d.cjs
const { chromium, devices } = require("playwright");
const fs = require("fs");
const { context, settle } = require("./capture_signature_shell.cjs");
const OUT = process.env.OUT || "/tmp/thapal-b1d"; fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || "http://127.0.0.1:8085";
const RECEIPT = process.env.RECEIPT;
const SHOTS = [];
const reading = (variant) => ({ ok: true, result: {
  title: "Blue Tokai Coffee", merchant: "Blue Tokai Coffee Roasters", date: "2026-11-09", amount: 460, subtotal: 438.1, tax: 21.9, tip: null, round_off: null, charges: [],
  tax_parts: [{ label: "CGST", rate: 2.5, amount: 10.95 }, { label: "SGST", rate: 2.5, amount: 10.95 }],
  confidence: { merchant: "high", date: "high", total: "high" },
  items: [{ name: "Cappuccino", quantity: 2, amount: 380, section: null, confidence: { name: "high", amount: "high" } }, { name: "Almond croissant", quantity: 1, amount: 58.1, section: null, confidence: { name: "high", amount: "high" } }],
  text: `BLUE TOKAI COFFEE ROASTERS Indiranagar, Bengaluru GSTIN 29ABCDE1234F1Z5 Date: 09-11-2026 14:22 Cappuccino x2 380.00 Almond croissant 58.10 Subtotal 438.10 CGST 2.5% 10.95 SGST 2.5% 10.95 TOTAL 460.00 ${variant === "amex" ? "Paid: AMEX ****1006" : "Paid: Credit card ****1006"} Thank you!`,
  currency: "INR", payment_method: "credit_card", card_network: variant === "amex" ? "amex" : null, card_last_four: "1006",
  description: null, category: "Food and beverages", scope: "personal",
} });

const intersects = (a, b) => !!a && !!b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
async function measure(page) {
  return page.evaluate(() => {
    const c = document.querySelector(".sf-canvas");
    if (!c) return null;
    const rect = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; };
    const foot = c.querySelector(".sf-canvas-foot");
    const toasts = [...document.querySelectorAll("[data-sonner-toast]")].map(rect);
    const date = c.querySelector("#sd, #d");
    return {
      viewport: { width: innerWidth, height: innerHeight }, footer: rect(foot), footerActions: [...(foot?.querySelectorAll("button, a") ?? [])].map((b) => ({ text: b.textContent.trim().slice(0, 40), disabled: !!b.disabled, ...rect(b) })),
      toasts, toaster: document.querySelector("[data-sonner-toaster]")?.getAttribute("data-y-position") ?? null,
      accountState: c.querySelector("form")?.getAttribute("data-account-state") ?? null, accountEvidence: c.querySelector("form")?.getAttribute("data-account-evidence") ?? null,
      dateField: date ? { shown: date.textContent.trim(), stored: date.getAttribute("data-value"), name: date.getAttribute("aria-label"), ...rect(date) } : null,
    };
  });
}
async function shot(page, name, note, text, quick = false) {
  if (quick) await page.waitForTimeout(250); else await settle(page, text);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const m = await measure(page);
  if (m) m.toastOverlapsFooter = m.toasts.some((t) => intersects(t, m.footer));
  if (m) m.toastGapAboveFooterPx = m.toasts.length && m.footer ? Math.min(...m.toasts.map((t) => m.footer.y - (t.y + t.height))) : null;
  if (m) m.toastInSafeArea = m.toasts.some((t) => t.y < 47 || t.y + t.height > m.viewport.height - 34);
  SHOTS.push({ name, note, ...m });
  console.log("shot", name, JSON.stringify({ toasts: m?.toasts, footer: m?.footer, overlap: m?.toastOverlapsFooter, account: m?.accountState, date: m?.dateField?.shown }));
}
// Sonner pauses a toast while the pointer rests on it, so move the pointer off first.
const noToasts = async (page) => { await page.mouse.move(2, 2); return page.waitForFunction(() => !document.querySelector("[data-sonner-toast]"), null, { timeout: 15000 }).catch(() => console.log("  (toast still shown)")); };
const center = async (page, locator) => { try { await locator.first().evaluate((e) => e.scrollIntoView({ block: "center" })); await page.waitForTimeout(400); } catch { console.log("  (no scroll target)"); } };

async function openWith(browser, variant) {
  const ctx = await context(browser, { ...devices["iPhone 15"] });
  await ctx.route(/\/src\/lib\/receipt-extract\.functions\.ts/, (route) => route.fulfill({ contentType: "application/javascript", body: `// Capture stand-in for the receipt reader (labelled; see README).\nexport const extractReceipt = async () => { await new Promise((r) => setTimeout(r, 400)); return ${JSON.stringify(reading(variant))}; };` }));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  pageerror:", e.message));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 47, bottom: 34, left: 0, right: 0 } });
  await page.goto(`${BASE}/home`); await settle(page, "Coming up");
  await page.getByRole("button", { name: /Smart Add/ }).first().click();
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch();
  const { page } = await openWith(browser, "printed");
  await shot(page, "01-add", "Step 1 · Add (unchanged B1c layout)");
  await page.locator('input[type="file"][aria-label="Choose files"]').first().setInputFiles(RECEIPT);
  await page.getByRole("button", { name: /Continue to review/ }).first().click();
  // A toast fires as the bill is read; capture it at once with the sticky footer on screen.
  await page.getByText("Bill read — check the key details").first().waitFor({ timeout: 20000 });
  await shot(page, "02-toast-clear-of-footer", "A notification while the sticky footer is visible: it sits just above the footer, clear of the safe areas", null, true);
  await shot(page, "03-review-details", "Step 2 · Review (Details tab), top: the existing duplicate check", /Blue Tokai/);
  await noToasts(page);
  await center(page, page.locator(".sf-canvas #sd"));
  await shot(page, "04-review-date-field", "Step 2 · the date field always shows 09 Nov 2026 (stored 2026-11-09)");
  await page.locator(".sf-canvas #sd").click();
  await page.getByRole("dialog", { name: "Choose date" }).waitFor();
  await shot(page, "05-review-date-picker", "Step 2 · the date field opens a calendar (keyboard: arrows, Enter, Escape)", null, true);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Looks right" }).first().click();
  await page.waitForTimeout(800);
  await center(page, page.locator('.sf-canvas [aria-label="Account"]'));
  await shot(page, "06-review-account-suggested", "Step 2 · Amex Platinum Travel suggested from the printed card digits, with evidence and Confirm this account");
  await page.getByRole("tab", { name: "Original" }).first().click();
  await shot(page, "07-review-original", "Step 2 · Original tab (source kept)");
  await page.getByRole("tab", { name: "Details" }).first().click();
  await page.waitForTimeout(400);
  // The fixture already holds a Blue Tokai entry for ₹460 that day: the review's existing check asks first.
  const dup = page.getByRole("region", { name: /Possible duplicate bills|Possible matching entries/ }).first();
  await center(page, dup);
  await dup.getByRole("button", { name: "It's separate" }).click();
  await page.waitForTimeout(300);
  await shot(page, "08-duplicate-reason-required", "Step 2 · “It's separate” without a reason is refused and asks why", null, true);
  await dup.getByLabel("If it's a separate bill, say why").fill("Second round for the team — new bill BT-20932");
  await dup.getByRole("button", { name: "It's separate" }).click();
  await page.waitForTimeout(400);
  await shot(page, "09-duplicate-separate-with-reason", "Step 2 · separate bill confirmed with its reason (saved with the entry, with who and when)");
  await page.getByRole("button", { name: /Continue to confirmation/ }).last().click();
  await page.waitForTimeout(800);
  await shot(page, "10-confirm-blocked", "Step 3 · blocked: the suggested account is not yet confirmed", "Ready for confirmation.");
  await page.getByRole("button", { name: /Choose the account/ }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Confirm this account" }).first().click();
  await page.waitForTimeout(400);
  await center(page, page.locator('.sf-canvas [aria-label="Account"]'));
  await shot(page, "11-review-account-confirmed", "Step 2 · the owner confirmed Amex Platinum Travel");
  await page.getByRole("button", { name: /Continue to confirmation/ }).last().click();
  await page.waitForTimeout(800);
  await shot(page, "12-confirm-enabled", "Step 3 · confirmed: Confirm and save enabled (not pressed)", "Ready for confirmation.");

  // Labelled variant: the bill prints the network ("AMEX ****1006").
  const v = await openWith(browser, "amex");
  await v.page.locator('input[type="file"][aria-label="Choose files"]').first().setInputFiles(RECEIPT);
  await v.page.getByRole("button", { name: /Continue to review/ }).first().click();
  await v.page.getByRole("button", { name: "Looks right" }).first().waitFor({ timeout: 20000 });
  await v.page.getByRole("button", { name: "Looks right" }).first().click();
  await noToasts(v.page);
  await v.page.waitForTimeout(800);
  await center(v.page, v.page.locator('.sf-canvas [aria-label="Account"]'));
  await shot(v.page, "13-variant-amex-printed", "Variant stand-in text “AMEX ****1006”: evidence reads “Amex ending 1006 printed on the bill matches Amex Platinum Travel”");
  await browser.close();
  fs.writeFileSync(`${OUT}/index.json`, JSON.stringify(SHOTS, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
