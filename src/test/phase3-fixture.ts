// Test-only fixture for the Phase 3 (P7 balanced posting) acceptance tests. Builds an isolated in-memory
// PGlite with migrations 0000-0088 + P1 + P2 + P4 + P5 (+ P7) and a realistic multi-entity,
// multi-currency owner dataset in the app's real shapes. Never connects to Cloud.
import type { PGlite } from "@electric-sql/pglite";
import { actAs, addUsers, fullSchemaDb } from "./full-schema-pglite";

export const DIR = ".lovable/staged-sql/proposed/";
export const P1 = `${DIR}P1_security_containment.sql`;
export const P2 = `${DIR}P2_v31_role_model.sql`;
export const P4 = `${DIR}P4_step_up_and_assistant_limits.sql`;
export const P5 = `${DIR}P5_legal_entities_foundation.sql`;
export const P5_RB = `${DIR}P5_legal_entities_foundation.rollback.sql`;
export const P7 = `${DIR}P7_balanced_posting.sql`;
export const P7_RB = `${DIR}P7_balanced_posting.rollback.sql`;
export const BASE = [P1, P2, P4, P5];
export const T = 300_000;

export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** owner, other owner, authorised accountant, company member (legacy grant), guest, stranger */
export const U = { O: id(1), V: id(2), A: id(3), M: id(4), G: id(5), X: id(6) } as const;
export const MCP = "mcp-client-1";
export const C1 = "5b1f0c1e-7a3d-4c2e-9f10-0000000000c1"; // Alpha Traders Pvt Ltd
export const C2 = "5b1f0c1e-7a3d-4c2e-9f10-0000000000c2"; // Beta Holdings LLP
export const VC = "5b1f0c1e-7a3d-4c2e-9f10-0000000000f1"; // V's company
export const ACC = {
  A1: id(101), A2: id(102), B1: id(103), P1: id(104), P2: id(105), P3: id(106), L1: id(107), I1: id(108), V1: id(201),
} as const;
export const DOC = { opening: id(2001), v: id(2002), journal: id(2003) } as const;
export const OP = { a1: id(3001), b1: id(3002) } as const;

export type Db = PGlite;
export const q = async <R = Record<string, unknown>>(db: Db, sql: string, params: unknown[] = []) => (await db.query<R>(sql, params)).rows;
export function first<R>(rows: readonly R[], what = "row"): R { const r = rows[0]; if (r === undefined) throw new Error(`Expected a ${what}, got none`); return r; }
const errInfo = (e: unknown) => { const x = e as Error & { code?: unknown }; return { error: String(x.message), code: typeof x.code === "string" ? x.code : "" }; };

export type Opts = { clientId?: string | undefined; anon?: boolean };
export type Attempt<R> = { ok: true; value: R } | { ok: false; error: string; code: string };
/** Run fn as uid inside a transaction that is always rolled back (commit-time constraints run via SET CONSTRAINTS ALL IMMEDIATE). */
export async function attempt<R>(db: Db, uid: string | null, fn: () => Promise<R>, opts: Opts = {}): Promise<Attempt<R>> {
  await actAs(db, uid, opts.clientId === undefined ? {} : { clientId: opts.clientId });
  if (opts.anon) await db.query("SELECT set_config('test.anon','true',false)");
  await db.exec("BEGIN");
  try { const value = await fn(); await db.exec("SET CONSTRAINTS ALL IMMEDIATE"); return { ok: true, value }; }
  catch (e) { return { ok: false, ...errInfo(e) }; }
  finally { await db.exec("ROLLBACK"); await db.query("SELECT set_config('test.anon','',false)"); await actAs(db, null); }
}
/** Run fn as uid and keep the effects (one transaction, so deferred constraints run at commit). */
export async function as<R>(db: Db, uid: string, fn: () => Promise<R>, opts: Opts = {}): Promise<R> {
  await actAs(db, uid, opts.clientId === undefined ? {} : { clientId: opts.clientId });
  if (opts.anon) await db.query("SELECT set_config('test.anon','true',false)");
  await db.exec("BEGIN");
  try { const r = await fn(); await db.exec("COMMIT"); return r; }
  catch (e) { await db.exec("ROLLBACK"); throw e; }
  finally {
    await db.query("SELECT set_config('test.anon','',false)");
    await actAs(db, null);
    // Step-up grants expire on return so a later "without step-up" probe is not satisfied by them.
    await q(db, "UPDATE public.step_up_grants SET created_at = clock_timestamp() - interval '10 minutes', expires_at = clock_timestamp() - interval '6 minutes' WHERE expires_at > clock_timestamp()");
  }
}
export const errorText = (a: Attempt<unknown>) => (a.ok ? "" : a.error);
/** Record a step-up exactly as the server does (service role), then return to the caller's role. */
export async function stepUp(db: Db, uid: string) {
  const caller = first(await q<{ u: string | null }>(db, "SELECT nullif(current_setting('test.uid',true),'') u")).u;
  await db.exec("RESET ROLE"); await db.exec("SET ROLE service_role");
  try { await q(db, "SELECT public.record_step_up($1,'password',300)", [uid]); }
  finally { await db.exec("RESET ROLE"); if (caller) await db.exec("SET ROLE authenticated"); }
}
/** Inside a transaction: a statement that may fail without aborting it; returns its error or "". */
export async function errorOf(db: Db, fn: () => Promise<unknown>) {
  await db.exec("SAVEPOINT probe");
  try { await fn(); await db.exec("SET CONSTRAINTS ALL IMMEDIATE"); await db.exec("RELEASE SAVEPOINT probe"); return ""; }
  catch (e) { await db.exec("ROLLBACK TO SAVEPOINT probe"); return errInfo(e).error; }
}

