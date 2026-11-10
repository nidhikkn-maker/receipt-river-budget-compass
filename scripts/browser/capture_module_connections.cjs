// Track C evidence (C1 archive instead of delete; C2 new screens): device-emulated screenshots on fixture data.
// Every Supabase call is answered here; the app's Supabase URL points at a non-existent host
// (fixture.supabase.invalid), so nothing can reach hosted services. Saved preferences live in this script's memory.
//   PHASE=before|after|c2 OUT=<dir> BASE=http://127.0.0.1:8084 NODE_PATH=$(npm root -g) node scripts/browser/capture_module_connections.cjs
// PNGs are converted to JPEG at most 720 px wide with ImageMagick (convert).
const { chromium, devices } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs");
const PHASE = process.env.PHASE || "after";
const OUT = process.env.OUT || "/tmp/thapal-module-connections"; fs.mkdirSync(OUT, { recursive: true });
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
const DOC = "dddddddd-0000-4000-8000-000000000011", DOC2 = "dddddddd-0000-4000-8000-000000000012";
const seed = () => ({
  receivables: [
    { id: "aaaaaaaa-1000-4000-8000-000000000001", customer: "Sundaram Traders", invoiceNo: "TH-101", date: "2026-10-01", dueDate: "2026-10-31", amount: 59000, gst: 9000 },
    { id: "aaaaaaaa-1000-4000-8000-000000000002", customer: "Kaveri Foods", invoiceNo: "TH-104", date: "2026-10-20", dueDate: "2026-11-20", amount: 12000 },
  ],
  entities: [{ id: ENT, name: "Thapal Ventures Pvt Ltd", kind: "company", pan: "AAACT1234F", gstins: ["33AAACT1234F1Z5"], regNo: "U72900TN2021PTC000001", booksFrom: "2024-25", address: "Anna Salai, Chennai 600002" }],
  books: { entityAccounts: { [ENT]: [BANK] }, entityTaxProfiles: [{ id: "eeeeeeee-1000-4000-8000-000000000001", entityId: ENT, fy: "2025-26", bookProfit: 420000 }] },
  notifications: { enabled: true },
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
    if (req.method() === "DELETE" || req.method() === "PATCH" || req.method() === "POST") { state.writes.push(`${req.method()} ${table}`); }
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

async function before(page, tag) {
  await page.goto(`${BASE}/receivables`);
  await shot(page, `${tag}-before-01-receivables-one-tap-remove`, "Receivables: one-tap Remove beside each invoice (no confirmation, reason or record)", "Kaveri Foods");
  await page.getByRole("button", { name: "Remove" }).first().click(); await approve(page);
  await shot(page, `${tag}-before-02-receivables-after-remove`, "After one tap: Kaveri Foods invoice is gone from storage; no archive, no history", "Customers owing");
  await page.goto(`${BASE}/entities`);
  await shot(page, `${tag}-before-03-entities-delete`, "Companies & years: Delete beside Edit", "Thapal Ventures Pvt Ltd");
  await page.getByRole("button", { name: "Delete", exact: true }).first().click();
  await shot(page, `${tag}-before-04-entities-generic-confirm`, "Generic 'Delete this profile?' — no reason; profile, tax years and account links are dropped", "Delete this profile?");
  await page.goto(`${BASE}/vault`);
  await shot(page, `${tag}-before-05-vault-delete-icon`, "DocuRepo: bin icon deletes the document row and its file", "LIC policy 2026", page.getByRole("button", { name: /Delete document LIC/ }));
  await page.getByRole("button", { name: /Delete document LIC/ }).click();
  await shot(page, `${tag}-before-06-vault-generic-confirm`, "Generic 'Delete … and its file?' confirmation, no reason", "and its file?");
  await page.goto(`${BASE}/plan`);
  const del = page.getByRole("button", { name: "Delete Flat rent" });
  await shot(page, `${tag}-before-07-plan-delete-icon`, "Plan: bin icon on a scheduled payment hard-deletes it in one tap", "Recurring & subscriptions", del);
}

async function after(page, tag) {
  await page.goto(`${BASE}/receivables`);
  await shot(page, `${tag}-after-01-receivables-archive`, "Receivables: Archive instead of Remove; totals include archived", "Kaveri Foods");
  await page.getByRole("button", { name: /^Archive/ }).first().click();
  await shot(page, `${tag}-after-02-receivables-archive-confirm`, "Archive confirmation with a required reason", "Archive this invoice?");
  await page.getByLabel("Reason").fill("Raised in error; replaced by TH-105");
  await page.getByRole("button", { name: "Archive invoice" }).click(); await approve(page);
  await page.getByText(/^Archived invoices/).first().click().catch(() => {});
  await shot(page, `${tag}-after-03-receivables-archived-view`, "Archived invoices: who, when, why, history and Restore; figures unchanged", "Archived by you", page.getByText("Archived by you").first());
  await page.goto(`${BASE}/entities`);
  await shot(page, `${tag}-after-04-entities-archive`, "Companies & years: Archive replaces Delete; tax years and links are kept", "Thapal Ventures Pvt Ltd");
  await page.getByRole("button", { name: "Archive", exact: true }).first().click();
  await shot(page, `${tag}-after-05-entities-archive-confirm`, "Archive profile confirmation with a required reason", "Archive this profile?");
  await page.getByLabel("Reason").fill("Company struck off; kept for records");
  await page.getByRole("button", { name: "Archive profile" }).click(); await approve(page);
  await page.getByText(/^Archived profiles/).first().click().catch(() => {});
  await shot(page, `${tag}-after-06-entities-archived-view`, "Archived profiles with tax years kept and Restore", "Archived by you", page.getByText("Archived by you").first());
  await page.goto(`${BASE}/vault`);
  await shot(page, `${tag}-after-07-vault-archive`, "DocuRepo: Archive instead of the bin icon; file and links are kept", "LIC policy 2026", page.getByRole("button", { name: /Archive document LIC/ }));
  await page.getByRole("button", { name: /Archive document LIC/ }).click();
  await shot(page, `${tag}-after-08-vault-archive-confirm`, "Archive document confirmation with a required reason", "Archive this document?");
  await page.getByLabel("Reason").fill("Policy surrendered; kept as evidence");
  await page.getByRole("button", { name: "Archive document" }).click(); await approve(page);
  await page.getByText(/^Archived documents/).first().click().catch(() => {});
  await shot(page, `${tag}-after-09-vault-archived-view`, "Archived documents with who/when/why and Restore", "Archived by you", page.getByText("Archived by you").first());
  await page.goto(`${BASE}/plan`);
  await shot(page, `${tag}-after-10-plan-archive`, "Plan: Archive on a cancelled payment only; an active one shows Cancel first", "Recurring & subscriptions", page.getByRole("button", { name: /Archive LIC premium/ }));
  await page.getByRole("button", { name: /Archive LIC premium/ }).click();
  await page.getByLabel("Reason").fill("Policy surrendered in October");
  await shot(page, `${tag}-after-11-plan-archive-confirm`, "Archive scheduled payment confirmation", "Archive this scheduled payment?");
  await page.getByRole("button", { name: "Archive scheduled payment" }).click(); await approve(page);
  await page.getByText(/^Archived scheduled payments/).first().click().catch(() => {});
  await shot(page, `${tag}-after-12-plan-archived-view`, "Archived scheduled payments with Restore", "Archived by you", page.getByText("Archived by you").first());
}

async function c2(page, tag) {
  await page.goto(`${BASE}/about`);
  await shot(page, `${tag}-c2-01-about`, "K10 Settings → About: version, build, environment, service health, known limitations", "About Thapal");
  await page.goto(`${BASE}/notifications`);
  await shot(page, `${tag}-c2-02-notifications`, "B05 Notification centre: grouped alerts from real sources, read/unread, mark all read", "Notifications");
  await page.goto(`${BASE}/calendar-item?id=commitment:cccc0000-0000-4000-8000-000000000001`);
  await shot(page, `${tag}-c2-03-calendar-item`, "B04 Calendar item detail: owner, source link, reminder schedule, recurrence, snooze", "Flat rent");
  await page.goto(`${BASE}/bank-account/${BANK}`);
  await shot(page, `${tag}-c2-04-bank-account`, "C03 Bank account detail (read-only): masked number, institution, owner entity, freshness, running balance", "HDFC current");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot(page, `${tag}-c2-05-bank-account-transactions`, "C03 recent transactions with running balance and reconciliation status", "Recent transactions");
}

(async () => {
  const browser = await chromium.launch();
  for (const [device, tag] of VIEWPORTS) {
    const state = { data: seed(), revision: 5, saves: [], writes: [], tables: JSON.parse(JSON.stringify(TABLES)) };
    const ctx = await context(browser, device, state);
    const page = await ctx.newPage();
    try {
      if (PHASE === "before") await before(page, tag); else if (PHASE === "after") await after(page, tag); else await c2(page, tag);
    } catch (e) { console.log(`  ${tag} stopped:`, e.message.split("\n")[0]); await page.screenshot({ path: `${OUT}/${tag}-${PHASE}-error.png` }).catch(() => {}); }
    console.log(`${tag} table writes:`, JSON.stringify(state.writes));
    if (PHASE === "after") console.log(`${tag} stored receivables:`, JSON.stringify(state.data.receivables));
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(`${OUT}/index-${PHASE}.json`, JSON.stringify({ shots: SHOTS }, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
