// Track C evidence, second pass (browser confirm/prompt pop-ups replaced by in-app dialogs, prioritising destructive
// financial actions and period closing): device-emulated screenshots on fixture data. Based on
// capture_prompt_replacement.cjs (same Supabase stand-in and fixture rows) plus one card purchase with a receipt, one
// trip and one closed period.
// Every Supabase call is answered here; the app's Supabase URL points at a non-existent host
// (fixture.supabase.invalid), so nothing can reach hosted services. Saved preferences live in this script's memory.
//   PHASE=before|after OUT=<dir> BASE=http://127.0.0.1:8084 NODE_PATH=$(npm root -g) node scripts/browser/capture_prompt_replacement_2.cjs
// PNGs are converted to JPEG at most 720 px wide with ImageMagick (convert).
const { chromium, devices } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs");
const PHASE = process.env.PHASE || "after";
const OUT = process.env.OUT || "/tmp/thapal-prompt-replacement-2"; fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || "http://127.0.0.1:8084";
const OWNER = "11111111-1111-4111-8111-111111111111";
const b64 = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
const token = (sid) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: OWNER, exp: Math.floor(Date.now() / 1000) + 3600, aud: "authenticated", role: "authenticated", session_id: sid })}.fixture`;
const user = {
  id: OWNER, aud: "authenticated", role: "authenticated", email: "kk@example.invalid",
  email_confirmed_at: "2026-01-01T00:00:00Z", last_sign_in_at: new Date(Date.now() - 3600_000).toISOString(),
  app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { full_name: "KK" },
  identities: [{ id: "i1", user_id: OWNER, provider: "email", identity_data: { email: "kk@example.invalid" } }],
  is_anonymous: false, created_at: "2026-01-01T00:00:00Z",
};
const today = new Date().toISOString().slice(0, 10);
const month = today.slice(0, 7);
const ENT = "eeeeeeee-0000-4000-8000-000000000001", BANK = "acacacac-0000-4000-8000-000000000001", CARD = "acacacac-0000-4000-8000-000000000002";
const TRIP = "77777777-0000-4000-8000-000000000001";
const DOC = "dddddddd-0000-4000-8000-000000000011", DOC2 = "dddddddd-0000-4000-8000-000000000012";
const seed = () => ({
  receivables: [
    { id: "aaaaaaaa-1000-4000-8000-000000000001", customer: "Sundaram Traders", invoiceNo: "TH-101", date: "2026-10-01", dueDate: "2026-10-31", amount: 59000, gst: 9000 },
    { id: "aaaaaaaa-1000-4000-8000-000000000002", customer: "Kaveri Foods", invoiceNo: "TH-104", date: "2026-10-20", dueDate: "2026-11-20", amount: 12000 },
  ],
  entities: [{ id: ENT, name: "Thapal Ventures Pvt Ltd", kind: "company", pan: "AAACT1234F", gstins: ["33AAACT1234F1Z5"], regNo: "U72900TN2021PTC000001", booksFrom: "2024-25", address: "Anna Salai, Chennai 600002" }],
  books: { closedPeriods: [{ id: "cp000000-0000-4000-8000-000000000001", from: "2023-04-01", to: "2024-03-31", closedOn: "2024-07-31", note: "FY 2023-24 audited and filed" }], entityAccounts: { [ENT]: [BANK] }, entityTaxProfiles: [{ id: "eeeeeeee-1000-4000-8000-000000000001", entityId: ENT, fy: "2025-26", bookProfit: 420000 }] },
  notifications: { enabled: true },
  trips: [{ id: TRIP, name: "Goa offsite", destination: "Goa", start: "2026-12-04", end: "2026-12-07", budget: 60000, currencies: ["INR"], travellers: [], bookings: [], itinerary: [], advances: [] }],
});
const row = (o) => ({ owner_id: OWNER, created_at: "2026-01-01T00:00:00Z", ...o });
const TABLES = {
  accounts: [
    row({ id: BANK, name: "HDFC current ••4417", kind: "current", opening_balance: 245000, archived: false, issuer: "HDFC Bank", last_four: "4417", include_in_cash: true, min_balance: 10000, credit_limit: null, due_day: null, statement_day: null, interest_rate: null, details: {} }),
    row({ id: CARD, name: "Amex card ••1009", kind: "credit_card", opening_balance: 0, archived: false, issuer: "American Express", last_four: "1009", credit_limit: 300000, statement_day: 12, due_day: 2, min_balance: 0, interest_rate: 42, include_in_cash: false, details: {} }),
  ],
  expenses: [
    row({ id: "eeee0000-0000-4000-8000-000000000001", title: "Office rent November", amount: 32000, original_amount: 32000, currency: "INR", fx_rate: 1, expense_date: `${month}-01`, category: "Rent", payment_method: "bank_transfer", txn_type: "expense", account_id: BANK, scope: "business", description: "", merchant: "Ravi Properties", splits: [], receipts: [], reconciled_at: `${month}-05T00:00:00Z`, statement_ref: "UPI/3011", employee_id: null, tags: [], allocations: [], adjustment_sign: 1 }),
    row({ id: "eeee0000-0000-4000-8000-000000000002", title: "Sundaram Traders payment", amount: 59000, original_amount: 59000, currency: "INR", fx_rate: 1, expense_date: `${month}-03`, category: "Income", payment_method: "bank_transfer", txn_type: "income", account_id: BANK, scope: "business", description: "TH-101", merchant: "Sundaram Traders", splits: [], receipts: [], reconciled_at: null, statement_ref: null, employee_id: null, tags: [], allocations: [], adjustment_sign: 1 }),
    row({ id: "eeee0000-0000-4000-8000-000000000003", title: "Team lunch", amount: 2400, original_amount: 2400, currency: "INR", fx_rate: 1, expense_date: `${month}-02`, category: "Food", payment_method: "card", txn_type: "expense", account_id: CARD, scope: "personal", description: "", merchant: "Toit", splits: [], receipts: [{ path: `${OWNER}/receipts/toit.pdf`, name: "toit-bill.pdf", type: "application/pdf" }], reconciled_at: null, statement_ref: null, employee_id: null, tags: [], allocations: [], adjustment_sign: 1 }),
  ],
  commitments: [
    row({ id: "cccc0000-0000-4000-8000-000000000001", name: "Flat rent", kind: "rent", direction: "out", amount: 32000, frequency: "monthly", interval_days: null, next_due: `${month}-28`, account_id: BANK, category: "Rent", confirmed: true, essential: true, status: "active" }),
    row({ id: "cccc0000-0000-4000-8000-000000000002", name: "LIC premium", kind: "insurance", direction: "out", amount: 24000, frequency: "yearly", interval_days: null, next_due: "2027-03-15", account_id: BANK, category: "Insurance", confirmed: true, essential: true, status: "cancelled" }),
  ],
  documents: [
    row({ id: DOC, title: "LIC policy 2026", doc_type: "insurance", file_path: `${OWNER}/docs/lic.pdf`, file_name: "lic-policy.pdf", mime_type: "application/pdf", size_bytes: 120000, doc_date: "2026-04-01", amount: 24000, currency: "INR", merchant: "LIC", notes: "", extracted_text: "", transaction_id: null, account_id: null, loan_id: null, expires_on: null, fields: [], replaces_id: null, evidence_locked: false, entity_id: null }),
    row({ id: DOC2, title: "HDFC statement Oct 2026", doc_type: "bank_statement", file_path: `${OWNER}/docs/hdfc-oct.pdf`, file_name: "hdfc-oct.pdf", mime_type: "application/pdf", size_bytes: 220000, doc_date: "2026-10-31", amount: null, currency: "INR", merchant: "HDFC Bank", notes: "", extracted_text: "", transaction_id: null, account_id: BANK, loan_id: null, expires_on: null, fields: [], replaces_id: null, evidence_locked: true, entity_id: ENT }),
  ],
};
const SHOTS = [];
const VIEWPORTS = [["iPhone 15", "iphone"], ["iPad Pro 11", "ipad"], ["Desktop 1440x900", "desktop"]];

async function context(browser, device, state) {
  const opts = device === "Desktop 1440x900" ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } : { ...devices[device] };
  const ctx = await browser.newContext(opts);
  await ctx.route("https://fixture.supabase.invalid/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const single = /vnd\.pgrst\.object/.test(req.headers()["accept"] || "");
    if (p.startsWith("/auth/v1/user")) return route.fulfill({ json: user });
    if (p.startsWith("/auth/v1/token")) return route.fulfill({ json: { access_token: token("22222222-2222-4222-8222-222222222222"), refresh_token: "fixture", expires_in: 3600, token_type: "bearer", user } });
    if (p.startsWith("/auth/v1/")) return route.fulfill({ status: 200, json: {} });
    if (p.startsWith("/rest/v1/finance_preferences")) { const r = { data: state.data, revision: state.revision }; return route.fulfill({ json: single ? r : [r] }); }
    if (p.startsWith("/rest/v1/rpc/save_reviewed_preferences")) {
      const body = JSON.parse(req.postData() || "{}");
      state.data = body._data; state.revision += 1; state.saves.push(body._data);
      return route.fulfill({ json: state.revision });
    }
    if (p.startsWith("/rest/v1/profiles")) return route.fulfill({ json: single ? { full_name: "KK" } : [{ full_name: "KK" }] });
    const table = p.replace("/rest/v1/", "");
    if ((req.method() === "DELETE" || req.method() === "PATCH" || req.method() === "POST") && !/^(rpc\/posting_status|\/storage\/v1\/object\/sign\/)/.test(table)) { state.writes.push(`${req.method()} ${table}`); }
    if (req.method() === "DELETE" && TABLES[table]) { state.tables[table] = []; return route.fulfill({ status: 204, body: "" }); }
    if (state.tables[table]) return route.fulfill({ json: single ? state.tables[table][0] ?? null : state.tables[table] });
    if (p.startsWith("/rest/v1/rpc/")) return route.fulfill({ status: 200, json: null });
    if (p.startsWith("/storage/")) return route.fulfill({ json: [] });
    return route.fulfill({ json: single ? null : [] });
  });
  await ctx.addInitScript(([owner, sess]) => {
    try {
      localStorage.setItem("sb-fixture-auth-token", JSON.stringify(sess));
      localStorage.setItem(`ll-face-offer-${owner}`, "later");
      localStorage.setItem(`ll-activity-${owner}`, String(Date.now()));
    } catch { /* storage blocked */ }
  }, [OWNER, { access_token: token("22222222-2222-4222-8222-222222222222"), refresh_token: "fixture", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user }]);
  return ctx;
}

async function settle(page, text) {
  try { await page.waitForLoadState("networkidle", { timeout: 15000 }); } catch {}
  if (text) { try { await page.getByText(text).first().waitFor({ timeout: 20000 }); } catch { console.log("  (text not found:", String(text), ")"); } }
}
async function shot(page, name, note, text, locator) {
  await settle(page, text);
  if (locator) await locator.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(900);
  const png = `${OUT}/${name}.png`, jpg = `${OUT}/${name}.jpg`;
  await page.screenshot({ path: png, fullPage: false });
  execFileSync("convert", [png, "-resize", "720x>", "-quality", "78", jpg]);
  fs.unlinkSync(png);
  SHOTS.push({ name: `${name}.jpg`, note });
  console.log("shot", name);
}
const approve = async (page) => { const b = page.getByRole("button", { name: /Approve & save/ }); try { await b.waitFor({ timeout: 6000 }); await b.click(); } catch { /* no review step */ } await page.waitForTimeout(1200); };

const PROMPTS = [];
const openLunch = async (page) => {
  await page.goto(`${BASE}/expenses`);
  await settle(page, "Team lunch");
  await page.getByText("Team lunch").first().click();
  await page.waitForTimeout(800);
};
const openTripMore = async (page) => {
  await page.goto(`${BASE}/trips/${TRIP}`);
  await settle(page, "Goa offsite");
  await page.locator("button[aria-expanded]", { hasText: "More" }).first().click();
  await page.waitForTimeout(500);
};
const openPeriods = async (page) => {
  await page.goto(`${BASE}/audit#periods`);
  await settle(page, "Closed periods");
  await page.evaluate(() => { const d = document.getElementById("periods"); if (d instanceof HTMLDetailsElement) d.open = true; });
  await page.waitForTimeout(500);
};

