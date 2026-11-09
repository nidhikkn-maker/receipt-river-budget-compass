// @vitest-environment node
// Phase 2 (database foundation) acceptance tests for the PROPOSED P5_legal_entities_foundation.sql:
// legal entities, dated account assignments, ledger links, scope-local readable numbers, shared
// register records with dated ownership, entity-aware closed periods, previewed backfill + compare,
// RLS / P4 limits and the exact rollback. Everything runs in isolated in-memory PGlite replaying
// drizzle/migrations 0000-0088 + P1 + P2 + P4 (src/test/full-schema-pglite.ts). Nothing connects to Cloud.
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { fullSchemaDb, actAs, addUsers, readSql } from "../test/full-schema-pglite";
import { effectiveEntity, type EntityAccounts } from "./books/entity-accounts";
import { BACKUP_EXCLUDED_TABLES, BACKUP_NOT_OWNER_TABLES, BACKUP_TABLES } from "./backup";

const DIR = ".lovable/staged-sql/proposed/";
const P1 = `${DIR}P1_security_containment.sql`;
const P2 = `${DIR}P2_v31_role_model.sql`;
const P2_RB = `${DIR}P2_v31_role_model.rollback.sql`;
const P1_RB = `${DIR}P1_security_containment.rollback.sql`;
const P4 = `${DIR}P4_step_up_and_assistant_limits.sql`;
const P4_RB = `${DIR}P4_step_up_and_assistant_limits.rollback.sql`;
const P5 = `${DIR}P5_legal_entities_foundation.sql`;
const P5_RB = `${DIR}P5_legal_entities_foundation.rollback.sql`;
const BASE = [P1, P2, P4];
const T = 180_000;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U = { O: id(1), V: id(2), G: id(3), J: id(4), X: id(5) } as const; // owner, other owner, c1 grantee, joint co-owner, stranger
const MCP = "mcp-client-1";
// Entity keys exactly as the app stores them (crypto.randomUUID text); INTAKE is a document intake run id.
const C1 = "5b1f0c1e-7a3d-4c2e-9f10-0000000000c1";
const C2 = "5b1f0c1e-7a3d-4c2e-9f10-0000000000c2";
const INTAKE = "9d0c4b1a-2e3f-4a5b-8c6d-00000000a1a1";
const CDEL = "5b1f0c1e-7a3d-4c2e-9f10-00000000de1e"; // deleted company: still referenced by rows
const COLD = "5b1f0c1e-7a3d-4c2e-9f10-0000000001d0"; // merged into C1: still referenced by rows and a close
const JC = "7c7c7c7c-1111-4222-8333-00000000009c"; // J's company
const ACC = { A: id(101), B: id(102), C: id(103), D: id(104), V: id(201), J: id(301) } as const;
const E = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`e${i + 1}`, id(1001 + i)])) as Record<string, string>;
const DOC = { c1: id(2001), personal: id(2002), del: id(2003), intake: id(2004), v: id(2005) } as const;
const OP = { c1: id(3001), del: id(3002) } as const;
const hex = (s: string) => Buffer.from(s, "utf8").toString("hex");
const PERSONAL = (u: string) => `personal:${u}`;

type Db = PGlite;
const q = async <R = Record<string, unknown>>(db: Db, sql: string, params: unknown[] = []) => (await db.query<R>(sql, params)).rows;
function first<R>(rows: readonly R[], what = "row"): R { const r = rows[0]; if (r === undefined) throw new Error(`Expected a ${what}, got none`); return r; }
const errInfo = (e: unknown) => { const x = e as Error & { code?: unknown }; return { error: String(x.message), code: typeof x.code === "string" ? x.code : "" }; };
const must = (s: string | undefined) => { if (s === undefined) throw new Error("missing fixture"); return s; };

type Opts = { clientId?: string | undefined; anon?: boolean };
type Attempt<R> = { ok: true; value: R } | { ok: false; error: string; code: string };
/** Run fn as uid inside a transaction that is always rolled back. */
async function attempt<R>(db: Db, uid: string | null, fn: () => Promise<R>, opts: Opts = {}): Promise<Attempt<R>> {
  await actAs(db, uid, opts.clientId === undefined ? {} : { clientId: opts.clientId });
  if (opts.anon) await db.query("SELECT set_config('test.anon','true',false)");
  await db.exec("BEGIN");
  try { return { ok: true, value: await fn() }; }
  catch (e) { return { ok: false, ...errInfo(e) }; }
  finally { await db.exec("ROLLBACK"); await db.query("SELECT set_config('test.anon','',false)"); await actAs(db, null); }
}
/** Run fn as uid and keep the effects. Step-up grants recorded inside expire on return, so a later
 *  probe "without step-up" is not satisfied by an earlier, still unexpired 5-minute grant. */
async function as<R>(db: Db, uid: string, fn: () => Promise<R>, opts: Opts = {}) {
  await actAs(db, uid, opts.clientId === undefined ? {} : { clientId: opts.clientId });
  try { return await fn(); } finally {
    await actAs(db, null);
    await q(db, "UPDATE public.step_up_grants SET created_at = clock_timestamp() - interval '10 minutes', expires_at = clock_timestamp() - interval '6 minutes' WHERE expires_at > clock_timestamp()");
  }
}
const errorText = (a: Attempt<unknown>) => (a.ok ? "" : a.error);
/** Record a step-up exactly as the server does (service role), then return to the caller's role. */
async function stepUp(db: Db, uid: string) {
  const caller = first(await q<{ u: string | null }>(db, "SELECT nullif(current_setting('test.uid',true),'') u")).u;
  await db.exec("RESET ROLE"); await db.exec("SET ROLE service_role");
  try { await q(db, "SELECT public.record_step_up($1,'password',300)", [uid]); }
  finally { await db.exec("RESET ROLE"); if (caller) await db.exec("SET ROLE authenticated"); }
}
/** Inside an attempt: a statement that may fail without aborting the transaction; returns its error or "". */
async function errorOf(db: Db, fn: () => Promise<unknown>) {
  await db.exec("SAVEPOINT probe");
  try { await fn(); await db.exec("RELEASE SAVEPOINT probe"); return ""; }
  catch (e) { await db.exec("ROLLBACK TO SAVEPOINT probe"); return errInfo(e).error; }
}

// ------------------------------------------------------------------------------------------
// Seed: the app's real JSON shapes (EntityProfile, books.entityAccounts, Asset.ownerEntityId,
// Journal, AssetEvent, ClosedPeriod) plus relational rows. Inserted as the superuser, like data
// already present in production before P5 is applied.
// ------------------------------------------------------------------------------------------
const OWNER_DATA = {
  entities: [
    { id: C1, name: "Alpha Traders Pvt Ltd", kind: "company", pan: "aaaca1234a", gstins: ["29aaaca1234a1z5"], regNo: "U51909KA2019PTC123456", booksFrom: "2024-25",
      shareholding: [{ name: "K Kumar", pct: 60 }, { name: "S Rao", pct: 40 }], people: [{ name: "K Kumar", role: "Director" }], verified: ["pan"] },
    { id: C2, name: "Beta Holdings LLP", kind: "llp", pan: "AAKFB5678B", gstins: [], regNo: "AAB-1234", booksFrom: "2025-26" },
    { id: INTAKE, name: "Gamma Stores", kind: "proprietorship", pan: "ABCPK1234K", gstins: [], booksFrom: "2025-26" },
  ],
  assets: [
    { id: "ast-van", name: "Delivery van", kind: "vehicle", cost: 900000, inUse: "2025-06-01", ownerEntityId: C1, sharePct: 100, bookMethod: "slm", bookRatePct: 15 },
    { id: "ast-c2", name: "Server rack", kind: "computer", cost: 300000, inUse: "2025-07-01", ownerEntityId: C2, sharePct: 100, bookMethod: "wdv", bookRatePct: 40 },
    { id: "ast-laptop", name: "Home laptop", kind: "computer", cost: 120000, inUse: "2025-07-01", sharePct: 100, bookMethod: "wdv", bookRatePct: 40 },
  ],
  // Workspace and organisation labels that must NEVER become legal entities (FND-02).
  reimbursementSettings: { profiles: [{ id: "rp-1", organisation: "VEI", workspace: "business" }] },
  trips: [{ id: "trip-1", name: "Goa offsite", organisation: "MOVAC", primaryWorkspace: "business" }],
  books: {
    entityAccounts: { [C1]: [ACC.A, ACC.B], [C2]: [ACC.C] },
    journals: [{ id: "j-van-2026-03", assetId: "ast-van", period: "2026-03", amount: 11250, kind: "book", status: "prepared" }],
    assetEvents: [],
    properties: [{ id: "prop-flat", name: "Flat 4B", ownerEntityId: C1 }],
    fyRecords: [{ id: "fy-old", entityId: CDEL, fy: "2024-25" }],
    closedPeriods: [], periodLog: [],
  },
};
const CLOSED = [
  { id: "cp-all-2025", from: "2025-01-01", to: "2025-12-31", closedOn: "2026-01-10", note: "Year 2025 closed for everyone" },
  { id: "cp-old-jan", from: "2026-01-01", to: "2026-01-31", entityId: COLD, closedOn: "2026-02-03", note: "Old company January" },
  { id: "cp-c1-apr", from: "2026-04-01", to: "2026-04-30", entityId: C1, closedOn: "2026-05-03", note: "Alpha April close" },
  { id: "cp-c2-may", from: "2026-05-01", to: "2026-05-31", entityId: C2, closedOn: "2026-06-02", note: "Beta May close" },
];

async function setClosedPeriods(db: Db, owner: string, periods: unknown[]) {
  await actAs(db, null);
  await db.exec("BEGIN");
  await q(db, "INSERT INTO public.period_operation_authority(owner_id, transaction_id) VALUES ($1, txid_current())", [owner]);
  await q(db, "UPDATE public.finance_preferences SET data = jsonb_set(data, '{books,closedPeriods}', $2::jsonb) WHERE owner_id = $1", [owner, JSON.stringify(periods)]);
  await q(db, "DELETE FROM public.period_operation_authority WHERE owner_id = $1", [owner]);
  await db.exec("COMMIT");
}