export type Ex = {
  id: string; acc?: string | null; to?: string | null; date: string; amount: number; type?: string; manual?: string; cur?: string; orig?: number; rate?: number;
  category?: string; allocations?: { category: string; amount: number }[]; principal?: number; interest?: number; adjSign?: 1 | -1; ref?: string | null;
  counterpartOf?: string; receipts?: { name: string; type: string; path: string }[]; details?: Record<string, unknown>; owner?: string; title?: string;
};
const COLS = `id, employee_id, title, merchant, category, amount, original_amount, currency, fx_rate, fx_date, expense_date, account_id, to_account_id,
  txn_type, entity_source, entity_id, scope, allocations, principal, interest, adjustment_sign, statement_ref, transfer_counterpart_of, receipts, receipt_details, payment_method`;
export const exParams = (x: Ex) => [x.id, x.owner ?? U.O, x.title ?? `entry ${x.id.slice(-4)}`, x.category ?? "General", x.amount, x.orig ?? x.amount, x.cur ?? "INR", x.rate ?? 1,
  x.cur && x.cur !== "INR" ? x.date : null, x.date, x.acc ?? null, x.to ?? null, x.type ?? "expense", x.manual ? "manual" : "account", x.manual ?? null,
  "personal", JSON.stringify(x.allocations ?? []), x.principal ?? null, x.interest ?? null, x.adjSign ?? 1, x.ref ?? null, x.counterpartOf ?? null,
  JSON.stringify(x.receipts ?? []), JSON.stringify(x.details ?? {}), "other"];
export const INSERT_EXPENSE = `INSERT INTO public.expenses(${COLS}) VALUES ($1,$2,$3,'Shop',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19,$20,$21,$22,$23::jsonb,$24::jsonb,$25)`;
export async function insertExpense(db: Db, x: Ex) { await q(db, INSERT_EXPENSE, exParams(x)); }

export const OWNER_DATA = {
  entities: [
    { id: C1, name: "Alpha Traders Pvt Ltd", kind: "company", pan: "AAACA1234A", gstins: ["29AAACA1234A1Z5"], booksFrom: "2024-25" },
    { id: C2, name: "Beta Holdings LLP", kind: "llp", pan: "AAKFB5678B", gstins: [], booksFrom: "2025-26" },
  ],
  books: { entityAccounts: { [C1]: [ACC.A1, ACC.A2], [C2]: [ACC.B1] }, journals: [], assetEvents: [], closedPeriods: [], periodLog: [] },
};

const E = (n: number) => id(1000 + n);
export const ENTRY = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`e${i + 1}`, E(i + 1)])) as Record<string, string>;
const must = (s: string | undefined) => { if (s === undefined) throw new Error("missing fixture"); return s; };
export const e = (n: number) => must(ENTRY[`e${n}`]);

