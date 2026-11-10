// Track B batch B1: device-emulated screenshots of the PROPOSED Signature Flow shell for KK's visual review.
// Fixture data only: the app's Supabase URL is a non-existent host and every request to it is answered here,
// so nothing reaches hosted services. Saved preferences are kept in this script's memory only.
//   BASE=http://127.0.0.1:8083 OUT=<dir> NODE_PATH=$(npm root -g) node scripts/browser/capture_signature_shell.cjs
// The shell is switched on per device with the review flag (localStorage "ll-uix"), never by a cloud write.
const { chromium, devices } = require("playwright");
const fs = require("fs");
const OUT = process.env.OUT || "/tmp/thapal-signature-shell"; fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || "http://127.0.0.1:8083";
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const OWNER = "11111111-1111-4111-8111-111111111111";
const b64 = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
const token = () => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: OWNER, exp: Math.floor(Date.now() / 1000) + 3600, aud: "authenticated", role: "authenticated", session_id: "s1" })}.fixture`;
const user = { id: OWNER, aud: "authenticated", role: "authenticated", email: "kk@example.invalid", email_confirmed_at: "2026-01-01T00:00:00Z", last_sign_in_at: new Date().toISOString(), app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { full_name: "KK" }, identities: [], is_anonymous: false, created_at: "2026-01-01T00:00:00Z" };
const SHOTS = [];

// ---- Fixture records (illustrative, not anyone's real finances) ----
const id = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SAV = id(1), CUR = id(2), CASH = id(3), CARD = id(4), INV = id(5), CARD2 = id(6);
const acc = (x) => ({ owner_id: OWNER, archived: false, credit_limit: null, due_day: null, min_balance: 0, issuer: null, last_four: null, statement_day: null, interest_rate: null, include_in_cash: true, details: {}, created_at: "2026-04-01T00:00:00Z", ...x });
const accounts = [
  acc({ id: SAV, name: "HDFC Savings", kind: "savings", opening_balance: 286400, issuer: "HDFC Bank", last_four: "4821" }),
  acc({ id: CUR, name: "ICICI Current", kind: "current", opening_balance: 142500, issuer: "ICICI Bank", last_four: "0937" }),
  acc({ id: CASH, name: "Cash wallet", kind: "cash", opening_balance: 6200 }),
  acc({ id: CARD, name: "HDFC Regalia card", kind: "credit_card", opening_balance: 41250, credit_limit: 500000, due_day: 7, statement_day: 18, issuer: "HDFC Bank", last_four: "7710", include_in_cash: false }),
  acc({ id: CARD2, name: "Amex Platinum Travel", kind: "credit_card", opening_balance: 0, credit_limit: 300000, due_day: 22, statement_day: 2, issuer: "American Express", last_four: "1006", include_in_cash: false }),
  acc({ id: INV, name: "Zerodha portfolio", kind: "investment", opening_balance: 0, include_in_cash: false }),
];
let n = 100;
const tx = (x) => ({ id: id(++n), employee_id: OWNER, department: null, merchant: null, category: "Food", scope: "personal", member_id: null, splits: [], currency: "INR", fx_rate: 1, payment_method: "upi", reconciled_at: "2026-11-08T10:00:00Z", statement_ref: null, updated_at: "2026-11-08T10:00:00Z", created_at: `${x.expense_date}T10:00:00Z`, description: "", receipts: [], txn_type: "expense", account_id: SAV, to_account_id: null, payment_instrument_id: null, tags: [], workspace_allocations: [], receipt_details: null, reimbursement_status: "none", adjustment_sign: 1, allocations: [], reimbursement: {}, transfer_counterpart_of: null, trip_id: null, principal: null, interest: null, category_revision: 0, correction_revision: 1, ...x, original_amount: x.amount });
const expenses = [
  tx({ title: "Salary — November", merchant: "Thapal Ventures", category: "Salary", txn_type: "income", amount: 245000, expense_date: "2026-11-01", payment_method: "bank_transfer" }),
  tx({ title: "Taj Mahal Palace", merchant: "Taj Hotels", category: "Travel", amount: 38400, expense_date: "2026-11-08", payment_method: "credit_card", account_id: CARD, reimbursement_status: "pending", tags: ["Purpose: Reimbursable"] }),
  tx({ title: "Swiggy order", merchant: "Swiggy", category: "Food", amount: 742, expense_date: "2026-11-09" }),
  tx({ title: "Uber to airport", merchant: "Uber", category: "Transport", amount: 1180, expense_date: "2026-11-07", payment_method: "credit_card", account_id: CARD2 }),
  tx({ title: "BESCOM electricity", merchant: "BESCOM", category: "Utilities", amount: 4320, expense_date: "2026-11-05" }),
  tx({ title: "Amazon order", merchant: "Amazon", category: "Miscellaneous", amount: 2599, expense_date: "2026-11-06", payment_method: "credit_card", account_id: CARD, reconciled_at: null, statement_ref: "HDFC card:2026-11-06:2599" }),
  tx({ title: "HDFC Regalia payment", category: "Transfer", txn_type: "transfer", amount: 41250, expense_date: "2026-11-04", payment_method: "bank_transfer", account_id: SAV, to_account_id: CARD }),
  tx({ title: "Indian Oil", merchant: "Indian Oil", category: "Fuel", amount: 3500, expense_date: "2026-11-03", payment_method: "credit_card", account_id: CARD }),
  tx({ title: "Blue Tokai coffee", merchant: "Blue Tokai", category: "Food", amount: 460, expense_date: "2026-11-09", payment_method: "credit_card", account_id: CARD2 }),
  tx({ title: "Rent received — Indiranagar flat", merchant: "Tenant", category: "Rent", txn_type: "income", amount: 42000, expense_date: "2026-11-02", payment_method: "bank_transfer", account_id: CUR }),
];
const commitments = [
  { id: id(201), owner_id: OWNER, name: "LIC premium", kind: "bill", direction: "out", amount: 18650, frequency: "yearly", interval_days: null, next_due: "2026-11-15", account_id: SAV, category: "Insurance", confirmed: true, essential: true, status: "active" },
  { id: id(202), owner_id: OWNER, name: "ACT Fibernet", kind: "subscription", direction: "out", amount: 1179, frequency: "monthly", interval_days: null, next_due: "2026-11-12", account_id: CARD, category: "Utilities", confirmed: true, essential: true, status: "active" },
  { id: id(203), owner_id: OWNER, name: "Rent — Indiranagar flat", kind: "income", direction: "in", amount: 42000, frequency: "monthly", interval_days: null, next_due: "2026-12-02", account_id: CUR, category: "Rent", confirmed: true, essential: false, status: "active" },
  { id: id(205), owner_id: OWNER, name: "Property tax — BBMP", kind: "bill", direction: "out", amount: 14820, frequency: "yearly", interval_days: null, next_due: "2026-11-05", account_id: SAV, category: "Taxes", confirmed: true, essential: true, status: "active" },
  { id: id(204), owner_id: OWNER, name: "SIP — Parag Parikh Flexi Cap", kind: "bill", direction: "out", amount: 25000, frequency: "monthly", interval_days: null, next_due: "2026-11-11", account_id: SAV, category: "Investments", confirmed: true, essential: false, status: "active" },
];
const valuations = [{ id: id(301), owner_id: OWNER, account_id: INV, value: 1864300, valued_on: "2026-11-07", source: "Zerodha holdings statement", note: null }];
const documents = [
  { id: id(401), owner_id: OWNER, title: "Taj Mahal Palace invoice", doc_type: "invoice", file_path: `${OWNER}/taj.pdf`, file_name: "taj-invoice.pdf", mime_type: "application/pdf", size_bytes: 182000, doc_date: "2026-11-08", amount: 38400, currency: "INR", created_at: "2026-11-08T12:00:00Z", fields: [] },
  { id: id(402), owner_id: OWNER, title: "LIC policy schedule", doc_type: "insurance", file_path: `${OWNER}/lic.pdf`, file_name: "lic.pdf", mime_type: "application/pdf", size_bytes: 92000, doc_date: "2025-11-15", amount: 18650, currency: "INR", created_at: "2025-11-15T12:00:00Z", fields: [] },
  { id: id(403), owner_id: OWNER, title: "HDFC Savings — October statement", doc_type: "bank_statement", file_path: `${OWNER}/hdfc-oct.pdf`, file_name: "hdfc-oct.pdf", mime_type: "application/pdf", size_bytes: 310000, doc_date: "2026-10-31", amount: null, currency: "INR", created_at: "2026-11-01T12:00:00Z", fields: [] },
];
const prefsSeed = () => ({
  homeScope: "personal",
  entities: [{ id: "ent-1", name: "Thapal Ventures Pvt Ltd", kind: "company", pan: "", gstins: [], booksFrom: "2026-27" }],
  trips: [{ id: "trip-1", name: "Mumbai client visit", destination: "Mumbai", start: "2026-11-07", end: "2026-11-09", budget: 60000, currencies: ["INR"] }],
  assets: [{ id: id(501), name: "MacBook Pro (office)", kind: "computer", cost: 185000, inUse: "2025-05-12", purchaseDate: "2025-05-10", sharePct: 100, bookMethod: "wdv", bookRatePct: 40 }],
});

async function context(browser, device, opts = {}) {
  const ctx = await browser.newContext(device);
  const state = { prefs: prefsSeed(), revision: 3 };
  await ctx.route("https://fixture.supabase.invalid/**", async (route) => {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname;
    const one = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
    const reply = (rows) => route.fulfill({ json: one ? (rows[0] ?? null) : rows });
    if (p.startsWith("/auth/v1/user")) return route.fulfill({ json: user });
    if (p.startsWith("/auth/v1/token")) return route.fulfill({ json: { access_token: token(), refresh_token: "fixture", expires_in: 3600, token_type: "bearer", user } });
    if (p.startsWith("/auth/v1/")) return route.fulfill({ json: {} });
    if (p.startsWith("/rest/v1/rpc/save_reviewed_preferences")) { const body = JSON.parse(req.postData() || "{}"); if (body._data) state.prefs = body._data; state.revision += 1; return route.fulfill({ json: state.revision }); }
    if (p.startsWith("/rest/v1/rpc/")) return route.fulfill({ json: null });
    if (req.method() !== "GET" && req.method() !== "HEAD") return route.fulfill({ status: 403, json: { message: "Writes are blocked in captures" } });
    const table = p.replace("/rest/v1/", "");
    if (table === "finance_preferences") return reply([{ data: state.prefs, revision: state.revision }]);
    if (table === "profiles") return reply([{ full_name: "KK" }]);
    if (table === "accounts") return reply(accounts);
    if (table === "expenses") return reply(expenses);
    if (table === "commitments") return reply(commitments);
    if (table === "asset_valuations") return reply(valuations);
    if (table === "documents") return reply(documents);
    if (p.startsWith("/storage/")) return route.fulfill({ json: [] });
    return reply([]);
  });
  await ctx.addInitScript(([owner, sess, shell]) => {
    try {
      localStorage.setItem("sb-fixture-auth-token", JSON.stringify(sess));
      localStorage.setItem(`ll-face-offer-${owner}`, "later");
      localStorage.setItem(`ll-activity-${owner}`, String(Date.now()));
      if (shell) localStorage.setItem("ll-uix", shell); else localStorage.removeItem("ll-uix");
    } catch { /* storage blocked */ }
  }, [OWNER, { access_token: token(), refresh_token: "fixture", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user }, opts.shell === undefined ? "signature-flow" : opts.shell]);
  return ctx;
}

async function settle(page, text) {
  try { await page.waitForLoadState("networkidle", { timeout: 15000 }); } catch {}
  if (text) { try { await page.getByText(text).first().waitFor({ timeout: 20000 }); } catch { console.log("  (text not found:", String(text), ")"); } }
  await page.waitForTimeout(1200);
}
async function shot(page, name, note, text) {
  await settle(page, text);
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  SHOTS.push({ name, note, horizontalOverflowPx: overflow });
  console.log("shot", name, overflow ? `(horizontal overflow ${overflow}px)` : "");
}

const DEVICES = [
  ["iphone", { ...devices["iPhone 15"] }],
  ["ipad-portrait", { ...devices["iPad Pro 11"] }],
  ["ipad-landscape", { ...devices["iPad Pro 11 landscape"] }],
  ["desktop", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }],
];

module.exports = { context, settle, CARD, BASE };
if (require.main === module) (async () => {
  const browser = await chromium.launch();
  for (const [tag, device] of DEVICES) {
    if (ONLY && !ONLY.includes(tag)) continue;
    const ctx = await context(browser, device);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("  pageerror:", e.message));
    await page.goto(`${BASE}/home`); await shot(page, `${tag}-01-home`, "Home (B01) on fixture data", "Coming up");
    await page.goto(`${BASE}/money`); await shot(page, `${tag}-02-money`, "Money hub (capture 03 layout), account-first", "Your money, connected.");
    if (tag !== "iphone") {
      await page.getByRole("button", { name: /HDFC Savings/ }).first().click();
      await page.getByText("Latest entries").first().scrollIntoViewIfNeeded().catch(() => {});
      await shot(page, `${tag}-03-money-account-split`, "Money: list/detail split — selected account stays beside the list");
    } else {
      await page.getByRole("button", { name: /HDFC Savings/ }).first().click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.getByText("Latest entries").first().scrollIntoViewIfNeeded().catch(() => {});
      await shot(page, `${tag}-03-money-account-detail`, "Money: on iPhone the account detail opens full width with Back to accounts");
    }
    await page.goto(`${BASE}/records`); await shot(page, `${tag}-04-records`, "Records hub (capture 05 layout); Reports is one row away", "Everything in its place.");
    await page.goto(`${BASE}/tasks`); await shot(page, `${tag}-05-todo`, "To-do: counts from Financial Inbox rules, rows open existing Inbox sections", "Needs your review");
    await page.goto(`${BASE}/calendar`); await shot(page, `${tag}-06-calendar`, "Calendar: existing PlanCalendar inside the new frame", "Calendar");
    await page.goto(`${BASE}/notifications`); await shot(page, `${tag}-07-notifications`, "Notifications: PROPOSED placeholder listing real derived alerts", "Notifications");
    await page.goto(`${BASE}/home`); await settle(page, "Coming up");
    await page.getByRole("button", { name: /Smart Add/ }).first().click();
    await shot(page, `${tag}-08-smart-add`, "Smart Add sheet (existing component) restyled by the Signature Flow tokens", "Scan or Photo");
    await page.keyboard.press("Escape");
    await page.goto(`${BASE}/money`); await settle(page, "Your money, connected.");
    await page.goto(`${BASE}/cards/${CARD}`); await shot(page, `${tag}-09-existing-card-detail`, "Existing page (card detail) inside the new shell; breadcrumbs show the real path Money → Card", "HDFC Regalia");
    await page.goto(`${BASE}/home`); await settle(page, "Coming up");
    if (tag === "iphone") {
      await page.getByRole("navigation", { name: "Tab bar" }).getByRole("link", { name: "Records" }).click();
      await settle(page, "Everything in its place.");
      await page.getByRole("link", { name: /^Reports/ }).first().scrollIntoViewIfNeeded();
      await shot(page, `${tag}-10-reports-two-taps-step1`, "iPhone: Records tab (tap 1) shows the Reports row (tap 2)");
    } else {
      await page.getByRole("button", { name: /Find anything/ }).first().click();
      await page.getByRole("searchbox", { name: "Find anything" }).fill("taj");
      await shot(page, `${tag}-10-search-palette`, "Find anything palette: existing record search grouped by type", "Transactions");
      await page.keyboard.press("Escape");
    }
    await ctx.close();
  }
  // Default stays the current UI: same fixture, no review flag.
  if (!ONLY || ONLY.includes("default")) {
    const ctx = await context(browser, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, { shell: null });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dashboard`); await shot(page, "desktop-00-default-current-ui", "Switch off (default): today's UI is unchanged", "Today");
    await page.goto(`${BASE}/settings`); await settle(page, "Appearance");
    const ap = page.getByText("Signature Flow (proposed)").first();
    if (await ap.count()) { await ap.scrollIntoViewIfNeeded(); await shot(page, "desktop-00-settings-appearance-switch", "Settings → Appearance offers 'Signature Flow (proposed)'"); }
    else console.log("  (appearance option not on first screen)");
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(`${OUT}/index.json`, JSON.stringify(SHOTS, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