type Ex = { id: string; acc?: string | null; to?: string | null; date: string; amount: number; type?: string; manual?: string; cur?: string; orig?: number; scope?: string; tags?: string[]; owner?: string };
const EXPENSES: Ex[] = [
  { id: must(E["e1"]), acc: ACC.A, date: "2026-03-10", amount: 1000 },                              // C1 (account)
  { id: must(E["e2"]), acc: ACC.C, date: "2026-03-11", amount: 2000 },                              // C2 (account)
  { id: must(E["e3"]), acc: ACC.D, date: "2026-04-12", amount: 300 },                               // personal, inside C1-only April close
  { id: must(E["e4"]), acc: ACC.D, date: "2026-02-01", amount: 4150, manual: CDEL, cur: "USD", orig: 50 }, // deleted company (orphan)
  { id: must(E["e5"]), acc: ACC.A, date: "2026-03-15", amount: 700, manual: C2 },                   // hand-picked company wins
  { id: must(E["e6"]), acc: ACC.A, to: ACC.D, date: "2026-03-20", amount: 5000, type: "transfer" },  // company -> personal transfer
  { id: must(E["e7"]), acc: ACC.B, date: "2026-03-21", amount: 1800, cur: "EUR", orig: 20 },        // C1, foreign currency
  { id: must(E["e8"]), acc: ACC.D, date: "2026-01-05", amount: 600, manual: COLD },                 // merged company (orphan), its January is closed
  { id: must(E["e9"]), acc: ACC.A, date: "2026-04-10", amount: 450 },                               // C1 inside C1 April close
  { id: must(E["e10"]), acc: ACC.C, date: "2026-04-05", amount: 250 },                              // C2 in April (only C1 closed)
  { id: must(E["e11"]), acc: ACC.B, date: "2026-06-10", amount: 900 },                              // later moved with its account
  { id: must(E["e12"]), acc: ACC.D, date: "2025-07-01", amount: 100 },                              // inside the all-entity 2025 close
  { id: must(E["e13"]), acc: ACC.D, date: "2026-03-25", amount: 120, scope: "business", tags: ["Organisation: KR Enterprises"] }, // workspace label only
  { id: id(1101), acc: ACC.V, date: "2026-03-01", amount: 999, owner: U.V },
  { id: id(1102), acc: ACC.V, date: "2026-03-02", amount: 555, manual: C1, owner: U.V },          // V's OWN company with the same text key as O's C1
];

async function insertExpense(db: Db, x: Ex) {
  await q(db, `INSERT INTO public.expenses(id, employee_id, title, merchant, category, amount, original_amount, currency, expense_date, account_id, to_account_id,
      txn_type, entity_source, entity_id, scope, tags) VALUES ($1,$2,$3,'Shop','General',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [x.id, x.owner ?? U.O, `entry ${x.id.slice(-4)}`, x.amount, x.orig ?? x.amount, x.cur ?? "INR", x.date, x.acc ?? null, x.to ?? null, x.type ?? "expense",
      x.manual ? "manual" : "account", x.manual ?? null, x.scope ?? "personal", x.tags ?? []]);
}

async function seed(db: Db) {
  await addUsers(db, { [U.O]: "o@x.in", [U.V]: "v@x.in", [U.G]: "g@x.in", [U.J]: "j@x.in", [U.X]: "x@x.in" });
  await q(db, "UPDATE public.profiles SET full_name = 'K Kumar' WHERE id = $1", [U.O]);
  const prefs: [string, unknown][] = [
    [U.O, OWNER_DATA],
    [U.V, { entities: [{ id: C1, name: "Vee Corp", kind: "company", pan: "AAACV1111V", gstins: [], booksFrom: "2025-26" }], books: { entityAccounts: {} } }],
    [U.J, { entities: [{ id: JC, name: "Jay Estates Pvt Ltd", kind: "company", pan: "AAACJ2222J", gstins: [], booksFrom: "2025-26" }], books: {} }],
    [U.X, { entities: [], books: {} }],
  ];
  for (const [u, d] of prefs) await q(db, "INSERT INTO public.finance_preferences(owner_id, data) VALUES ($1, $2::jsonb)", [u, JSON.stringify(d)]);
  for (const [k, acc] of Object.entries(ACC)) {
    const owner = k === "V" ? U.V : k === "J" ? U.J : U.O;
    await q(db, "INSERT INTO public.accounts(id, owner_id, name, kind, opening_balance) VALUES ($1,$2,$3,'savings',1000)", [acc, owner, `Account ${k}`]);
  }
  for (const x of EXPENSES) await insertExpense(db, x);
  await q(db, "INSERT INTO public.document_runs(id, owner_id, file_name, status) VALUES ($1,$2,'gamma-gst.pdf','done')", [INTAKE, U.O]);
  const docs: [string, string, string, string | null][] = [
    [DOC.c1, U.O, `${U.O}/companies/${hex(C1)}/alpha-invoice.pdf`, C1],
    [DOC.personal, U.O, `${U.O}/docs/passport.pdf`, null],
    [DOC.del, U.O, `${U.O}/docs/old-company-deed.pdf`, CDEL],
    [DOC.intake, U.O, `${U.O}/docs/gamma-gst.pdf`, INTAKE],
    [DOC.v, U.V, `${U.V}/docs/v.pdf`, C1],
  ];
  for (const [d, o, path, ent] of docs) await q(db, "INSERT INTO public.documents(id, owner_id, title, file_path, file_name, entity_id) VALUES ($1,$2,'doc',$3,'f.pdf',$4)", [d, o, path, ent]);
  await q(db, "INSERT INTO public.opening_postings(id, owner_id, entity_id, fy, opening_date, posted_by) VALUES ($1,$2,$3,'2025-26','2025-04-01',$2), ($4,$2,$5,'2024-25','2024-04-01',$2)", [OP.c1, U.O, C1, OP.del, CDEL]);
  // G reads company C1 only (legacy company viewer; P2 mirrors it into access_grants)
  await q(db, "INSERT INTO public.entity_members(owner_id, entity_id, member_id, member_email, can_write) VALUES ($1,$2,$3,'g@x.in',false)", [U.O, C1, U.G]);
  await setClosedPeriods(db, U.O, CLOSED);
}

/** count + md5 of every row of every listed table; legal_entity_id (the one additive column) excluded. */
async function dataSnapshot(db: Db, tables: string[]) {
  await actAs(db, null);
  const out: Record<string, string> = {};
  for (const t of tables) {
    const row = "(to_jsonb(x) - 'legal_entity_id')::text";
    const r = first(await q<{ n: number; h: string }>(db, `SELECT count(*)::int n, md5(coalesce(string_agg(${row}, '|' ORDER BY ${row}), '')) h FROM ${t} x`));
    out[t] = `${r.n}:${r.h}`;
  }
  return out;
}
const P4_WRITTEN_BY_TESTS = new Set(["step_up_grants", "security_events", "step_up_attempts", "revoked_assistant_clients"]);
async function preexistingTables(db: Db) {
  return (await q<{ t: string }>(db, "SELECT c.relname t FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' ORDER BY 1"))
    .map((r) => r.t).filter((t) => !P4_WRITTEN_BY_TESTS.has(t)).map((t) => `public.${t}`).concat(["storage.objects", "auth.users"]);
}

async function fullCatalog(db: Db) {
  await actAs(db, null);
  const j = async (sql: string) => JSON.stringify(await q(db, sql));
  return {
    policies: await j("SELECT schemaname, tablename, policyname, permissive, roles::text, cmd, qual, with_check FROM pg_policies WHERE schemaname IN ('public','storage') ORDER BY 1,2,3"),
    functions: await j(`SELECT p.oid::regprocedure::text sig, pg_get_functiondef(p.oid) def,
      (SELECT string_agg(a::text, ',' ORDER BY a::text) FROM unnest(coalesce(p.proacl, '{}'::aclitem[])) a) acl
      FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' ORDER BY 1`),
    triggers: await j("SELECT tgrelid::regclass::text t, tgname, pg_get_triggerdef(oid) d FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1,2"),
    indexes: await j("SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes WHERE schemaname IN ('public','storage') ORDER BY 1,2,3"),
    constraints: await j("SELECT conrelid::regclass::text t, conname, pg_get_constraintdef(oid) d FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY 1,2"),
    tables: await j("SELECT c.relname, c.relrowsecurity FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' ORDER BY 1"),
    columns: await j("SELECT table_name, column_name, data_type, column_default, is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY 1, ordinal_position"),
    grants: await j("SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' ORDER BY 1,2,3"),
    columnGrants: await j("SELECT table_name, column_name, grantee, privilege_type FROM information_schema.column_privileges WHERE table_schema='public' ORDER BY 1,2,3,4"),
    schemas: await j("SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('information_schema','security_rollback_archive') ORDER BY 1"),
  };
}

/** Entity key per expense as the app derives it today (effectiveEntity over the stored JSON), personal = personal:<owner>. */
async function appAttribution(db: Db, owner: string) {
  await actAs(db, null);
  const eam = first(await q<{ m: EntityAccounts | null }>(db, "SELECT data->'books'->'entityAccounts' m FROM public.finance_preferences WHERE owner_id=$1", [owner])).m ?? {};
  const rows = await q<{ id: string; entity_source: "account" | "manual"; entity_id: string | null; account_id: string | null; currency: string; d: string; txn_type: string; amount: string; stored: string | null; linked: boolean }>(db,
    `SELECT e.id, e.entity_source, e.entity_id, e.account_id, e.currency, to_char(e.expense_date,'YYYY-MM') d, e.txn_type, e.amount::text amount, le.entity_key stored, e.legal_entity_id IS NOT NULL linked
     FROM public.expenses e LEFT JOIN public.legal_entities le ON le.id = e.legal_entity_id WHERE e.employee_id = $1`, [owner]);
  const app: Record<string, number> = {}; const stored: Record<string, number> = {};
  for (const r of rows) {
    const a = effectiveEntity({ entityId: r.entity_id, entitySource: r.entity_source, accountId: r.account_id }, eam) ?? PERSONAL(owner);
    const k = (ent: string) => [ent, r.account_id ?? "-", r.currency, r.d, r.txn_type].join("|");
    const cents = Math.round(Number(r.amount) * 100);
    app[k(a)] = (app[k(a)] ?? 0) + cents;
    const s = r.stored ?? "(unlinked)";
    stored[k(s)] = (stored[k(s)] ?? 0) + cents;
  }
  return { app, stored, rows };
}