/**
 * Realistic owner ledger (April-June 2026, FY 2026-27): two companies + personal books, INR/USD/EUR,
 * card settlement, loan EMI split, split categories, an inter-entity expense and withdrawal, a refund,
 * a reimbursement claim, a statement transfer pair, a duplicated statement row, opening balances with
 * and without evidence and unclassifiable rows that must remain exceptions.
 */
export const LEDGER: Ex[] = [
  { id: e(1), acc: ACC.A1, date: "2026-04-01", amount: 100000, type: "adjustment", title: "Opening balance A1", category: "Adjustment" },     // opening WITH evidence
  { id: e(2), acc: ACC.B1, date: "2026-04-01", amount: 20000, type: "adjustment", title: "Opening balance B1", category: "Adjustment" },      // opening WITHOUT evidence
  { id: e(3), acc: ACC.A1, date: "2026-04-05", amount: 50000, category: "Rent", title: "Office rent April" },
  { id: e(4), acc: ACC.A2, date: "2026-04-10", amount: 10020, cur: "USD", orig: 120, rate: 83.5, category: "Software", title: "Cloud subscription" },
  { id: e(5), acc: ACC.A1, date: "2026-04-15", amount: 200000, type: "income", category: "Sales", title: "Invoice 1001 received" },
  { id: e(6), acc: ACC.A1, to: ACC.A2, date: "2026-05-02", amount: 10020, type: "card_payment", category: "Card payment", title: "Alpha card bill" },
  { id: e(7), acc: ACC.P2, date: "2026-04-08", amount: 3456.78, category: "Groceries", allocations: [{ category: "Groceries", amount: 2000 }, { category: "Household", amount: 1456.78 }], title: "Supermarket" },
  { id: e(8), acc: ACC.P1, date: "2026-04-30", amount: 150000, type: "income", category: "Salary", title: "April salary" },
  { id: e(9), acc: ACC.P1, to: ACC.P3, date: "2026-05-01", amount: 5000, type: "transfer", category: "Transfer", title: "Wallet top-up" },
  { id: e(10), acc: ACC.P1, to: ACC.I1, date: "2026-05-03", amount: 25000, type: "investment", category: "Investment", title: "SIP" },
  { id: e(11), acc: ACC.P1, to: ACC.L1, date: "2026-05-05", amount: 30000, type: "loan_repayment", principal: 22000, interest: 8000, orig: 30000, category: "EMI", title: "Home loan EMI" },
  { id: e(12), acc: ACC.P2, date: "2026-05-10", amount: 4500, cur: "EUR", orig: 50, rate: 90, manual: C1, category: "Travel", title: "Client dinner paid personally" },
  { id: e(13), acc: ACC.A1, to: ACC.P1, date: "2026-05-20", amount: 40000, type: "transfer", category: "Transfer", title: "Director withdrawal" },
  { id: e(14), acc: ACC.P2, date: "2026-05-12", amount: 999.5, type: "refund", category: "Groceries", title: "Supermarket refund" },
  { id: e(15), acc: ACC.P2, date: "2026-05-14", amount: 1200, category: "Medical", title: "Clinic (claim)" },
  { id: e(16), acc: ACC.P1, date: "2026-05-25", amount: 1200, type: "reimbursement", category: "Medical", title: "Reimbursement: Clinic" },
  { id: e(17), acc: ACC.B1, date: "2026-06-01", amount: 7500, category: "Audit fees", title: "Statutory audit" },
  { id: e(18), acc: ACC.B1, date: "2026-06-02", amount: 12345.67, type: "income", category: "Interest", title: "FD interest" },
  { id: e(19), acc: ACC.P1, date: "2026-06-03", amount: 250, type: "adjustment", category: "Adjustment", title: "Unexplained bank difference" },  // exception
  { id: e(20), acc: null, date: "2026-06-04", amount: 300, category: "Food", title: "Cash snack (no account)" },                                     // exception
  { id: e(21), acc: ACC.P1, date: "2026-06-05", amount: 2100, category: "Utilities", title: "Electricity", ref: "document:stmt-1 · L0042 · 2026-06-05 · 2100.00" },
  { id: e(22), acc: ACC.P1, date: "2026-06-05", amount: 2100, category: "Utilities", title: "Electricity (re-imported)", ref: "document:stmt-1 · L0042 · 2026-06-05 · 2100.00" }, // duplicate row
  { id: e(23), acc: ACC.P1, to: ACC.P2, date: "2026-06-10", amount: 15000, type: "card_payment", category: "Card payment", title: "Personal card bill", ref: "document:stmt-1 · L0050 · 2026-06-10 · 15000.00" },
  { id: e(24), acc: ACC.P2, date: "2026-06-10", amount: 15000, type: "income", category: "Payment received", title: "Card payment received", ref: "document:card-1 · L0007 · 2026-06-10 · 15000.00", counterpartOf: e(23) },
  { id: e(25), acc: ACC.P2, date: "2026-06-12", amount: 1800, category: "Dining", title: "Dinner (with receipt)", receipts: [{ name: "r.jpg", type: "image/jpeg", path: `${U.O}/receipts/r-25.jpg` }] },
];

