// Device-emulated screenshots of Phase 1 security flows. Every Supabase call is answered locally;
// the app's Supabase URL points at a non-existent host, so nothing can reach hosted services.
const { chromium, devices } = require("playwright");
const OUT = process.env.OUT || "/tmp/thapal-screens"; require("fs").mkdirSync(OUT, { recursive: true });
const BASE = "http://127.0.0.1:8080";
const OWNER = "11111111-1111-4111-8111-111111111111";
const b64 = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
const token = (sid) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: OWNER, exp: Math.floor(Date.now() / 1000) + 3600, aud: "authenticated", role: "authenticated", session_id: sid })}.fixture`;
const user = (kind) => ({
  id: OWNER, aud: "authenticated", role: "authenticated", email: "kk@example.invalid",
  email_confirmed_at: "2026-01-01T00:00:00Z", last_sign_in_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
  app_metadata: { provider: kind, providers: [kind] }, user_metadata: { full_name: "KK" },
  identities: [{ id: "i1", user_id: OWNER, provider: kind, identity_data: { email: "kk@example.invalid" } }],
  is_anonymous: false, created_at: "2026-01-01T00:00:00Z",
});
const SHOTS = [];

async function context(browser, device, kind, opts = {}) {
  const ctx = await browser.newContext({ ...devices[device] });
  const u = user(kind);
  await ctx.route("https://fixture.supabase.invalid/**", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    if (p.startsWith("/auth/v1/user")) return route.fulfill({ json: u });
    if (p.startsWith("/auth/v1/token")) return route.fulfill({ json: { access_token: token("22222222-2222-4222-8222-222222222222"), refresh_token: "fixture", expires_in: 3600, token_type: "bearer", user: u } });
    if (p.startsWith("/auth/v1/")) return route.fulfill({ status: 200, json: {} });
    if (p.startsWith("/rest/v1/device_passkeys")) return route.fulfill({ json: [{ credential_id: "cred-iphone", created_at: "2026-10-02T09:00:00Z", transports: ["internal"], last_used_at: "2026-11-08T08:30:00Z" }, { credential_id: "cred-ipad", created_at: "2026-10-20T09:00:00Z", transports: ["hybrid"] }] });
    if (p.startsWith("/rest/v1/rpc/")) return route.fulfill({ status: 200, json: null });
    if (p.startsWith("/storage/")) return route.fulfill({ json: [] });
    return route.fulfill({ json: [] });
  });
  await ctx.addInitScript(([owner, sess, opts]) => {
    try {
      localStorage.setItem("sb-fixture-auth-token", JSON.stringify(sess));
      localStorage.setItem(`ll-face-offer-${owner}`, "later");
      if (opts.oldActivity) localStorage.setItem(`ll-activity-${owner}`, String(Date.now() - 6 * 3600_000));
      else localStorage.setItem(`ll-activity-${owner}`, String(Date.now()));
    } catch { /* storage blocked */ }
  }, [OWNER, { access_token: token("22222222-2222-4222-8222-222222222222"), refresh_token: "fixture", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: u }, opts]);
  return ctx;
}

async function settle(page, text) {
  try { await page.waitForLoadState("networkidle", { timeout: 15000 }); } catch {}
  if (text) { try { await page.getByText(text).first().waitFor({ timeout: 20000 }); } catch { console.log("  (text not found:", String(text), ")"); } }
}
async function shot(page, name, note, text) {
  await settle(page, text);
  await page.waitForTimeout(1500);
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  SHOTS.push({ name, note });
  console.log("shot", name);
}


const ROUTES = process.argv.slice(2).length ? process.argv.slice(2) : ["account-reconciliation","allocation","assets","assistant","assistants","audit","brief","budgets","claim-submission","company-spending","connections","dashboard","drafts","entities","expenditure-statement","expenses","family","forecast","gst-check","historical-import","inbox","new","offline-receipts","patterns","payment-methods","plan","receivables","records-check","reimbursement-settings","report-centre","report-status","reports","review","rules","search","settings","shared","spaces","start","statement-accounts","statements","strategy","sync-queue","tax","transaction-review","transfers","travel-inbox","trips","upload-requests","vault","wealth"];
const SIZES = [["iPhone 15","iphone"],["iPad Pro 11","ipad"],["Desktop Chrome","desktop"]];
(async () => {
  const fs = require("fs"); const OUTR = OUT + "/routes"; fs.mkdirSync(OUTR, { recursive: true });
  const browser = await chromium.launch();
  const result = [];
  for (const [device, tag] of SIZES) {
    const ctx = await context(browser, device, "email");
    for (const r of ROUTES) {
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
      let status = "ok";
      try {
        await page.goto(`${BASE}/${r}`, { timeout: 45000 });
        try { await page.waitForLoadState("networkidle", { timeout: 12000 }); } catch {}
        await page.waitForTimeout(1200);
        const url = new URL(page.url()).pathname;
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        const text = (await page.evaluate(() => document.body.innerText || "")).trim();
        await page.screenshot({ path: `${OUTR}/${tag}-${r}.png` });
        result.push({ device: tag, route: r, landed: url, horizontalOverflow: overflow, textChars: text.length, errors });
      } catch (e) { status = "failed"; result.push({ device: tag, route: r, failed: String(e).slice(0, 200) }); }
      await page.close();
      console.log(tag, r, status);
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(`${OUTR}/sweep.json`, JSON.stringify(result, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