const expenseLinks = async (db: Db, owner: string) => {
  await actAs(db, null);
  return Object.fromEntries((await q<{ id: string; k: string | null }>(db,
    "SELECT e.id, le.entity_key k FROM public.expenses e LEFT JOIN public.legal_entities le ON le.id = e.legal_entity_id WHERE e.employee_id=$1 ORDER BY e.id", [owner])).map((r) => [r.id, r.k]));
};
const entitiesOf = async (db: Db, owner: string) => {
  await actAs(db, null);
  return q<{ entity_key: string; kind: string; readable_id: string; archived: boolean; legal_name: string; pan: string | null; gstins: string[] }>(db,
    "SELECT entity_key, kind, readable_id, archived_at IS NOT NULL archived, legal_name, pan, gstins FROM public.legal_entities WHERE owner_id=$1 ORDER BY readable_id", [owner]);
};
type Plan = { source_sha256: string; personal: { action: string }; entities: { entity_key: string; action: string; kind: string }[]; account_assignments: { account_id: string; entity_key: string; action: string }[];
  exceptions: { code: string; severity: string; legacy_id: string | null }[]; relationship_hints: unknown[]; counts: Record<string, number>; links: Record<string, Record<string, unknown>> };
const preview = async (db: Db, owner: string, archiveOrphans = false) =>
  first(await as(db, owner, () => q<{ p: Plan }>(db, "SELECT public.preview_entity_backfill($1) p", [archiveOrphans]))).p;
const commit = async (db: Db, owner: string, sha: string, archiveOrphans = false) =>
  first(await as(db, owner, async () => { await stepUp(db, owner); return q<{ r: Record<string, unknown> }>(db, "SELECT public.commit_entity_backfill($1,$2) r", [sha, archiveOrphans]); })).r;
type Report = { status: string; balances: { identical: boolean; differences: unknown[] }; orphans: { table: string; entity_key: string; rows: number }[]; unresolved: unknown[]; counts: Record<string, unknown>; drift: Record<string, unknown> };
const report = async (db: Db, owner: string) => first(await as(db, owner, () => q<{ r: Report }>(db, "SELECT public.entity_backfill_report() r"))).r;

// ------------------------------------------------------------------------------------------
// A. Confirmed defects at 0088+P1+P2+P4, fixed by P5; writes valid today stay valid
// ------------------------------------------------------------------------------------------
describe("A. entity-aware closed periods: defects reproduced at 0088+P1+P2+P4 and fixed by P5", () => {
  let base: Db; let p5: Db; let tables: string[]; let before: Record<string, string>;
  beforeAll(async () => {
    base = await fullSchemaDb(BASE); await seed(base);
    p5 = await fullSchemaDb(BASE); await seed(p5);
    tables = await preexistingTables(p5); before = await dataSnapshot(p5, tables);
    await p5.exec(readSql(P5));
  }, T);

  const edit = (db: Db, sql: string, params: unknown[]) => attempt(db, U.O, () => q(db, sql, params));
  const closedMsg = /closed period/;

  it("0058 guard_closed_period: a company-only close blocks personal and other-company entries before P5, not after; the company's own entries stay blocked", async () => {
    const cases: { what: string; sql: string; params: unknown[]; before: "refused" | "ok"; after: "refused" | "ok" }[] = [
      { what: "personal entry in C1's closed April (amount)", sql: "UPDATE public.expenses SET amount=301 WHERE id=$1", params: [E["e3"]], before: "refused", after: "ok" },
      { what: "personal entry in C1's closed April (delete)", sql: "DELETE FROM public.expenses WHERE id=$1", params: [E["e3"]], before: "refused", after: "ok" },
      { what: "new personal entry dated in C1's closed April", sql: "INSERT INTO public.expenses(employee_id,title,merchant,category,amount,currency,expense_date,account_id) VALUES ($1,'new','Shop','General',10,'INR','2026-04-20',$2)", params: [U.O, ACC.D], before: "refused", after: "ok" },
      { what: "C2 entry in April (only C1 closed)", sql: "UPDATE public.expenses SET amount=251 WHERE id=$1", params: [E["e10"]], before: "refused", after: "ok" },
      { what: "C1 entry in C1's closed April", sql: "UPDATE public.expenses SET amount=451 WHERE id=$1", params: [E["e9"]], before: "refused", after: "refused" },
      { what: "new C1 entry in C1's closed April", sql: "INSERT INTO public.expenses(employee_id,title,merchant,category,amount,currency,expense_date,account_id) VALUES ($1,'new','Shop','General',10,'INR','2026-04-20',$2)", params: [U.O, ACC.A], before: "refused", after: "refused" },
      { what: "moving a personal April entry onto a C1 account", sql: "UPDATE public.expenses SET account_id=$2 WHERE id=$1", params: [E["e3"], ACC.A], before: "refused", after: "refused" },
      { what: "personal entry inside the all-entity 2025 close", sql: "UPDATE public.expenses SET amount=101 WHERE id=$1", params: [E["e12"]], before: "refused", after: "refused" },
      { what: "hand-picked merged company inside its closed January", sql: "UPDATE public.expenses SET amount=601 WHERE id=$1", params: [E["e8"]], before: "refused", after: "refused" },
      { what: "C1 April entry: title-only edit (not financial)", sql: "UPDATE public.expenses SET title='renamed' WHERE id=$1", params: [E["e9"]], before: "ok", after: "ok" },
      { what: "open-period edit", sql: "UPDATE public.expenses SET amount=1001 WHERE id=$1", params: [E["e1"]], before: "ok", after: "ok" },
      { what: "transfer from a C1 account to personal in March", sql: "UPDATE public.expenses SET amount=5001 WHERE id=$1", params: [E["e6"]], before: "ok", after: "ok" },
    ];
    for (const c of cases) {
      const b = await edit(base, c.sql, c.params); const a = await edit(p5, c.sql, c.params);
      expect(b.ok ? "ok" : (expect(b.error, c.what).toMatch(closedMsg), "refused"), `${c.what} at 0088+P1+P2+P4`).toBe(c.before);
      expect(a.ok ? "ok" : (expect(a.error, c.what).toMatch(closedMsg), "refused"), `${c.what} after P5`).toBe(c.after);
    }
  }, T);

  it("0083 guard_journals_rules: assets store ownerEntityId, so a company close never protected asset journals/events before P5; after P5 it does", async () => {
    const save = (db: Db, change: (d: typeof OWNER_DATA) => unknown) => attempt(db, U.O, async () => {
      const data = first(await q<{ d: typeof OWNER_DATA }>(db, "SELECT data d FROM public.finance_preferences WHERE owner_id=$1", [U.O])).d;
      change(data);
      return q(db, "UPDATE public.finance_preferences SET data=$2::jsonb WHERE owner_id=$1 RETURNING 1", [U.O, JSON.stringify(data)]);
    });
    const journal = (assetId: string, period: string) => ({ id: `j-${assetId}-${period}`, assetId, period, amount: 100, kind: "book", status: "prepared" });
    const cases: { what: string; change: (d: typeof OWNER_DATA) => unknown; before: string; after: string }[] = [
      { what: "C1 van journal in C1's closed April", change: (d) => (d.books.journals as unknown[]).push(journal("ast-van", "2026-04")), before: "ok", after: "Journal j-ast-van-2026-04 is in a closed period" },
      { what: "C1 van impairment dated in C1's closed April", change: (d) => (d.books.assetEvents as unknown[]).push({ id: "ev-imp", assetId: "ast-van", date: "2026-04-15", kind: "impairment", note: "dent", value: 5000 }), before: "ok", after: "Asset event ev-imp is in a closed period" },
      { what: "van moved to C2 in the same save as an April journal", change: (d) => { const v = d.assets[0]; if (v) Object.assign(v, { ownerEntityId: C2 }); (d.books.journals as unknown[]).push(journal("ast-van", "2026-04")); }, before: "closed period", after: "closed period" },
      { what: "editing the prepared March van journal", change: (d) => { const j = d.books.journals[0]; if (j) j.amount = 11000; }, before: "ok", after: "ok" },
      { what: "C2 rack journal in April (C2 open)", change: (d) => (d.books.journals as unknown[]).push(journal("ast-c2", "2026-04")), before: "ok", after: "ok" },
      { what: "personal laptop journal in April", change: (d) => (d.books.journals as unknown[]).push(journal("ast-laptop", "2026-04")), before: "ok", after: "ok" },
      { what: "C2 rack journal in C2's closed May", change: (d) => (d.books.journals as unknown[]).push(journal("ast-c2", "2026-05")), before: "ok", after: "is in a closed period" },
      { what: "any journal in the all-entity 2025 close", change: (d) => (d.books.journals as unknown[]).push(journal("ast-laptop", "2025-08")), before: "is in a closed period", after: "is in a closed period" },
    ];
    for (const c of cases) {
      for (const [db, want, label] of [[base, c.before, "0088+P1+P2+P4"], [p5, c.after, "after P5"]] as const) {
        const r = await save(db, c.change);
        if (want === "ok") expect(r.ok ? "ok" : r.error, `${c.what} ${label}`).toBe("ok");
        else expect(errorText(r), `${c.what} ${label}`).toContain(want);
      }
    }
  }, T);

  it("P5 changes no existing row on apply, and its replaced functions are exactly the pinned 0058/0083 originals", async () => {
    expect(await dataSnapshot(p5, tables)).toEqual(before); // the probes above all rolled back
    const saved = await q<{ sig: string }>(p5, "SELECT sig FROM phase2_p5.saved_functions ORDER BY 1");
    expect(saved.map((s) => s.sig)).toEqual(["guard_closed_period()", "guard_journals_rules()", "ll_closed_on(jsonb,text,text)"]);
    const orig = await q<{ d: string }>(base, "SELECT pg_get_functiondef(to_regprocedure(s)) d FROM unnest(ARRAY['public.guard_closed_period()','public.guard_journals_rules()','public.ll_closed_on(jsonb,text,text)']) s ORDER BY s");
    expect((await q<{ d: string }>(p5, "SELECT definition d FROM phase2_p5.saved_functions ORDER BY sig")).map((r) => r.d)).toEqual(orig.map((r) => r.d));
  }, T);
});

