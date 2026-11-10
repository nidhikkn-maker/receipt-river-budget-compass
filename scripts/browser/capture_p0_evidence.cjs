// P0 financial-integrity evidence captures (P0-002, P0-003, P0-004, P0-017+). Fixture data only:
// the app's Supabase URL is a non-existent host and every request to it is answered here, so nothing
// reaches hosted services. Run against the isolated dev server on 8081:
//   PHASE=before|after OUT=/tmp/p0-shots NODE_PATH=$(npm root -g) node scripts/browser/capture_p0_evidence.cjs
// The statement Undo server function is replaced in the browser by a module that answers exactly as the
// production server does when the database lacks statement_undo_receipts / undo_statement_rows
// (src/lib/statement-pipeline/atomic-undo.functions.ts), because the dev server cannot reach a database.
const { chromium, devices } = require("playwright");
const fs = require("fs");
const PHASE = process.env.PHASE || "before";
const OUT = process.env.OUT || "/tmp/p0-shots"; fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || "http://127.0.0.1:8081";
const OWNER = "11111111-1111-4111-8111-111111111111";
const BANK = "22222222-2222-4222-8222-222222222201";
const TX = "33333333-3333-4333-8333-333333333301";
const b64 = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
const token = () => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: OWNER, exp: Math.floor(Date.now() / 1000) + 3600, aud: "authenticated", role: "authenticated", session_id: "s1" })}.fixture`;
const user = { id: OWNER, aud: "authenticated", role: "authenticated", email: "kk@example.invalid", email_confirmed_at: "2026-01-01T00:00:00Z", last_sign_in_at: new Date().toISOString(), app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { full_name: "KK" }, identities: [], is_anonymous: false, created_at: "2026-01-01T00:00:00Z" };
const SHOTS = [];
const pgError = { code: "PGRST000", message: "Could not connect to the database (fixture outage)", details: null, hint: null };

const account = { id: BANK, owner_id: OWNER, name: "HDFC savings", kind: "savings", opening_balance: 25000, archived: false, credit_limit: null, due_day: null, min_balance: 0, issuer: "HDFC", last_four: "1234", statement_day: null, interest_rate: null, include_in_cash: true, details: {}, created_at: "2026-04-01T00:00:00Z" };
const expense = { id: TX, employee_id: OWNER, title: "Swiggy order", merchant: "Swiggy", category: "Food", scope: "personal", member_id: null, splits: [], amount: 640, original_amount: 640, currency: "INR", fx_rate: 1, payment_method: "upi", reconciled_at: "2026-11-02T10:00:00Z", statement_ref: "HDFC:2026-11-01:640", updated_at: "2026-11-02T10:00:00Z", created_at: "2026-11-02T10:00:00Z", expense_date: "2026-11-01", description: "", receipts: [], txn_type: "expense", account_id: BANK, to_account_id: null, payment_instrument_id: null, tags: [], workspace_allocations: [], receipt_details: null, reimbursement_status: "none", adjustment_sign: 1, allocations: [], reimbursement: {}, transfer_counterpart_of: null, trip_id: null, principal: null, interest: null, category_revision: 0, correction_revision: 1, department: null };
const upload = { id: "44444444-4444-4444-8444-444444444401", at: "2026-11-02T10:00:00Z", label: "HDFC statement Oct 2026.pdf", posted: [TX], reconciled: [], createdAccounts: [], status: "complete", evidence: [{ id: TX, ref: "HDFC:2026-11-01:640" }], undoRows: [{ id: TX, ref: "HDFC:2026-11-01:640", revision: 1 }] };
const corrections = [
  { id: "55555555-5555-4555-8555-555555555501", created_at: "2026-11-05T09:00:00Z", undone_at: null, request: { kind: "financial" }, entries: [{ before: { id: TX, title: "Swiggy order", txn_type: "transfer" }, after: { txn_type: "expense" } }] },
  { id: "55555555-5555-4555-8555-555555555502", created_at: "2026-11-03T09:00:00Z", undone_at: "2026-11-04T09:00:00Z", request: { kind: "financial" }, entries: [{ before: { id: TX, title: "Swiggy order", txn_type: "income" }, after: { txn_type: "expense" } }] },
];

/** opts.fail: table names whose REST reads fail like a database outage. */
async function context(browser, device, opts = {}) {
  const ctx = await browser.newContext({ ...devices[device] });
  const prefs = { categories: [{ name: "Food", archived: false }, { name: "Other", archived: false }], statementUploads: opts.uploads ? [upload] : [] };
  await ctx.route("https://fixture.supabase.invalid/**", async (route) => {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname;
    const one = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
    const reply = (rows) => route.fulfill({ json: one ? (rows[0] ?? null) : rows });
    if (p.startsWith("/auth/v1/user")) return route.fulfill({ json: user });
    if (p.startsWith("/auth/v1/token")) return route.fulfill({ json: { access_token: token(), refresh_token: "fixture", expires_in: 3600, token_type: "bearer", user } });
    if (p.startsWith("/auth/v1/")) return route.fulfill({ json: {} });
    const table = p.replace("/rest/v1/", "");
    if (req.method() === "GET" && (opts.fail || []).includes(table)) return route.fulfill({ status: 500, json: pgError }); // 500: postgrest-js retries 503s for a while before failing
    if (p.startsWith("/rest/v1/rpc/save_reviewed_preferences")) { const body = JSON.parse(req.postData() || "{}"); if (body._data) Object.assign(prefs, body._data); return route.fulfill({ json: 2 }); }
    if (p.startsWith("/rest/v1/rpc/")) return route.fulfill({ json: null });
    if (table === "finance_preferences") return reply([{ data: prefs, revision: 1 }]);
    if (table === "profiles") return reply([{ full_name: "KK" }]);
    if (table === "accounts") return reply([account]);
    if (table === "expenses") return reply(opts.noExpenses ? [] : [expense]);
    if (table === "financial_corrections") {
      // Honour the PostgREST filters the app sends so the screen shows what production would return.
      let rows = corrections;
      if (url.searchParams.get("undone_at") === "is.null") rows = rows.filter((r) => !r.undone_at);
      if (url.searchParams.get("request->>kind") === "eq.review_metadata") rows = rows.filter((r) => r.request.kind === "review_metadata");
      return reply(rows);
    }
    if (p.startsWith("/storage/")) return route.fulfill({ json: [] });
    return reply([]);
  });
  // Replace the statement Undo server function with the production server's answer for the current schema.
  await ctx.route(/\/src\/lib\/statement-pipeline\/atomic-undo\.functions\.ts/, (route) => route.fulfill({
    contentType: "application/javascript",
    body: `export const undoStatement = async () => { window.__undoCalls = (window.__undoCalls || 0) + 1; throw new Error('Safe Undo is awaiting database release approval. Your records and recovery history are unchanged.'); };
