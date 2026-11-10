#!/usr/bin/env node
// Thapal local live preview with a FIXTURE backend (never the hosted Supabase project).
//
// One port serves everything:  http://localhost:${PREVIEW_PORT}
//   /__fixture-supabase/*  -> in-memory stand-in for Supabase auth, REST, RPC and storage (fixture data; writes kept
//                             in memory only and lost on restart; nothing is sent anywhere)
//   everything else        -> the app's own Vite dev server (hot reload / live updates pass through)
//
// Start:  node scripts/dev/local-preview.cjs        (starts Vite itself with the fixture environment)
// Sign in with any email and password: the fixture accepts them and signs you in as the fixture owner "KK".
// Signature Flow (proposed) preview: add ?uix=signature-flow to any URL; ?uix=classic returns to today's UI.
"use strict";
const http = require("http");
const net = require("net");
const { spawn } = require("child_process");
const path = require("path");

const PREVIEW_PORT = Number(process.env.PREVIEW_PORT || 8090);
const VITE_PORT = Number(process.env.VITE_PORT || 8091);
const PREFIX = "/__fixture-supabase";
const PUBLIC_URL = `http://localhost:${PREVIEW_PORT}${PREFIX}`;
const ROOT = path.resolve(__dirname, "..", "..");

// ---------------- fixture data (illustrative; nobody's real finances) ----------------
const OWNER = "11111111-1111-4111-8111-111111111111";
const b64 = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
const token = () => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: OWNER, exp: Math.floor(Date.now() / 1000) + 8 * 3600, aud: "authenticated", role: "authenticated", session_id: "22222222-2222-4222-8222-222222222222", email: "kk@example.invalid" })}.fixture`;
const user = { id: OWNER, aud: "authenticated", role: "authenticated", email: "kk@example.invalid", email_confirmed_at: "2026-01-01T00:00:00Z", last_sign_in_at: new Date().toISOString(), app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { full_name: "KK" }, identities: [{ id: "i1", user_id: OWNER, provider: "email", identity_data: { email: "kk@example.invalid" } }], is_anonymous: false, created_at: "2026-01-01T00:00:00Z" };
const id = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SAV = id(1), CUR = id(2), CASH = id(3), CARD = id(4), INV = id(5), CARD2 = id(6);
const acc = (x) => ({ owner_id: OWNER, archived: false, credit_limit: null, due_day: null, min_balance: 0, issuer: null, last_four: null, statement_day: null, interest_rate: null, include_in_cash: true, details: {}, created_at: "2026-04-01T00:00:00Z", ...x });
let n = 100;
const tx = (x) => ({ id: id(++n), employee_id: OWNER, department: null, merchant: null, category: "Food", scope: "personal", member_id: null, splits: [], currency: "INR", fx_rate: 1, original_amount: null, payment_method: "upi", reconciled_at: "2026-11-08T10:00:00Z", statement_ref: null, receipt_path: null, receipts: [], tags: [], txn_type: "expense", account_id: SAV, to_account_id: null, status: "approved", reimbursement_status: null, created_at: "2026-11-01T09:00:00Z", entity_source: "account", entity_id: null, allocations: null, receipt_details: {}, ...x });
const DB = {
  accounts: [
    acc({ id: SAV, name: "HDFC Savings", kind: "savings", opening_balance: 286400, issuer: "HDFC Bank", last_four: "4821" }),
    acc({ id: CUR, name: "ICICI Current", kind: "current", opening_balance: 142500, issuer: "ICICI Bank", last_four: "0937" }),
    acc({ id: CASH, name: "Cash wallet", kind: "cash", opening_balance: 6200 }),
    acc({ id: CARD, name: "HDFC Regalia card", kind: "credit_card", opening_balance: 41250, credit_limit: 500000, due_day: 7, statement_day: 18, issuer: "HDFC Bank", last_four: "7710", include_in_cash: false }),
    acc({ id: CARD2, name: "Amex Platinum Travel", kind: "credit_card", opening_balance: 0, credit_limit: 300000, due_day: 22, statement_day: 2, issuer: "American Express", last_four: "1006", include_in_cash: false }),
    acc({ id: INV, name: "Zerodha portfolio", kind: "investment", opening_balance: 0, include_in_cash: false }),
  ],
  expenses: [
    tx({ title: "Salary — November", merchant: "Thapal Ventures", category: "Salary", txn_type: "income", amount: 245000, expense_date: "2026-11-01", payment_method: "bank_transfer" }),
    tx({ title: "Taj Mahal Palace", merchant: "Taj Hotels", category: "Travel", amount: 38400, expense_date: "2026-11-08", payment_method: "credit_card", account_id: CARD, reimbursement_status: "pending", tags: ["Purpose: Reimbursable"] }),
    tx({ title: "Swiggy order", merchant: "Swiggy", category: "Food", amount: 742, expense_date: "2026-11-09" }),
    tx({ title: "Uber to airport", merchant: "Uber", category: "Transport", amount: 1180, expense_date: "2026-11-07", payment_method: "credit_card", account_id: CARD2 }),
    tx({ title: "BESCOM electricity", merchant: "BESCOM", category: "Utilities", amount: 4320, expense_date: "2026-11-05" }),
    tx({ title: "Amazon order", merchant: "Amazon", category: "Miscellaneous", amount: 2599, expense_date: "2026-11-06", payment_method: "credit_card", account_id: CARD, reconciled_at: null, statement_ref: "HDFC card:2026-11-06:2599" }),
    tx({ title: "HDFC Regalia payment", category: "Transfer", txn_type: "transfer", amount: 41250, expense_date: "2026-11-04", payment_method: "bank_transfer", account_id: SAV, to_account_id: CARD }),
    tx({ title: "Indian Oil", merchant: "Indian Oil", category: "Fuel", amount: 3500, expense_date: "2026-11-03", payment_method: "credit_card", account_id: CARD }),
    tx({ title: "Rent received — Indiranagar flat", merchant: "Tenant", category: "Rent", txn_type: "income", amount: 42000, expense_date: "2026-11-02", payment_method: "bank_transfer", account_id: CUR }),
  ],
  commitments: [
    { id: id(201), owner_id: OWNER, name: "LIC premium", kind: "bill", direction: "out", amount: 18650, frequency: "yearly", interval_days: null, next_due: "2026-11-15", account_id: SAV, category: "Insurance", confirmed: true, essential: true, status: "active" },
    { id: id(202), owner_id: OWNER, name: "ACT Fibernet", kind: "subscription", direction: "out", amount: 1179, frequency: "monthly", interval_days: null, next_due: "2026-11-12", account_id: CARD, category: "Utilities", confirmed: true, essential: true, status: "active" },
    { id: id(204), owner_id: OWNER, name: "SIP — Parag Parikh Flexi Cap", kind: "bill", direction: "out", amount: 25000, frequency: "monthly", interval_days: null, next_due: "2026-11-11", account_id: SAV, category: "Investments", confirmed: true, essential: false, status: "active" },
  ],
  asset_valuations: [{ id: id(301), owner_id: OWNER, account_id: INV, value: 1864300, valued_on: "2026-11-07", source: "Zerodha holdings statement", note: null }],
  documents: [],
  profiles: [{ id: OWNER, full_name: "KK" }],
  finance_preferences: [{ owner_id: OWNER, revision: 1, data: {
    homeScope: "personal",
    entities: [{ id: "ent-1", name: "Thapal Ventures Pvt Ltd", kind: "company", pan: "", gstins: [], booksFrom: "2026-27" }],
    trips: [{ id: "trip-1", name: "Mumbai client visit", destination: "Mumbai", start: "2026-11-07", end: "2026-11-09", budget: 60000, currencies: ["INR"] }],
    assets: [{ id: id(501), name: "MacBook Pro (office)", kind: "computer", cost: 185000, inUse: "2025-05-12", purchaseDate: "2025-05-10", sharePct: 100, bookMethod: "wdv", bookRatePct: 40 }],
  } }],
};

// ---------------- minimal PostgREST-like handling ----------------
const send = (res, status, body, headers = {}) => {
  const json = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(json);
};
const readBody = (req) => new Promise((ok) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { ok(b ? JSON.parse(b) : null); } catch { ok(null); } }); });
function filterRows(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
    const m = /^(eq|neq|is|in)\.(.*)$/.exec(v); if (!m) continue;
    const [, op, val] = m;
    out = out.filter((r) => {
      const cell = r[k] === undefined || r[k] === null ? null : String(r[k]);
      if (op === "eq") return cell === val;
      if (op === "neq") return cell !== val;
      if (op === "is") return val === "null" ? cell === null : cell !== null;
      if (op === "in") return val.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, "")).includes(cell ?? "");
      return true;
    });
  }
  return out;
}
let seq = 9000;
async function handleBackend(req, res, rest) {
  const url = new URL(rest, "http://x"); const p = url.pathname;
  const one = (req.headers["accept"] || "").includes("vnd.pgrst.object");
  if (req.method === "OPTIONS") return send(res, 204);
  if (p.startsWith("/auth/v1/user")) return send(res, 200, user);
  if (p.startsWith("/auth/v1/token") || p.startsWith("/auth/v1/signup") || p.startsWith("/auth/v1/verify"))
    return send(res, 200, { access_token: token(), refresh_token: "fixture", expires_in: 8 * 3600, expires_at: Math.floor(Date.now() / 1000) + 8 * 3600, token_type: "bearer", user });
  if (p.startsWith("/auth/v1/logout")) return send(res, 204);
  if (p.startsWith("/auth/v1/")) return send(res, 200, {});
  if (p.startsWith("/storage/v1/")) return send(res, 200, []);
  if (p.startsWith("/rest/v1/rpc/")) {
    const fn = p.slice("/rest/v1/rpc/".length); const body = (await readBody(req)) || {};
    if (fn === "save_reviewed_preferences" && body._data) { const row = DB.finance_preferences[0]; row.data = body._data; row.revision += 1; return send(res, 200, row.revision); }
    // Functions that only exist in proposed (not applied) SQL answer "not found", exactly like today's production schema.
    return send(res, 404, { code: "PGRST202", message: `Could not find the function public.${fn} (local preview)` });
  }
  if (p.startsWith("/rest/v1/")) {
    const table = p.slice("/rest/v1/".length); const rows = (DB[table] ||= []);
    if (req.method === "GET" || req.method === "HEAD") { const r = filterRows(rows, url.searchParams); return send(res, 200, one ? (r[0] ?? null) : r); }
    const body = await readBody(req);
    if (req.method === "POST") {
      const items = (Array.isArray(body) ? body : [body]).filter(Boolean).map((x) => ({ id: x.id ?? `ffffffff-0000-4000-8000-${String(++seq).padStart(12, "0")}`, created_at: new Date().toISOString(), ...x }));
      for (const it of items) { const i = rows.findIndex((r) => r.id === it.id); if (i >= 0) rows[i] = { ...rows[i], ...it }; else rows.push(it); }
      return send(res, 201, one ? items[0] : items);
    }
    const hit = filterRows(rows, url.searchParams);
    if (req.method === "PATCH") { for (const r of hit) Object.assign(r, body || {}); return send(res, 200, one ? (hit[0] ?? null) : hit); }
    if (req.method === "DELETE") { DB[table] = rows.filter((r) => !hit.includes(r)); return send(res, 200, one ? (hit[0] ?? null) : hit); }
  }
  return send(res, 404, { message: "Not available in the local preview" });
}

// ---------------- front server: backend + proxy to Vite (incl. HMR websocket) ----------------
const server = http.createServer((req, res) => {
  if (req.url.startsWith(PREFIX)) { handleBackend(req, res, req.url.slice(PREFIX.length) || "/").catch((e) => send(res, 500, { message: String(e) })); return; }
  const up = http.request({ host: "127.0.0.1", port: VITE_PORT, method: req.method, path: req.url, headers: req.headers }, (r) => { res.writeHead(r.statusCode || 502, r.headers); r.pipe(res); });
  up.on("error", () => { res.writeHead(502, { "content-type": "text/plain" }); res.end("The app is still starting. Refresh in a few seconds."); });
  req.pipe(up);
});
server.on("upgrade", (req, socket, head) => {
  const up = net.connect(VITE_PORT, "127.0.0.1", () => {
    up.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n` + Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") + "\r\n\r\n");
    if (head && head.length) up.write(head);
    socket.pipe(up).pipe(socket);
  });
  up.on("error", () => socket.destroy()); socket.on("error", () => up.destroy());
});