export const V_LEDGER: Ex[] = [{ id: id(1900), acc: ACC.V1, date: "2026-04-20", amount: 999, category: "Other owner", owner: U.V }];

/** Base install + realistic seed + P5 entity backfill committed for O and V (personal entities exist). */
export async function seededDb(extra: string[] = [P7]) {
  const db = await fullSchemaDb([...BASE, ...extra]);
  await addUsers(db, { [U.O]: "o@x.in", [U.V]: "v@x.in", [U.A]: "ca@x.in", [U.M]: "m@x.in", [U.X]: "x@x.in" });
  await q(db, "INSERT INTO auth.users(id, email, is_anonymous) VALUES ($1, NULL, true)", [U.G]);
  await q(db, "INSERT INTO public.demo_sessions(owner_id, label) VALUES ($1, 'Visitor demo')", [U.G]);
  for (const [u, d] of [[U.O, OWNER_DATA], [U.V, { entities: [{ id: VC, name: "Vee Corp", kind: "company", pan: "AAACV1111V", gstins: [] }], books: { entityAccounts: { [VC]: [ACC.V1] } } }],
    [U.G, { entities: [], books: {} }], [U.X, { entities: [], books: {} }]] as const) {
    await q(db, "INSERT INTO public.finance_preferences(owner_id, data) VALUES ($1, $2::jsonb)", [u, JSON.stringify(d)]);
  }
  const accounts: [string, string, string, string, number][] = [
    [ACC.A1, U.O, "Alpha HDFC current", "current", 0], [ACC.A2, U.O, "Alpha corporate card", "credit_card", 0], [ACC.B1, U.O, "Beta ICICI current", "current", 0],
    [ACC.P1, U.O, "Personal savings", "savings", 50000], [ACC.P2, U.O, "Personal credit card", "credit_card", 0], [ACC.P3, U.O, "Paytm wallet", "wallet", 0],
    [ACC.L1, U.O, "Home loan", "loan", 0], [ACC.I1, U.O, "Mutual funds", "investment", 0], [ACC.V1, U.V, "Vee bank", "current", 0],
  ];
  for (const [a, o, n, k, ob] of accounts) await q(db, "INSERT INTO public.accounts(id, owner_id, name, kind, opening_balance) VALUES ($1,$2,$3,$4,$5)", [a, o, n, k, ob]);
  await q(db, "INSERT INTO public.documents(id, owner_id, title, file_path, file_name) VALUES ($1,$2,'Opening trial balance FY 2026-27',$3,'tb.pdf'), ($4,$5,'v doc',$6,'v.pdf'), ($7,$2,'Accrual working',$8,'acc.pdf')",
    [DOC.opening, U.O, `${U.O}/docs/tb.pdf`, DOC.v, U.V, `${U.V}/docs/v.pdf`, DOC.journal, `${U.O}/docs/acc.pdf`]);
  for (const x of [...LEDGER, ...V_LEDGER]) await insertExpense(db, x);
  await q(db, `INSERT INTO public.opening_postings(id, owner_id, entity_id, fy, opening_date, lines, txn_ids, source_doc_id, posted_by)
    VALUES ($1,$2,$3,'2026-27','2026-04-01','[]',ARRAY[$4::uuid],$5,$2), ($6,$2,$7,'2026-27','2026-04-01','[]',ARRAY[$8::uuid],NULL,$2)`,
    [OP.a1, U.O, C1, e(1), DOC.opening, OP.b1, C2, e(2)]);
  // Authorised accountant for C1 only (V3.1 grant) and a legacy company member (entity_members -> P2 mirror).
  await q(db, `INSERT INTO public.access_grants(workspace_owner_id, entity_id, role, grantee_email, grantee_id, granted_by, accepted_at, identity_check)
    VALUES ($1,$2,'accountant','ca@x.in',$3,$1,now(),'confirmed_email_match')`, [U.O, C1, U.A]);
  await q(db, "INSERT INTO public.entity_members(owner_id, entity_id, member_id, member_email, can_write) VALUES ($1,$2,$3,'m@x.in',true)", [U.O, C1, U.M]);
  for (const u of [U.O, U.V]) await entityBackfill(db, u);
  return db;
}