export const statementUndoCapability = async () => ({ state: 'needs-update' });`,
  }));
  await ctx.addInitScript(([owner, sess]) => {
    try {
      localStorage.setItem("sb-fixture-auth-token", JSON.stringify(sess));
      localStorage.setItem(`ll-face-offer-${owner}`, "later");
      localStorage.setItem(`ll-activity-${owner}`, String(Date.now()));
    } catch { /* storage blocked */ }
  }, [OWNER, { access_token: token(), refresh_token: "fixture", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user }]);
  return ctx;
}

async function shot(page, name, note, text, scroll) {
  try { await page.waitForLoadState("networkidle", { timeout: 15000 }); } catch {}
  if (text) { try { await page.getByText(text).first().waitFor({ timeout: 20000 }); } catch { console.log("  (text not found:", String(text), ")"); } }
  await page.waitForTimeout(1200);
  // Scroll last: the app restores scroll position after late renders.
  if (scroll) { try { await page.getByText(scroll).first().evaluate((el) => el.scrollIntoView({ block: "center" })); await page.waitForTimeout(400); } catch { console.log("  (no scroll target", String(scroll), ")"); } }
  const file = `${OUT}/${PHASE}-${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  SHOTS.push({ file: `${PHASE}-${name}`, note });
  console.log("shot", `${PHASE}-${name}`);
}
async function scrollTo(page, text) { try { const el = page.getByText(text).first(); await el.waitFor({ timeout: 20000 }); await el.scrollIntoViewIfNeeded(); } catch { console.log("  (no scroll target", String(text), ")"); } }

