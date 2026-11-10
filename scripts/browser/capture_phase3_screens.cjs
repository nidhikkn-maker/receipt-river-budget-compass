// Device-emulated screenshots of the Phase 3 changes (Statement Desk C11 row approval; reversal of a posted
// entry). Every Supabase call is answered locally; the app's Supabase URL points at a non-existent host,
// so nothing can reach hosted services. Usage (server started from the Phase 3 worktree on port 8082):
//   NODE_PATH=$(npm root -g) OUT=/tmp/p3 PHASE=before|after POSTING=on|off node scripts/browser/capture_phase3_screens.cjs
const { chromium, devices } = require("playwright");
const OUT = process.env.OUT || "/tmp/thapal-p3-screens"; require("fs").mkdirSync(OUT, { recursive: true });
const PHASE = process.env.PHASE || "after";
const POSTING = process.env.POSTING === "on"; // P7 installed + owner active (posting_status answers)
const BASE = "http://127.0.0.1:8082";
const OWNER = "11111111-1111-4111-8111-111111111111";
const ACC = "aaaaaaaa-1111-4111-8111-000000000001";
const b64 = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
const token = () => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: OWNER, exp: Math.floor(Date.now() / 1000) + 3600, aud: "authenticated", role: "authenticated", session_id: "22222222-2222-4222-8222-222222222222" })}.fixture`;
const user = { id: OWNER, aud: "authenticated", role: "authenticated", email: "kk@example.invalid", email_confirmed_at: "2026-01-01T00:00:00Z",
  last_sign_in_at: new Date().toISOString(), app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { full_name: "KK" }, is_anonymous: false, created_at: "2026-01-01T00:00:00Z" };
const account = { id: ACC, owner_id: OWNER, name: "HDFC savings", kind: "savings", opening_balance: 26800, archived: false, created_at: "2026-01-01T00:00:00Z", credit_limit: null, due_day: null,
  min_balance: 0, issuer: "HDFC Bank", last_four: "4321", statement_day: null, interest_rate: null, include_in_cash: true, details: {} };
const entry = { id: "eeeeeeee-1111-4111-8111-000000000001", employee_id: OWNER, department: null, title: "Dinner at Toit", merchant: "Toit", category: "Dining", amount: 1800, expense_date: "2026-10-28",
  description: "", receipts: [{ name: "toit.jpg", type: "image/jpeg", path: `${OWNER}/receipts/toit.jpg` }], status: "approved", created_at: "2026-11-02T20:00:00Z", currency: "INR", original_amount: 1800,
  fx_rate: 1, fx_date: "2026-10-28", payment_method: "upi", reconciled_at: null, reconciled_by: null, statement_ref: null, scope: "personal", member_id: null, updated_at: "2026-11-02T20:00:00Z",
  splits: [], txn_type: "expense", account_id: ACC, to_account_id: null, tags: [], receipt_details: {}, reimbursement_status: "none", adjustment_sign: 1, allocations: [], reimbursement: {},
  category_revision: 0, payment_instrument_id: null, workspace_allocations: [], trip_id: null, principal: null, interest: null, correction_revision: 0, payee_id: null, transfer_counterpart_of: null,
  entity_id: null, entity_source: "account" };
const CSV = [
  "Date,Narration,Debit,Credit,Balance",
  "01/11/2026,Opening balance,,,25000.00",
  "02/11/2026,UPI-SWIGGY-ORDER 8812,450.00,,24550.00",
  "03/11/2026,SALARY NOV ACME LTD,,85000.00,109550.00",
  "04/11/2026,UPI-UBER INDIA TRIP,312.40,,109237.60",
  "05/11/2026,ATM WDL MG ROAD,2000.00,,107237.60",
  "06/11/2026,NEFT-LANDLORD RENT NOV,30000.00,,77237.60",
].join("\n");
const SHOTS = [];

async function context(browser, device) {
  const ctx = await browser.newContext({ ...devices[device] });
  await ctx.route("https://fixture.supabase.invalid/**", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    if (p.startsWith("/auth/v1/user")) return route.fulfill({ json: user });
    if (p.startsWith("/auth/v1/token")) return route.fulfill({ json: { access_token: token(), refresh_token: "fixture", expires_in: 3600, token_type: "bearer", user } });
    if (p.startsWith("/auth/v1/")) return route.fulfill({ status: 200, json: {} });
    if (p === "/rest/v1/rpc/posting_status") {
      if (!POSTING) return route.fulfill({ status: 404, json: { code: "PGRST202", message: "Could not find the function public.posting_status" } });
      return route.fulfill({ json: { installed: true, version: "P7", active: true, guest: false, canPost: true } });
    }
    if (p.startsWith("/rest/v1/rpc/")) return route.fulfill({ status: 200, json: null });
    if (p.startsWith("/rest/v1/accounts")) return route.fulfill({ json: [account] });
    if (p.startsWith("/rest/v1/expenses")) return route.fulfill({ json: [entry] });
    if (p.startsWith("/rest/v1/finance_preferences")) return route.fulfill({ json: [{ owner_id: OWNER, data: {}, revision: 1, updated_at: "2026-11-01T00:00:00Z" }] });
    if (p.startsWith("/storage/")) return route.fulfill({ json: [] });
    return route.fulfill({ json: [] });
  });
  await ctx.addInitScript(([owner, sess]) => {
    try {
      localStorage.setItem("sb-fixture-auth-token", JSON.stringify(sess));
      localStorage.setItem(`ll-face-offer-${owner}`, "later");
      localStorage.setItem(`ll-activity-${owner}`, String(Date.now()));
    } catch { /* storage blocked */ }
  }, [OWNER, { access_token: token(), refresh_token: "fixture", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user }]);
  return ctx;
}
async function settle(page, text) {
  try { await page.waitForLoadState("networkidle", { timeout: 15000 }); } catch {}
  if (text) { try { await page.getByText(text).first().waitFor({ timeout: 20000 }); } catch { console.log("  (text not found:", String(text), ")"); } }
}
async function shot(page, name, note, text, locator) {
  await settle(page, text);
  if (locator) { try { await locator.first().scrollIntoViewIfNeeded({ timeout: 5000 }); } catch { console.log("  (no scroll target)"); } }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  SHOTS.push({ name, note });
  console.log("shot", name);
}

(async () => {
  const browser = await chromium.launch();
  for (const [device, tag] of [["iPhone 15", "iphone"], ["iPad Pro 11", "ipad"], ["Desktop Chrome", "desktop"]]) {
    const ctx = await context(browser, device);
    const page = await ctx.newPage();
    // 1. Statement Desk: upload a statement and look at the save area
    await page.goto(`${BASE}/statements`);
    await settle(page, /Statement/i);
    const input = page.locator('input[type="file"]').first();
    if (await input.count()) {
      await input.setInputFiles({ name: "HDFC-4321-nov.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
      await settle(page, /Intelligent Canvas|Needs your decision|Saved automatically|Suggested/);
      const pick = page.getByRole("combobox").first();
      void pick;
      await shot(page, `${PHASE}-${tag}-01-statement-plan`, "Statement Desk plan after reading the file", /Intelligent Canvas/, page.getByText(/Saved automatically|Suggested/));
      await shot(page, `${PHASE}-${tag}-02-statement-save-button`, "Save area: the button that commits the rows", null, page.getByRole("button", { name: /Apply everything|Save \d+ approved|Approve rows/ }));
      const firstBox = page.getByRole("checkbox").first();
      if (PHASE === "after" && await firstBox.count()) {
        await firstBox.click();
        await shot(page, `${PHASE}-${tag}-03-statement-one-approved`, "One row approved: the button saves exactly the approved rows", null, page.getByRole("button", { name: /Save \d+ approved|Approve rows/ }));
      }
    } else console.log("  (no file input on /statements)");
    // 2. Entry detail: delete (today) vs reverse (posted entry, P7 active)
    await page.goto(`${BASE}/vault`);
    await settle(page, /Dinner at Toit|documents/);
    const item = page.getByText("Dinner at Toit").first();
    if (await item.count()) {
      await item.click();
      await shot(page, `${PHASE}-${tag}-04-entry-detail`, POSTING ? "Entry detail with posting active: Reverse entry" : "Entry detail (no posting layer): Delete", /Dinner at Toit/, page.getByRole("button", { name: /Delete|Reverse/ }));
      const btn = page.getByRole("button", { name: /Reverse entry/ });
      if (POSTING && await btn.count()) { await btn.first().click(); await shot(page, `${PHASE}-${tag}-05-reverse-dialog`, "Reverse a posted entry: reason required, re-confirmation follows", /reason/i); }
    } else console.log("  (entry not listed in vault)");
    await ctx.close();
  }
  await browser.close();
  require("fs").writeFileSync(`${OUT}/index-${PHASE}${POSTING ? "-posting" : ""}.json`, JSON.stringify(SHOTS, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