// ------------------------------------------------------------------------------------------
// B-E. One database, in order: preview -> commit -> idempotence -> owner-confirmed orphans -> access
//      -> dated moves -> readable numbers and joint property -> restore -> erasure
// ------------------------------------------------------------------------------------------
describe("B. previewed backfill, commit and compare report (data preservation)", () => {
  let db: Db; let tables: string[]; let D0: Record<string, string>; let plan: Plan;
  beforeAll(async () => {
    db = await fullSchemaDb(BASE); await seed(db);
    tables = await preexistingTables(db);
    D0 = await dataSnapshot(db, tables);
    await db.exec(readSql(P5));
  }, T);

  it("preview: proposed rows, exceptions and source sha256 from the raw stored JSON; labels never become entities; nothing changes", async () => {
    plan = await preview(db, U.O);
    expect(plan.personal.action).toBe("create");
    expect(plan.entities.map((e) => [e.entity_key, e.kind, e.action])).toEqual([[C1, "company", "create"], [C2, "llp", "create"], [INTAKE, "proprietorship", "create"]]);
    expect(plan.account_assignments.map((a) => [a.account_id, a.entity_key, a.action]).sort()).toEqual([[ACC.A, C1, "create"], [ACC.B, C1, "create"], [ACC.C, C2, "create"]]);
    const codes = plan.exceptions.map((e) => `${e.code}:${e.severity}:${e.legacy_id ?? ""}`);
    expect(codes).toContain(`orphan_entity_reference:error:${CDEL}`);
    expect(codes).toContain(`orphan_entity_reference:error:${COLD}`);
    expect(codes).toContain(`intake_run_entity_key:info:${INTAKE}`);
    expect(plan.relationship_hints).toHaveLength(1); // C1 shareholding names: listed, never linked
    expect(plan.counts).toMatchObject({ source_entities: 3, entities_to_create: 4, assignments_to_create: 3, errors: 2 });
    // Me/Family/Business labels, Organisation: tags, reimbursement profiles and trip organisations are never companies
    const text = JSON.stringify(plan);
    for (const label of ["VEI", "MOVAC", "KR Enterprises", "business"]) expect(text).not.toContain(label);
    const sha = first(await q<{ h: string }>(db, `SELECT encode(sha256(convert_to(jsonb_build_object('entities', data->'entities', 'entityAccounts', data->'books'->'entityAccounts')::text, 'UTF8')), 'hex') h
      FROM public.finance_preferences WHERE owner_id=$1`, [U.O])).h;
    expect(plan.source_sha256).toBe(sha);
    expect(await dataSnapshot(db, tables)).toEqual(D0);
  }, T);

  it("commit is refused without step-up, for an assistant with step-up, for anonymous guests and when the source changed since the preview", async () => {
    const call = () => q(db, "SELECT public.commit_entity_backfill($1,false)", [plan.source_sha256]);
    expect(errorText(await attempt(db, U.O, call))).toBe("STEP_UP_REQUIRED: commit_entity_backfill");
    expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return call(); }, { clientId: MCP }))).toBe("STEP_UP_REQUIRED: commit_entity_backfill");
    const changed = await attempt(db, U.O, async () => {
      await q(db, "UPDATE public.finance_preferences SET data = jsonb_set(data, '{books,entityAccounts}', $2::jsonb) WHERE owner_id=$1", [U.O, JSON.stringify({ [C1]: [ACC.A], [C2]: [ACC.C, ACC.B] })]);
      await stepUp(db, U.O); return call();
    });
    expect(errorText(changed)).toMatch(/^BACKFILL_SOURCE_CHANGED/);
    expect(errorText(await attempt(db, U.X, async () => { await stepUp(db, U.X); return call(); }, { anon: true }))).toBe("Sign in with your account to link companies");
    expect(await dataSnapshot(db, tables)).toEqual(D0);
  }, T);

  it("commit: creates the personal entity first, then entities in stored order with ENT numbers in the owner's personal scope; links rows; changes no existing value", async () => {
    const auditBefore = first(await q<{ n: number }>(db, "SELECT count(*)::int n FROM public.transaction_audit")).n;
    const r = await commit(db, U.O, plan.source_sha256);
    expect(r["created"]).toEqual({ legal_entities: 4, account_assignments: 3 });
    expect(r["linked"]).toEqual({ expenses: 11, documents: 3, opening_postings: 1 });
    expect(r["failed_rows"]).toEqual([]);
    expect((await entitiesOf(db, U.O)).map((e) => [e.entity_key, e.kind, e.readable_id, e.archived])).toEqual([
      [PERSONAL(U.O), "individual_personal", "ENT-000001", false], [C1, "company", "ENT-000002", false], [C2, "llp", "ENT-000003", false], [INTAKE, "proprietorship", "ENT-000004", false]]);
    const c1 = (await entitiesOf(db, U.O)).find((e) => e.entity_key === C1);
    expect(c1).toMatchObject({ legal_name: "Alpha Traders Pvt Ltd", pan: "AAACA1234A", gstins: ["29AAACA1234A1Z5"] });
    const src = first(await q<{ s: Record<string, unknown> }>(db, "SELECT source s FROM public.legal_entities WHERE owner_id=$1 AND entity_key=$2", [U.O, C1])).s;
    expect(src).toMatchObject({ from: "finance_preferences", path: "entities[0]", legacy_id: C1, source_sha256: plan.source_sha256 });
    expect(String(src["element_sha256"])).toMatch(/^[0-9a-f]{64}$/);
    expect(await expenseLinks(db, U.O)).toEqual({
      [must(E["e1"])]: C1, [must(E["e2"])]: C2, [must(E["e3"])]: PERSONAL(U.O), [must(E["e4"])]: null, [must(E["e5"])]: C2, [must(E["e6"])]: C1, [must(E["e7"])]: C1,
      [must(E["e8"])]: null, [must(E["e9"])]: C1, [must(E["e10"])]: C2, [must(E["e11"])]: C1, [must(E["e12"])]: PERSONAL(U.O), [must(E["e13"])]: PERSONAL(U.O) });
    const docLinks = await q<{ id: string; k: string | null }>(db, "SELECT d.id, le.entity_key k FROM public.documents d LEFT JOIN public.legal_entities le ON le.id=d.legal_entity_id WHERE d.owner_id=$1 ORDER BY d.id", [U.O]);
    expect(docLinks.map((d) => d.k)).toEqual([C1, PERSONAL(U.O), null, INTAKE]);
    // every pre-existing value identical (incl. correction_revision, entity_id text, JSON, storage paths); no audit rows written
    expect(await dataSnapshot(db, tables)).toEqual(D0);
    expect(first(await q<{ n: number }>(db, "SELECT count(*)::int n FROM public.transaction_audit")).n).toBe(auditBefore);
    // the other owner is untouched
    expect(await entitiesOf(db, U.V)).toEqual([]);
    expect(Object.values(await expenseLinks(db, U.V))).toEqual([null, null]);
  }, T);

  it("compare report: unresolved deleted/merged companies are reported, not guessed; balances of every linked row are identical", async () => {
    const r = await report(db, U.O);
    expect(r.status).toBe("differences");
    expect(r.orphans).toEqual([
      { table: "documents", entity_key: CDEL, rows: 1 }, { table: "expenses", entity_key: COLD, rows: 1 }, { table: "expenses", entity_key: CDEL, rows: 1 }, { table: "opening_postings", entity_key: CDEL, rows: 1 }]);
    expect(r.unresolved).toEqual([{ table: "documents", rows: 1 }, { table: "expenses", rows: 2 }, { table: "opening_postings", rows: 1 }]);
    // the only balance differences are the two unresolved orphan rows
    expect((r.balances.differences as { key: string }[]).map((d) => d.key.split("|")[0])).toEqual(["(unlinked)", "(unlinked)", COLD, CDEL]);
  }, T);

  it("re-commit with the same preview is idempotent: nothing created, no number spent, no value changed", async () => {
    const before = await entitiesOf(db, U.O);
    const counters = await q(db, "SELECT * FROM public.readable_id_counters ORDER BY 1,2,3");
    const again = await preview(db, U.O);
    expect(again.source_sha256).toBe(plan.source_sha256);
    expect(again.personal.action).toBe("exists");
    expect(again.entities.map((e) => e.action)).toEqual(["exists", "exists", "exists"]);
    const r = await commit(db, U.O, again.source_sha256);
    expect(r["created"]).toEqual({ legal_entities: 0, account_assignments: 0 });
    expect(r["linked"]).toEqual({ expenses: 0, documents: 0, opening_postings: 0 });
    expect(await entitiesOf(db, U.O)).toEqual(before);
    expect(await q(db, "SELECT * FROM public.readable_id_counters ORDER BY 1,2,3")).toEqual(counters);
    expect(first(await q<{ n: number }>(db, "SELECT count(*)::int n FROM public.readable_id_registry WHERE owner_id=$1", [U.O])).n).toBe(4);
    expect(first(await q<{ n: number }>(db, "SELECT count(*)::int n FROM public.legacy_backfill_runs WHERE owner_id=$1", [U.O])).n).toBe(2);
    expect(await dataSnapshot(db, tables)).toEqual(D0);
  }, T);

  it("owner-confirmed orphans become archived 'unknown legacy' entities; report then matches with zero orphans and identical balances", async () => {
    const p = await preview(db, U.O, true);
    expect(p.exceptions.filter((e) => e.code === "orphan_entity_reference").map((e) => e.severity)).toEqual(["warning", "warning"]);
    const r = await commit(db, U.O, p.source_sha256, true);
    expect(r["created"]).toEqual({ legal_entities: 2, account_assignments: 0 });
    expect(r["linked"]).toEqual({ expenses: 2, documents: 1, opening_postings: 1 });
    const ents = await entitiesOf(db, U.O);
    expect(ents.filter((e) => e.kind === "legacy_unknown").map((e) => [e.entity_key, e.archived]).sort()).toEqual([[COLD, true], [CDEL, true]]);
    expect(ents.slice(0, 4).map((e) => e.readable_id)).toEqual(["ENT-000001", "ENT-000002", "ENT-000003", "ENT-000004"]); // never renumbered
    const rep = await report(db, U.O);
    expect(rep).toMatchObject({ status: "match", orphans: [], unresolved: [] });
    expect(rep.balances.identical).toBe(true);
    expect(await dataSnapshot(db, tables)).toEqual(D0);
  }, T);

  it("independent check with the app's own effectiveEntity: balances per entity/account/currency/month/type are identical before and after", async () => {
    const { app, stored, rows } = await appAttribution(db, U.O);
    expect(rows.every((r) => r.linked)).toBe(true);
    expect(stored).toEqual(app);
    expect(Object.keys(app).length).toBeGreaterThan(8);
  }, T);

  // ----------------------------------------------------------------------------------------
  // C. Access
  // ----------------------------------------------------------------------------------------
  it("C. cross-tenant: another owner sees, links and commits nothing of O's; same text key under another owner is a different entity", async () => {
    const seen = await as(db, U.V, () => q<{ n: number }>(db, "SELECT count(*)::int n FROM public.legal_entities WHERE owner_id=$1", [U.O]));
    expect(first(seen).n).toBe(0);
    for (const t of ["account_entity_assignments", "legacy_backfill_runs", "readable_id_registry"]) {
      expect(first(await as(db, U.V, () => q<{ n: number }>(db, `SELECT count(*)::int n FROM public.${t} WHERE owner_id=$1`, [U.O]))).n, t).toBe(0);
    }
    const o1 = first(await q<{ id: string }>(db, "SELECT id FROM public.legal_entities WHERE owner_id=$1 AND entity_key=$2", [U.O, C1])).id;
    expect(errorText(await attempt(db, U.V, async () => { await stepUp(db, U.V); return q(db, "SELECT public.reassign_account_entity($1,$2,'2026-07-01','takeover')", [ACC.A, o1]); }))).toBe("Account not found");
    expect(errorText(await attempt(db, U.V, async () => { await stepUp(db, U.V); return q(db, "SELECT public.archive_legal_entity($1,'take it')", [o1]); }))).toBe("Legal entity not found");
    // V's own backfill touches only V; V's C1 is its own row with its own ENT numbering
    const vp = await preview(db, U.V);
    expect(JSON.stringify(vp)).not.toContain(U.O);
    await commit(db, U.V, vp.source_sha256);
    expect((await entitiesOf(db, U.V)).map((e) => [e.entity_key, e.readable_id])).toEqual([[PERSONAL(U.V), "ENT-000001"], [C1, "ENT-000002"]]);
    const keys = await q<{ owner_id: string; id: string }>(db, "SELECT owner_id, id FROM public.legal_entities WHERE entity_key=$1 ORDER BY owner_id", [C1]);
    expect(keys).toHaveLength(2);
    expect(Object.values(await expenseLinks(db, U.V))).toEqual([PERSONAL(U.V), C1]);
    expect(await expenseLinks(db, U.O)).not.toHaveProperty(id(1101));
    // a client cannot point a row at another owner's entity (trigger recomputes; FK is owner-composite)
    const forged = await attempt(db, U.V, async () => {
      await q(db, "UPDATE public.expenses SET legal_entity_id=$2 WHERE id=$1", [id(1101), o1]);
      return first(await q<{ k: string }>(db, "SELECT le.entity_key k FROM public.expenses e JOIN public.legal_entities le ON le.id=e.legal_entity_id WHERE e.id=$1", [id(1101)])).k;
    });
    expect(forged).toEqual({ ok: true, value: PERSONAL(U.V) });
  }, T);

  it("C. a P2 grantee of C1 reads exactly C1 (never personal, other companies or backfill history); a stranger reads nothing", async () => {
    const g = await as(db, U.G, () => q<{ entity_key: string }>(db, "SELECT entity_key FROM public.legal_entities ORDER BY 1"));
    expect(g.map((r) => r.entity_key)).toEqual([C1]);
    const ga = await as(db, U.G, () => q<{ account_id: string }>(db, "SELECT account_id FROM public.account_entity_assignments ORDER BY 1"));
    expect(ga.map((r) => r.account_id)).toEqual([ACC.A, ACC.B]);
    expect(await as(db, U.G, () => q(db, "SELECT 1 FROM public.legacy_backfill_runs"))).toEqual([]);
    expect(await as(db, U.G, () => q(db, "SELECT 1 FROM public.readable_id_registry"))).toEqual([]);
    for (const t of ["legal_entities", "account_entity_assignments", "legacy_backfill_runs", "readable_id_registry", "record_ownerships", "register_records", "entity_relationships"]) {
      expect(await as(db, U.X, () => q(db, `SELECT 1 FROM public.${t}`)), t).toEqual([]);
    }
  }, T);

  it("C. assistant sessions read their owner's rows but every P5 writer and table write is refused; no client can hard-delete or edit history", async () => {
    expect((await as(db, U.O, () => q(db, "SELECT 1 FROM public.legal_entities"), { clientId: MCP })).length).toBe(6);
    expect(errorText(await attempt(db, U.O, () => q(db, "SELECT public.preview_entity_backfill(false)"), { clientId: MCP }))).toBe("ASSISTANT_READ_ONLY: preview_entity_backfill");
    expect(errorText(await attempt(db, U.O, () => q(db, "SELECT public.entity_backfill_report()"), { clientId: MCP }))).toBe("ASSISTANT_READ_ONLY: entity_backfill_report");
    const pe = first(await q<{ id: string }>(db, "SELECT id FROM public.legal_entities WHERE owner_id=$1 AND kind='individual_personal'", [U.O])).id;
    const c1 = first(await q<{ id: string }>(db, "SELECT id FROM public.legal_entities WHERE owner_id=$1 AND entity_key=$2", [U.O, C1])).id;
    const bot = (sql: string, params: unknown[]) => attempt(db, U.O, async () => { await stepUp(db, U.O); return q(db, sql, params); }, { clientId: MCP });
    expect(errorText(await bot("SELECT public.register_shared_record('property',$1,'x',NULL)", [c1]))).toBe("ASSISTANT_READ_ONLY: register_shared_record");
    expect(errorText(await bot("SELECT public.record_entity_relationship($1,$2,'shareholder',60,NULL,NULL,NULL)", [pe, c1]))).toBe("ASSISTANT_READ_ONLY: record_entity_relationship");
    expect(errorText(await bot("SELECT public.reassign_account_entity($1,$2,'2026-07-01','x y z')", [ACC.D, c1]))).toBe("STEP_UP_REQUIRED: reassign_account_entity");
    // direct table writes: no privilege for any client; even an owner session
    for (const sql of ["DELETE FROM public.legal_entities WHERE owner_id=$1", "UPDATE public.legal_entities SET legal_name='x' WHERE owner_id=$1",
      "DELETE FROM public.account_entity_assignments WHERE owner_id=$1", "DELETE FROM public.readable_id_registry WHERE owner_id=$1", "DELETE FROM public.legacy_backfill_runs WHERE owner_id=$1"]) {
      expect(errorText(await attempt(db, U.O, () => q(db, sql, [U.O]))), sql).toMatch(/permission denied/);
    }
    expect(errorText(await attempt(db, U.O, () => q(db, "INSERT INTO public.legal_entities(owner_id, entity_key, kind, readable_id) VALUES ($1,'new','company','ENT-000099')", [U.O])))).toMatch(/permission denied/);
    // the identity/history guards hold for every role, also the table owner
    expect(errorText(await attempt(db, null, () => q(db, "UPDATE public.legal_entities SET legal_name='renamed' WHERE id=$1", [c1])))).toMatch(/identity is fixed/);
    expect(errorText(await attempt(db, null, () => q(db, "DELETE FROM public.legal_entities WHERE id=$1", [c1])))).toMatch(/never deleted/);
    expect(errorText(await attempt(db, null, () => q(db, "UPDATE public.legal_entities SET readable_id='ENT-000777' WHERE id=$1", [c1])))).toMatch(/READABLE_ID_IMMUTABLE/);
    expect(errorText(await attempt(db, null, () => q(db, "DELETE FROM public.legacy_backfill_runs")))).toMatch(/append-only/);
    // a revoked assistant loses reads on the new tables at once (P4 RESTRICTIVE policy added by P5)
    const revoked = await attempt(db, U.O, async () => {
      await stepUp(db, U.O); await q(db, "SELECT public.revoke_assistant_client($1)", [MCP]);
      await q(db, "SELECT set_config('test.client_id', $1, false)", [MCP]);
      const out: Record<string, number> = {};
      for (const t of ["legal_entities", "account_entity_assignments", "legacy_backfill_runs", "readable_id_registry", "register_records", "record_ownerships"]) out[t] = (await q(db, `SELECT 1 FROM public.${t}`)).length;
      return out;
    });
    expect(revoked).toEqual({ ok: true, value: { legal_entities: 0, account_entity_assignments: 0, legacy_backfill_runs: 0, readable_id_registry: 0, register_records: 0, record_ownerships: 0 } });
  }, T);

  it("C. explicit relationships only (never inferred from names): recorded, ended once, visible to the company's grantee", async () => {
    const ent = async (k: string) => first(await q<{ id: string }>(db, "SELECT id FROM public.legal_entities WHERE owner_id=$1 AND entity_key=$2", [U.O, k])).id;
    expect(first(await q<{ n: number }>(db, "SELECT count(*)::int n FROM public.entity_relationships")).n).toBe(0); // shareholding names were only hints
    const rel = await as(db, U.O, async () => first(await q<{ r: string }>(db, "SELECT public.record_entity_relationship($1,$2,'shareholder',60,'2024-04-01',NULL,'Board resolution 3/2024') r", [await ent(PERSONAL(U.O)), await ent(C1)])).r);
    const vPersonal = first(await q<{ id: string }>(db, "SELECT id FROM public.legal_entities WHERE owner_id=$1 AND kind='individual_personal'", [U.V])).id;
    const c1 = await ent(C1);
    expect(errorText(await attempt(db, U.O, () => q(db, "SELECT public.record_entity_relationship($1,$2,'shareholder',10,NULL,NULL,NULL)", [c1, vPersonal])))).toMatch(/Both entities must be your active legal entities/);
    await as(db, U.O, () => q(db, "SELECT public.end_entity_relationship($1,'2026-04-01')", [rel]));
    expect(errorText(await attempt(db, U.O, () => q(db, "SELECT public.end_entity_relationship($1,'2026-05-01')", [rel])))).toMatch(/Open relationship not found/);
    expect((await as(db, U.G, () => q<{ pct: string }>(db, "SELECT pct::text FROM public.entity_relationships"))).map((r) => r.pct)).toEqual(["60.000000"]);
    expect(await as(db, U.X, () => q(db, "SELECT 1 FROM public.entity_relationships"))).toEqual([]);
  }, T);

  // ----------------------------------------------------------------------------------------
  // D. Dated account moves, link trigger, conservative dual-read period check
  // ----------------------------------------------------------------------------------------
  it("D. moving an account keeps earlier entries in the old company; overlaps, closed periods and unfrozen legacy links are refused", async () => {
    const ent = async (k: string) => first(await q<{ id: string }>(db, "SELECT id FROM public.legal_entities WHERE owner_id=$1 AND entity_key=$2", [U.O, k])).id;
    const c1 = await ent(C1); const c2 = await ent(C2);
    const move = (acc: string, to: string, from: string) => q(db, "SELECT public.reassign_account_entity($1,$2,$3,'Account moved to Beta') r", [acc, to, from]);
    expect(errorText(await attempt(db, U.O, () => move(ACC.B, c2, "2026-06-01")))).toBe("STEP_UP_REQUIRED: reassign_account_entity");
    expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return move(ACC.A, c2, "2026-04-01"); }))).toMatch(/^REASSIGN_CLOSED_PERIOD/);
    await as(db, U.O, async () => { await stepUp(db, U.O); await move(ACC.B, c2, "2026-06-01"); });
    const links = await expenseLinks(db, U.O);
    expect([links[must(E["e7"])], links[must(E["e11"])]]).toEqual([C1, C2]); // March stays Alpha, June moves to Beta
    const ranges = await q<{ k: string; f: string; t: string | null }>(db, `SELECT le.entity_key k, a.valid_from::text f, a.valid_to::text t FROM public.account_entity_assignments a
      JOIN public.legal_entities le ON le.id=a.entity_id WHERE a.account_id=$1 ORDER BY a.valid_from`, [ACC.B]);
    expect(ranges).toEqual([{ k: C1, f: "-infinity", t: "2026-06-01" }, { k: C2, f: "2026-06-01", t: null }]);
    // a new June entry on the moved account belongs to Beta; a back-dated March entry to Alpha
    const added = await attempt(db, U.O, async () => {
      for (const [n, d] of [[9001, "2026-06-15"], [9002, "2026-03-05"]] as const) await q(db, "INSERT INTO public.expenses(id,employee_id,title,merchant,category,amount,currency,expense_date,account_id) VALUES ($1,$2,'n','Shop','General',5,'INR',$3,$4)", [id(n), U.O, d, ACC.B]);
      return (await q<{ k: string }>(db, "SELECT le.entity_key k FROM public.expenses e JOIN public.legal_entities le ON le.id=e.legal_entity_id WHERE e.id IN ($1,$2) ORDER BY e.expense_date DESC", [id(9001), id(9002)])).map((r) => r.k);
    });
    expect(added).toEqual({ ok: true, value: [C2, C1] });
    // overlap (every role, incl. definer code and the table owner)
    expect(errorText(await attempt(db, null, () => q(db, "INSERT INTO public.account_entity_assignments(owner_id,account_id,entity_id,valid_from,reason) VALUES ($1,$2,$3,'2026-07-01','overlap test')", [U.O, ACC.B, c1])))).toMatch(/^ASSIGNMENT_OVERLAP/);
    expect(errorText(await attempt(db, null, () => q(db, "UPDATE public.account_entity_assignments SET valid_from='2020-01-01' WHERE account_id=$1", [ACC.B])))).toMatch(/closed once/);
    expect(errorText(await attempt(db, null, () => q(db, "DELETE FROM public.account_entity_assignments WHERE account_id=$1", [ACC.B])))).toMatch(/history/);
    // an account listed under two companies in the legacy JSON is never linked and cannot be moved before review
    const twice = await attempt(db, U.O, async () => {
      await q(db, "UPDATE public.finance_preferences SET data = jsonb_set(data, '{books,entityAccounts}', $2::jsonb) WHERE owner_id=$1", [U.O, JSON.stringify({ [C1]: [ACC.A, ACC.B, ACC.D], [C2]: [ACC.C, ACC.D] })]);
      const p = first(await q<{ p: Plan }>(db, "SELECT public.preview_entity_backfill(false) p")).p;
      const e = first(await q<{ id: string; l: string | null }>(db, "INSERT INTO public.expenses(employee_id,title,merchant,category,amount,currency,expense_date,account_id) VALUES ($1,'n','Shop','General',5,'INR','2026-03-28',$2) RETURNING id, legal_entity_id l", [U.O, ACC.D]));
      await stepUp(db, U.O);
      return { codes: p.exceptions.map((x) => x.code).filter((c) => c === "account_linked_twice").length, link: e.l, move: await errorOf(db, () => move(ACC.D, c1, "2026-07-01")) };
    });
    expect(twice).toMatchObject({ ok: true, value: { codes: 2, link: null } });
    expect(twice.ok ? twice.value.move : "").toMatch(/^REASSIGN_NEEDS_BACKFILL/);
  }, T);

  it("D. dual-read: when the app moves an account in the legacy JSON after the backfill, the closed-period check honours BOTH links (never weaker than 0058)", async () => {
    const edit = (jsonMove: boolean) => attempt(db, U.O, async () => {
      if (jsonMove) await q(db, "UPDATE public.finance_preferences SET data = jsonb_set(data, '{books,entityAccounts}', $2::jsonb) WHERE owner_id=$1", [U.O, JSON.stringify({ [C1]: [ACC.A, ACC.C] })]);
      return q(db, "UPDATE public.expenses SET amount=252 WHERE id=$1", [E["e10"]]);
    });
    expect((await edit(false)).ok).toBe(true); // Beta in April: open
    expect(errorText(await edit(true))).toMatch(/closed period/); // app now says Alpha (closed April): refused although the frozen link says Beta
  }, T);

  it("D. the link trigger never blocks a write valid today: unknown keys stay NULL, workspace labels stay personal, archived companies keep their history", async () => {
    const r = await attempt(db, U.O, async () => {
      const ins = async (manual: string | null, acc: string, scope = "personal", tags: string[] = []) => first(await q<{ l: string | null }>(db,
        "INSERT INTO public.expenses(employee_id,title,merchant,category,amount,currency,expense_date,account_id,entity_source,entity_id,scope,tags) VALUES ($1,'n','Shop','General',5,'INR','2026-03-28',$2,$3,$4,$5,$6) RETURNING (SELECT entity_key FROM public.legal_entities WHERE id=legal_entity_id) l",
        [U.O, acc, manual ? "manual" : "account", manual, scope, tags])).l;
      return { unknown: await ins("never-seen-company", ACC.D), business: await ins(null, ACC.D, "business", ["Organisation: VEI"]), merged: await ins(COLD, ACC.D), manual: await ins(C2, ACC.A) };
    });
    expect(r).toEqual({ ok: true, value: { unknown: null, business: PERSONAL(U.O), merged: COLD, manual: C2 } });
  }, T);

  it("D. archive, never delete: personal books cannot be archived; a company with open accounts must move them first; numbers stay", async () => {
    const ent = async (k: string) => first(await q<{ id: string }>(db, "SELECT id FROM public.legal_entities WHERE owner_id=$1 AND entity_key=$2", [U.O, k])).id;
    const arch = (eid: string) => attempt(db, U.O, async () => { await stepUp(db, U.O); return q(db, "SELECT public.archive_legal_entity($1,'Business closed')", [eid]); });
    expect(errorText(await arch(await ent(PERSONAL(U.O))))).toMatch(/Personal books cannot be archived/);
    expect(errorText(await arch(await ent(C2)))).toMatch(/Move this entity's accounts first/);
    expect(errorText(await attempt(db, U.O, async () => q(db, "SELECT public.archive_legal_entity($1,'Business closed')", [await ent(INTAKE)])))).toBe("STEP_UP_REQUIRED: archive_legal_entity");
    await as(db, U.O, async () => { await stepUp(db, U.O); await q(db, "SELECT public.archive_legal_entity($1,'Business closed')", [await ent(INTAKE)]); });
    const g = first(await q<{ readable_id: string; archived: boolean }>(db, "SELECT readable_id, archived_at IS NOT NULL archived FROM public.legal_entities WHERE owner_id=$1 AND entity_key=$2", [U.O, INTAKE]));
    expect(g).toEqual({ readable_id: "ENT-000004", archived: true });
    const docLink = first(await q<{ k: string }>(db, "SELECT le.entity_key k FROM public.documents d JOIN public.legal_entities le ON le.id=d.legal_entity_id WHERE d.id=$1", [DOC.intake])).k;
    expect(docLink).toBe(INTAKE);
  }, T);

  // ----------------------------------------------------------------------------------------
  // E. Readable numbers (scope-local) and one joint property with dated shares
  // ----------------------------------------------------------------------------------------
  it("E. readable numbers are issued per legal-entity scope: two companies each start at 0001; never reused after archive; a restore claim keeps its number", async () => {
    const ent = async (o: string, k: string) => first(await q<{ id: string }>(db, "SELECT id FROM public.legal_entities WHERE owner_id=$1 AND entity_key=$2", [o, k])).id;
    const c1 = await ent(U.O, C1); const c2 = await ent(U.O, C2); const vc1 = await ent(U.V, C1);
    const reg = (o: string, kind: string, e: string, label: string, legacy: string | null = null) =>
      as(db, o, async () => first(await q<{ r: string }>(db, "SELECT public.register_shared_record($1,$2,$3,$4) r", [kind, e, label, legacy])).r);
    const rid = async (rec: string) => first(await q<{ r: string }>(db, "SELECT readable_id r FROM public.register_records WHERE id=$1", [rec])).r;
    const a1 = await reg(U.O, "asset", c1, "Alpha laptop", "ast-laptop-legacy");
    const a2 = await reg(U.O, "asset", c2, "Beta laptop");
    const p1 = await reg(U.O, "property", c1, "Alpha warehouse");
    const p2 = await reg(U.O, "property", c2, "Beta office");
    const v1 = await reg(U.V, "asset", vc1, "Vee printer");
    expect([await rid(a1), await rid(a2), await rid(p1), await rid(p2), await rid(v1)]).toEqual(["AST-000001", "AST-000001", "PRP-0001", "PRP-0001", "AST-000001"]);
    // idempotent per legacy id: re-importing the same legacy asset creates nothing and keeps the number
    expect(await reg(U.O, "asset", c1, "Alpha laptop again", "ast-laptop-legacy")).toBe(a1);
    // archived numbers are never handed out again
    expect(errorText(await attempt(db, U.O, () => q(db, "SELECT public.archive_register_record($1,'Sold')", [a1])))).toBe("STEP_UP_REQUIRED: archive_register_record");
    await as(db, U.O, async () => { await stepUp(db, U.O); await q(db, "SELECT public.archive_register_record($1,'Sold')", [a1]); });
    expect(await rid(a1)).toBe("AST-000001");
    expect(await rid(await reg(U.O, "asset", c1, "Alpha phone"))).toBe("AST-000002");
    // restore/import path: a record restored with its number keeps it; another record cannot take a used number; the counter moves past a claimed one
    const restoreAs = (rec: string, num: string) => attempt(db, null, () => q(db, "INSERT INTO public.register_records(id, owner_id, record_kind, legal_entity_id, readable_id, label) VALUES ($1,$2,'asset',$3,$4,'restored')", [rec, U.O, c1, num]));
    expect(errorText(await restoreAs(id(7001), "AST-000001"))).toMatch(/^READABLE_ID_TAKEN/);
    expect(errorText(await restoreAs(id(7001), "AST-2026-000001"))).toMatch(/^READABLE_ID_INVALID/);
    await actAs(db, null);
    await q(db, "INSERT INTO public.register_records(id, owner_id, record_kind, legal_entity_id, readable_id, label) VALUES ($1,$2,'asset',$3,'AST-000009','restored')", [id(7002), U.O, c1]);
    expect(await rid(await reg(U.O, "asset", c1, "Alpha tablet"))).toBe("AST-000010");
    expect(errorText(await attempt(db, null, () => q(db, "UPDATE public.register_records SET readable_id='AST-000050' WHERE id=$1", [a2])))).toMatch(/READABLE_ID_IMMUTABLE/);
    expect(errorText(await attempt(db, null, () => q(db, "DELETE FROM public.register_records WHERE id=$1", [a2])))).toMatch(/never deleted/);
    // the generic trigger on a register without a scope yet: no number until linked, then issued in that scope and kept when the scope changes
    const unlinked = await attempt(db, null, async () => {
      await q(db, "CREATE TABLE public.zz_probe_trips(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL, legal_entity_id uuid, readable_id text, created_at timestamptz NOT NULL DEFAULT '2026-11-09T10:00:00+05:30')");
      await q(db, "CREATE TRIGGER a_assign_readable_id BEFORE INSERT OR UPDATE ON public.zz_probe_trips FOR EACH ROW EXECUTE FUNCTION public.assign_readable_id('TRP')");
      const t1 = first(await q<{ id: string; r: string | null }>(db, "INSERT INTO public.zz_probe_trips(owner_id) VALUES ($1) RETURNING id, readable_id r", [U.O]));
      const linked = first(await q<{ r: string }>(db, "UPDATE public.zz_probe_trips SET legal_entity_id=$2 WHERE id=$1 RETURNING readable_id r", [t1.id, c2])).r;
      const moved = first(await q<{ r: string }>(db, "UPDATE public.zz_probe_trips SET legal_entity_id=$2 WHERE id=$1 RETURNING readable_id r", [t1.id, c1])).r;
      const t2 = first(await q<{ r: string }>(db, "INSERT INTO public.zz_probe_trips(owner_id, legal_entity_id) VALUES ($1,$2) RETURNING readable_id r", [U.O, c2])).r;
      const noScope = await errorOf(db, () => q(db, "INSERT INTO public.zz_probe_trips(owner_id, readable_id) VALUES ($1,'TRP-2026-0007')", [U.O]));
      return { before: t1.r, linked, moved, t2, noScope };
    });
    expect(unlinked).toEqual({ ok: true, value: { before: null, linked: "TRP-2026-0001", moved: "TRP-2026-0001", t2: "TRP-2026-0002", noScope: expect.stringMatching(/^READABLE_ID_NEEDS_SCOPE/) } });
    // format_readable_id never wraps: width is a minimum
    expect(first(await q<{ f: string }>(db, "SELECT public.format_readable_id('TRP', 2026, 10000) f")).f).toBe("TRP-2026-10000");
  }, T);

  it("E. one jointly owned property keeps ONE id and number; two owners' shares over time; >100% and overlaps refused; consent and visibility", async () => {
    const ent = async (o: string, k: string) => first(await q<{ id: string }>(db, "SELECT id FROM public.legal_entities WHERE owner_id=$1 AND entity_key=$2", [o, k])).id;
    const jp = await commit(db, U.J, (await preview(db, U.J)).source_sha256);
    expect(jp["created"]).toEqual({ legal_entities: 2, account_assignments: 0 });
    const c1 = await ent(U.O, C1); const oPersonal = await ent(U.O, PERSONAL(U.O)); const jc = await ent(U.J, JC);
    const prop = await as(db, U.O, async () => first(await q<{ r: string }>(db, "SELECT public.register_shared_record('property',$1,'Plot 12, Whitefield','prop-flat') r", [c1])).r);
    const share = (who: string, rec: string, e: string, pct: number, from: string) => as(db, who, async () => { await stepUp(db, who);
      return first(await q<{ r: string }>(db, "SELECT public.record_ownership_share($1,$2,$3,$4,NULL,NULL) r", [rec, e, pct, from])).r; });
    const tryShare = (who: string, rec: string, e: string, pct: number, from: string) => attempt(db, who, async () => { await stepUp(db, who); return q(db, "SELECT public.record_ownership_share($1,$2,$3,$4,NULL,NULL)", [rec, e, pct, from]); });
    const decide = (rowId: string, ok: boolean) => as(db, U.O, async () => { await stepUp(db, U.O); await q(db, "SELECT public.decide_ownership_share($1,$2)", [rowId, ok]); });
    expect(errorText(await attempt(db, U.O, () => q(db, "SELECT public.record_ownership_share($1,$2,50,'2024-01-01',NULL,NULL)", [prop, c1])))).toBe("STEP_UP_REQUIRED: record_ownership_share");
    await share(U.O, prop, c1, 50, "2024-01-01");                 // administrator's own entity: confirmed at once
    const jRow = await share(U.J, prop, jc, 50, "2024-01-01");     // co-owner's entity: pending until the administrator confirms
    expect(first(await q<{ s: string }>(db, "SELECT status s FROM public.record_ownerships WHERE id=$1", [jRow])).s).toBe("pending");
    expect(await as(db, U.J, () => q(db, "SELECT 1 FROM public.register_records WHERE id=$1", [prop]))).toEqual([]); // not visible before confirmation
    await decide(jRow, true);
    // nobody can put someone else's entity on a record, and a stranger cannot block it (pending is not counted) or read it
    expect(errorText(await tryShare(U.O, prop, jc, 10, "2025-01-01"))).toMatch(/one of your active legal entities/);
    const xp = await commit(db, U.X, (await preview(db, U.X)).source_sha256);
    expect(xp["created"]).toEqual({ legal_entities: 1, account_assignments: 0 });
    const xRow = await share(U.X, prop, await ent(U.X, PERSONAL(U.X)), 100, "2024-01-01");
    expect(await as(db, U.X, () => q(db, "SELECT 1 FROM public.register_records WHERE id=$1", [prop]))).toEqual([]);
    expect((await as(db, U.X, () => q(db, "SELECT 1 FROM public.record_ownerships WHERE record_id=$1", [prop]))).length).toBe(1); // only its own request
    await decide(xRow, false);
    // J sells its half on 2026-01-01; O's personal books buy it from that date
    expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return q(db, "SELECT public.end_ownership_share($1,'2026-01-01')", [jRow]); }))).toBe("Open ownership share not found");
    await as(db, U.J, async () => { await stepUp(db, U.J); await q(db, "SELECT public.end_ownership_share($1,'2026-01-01')", [jRow]); });
    await share(U.O, prop, oPersonal, 50, "2026-01-01");
    // > 100%: J asks for 10% again from mid-2026; confirming it is refused
    const extra = await share(U.J, prop, jc, 10, "2026-06-01");
    expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return q(db, "SELECT public.decide_ownership_share($1,true)", [extra]); }))).toMatch(/^OWNERSHIP_OVER_100: shares of this record would total 110/);
    expect(errorText(await tryShare(U.O, prop, oPersonal, 60, "2025-06-01"))).toMatch(/^OWNERSHIP_OVERLAP/);   // overlaps its own 2026 share
    expect(errorText(await tryShare(U.O, prop, c1, 10, "2027-01-01"))).toMatch(/^OWNERSHIP_OVERLAP/);       // C1's open share still runs
    const jPersonal = await ent(U.J, PERSONAL(U.J)); // every role, also a direct superuser write
    expect(errorText(await attempt(db, null, () => q(db, "INSERT INTO public.record_ownerships(record_id, owner_id, owning_entity_id, share_pct, valid_from, status, decided_at) VALUES ($1,$2,$3,60,'2024-06-01','confirmed',now())", [prop, U.J, jPersonal])))).toMatch(/^OWNERSHIP_OVER_100/);
    // ownership on any date, ONE record id and ONE number for both owners
    const onDate = async (d: string) => (await q<{ k: string; p: string }>(db, `SELECT le.entity_key k, x.share_pct::numeric(5,2)::text p FROM public.record_ownerships x JOIN public.legal_entities le ON le.id=x.owning_entity_id
      WHERE x.record_id=$1 AND x.status='confirmed' AND x.valid_from <= $2::date AND (x.valid_to IS NULL OR $2::date < x.valid_to) ORDER BY 1`, [prop, d])).map((r) => `${r.k}:${r.p}`);
    expect(await onDate("2025-03-01")).toEqual([`${C1}:50.00`, `${JC}:50.00`]);
    expect(await onDate("2026-03-01")).toEqual([`${C1}:50.00`, `${PERSONAL(U.O)}:50.00`]);
    const seenBy = async (u: string) => (await as(db, u, () => q<{ id: string; readable_id: string }>(db, "SELECT id, readable_id FROM public.register_records WHERE id=$1", [prop])));
    expect(await seenBy(U.O)).toEqual(await seenBy(U.J));
    expect(first(await seenBy(U.J)).readable_id).toBe("PRP-0002");
    expect((await as(db, U.G, () => q(db, "SELECT 1 FROM public.register_records WHERE id=$1", [prop]))).length).toBe(1); // C1 grantee
    // erasure of the administrator is stopped while another account holds shares (shared evidence)
    expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return q(db, "SELECT public.delete_my_finance_data()"); }))).toMatch(/ERASURE_BLOCKED_COOWNED/);
  }, T);

  // ----------------------------------------------------------------------------------------
  // F. Restore keeps ids and numbers; links follow the restoring owner
  // ----------------------------------------------------------------------------------------
  it("F. same-account and cross-account restore of P5-era rows: no FK failure, ids and readable numbers kept, links follow the restoring owner", async () => {
    const before = await entitiesOf(db, U.O);
    // rows outside closed periods (a restore upsert fires BEFORE INSERT guards, so closed-period rows are refused today too)
    const rows = await q<{ r: Record<string, unknown> }>(db, "SELECT to_jsonb(e) r FROM public.expenses e WHERE e.employee_id=$1 AND e.expense_date >= '2026-02-01' AND e.expense_date < '2026-04-01' ORDER BY id", [U.O]);
    expect(rows.length).toBe(7);
    const linksBefore = await expenseLinks(db, U.O);
    await as(db, U.O, async () => { await stepUp(db, U.O); await q(db, "SELECT public.restore_finance_backup($1::jsonb)", [JSON.stringify({ expenses: rows.map((x) => x.r) })]); });
    expect(await expenseLinks(db, U.O)).toEqual(linksBefore);
    expect(await entitiesOf(db, U.O)).toEqual(before);
    // cross-account: O's row (carrying O's legal_entity_id) restored into V with fresh ids
    const one = { ...first(rows).r, id: id(8001), account_id: null, to_account_id: null, entity_source: "account", entity_id: null };
    await as(db, U.V, async () => { await stepUp(db, U.V); await q(db, "SELECT public.restore_finance_backup($1::jsonb)", [JSON.stringify({ expenses: [one] })]); });
    expect((await expenseLinks(db, U.V))[id(8001)]).toBe(PERSONAL(U.V));
  }, T);

  it("G. erasure removes the owner's P5 rows (counters kept so numbers are never reissued) and nobody else's", async () => {
    // V administers nothing shared: erase V
    const vRecords = first(await q<{ n: number }>(db, "SELECT count(*)::int n FROM public.register_records WHERE owner_id=$1", [U.V])).n;
    expect(vRecords).toBe(1);
    const oBefore = await entitiesOf(db, U.O);
    const counters = first(await q<{ n: number }>(db, "SELECT count(*)::int n FROM public.readable_id_counters")).n;
    await as(db, U.V, async () => { await stepUp(db, U.V); await q(db, "SELECT public.delete_my_finance_data()"); });
    for (const t of ["legal_entities", "account_entity_assignments", "readable_id_registry", "legacy_backfill_runs", "register_records", "record_ownerships"]) {
      expect(first(await q<{ n: number }>(db, `SELECT count(*)::int n FROM public.${t} WHERE owner_id=$1`, [U.V])).n, t).toBe(0);
    }
    expect(first(await q<{ n: number }>(db, "SELECT count(*)::int n FROM public.readable_id_counters")).n).toBe(counters);
    expect(await entitiesOf(db, U.O)).toEqual(oBefore);
  }, T);
});