export async function entityBackfill(db: Db, owner: string) {
  const plan = await as(db, owner, () => q<{ p: { source_sha256: string } }>(db, "SELECT public.preview_entity_backfill(false) p"));
  await as(db, owner, async () => { await stepUp(db, owner); await q(db, "SELECT public.commit_entity_backfill($1,false)", [first(plan).p.source_sha256]); });
}

export async function setClosedPeriods(db: Db, owner: string, periods: unknown[]) {
  await actAs(db, null);
  await db.exec("BEGIN");
  await q(db, "INSERT INTO public.period_operation_authority(owner_id, transaction_id) VALUES ($1, txid_current())", [owner]);
  await q(db, "UPDATE public.finance_preferences SET data = jsonb_set(data, '{books,closedPeriods}', $2::jsonb) WHERE owner_id = $1", [owner, JSON.stringify(periods)]);
  await q(db, "DELETE FROM public.period_operation_authority WHERE owner_id = $1", [owner]);
  await db.exec("COMMIT");
}

export type Plan = { fingerprint: string; proposals: Record<string, unknown>[]; exceptions: Record<string, unknown>[]; skippedClosed: Record<string, unknown>[]; counts: Record<string, number> };
export const preview = async (db: Db, owner: string) => first(await as(db, owner, () => q<{ p: Plan }>(db, "SELECT public.preview_posting_backfill() p"))).p;
/** Preview, then commit exactly that preview with a step-up (the owner's reviewed conversion). */
export async function activate(db: Db, owner: string, run = id(9000 + Number(owner.slice(-2)))) {
  const p = await preview(db, owner);
  return first(await as(db, owner, async () => { await stepUp(db, owner); return q<{ r: Record<string, unknown> }>(db, "SELECT public.commit_posting_backfill($1,$2) r", [run, p.fingerprint]); })).r;
}
export const entityId = async (db: Db, owner: string, key: string) =>
  first(await q<{ id: string }>(db, "SELECT id FROM public.legal_entities WHERE owner_id = $1 AND entity_key = $2", [owner, key])).id;
export const personalKey = (u: string) => `personal:${u}`;

/** Trial balance from the posted journal: entity key -> code -> signed (debit - credit). */
export async function journalTb(db: Db, owner: string) {
  await actAs(db, null);
  const rows = await q<{ k: string; code: string; s: string }>(db, `SELECT e.entity_key k, l.code, sum(l.signed_amount)::text s FROM public.posting_lines l
    JOIN public.posting_batches b ON b.id = l.batch_id JOIN public.legal_entities e ON e.id = b.legal_entity_id WHERE b.owner_id = $1 GROUP BY 1, 2 HAVING sum(l.signed_amount) <> 0`, [owner]);
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) (out[r.k] ??= {})[r.code] = Number(r.s);
  return out;
}

/** count + md5 of every row of every listed table (stable ordering), for preservation proofs. */
export async function dataSnapshot(db: Db, tables: string[]) {
  await actAs(db, null);
  const out: Record<string, string> = {};
  for (const t of tables) {
    const r = first(await q<{ n: number; h: string }>(db, `SELECT count(*)::int n, md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY to_jsonb(x)::text), '')) h FROM ${t} x`));
    out[t] = `${r.n}:${r.h}`;
  }
  return out;
}
export async function publicTables(db: Db, exclude: RegExp = /^posting_/) {
  await actAs(db, null);
  return (await q<{ t: string }>(db, "SELECT 'public.' || quote_ident(relname) t FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' ORDER BY relname"))
    .map((r) => r.t).filter((t) => !exclude.test(t.replace(/^public\./, "")));
}
