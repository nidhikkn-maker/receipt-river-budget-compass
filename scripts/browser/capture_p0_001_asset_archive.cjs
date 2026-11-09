// P0-001 evidence: device-emulated screenshots of asset Delete (before) and Archive/restore (after).
// Every Supabase call is answered locally; the app's Supabase URL points at a non-existent host
// (fixture.supabase.invalid), so nothing can reach hosted services. Saved preferences are kept in this
// script's memory only.
//   PHASE=before|after OUT=<dir> NODE_PATH=$(npm root -g) node scripts/browser/capture_p0_001_asset_archive.cjs
const { chromium, devices } = require("playwright");
const PHASE = process.env.PHASE || "after";
const OUT = process.env.OUT || "/tmp/thapal-p0-001"; require("fs").mkdirSync(OUT, { recursive: true });
const BASE = "http://127.0.0.1:8080";
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
const LAPTOP = "aaaaaaaa-0000-4000-8000-000000000001", FLAT = "aaaaaaaa-0000-4000-8000-000000000002";
const DOC_INV = "dddddddd-0000-4000-8000-000000000001", DOC_DEED = "dddddddd-0000-4000-8000-000000000002";
const seed = () => ({
  assets: [
    { id: LAPTOP, name: "MacBook Pro (office)", kind: "computer", cost: 185000, inUse: "2025-05-12", purchaseDate: "2025-05-10", sharePct: 100, bookMethod: "wdv", bookRatePct: 40, docId: DOC_INV, tag: "TH-CMP-014", location: "Chennai office", custodian: "KK", lastVerified: "2026-10-01", condition: "ok", supplier: "Croma, T Nagar" },
    { id: FLAT, name: "Anna Nagar flat", kind: "property", cost: 8500000, inUse: "2019-03-01", sharePct: 50, bookMethod: "slm", bookRatePct: 0, docId: DOC_DEED },
  ],
  books: {
    properties: [{ id: "bbbbbbbb-0000-4000-8000-000000000001", name: "Anna Nagar flat", address: "2nd Avenue, Anna Nagar, Chennai", assetId: FLAT, buildings: [], docIds: [DOC_DEED] }],
    holdings: [{ id: "cccccccc-0000-4000-8000-000000000001", kind: "physical_gold", name: "Gold coins (family locker)", quantity: 1, grams: 40, karat: 24, sharePct: 100, costBasis: 210000, source: "entered by you" }],
    goldRate: { perGram24k: 7600, date: "2026-11-08", source: "entered by you" },
  },
});
const docs = [
  { id: DOC_INV, owner_id: OWNER, title: "Croma invoice — MacBook Pro", doc_type: "invoice", file_path: `${OWNER}/inv.pdf`, file_name: "croma-invoice.pdf", mime_type: "application/pdf", size_bytes: 120000, doc_date: "2025-05-10", amount: 185000, currency: "INR", created_at: "2025-05-11T10:00:00Z", fields: [] },
  { id: DOC_DEED, owner_id: OWNER, title: "Sale deed — Anna Nagar flat", doc_type: "property_deed", file_path: `${OWNER}/deed.pdf`, file_name: "sale-deed.pdf", mime_type: "application/pdf", size_bytes: 900000, doc_date: "2019-02-20", amount: 8500000, currency: "INR", created_at: "2019-03-01T10:00:00Z", fields: [] },
];
const SHOTS = [];