// ------------------------------------------------------------------------------------------
// H. Exact rollback to the P1+P2+P4 catalog; evidence archived, never dropped
// ------------------------------------------------------------------------------------------
describe("H. rollback restores the exact P1+P2+P4 catalog and keeps P5 rows as evidence", () => {
  it("P4 rollback refuses while P5 is installed; P5 rollback restores catalog and data exactly; P4/P2/P1 roll back after it; P5 re-applies", async () => {
    const db = await fullSchemaDb(BASE); await seed(db);
    const tables = await preexistingTables(db);
    const S4 = await fullCatalog(db); const D0 = await dataSnapshot(db, tables);
    await db.exec(readSql(P5));
    await expect(db.exec(readSql(P5))).rejects.toThrow(/already installed/);
    await db.exec("ROLLBACK").catch(() => undefined);
    await expect(db.exec(readSql(P4_RB))).rejects.toThrow(/Roll back P5/);
    await db.exec("ROLLBACK").catch(() => undefined);
    const p = await preview(db, U.O, true);
    await commit(db, U.O, p.source_sha256, true);
    const c1 = first(await q<{ id: string }>(db, "SELECT id FROM public.legal_entities WHERE owner_id=$1 AND entity_key=$2", [U.O, C1])).id;
    await as(db, U.O, async () => { await q(db, "SELECT public.register_shared_record('property',$1,'Plot',NULL)", [c1]); });
    expect(await fullCatalog(db)).not.toEqual(S4);
    expect(await dataSnapshot(db, tables)).toEqual(D0);

    await db.exec(readSql(P5_RB));
    const S4b = await fullCatalog(db);
    for (const k of Object.keys(S4) as (keyof typeof S4)[]) expect(S4b[k], `after P5 rollback: ${k}`).toEqual(S4[k]);
    expect(await dataSnapshot(db, tables)).toEqual(D0);
    const archived = (await q<{ t: string }>(db, "SELECT tablename t FROM pg_tables WHERE schemaname='security_rollback_archive' ORDER BY 1")).map((r) => r.t.replace(/_\d{8}T\d{6}$/, ""));
    expect(archived).toEqual(["p5_account_entity_assignments", "p5_entity_relationships", "p5_ledger_links", "p5_legacy_backfill_runs", "p5_legal_entities",
      "p5_readable_id_counters", "p5_readable_id_formats", "p5_readable_id_registry", "p5_record_ownerships", "p5_register_records"]);
    const kept = await q<{ t: string; n: number }>(db, `SELECT 'legal_entities' t, count(*)::int n FROM security_rollback_archive."${(await q<{ t: string }>(db, "SELECT tablename t FROM pg_tables WHERE schemaname='security_rollback_archive' AND tablename LIKE 'p5_legal_entities_%'")).map((r) => r.t)[0] ?? ""}"`);
    expect(first(kept).n).toBe(6);
    expect(first(await q<{ n: number }>(db, `SELECT count(*)::int n FROM security_rollback_archive."${(await q<{ t: string }>(db, "SELECT tablename t FROM pg_tables WHERE schemaname='security_rollback_archive' AND tablename LIKE 'p5_ledger_links_%'")).map((r) => r.t)[0] ?? ""}"`)).n).toBe(19);
    // clients cannot reach the archive
    expect(first(await q<{ ok: boolean }>(db, "SELECT has_schema_privilege('authenticated','security_rollback_archive','USAGE') ok")).ok).toBe(false);

    // the earlier packages still roll back in order, and the whole stack re-applies with data intact
    await db.exec(readSql(P4_RB)); await db.exec(readSql(P2_RB)); await db.exec(readSql(P1_RB));
    for (const f of [...BASE, P5]) await db.exec(readSql(f));
    expect((await preview(db, U.O)).personal.action).toBe("create");
    await db.close();
  }, 300_000);
});