async function before(page, tag) {
  // A browser pop-up is drawn by the browser, not the page, so it never appears in a screenshot: record its text instead.
  page.on("dialog", async (d) => { PROMPTS.push({ tag, type: d.type(), message: d.message(), defaultValue: d.defaultValue() }); await d.dismiss(); });
  await openLunch(page);
  const del = page.getByRole("button", { name: "Delete", exact: true }).last();
  await shot(page, `${tag}-before-01-expense-delete`, "Expense: Delete asks with a browser pop-up (window.confirm: \"Delete this expense and its receipts?\") that names nothing and cannot be styled", "Team lunch", del);
  await del.click(); await page.waitForTimeout(400);
  await page.keyboard.press("Escape");
  await openTripMore(page);
  const cancel = page.getByRole("button", { name: "Cancel trip" }).last(); // the closure card under More (the header one already opens an in-app dialog)
  await shot(page, `${tag}-before-02-trip-cancel`, "Trip: Cancel trip asks with a browser pop-up (window.confirm)", "Complete trip", cancel);
  await cancel.dispatchEvent("click"); await page.waitForTimeout(400);
  await openPeriods(page);
  const close = page.getByRole("button", { name: "Close period" });
  await shot(page, `${tag}-before-03-period-close-freeze`, "Audit → Closed periods: Close period and Freeze FY ask with browser pop-ups (window.confirm); nothing to type, no statement of who can reopen", "Freeze a whole year", close);
  await close.dispatchEvent("click"); await page.waitForTimeout(400);
  await page.getByRole("button", { name: /^Freeze FY / }).first().dispatchEvent("click"); await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Reopen" }).first().dispatchEvent("click"); await page.waitForTimeout(400);
}