async function context(browser, device, state) {
  const ctx = await browser.newContext({ ...devices[device] });
  await ctx.route("https://fixture.supabase.invalid/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    if (p.startsWith("/auth/v1/user")) return route.fulfill({ json: user });
    if (p.startsWith("/auth/v1/token")) return route.fulfill({ json: { access_token: token("22222222-2222-4222-8222-222222222222"), refresh_token: "fixture", expires_in: 3600, token_type: "bearer", user } });
    if (p.startsWith("/auth/v1/")) return route.fulfill({ status: 200, json: {} });
    if (p.startsWith("/rest/v1/finance_preferences")) {
      const row = { data: state.data, revision: state.revision };
      const single = /vnd\.pgrst\.object/.test(req.headers()["accept"] || "");
      return route.fulfill({ json: single ? row : [row] });
    }
    if (p.startsWith("/rest/v1/rpc/save_reviewed_preferences")) {
      const body = JSON.parse(req.postData() || "{}");
      state.data = body._data; state.revision += 1; state.saves.push(body._data);
      return route.fulfill({ json: state.revision });
    }
    if (p.startsWith("/rest/v1/documents")) return route.fulfill({ json: docs });
    if (p.startsWith("/rest/v1/profiles")) return route.fulfill({ json: /vnd\.pgrst\.object/.test(req.headers()["accept"] || "") ? { full_name: "KK" } : [{ full_name: "KK" }] });
    if (p.startsWith("/rest/v1/rpc/")) return route.fulfill({ status: 200, json: null });
    if (p.startsWith("/storage/")) return route.fulfill({ json: [] });
    return route.fulfill({ json: [] });
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
async function shot(page, name, note, text) {
  await settle(page, text);
  await page.waitForTimeout(1200);
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  SHOTS.push({ name, note });
  console.log("shot", name);
}
async function netWorth(page) {
  await page.goto(`${BASE}/wealth`); await settle(page, "My total financial position");
  const t = await page.getByText(/My total financial position/).first().locator("xpath=..").innerText().catch(() => "");
  return t.replace(/\s+/g, " ").trim();
}
const approve = async (page) => { const b = page.getByRole("button", { name: /Approve & save/ }); await b.waitFor({ timeout: 10000 }); return b; };

(async () => {
  const browser = await chromium.launch();
  const figures = {};
  for (const [device, tag] of [["iPhone 15", "iphone"], ["iPad Pro 11", "ipad"]]) {
    const state = { data: seed(), revision: 5, saves: [] };
    const ctx = await context(browser, device, state);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/assets`);
    await shot(page, `${tag}-${PHASE}-01-register`, "Property & assets register with the seeded laptop and flat", "MacBook Pro (office)");
    figures[`${tag}-start`] = await netWorth(page);
    await page.goto(`${BASE}/assets`); await settle(page, "MacBook Pro (office)");
    await page.getByRole("button", { name: "Edit", exact: true }).first().click();
    if (PHASE === "before") {
      const del = page.getByRole("button", { name: "Delete", exact: true });
      await del.scrollIntoViewIfNeeded();
      await shot(page, `${tag}-before-02-edit-one-tap-delete`, "Asset edit form: one-tap Delete next to Save (no reason, no record)");
      await del.click();
      await shot(page, `${tag}-before-03-generic-approval`, "Only a generic 'Approve financial changes: Assets' dialog — no reason, no warning that the record is removed", "Approve financial changes");
      await (await approve(page)).click();
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, `${tag}-before-04-asset-gone`, "After Delete: the laptop record, its document link and depreciation history are gone from the register", "Property & assets");
      figures[`${tag}-after-delete`] = await netWorth(page);
      await shot(page, `${tag}-before-05-net-worth-after-delete`, "Financial position after Delete: the laptop's book value has silently dropped out", "My total financial position");
      console.log("stored asset ids after delete:", (state.data.assets || []).map((a) => a.name));
    } else {
      const arch = page.getByRole("button", { name: "Archive", exact: true });
      await arch.scrollIntoViewIfNeeded();
      await shot(page, `${tag}-after-02-edit-no-delete`, "Asset edit form: no Delete; Archive instead (record kept)");
      await arch.click();
      await shot(page, `${tag}-after-03-archive-confirm-empty`, "Archive confirmation: reason required, Archive disabled until given", "Archive this asset?");
      await page.getByLabel("Reason").fill("Moved to company books; kept for records");
      await shot(page, `${tag}-after-04-archive-confirm-reason`, "Archive confirmation with reason entered");
      await page.getByRole("button", { name: "Archive asset" }).click();
      await (await approve(page)).click();
      await page.waitForTimeout(1500);
      await page.getByText(/^Archived assets/).first().click();
      const sec = page.getByText("Archived by you").first(); await sec.scrollIntoViewIfNeeded().catch(() => {});
      await shot(page, `${tag}-after-05-archived-view`, "Archived assets view: record, figures, who/when/why and Restore", "Archived by you");
      figures[`${tag}-after-archive`] = await netWorth(page);
      await shot(page, `${tag}-after-06-net-worth-after-archive`, "Financial position after archiving: unchanged", "My total financial position");
      await page.goto(`${BASE}/assets`); await settle(page, "Property & assets");
      await page.getByText(/^Archived assets/).first().click();
      await page.getByRole("button", { name: /^Restore/ }).first().click();
      await shot(page, `${tag}-after-07-restore-confirm`, "Restore confirmation: reason required", "Restore this asset?");
      await page.getByLabel("Reason").fill("Archived by mistake");
      await page.getByRole("button", { name: "Restore asset" }).click();
      await (await approve(page)).click();
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, `${tag}-after-08-register-after-restore`, "Register after restore: laptop back in the active list, history kept", "MacBook Pro (office)");
      figures[`${tag}-after-restore`] = await netWorth(page);
      await shot(page, `${tag}-after-09-net-worth-after-restore`, "Financial position after restore: unchanged", "My total financial position");
      const laptop = (state.data.assets || []).find((a) => a.id === LAPTOP);
      console.log("stored laptop after restore:", JSON.stringify(laptop));
    }
    await ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify(figures, null, 1));
  require("fs").writeFileSync(`${OUT}/index-${PHASE}.json`, JSON.stringify({ shots: SHOTS, figures }, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