// ------------------------------------------------------------------------------------------
// I. Backup decisions for the tables P5 adds. src/lib/backup.ts classifies the APPLIED schema only (its
//    inventory test also requires every listed table to exist there), so these decisions move into
//    BACKUP_EXCLUDED_TABLES / BACKUP_TABLES when P5 becomes an applied migration (gated write switch).
// ------------------------------------------------------------------------------------------
const P5_BACKUP_DECISIONS: Readonly<Record<string, string>> = {
  legal_entities: "Derived by the reviewed backfill from preferences.entities (which is backed up); not backed up until the gated write switch, then backup format 4 with claim_readable_id so ENT numbers are kept",
  entity_relationships: "Explicit owner decisions; backup format 4 (owner-composite FKs remapped with legal_entities)",
  account_entity_assignments: "Derived by the backfill from books.entityAccounts until the write switch; then format 4 with account ids remapped",
  legacy_backfill_runs: "Server audit of backfill runs; stays with the source account (like preference_approvals)",
  readable_id_registry: "Number registry of the scope entities; restore re-claims numbers through claim_readable_id instead of copying rows",
  register_records: "Shared register anchors; format 4 with claim_readable_id (one number across co-owners); co-owners' rows are never copied into another account",
  record_ownerships: "Shares held by possibly several accounts; only the restoring owner's own shares travel (format 4), never another account's",
};
describe("I. backup decisions for P5 tables", () => {
  it("every owner-scoped table P5 adds has exactly one backup decision; the applied-schema lists need no change yet", async () => {
    const owned = async (db: Db) => (await q<{ t: string }>(db, `SELECT DISTINCT c.table_name t FROM information_schema.columns c JOIN information_schema.tables x ON x.table_schema=c.table_schema AND x.table_name=c.table_name AND x.table_type='BASE TABLE'
      WHERE c.table_schema='public' AND c.column_name IN ('owner_id','employee_id') ORDER BY 1`)).map((r) => r.t);
    const db = await fullSchemaDb(BASE); const before = new Set(await owned(db));
    await db.exec(readSql(P5));
    const added = (await owned(db)).filter((t) => !before.has(t));
    expect(added.sort()).toEqual(Object.keys(P5_BACKUP_DECISIONS).sort());
    const listed = new Set<string>([...BACKUP_TABLES, ...Object.keys(BACKUP_EXCLUDED_TABLES), ...Object.keys(BACKUP_NOT_OWNER_TABLES)]);
    expect(added.filter((t) => listed.has(t))).toEqual([]);
    // the non-owner-column P5 tables are global formats / counters (never backed up)
    expect((await q<{ t: string }>(db, "SELECT c.relname t FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' AND c.relname LIKE 'readable_id_%' ORDER BY 1")).map((r) => r.t))
      .toEqual(["readable_id_counters", "readable_id_formats", "readable_id_registry"]);
    await db.close();
  }, T);
});