async function after(page, tag) {
  page.on("dialog", async (d) => { PROMPTS.push({ tag, type: d.type(), message: d.message() }); await d.dismiss(); });
  const dlg = () => page.getByRole("dialog").last();
  await openLunch(page);
  await page.getByRole("button", { name: "Delete", exact: true }).last().click();
  await shot(page, `${tag}-after-01-expense-delete`, "Delete expense: names the entry, amount, date and receipt count, says it is deleted (not reversed) and cannot be undone; destructive Delete expense, Keep expense", "Delete “Team lunch”?");
  await page.keyboard.press("Escape");
  await openTripMore(page);
  await page.getByRole("button", { name: "Cancel trip" }).last().dispatchEvent("click");
  await shot(page, `${tag}-after-02-trip-cancel`, "Cancel trip: records stay, trip marked cancelled, can be undone; Keep trip or Cancel trip", "Cancel “Goa offsite”?");
  await dlg().getByRole("button", { name: "Keep trip" }).click();
  await openPeriods(page);
  await page.getByRole("button", { name: "Close period" }).dispatchEvent("click");
  await shot(page, `${tag}-after-03-period-close`, "Close period: names the period, lists what is locked and that only the Audit operation (Reopen with a reason) can reopen it; Close period stays off until the period is typed", "Close 2025-04-01 to 2026-03-31?");
  await dlg().getByLabel(/to confirm/).fill("2025-04-01 to 2026-03-31");
  await shot(page, `${tag}-after-04-period-close-typed`, "Close period: the typed period matches, so Close period is enabled (nothing is sent until it is pressed)", "Matches.");
  await dlg().getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: /^Freeze FY / }).first().dispatchEvent("click");
  await shot(page, `${tag}-after-05-freeze-fy`, "Freeze FY: names the year and its dates, lists what is locked and who can reopen it; type the FY label to enable Freeze", "Freeze FY");
  await dlg().getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Reopen" }).first().dispatchEvent("click");
  await shot(page, `${tag}-after-06-period-reopen`, "Reopen a closed period: names the period; the reason is required and kept permanently", "Reopen 2023-04-01 to 2024-03-31?");
  await dlg().getByRole("button", { name: "Reopen period" }).click();
  await shot(page, `${tag}-after-07-period-reopen-error`, "Reopen: an empty reason is explained inline; nothing sent", "Give the reason for reopening");
  await page.keyboard.press("Escape");
}

(async () => {
  const browser = await chromium.launch();
  // ONLY=iphone,ipad re-runs some viewports; their index is written separately so earlier runs are kept.
  const only = (process.env.ONLY || "").split(",").filter(Boolean);
  for (const [device, tag] of VIEWPORTS.filter(([, t]) => !only.length || only.includes(t))) {
    const state = { data: seed(), revision: 5, saves: [], writes: [], tables: JSON.parse(JSON.stringify(TABLES)) };
    const ctx = await context(browser, device, state);
    const page = await ctx.newPage();
    try {
      if (PHASE === "before") await before(page, tag); else await after(page, tag);
    } catch (e) { console.log(`  ${tag} stopped:`, e.message.split("\n")[0]); await page.screenshot({ path: `${OUT}/${tag}-${PHASE}-error.png` }).catch(() => {}); }
    console.log(`${tag} table writes:`, JSON.stringify(state.writes), "preference saves:", state.saves.length);
    PROMPTS.push({ tag, tableWrites: state.writes, preferenceSaves: state.saves.length });
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(`${OUT}/index-${PHASE}${only.length ? `-${only.join("-")}` : ""}.json`, JSON.stringify({ shots: SHOTS, browserPrompts: PROMPTS }, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