// ---------------- start Vite with the fixture environment ----------------
const env = { ...process.env,
  SUPABASE_URL: PUBLIC_URL.replace("localhost", "127.0.0.1"), VITE_SUPABASE_URL: PUBLIC_URL,
  SUPABASE_PROJECT_ID: "fixture", VITE_SUPABASE_PROJECT_ID: "fixture",
  SUPABASE_PUBLISHABLE_KEY: "fixture-anon", VITE_SUPABASE_PUBLISHABLE_KEY: "fixture-anon",
  SUPABASE_SERVICE_ROLE_KEY: "fixture-service" };
// On Windows, bunx is a command shim that only runs through a shell.
const vite = spawn("bunx", ["vite", "dev", "--host", "127.0.0.1", "--port", String(VITE_PORT), "--strictPort"], { cwd: ROOT, env, stdio: ["ignore", "inherit", "inherit"], shell: process.platform === "win32" });
vite.on("exit", (code) => { console.error(`[preview] Vite exited (${code})`); process.exit(code ?? 1); });
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { try { vite.kill(); } catch { /* already stopped */ } process.exit(0); });
server.listen(PREVIEW_PORT, process.env.PREVIEW_HOST || "127.0.0.1", () => console.log(`[preview] Thapal local preview: http://localhost:${PREVIEW_PORT}  (fixture backend at ${PREFIX}; hosted Supabase is never contacted)`));
