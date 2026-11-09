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

(async () => {
  const browser = await chromium.launch();
  for (const [device, tag] of [["iPhone 15", "iphone"], ["iPad Pro 11", "ipad"]]) {
    // 1. Sign-in screen and guest-idle notice (signed out)
    {
      const ctx = await browser.newContext({ ...devices[device] });
      await ctx.route("https://fixture.supabase.invalid/**", (r) => r.fulfill({ status: 401, json: { message: "No session" } }));
      const page = await ctx.newPage();
      await page.goto(`${BASE}/auth`); await shot(page, `${tag}-01-sign-in`, "Sign-in screen");
      await page.goto(`${BASE}/auth?ended=guest-idle`); await shot(page, `${tag}-02-guest-session-ended`, "Guest session ended after inactivity");
      await ctx.close();
    }
    // 2. Password account: Home, then fresh start after a long absence -> lock screen
    {
      const ctx = await context(browser, device, "email");
      const page = await ctx.newPage();
      await page.goto(`${BASE}/dashboard`); await shot(page, `${tag}-03-home-signed-in`, "Home after sign-in", /Today|Good|Home|money|₹/i);
      await page.goto(`${BASE}/settings`);
      await settle(page, "Security & device unlock");
      try { await page.getByText("Security & device unlock").first().click(); } catch { console.log("  (no security fold)"); }
      await settle(page, "Face ID and passkeys on this account");
      const sec = page.getByText("Face ID and passkeys on this account");
      if (await sec.count()) { await sec.first().scrollIntoViewIfNeeded(); await shot(page, `${tag}-04-settings-security`, "Settings > Security: passkeys, sign out other devices, recovery"); }
      else await shot(page, `${tag}-04-settings`, "Settings (security section not found on first screen)");
      const remove = page.getByRole("button", { name: /Remove passkey/ }).first();
      if (await remove.count()) {
        await remove.click(); await shot(page, `${tag}-05-remove-passkey-confirm`, "Remove passkey: confirmation");
        const ok = page.getByRole("button", { name: "Remove", exact: true }).last();
        if (await ok.count()) { await ok.click(); await shot(page, `${tag}-06-step-up-dialog`, "Re-confirmation (step-up) before removing a passkey: Face ID / passkey or password, never PIN"); }
      }
      await ctx.close();
    }
    {
      const ctx = await context(browser, device, "email", { oldActivity: true });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/dashboard`); await shot(page, `${tag}-07-locked-after-absence-password`, "Fresh start after 6 h away: locked (password account)", "Thapal is locked");
      await ctx.close();
    }
    // 3. Google-only account: lock screen offers the emailed code, no password
    {
      const ctx = await context(browser, device, "google", { oldActivity: true });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/dashboard`); await shot(page, `${tag}-08-locked-google-only`, "Google-only account locked: emailed code, no password field", "Thapal is locked");
      const code = page.getByRole("button", { name: /code/i }).first();
      if (await code.count()) { await code.click(); await shot(page, `${tag}-09-google-only-code-sent`, "Code requested: enter the 6-digit code"); }
      await ctx.close();
    }
  }
  await browser.close();
  require("fs").writeFileSync(`${OUT}/index.json`, JSON.stringify(SHOTS, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