(async () => {
  const browser = await chromium.launch();
  for (const [device, tag] of [["iPhone 15", "iphone"], ["iPad Pro 11", "ipad"]]) {
    { // P0-002 Statement Desk Undo
      const ctx = await context(browser, device, { uploads: true }); const page = await ctx.newPage();
      await page.goto(`${BASE}/statements`);
      await scrollTo(page, /Recent uploads/); await page.waitForTimeout(1500); await scrollTo(page, /needs an approved database update|Recent uploads/);
      await shot(page, `${tag}-p0-002-statement-undo-offered`, "Statement Desk: Recent uploads with the Undo control", /Recent uploads/, /Recent uploads/);
      const undo = page.getByLabel("Recent uploads").getByRole("button", { name: "Undo", exact: true });
      if (await undo.count()) { await undo.click(); await page.waitForTimeout(800); await scrollTo(page, /Recent uploads/); await shot(page, `${tag}-p0-002-statement-undo-pressed`, "After pressing Undo", /awaiting database|Undo unfinished/, /Recent uploads/); }
      else console.log("  (no Undo button offered)");
      console.log("  undo server calls:", await page.evaluate(() => window.__undoCalls || 0));
      await ctx.close();
    }
    { // P0-003 Review History
      const ctx = await context(browser, device); const page = await ctx.newPage();
      await page.goto(`${BASE}/inbox?section=history`);
      await shot(page, `${tag}-p0-003-review-history`, "Review History: one active and one restored account/type correction exist", /Review History/);
      await ctx.close();
    }
    { // P0-004 Demat holdings load failure
      const ctx = await context(browser, device, { fail: ["demat_accounts", "security_holdings"] }); const page = await ctx.newPage();
      await page.goto(`${BASE}/wealth`); await scrollTo(page, /Demat holdings/);
      await shot(page, `${tag}-p0-004-demat-load-failed`, "Wealth: demat holdings query fails", /Demat holdings/, /Demat holdings/);
      await ctx.close();
    }
    { // P0-004 Report Centre history load failure
      const ctx = await context(browser, device, { fail: ["report_history"] }); const page = await ctx.newPage();
      await page.goto(`${BASE}/report-centre`); await scrollTo(page, /Report history/);
      await shot(page, `${tag}-p0-004-report-history-load-failed`, "Report Centre: report_history query fails", /Report history/, /Report history/);
      await ctx.close();
    }
    { // P0-017 store-level: the ledger query fails on open
      const ctx = await context(browser, device, { fail: ["expenses"] }); const page = await ctx.newPage();
      await page.goto(`${BASE}/expenses`); await scrollTo(page, /No expenses match|load your transactions/);
      await shot(page, `${tag}-p0-007-transactions-load-failed`, "Transactions: the expenses (ledger) query fails on open", /No expenses match|load your transactions/);
      await page.goto(`${BASE}/dashboard`);
      await shot(page, `${tag}-p0-007-home-load-failed`, "Home: the expenses (ledger) query fails on open", /Nothing spent|load your transactions/);
      await ctx.close();
    }
  }
  await browser.close();
  fs.writeFileSync(`${OUT}/${PHASE}-index.json`, JSON.stringify(SHOTS, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
