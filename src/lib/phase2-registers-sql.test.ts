// @vitest-environment node
// Phase 2 stage 2 (normalised registers) acceptance tests for the PROPOSED P6_registers.sql: assets,
// asset events, depreciation journals, properties (+ units, containment, valuations), leases, trips
// (+ bookings, advances, entry links), holdings, receivables and projects, built on P5's legal
// entities, register_records, record_ownerships, readable numbers and backfill framework.
// Everything runs in isolated in-memory PGlite replaying drizzle/migrations 0000-0088 + P1 + P2 + P4 +
// P5 (src/test/full-schema-pglite.ts). Nothing connects to Cloud.
import { describe, it, expect, beforeAll } from "vitest";
import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { fullSchemaDb, actAs, addUsers, readSql } from "../test/full-schema-pglite";
import { BACKUP_EXCLUDED_TABLES, BACKUP_NOT_OWNER_TABLES, BACKUP_TABLES } from "./backup";

const DIR = ".lovable/staged-sql/proposed/";
const P1 = `${DIR}P1_security_containment.sql`;
const P2 = `${DIR}P2_v31_role_model.sql`;
const P4 = `${DIR}P4_step_up_and_assistant_limits.sql`;
const P5 = `${DIR}P5_legal_entities_foundation.sql`;
const P5_RB = `${DIR}P5_legal_entities_foundation.rollback.sql`;
const P6 = `${DIR}P6_registers.sql`;
const P6_RB = `${DIR}P6_registers.rollback.sql`;
const BASE = [P1, P2, P4];
const T = 240_000;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U = { O: id(1), V: id(2), G: id(3), J: id(4), X: id(5) } as const; // owner, other owner, C1 grantee, joint co-owner, stranger
const MCP = "mcp-client-1";
const C1 = "5b1f0c1e-7a3d-4c2e-9f10-0000000000c1";
const C2 = "5b1f0c1e-7a3d-4c2e-9f10-0000000000c2";
const CDEL = "5b1f0c1e-7a3d-4c2e-9f10-00000000de1e"; // deleted company still referenced by an asset
const JC = "7c7c7c7c-1111-4222-8333-00000000009c";
const ACC = { A: id(101), FA: id(102), DEP: id(103), BROKER: id(104), V: id(201) } as const;
const E = { van: id(1001), dep: id(1002), goa: id(1003), flight: id(1004), adv: id(1005), pune: id(1006), home1: id(1007), home2: id(1008), plain: id(1009), v1: id(1101) } as const;
const DOC = { inv: id(2001), deed: id(2002), lease: id(2003) } as const;
const LOAN = id(2501);
const DEMAT = id(2601);
const SEC = id(2602);
const TRIP = { goa: id(3001), delhi: id(3002), kochi: id(3003), pune1: id(3004), pune2: id(3005) } as const;
const PERSONAL = "personal";

type Db = PGlite;
type Row = Record<string, unknown>;
const q = async <R = Row>(db: Db, sql: string, params: unknown[] = []) => (await db.query<R>(sql, params)).rows;
function first<R>(rows: readonly R[], what = "row"): R { const r = rows[0]; if (r === undefined) throw new Error(`Expected a ${what}, got none`); return r; }
const errInfo = (e: unknown) => { const x = e as Error & { code?: unknown }; return { error: String(x.message), code: typeof x.code === "string" ? x.code : "" }; };
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
/** Run fn as uid and keep the effects; step-up grants recorded inside expire on return. */
async function as<R>(db: Db, uid: string, fn: () => Promise<R>, opts: Opts = {}) {
  await actAs(db, uid, opts.clientId === undefined ? {} : { clientId: opts.clientId });
  try { return await fn(); } finally {
    await actAs(db, null);
    await q(db, "UPDATE public.step_up_grants SET created_at = clock_timestamp() - interval '10 minutes', expires_at = clock_timestamp() - interval '6 minutes' WHERE expires_at > clock_timestamp()");
  }
}
const errorText = (a: Attempt<unknown>) => (a.ok ? "" : a.error);
async function stepUp(db: Db, uid: string) {
  const caller = first(await q<{ u: string | null }>(db, "SELECT nullif(current_setting('test.uid',true),'') u")).u;
  await db.exec("RESET ROLE"); await db.exec("SET ROLE service_role");
  try { await q(db, "SELECT public.record_step_up($1,'password',300)", [uid]); }
  finally { await db.exec("RESET ROLE"); if (caller) await db.exec("SET ROLE authenticated"); }
}

// ------------------------------------------------------------------------------------------
// Seed: the app's real JSON shapes (Asset in src/lib/assets.ts; AssetEvent, Journal, Property, Lease,
// Holding in src/lib/books/types.ts; TravelTrip/Booking/Advance in src/lib/travel.ts; Receivable in
// src/lib/receivables.ts; ScopedBudget kind 'project' in src/lib/preferences.ts) + relational rows.
// ------------------------------------------------------------------------------------------
const OWNER_DATA = {
  entities: [
    { id: C1, name: "Alpha Traders Pvt Ltd", kind: "company", pan: "AAACA1234A", gstins: [], booksFrom: "2024-25" },
    { id: C2, name: "Beta Holdings LLP", kind: "llp", pan: "AAKFB5678B", gstins: [], booksFrom: "2025-26" },
  ],
  assets: [
    { id: "ast-van", name: "Delivery van", kind: "vehicle", cost: 900000, inUse: "2025-06-01", ownerEntityId: C1, sharePct: 100, bookMethod: "slm", bookRatePct: 15,
      transactionId: E.van, accountId: ACC.FA, docId: DOC.inv, tag: "VAN-01", location: "Bengaluru depot", custodian: "R Kumar", purchaseDate: "2025-05-20" },
    { id: "ast-rack", name: "Server rack", kind: "computer", cost: 300000, inUse: "2025-07-01", ownerEntityId: C2, sharePct: 100, bookMethod: "wdv", bookRatePct: 40 },
    { id: "ast-laptop", name: "Home laptop", kind: "computer", cost: 120000, inUse: "2025-07-01", sharePct: 100, bookMethod: "wdv", bookRatePct: 40, tag: "LT-1" },
    { id: "ast-lift", name: "Passenger lift", kind: "machinery", cost: 800000, inUse: "2024-04-01", ownerEntityId: C1, sharePct: 100, bookMethod: "wdv", bookRatePct: 15 },
    { id: "ast-flat", name: "Flat 4B (building)", kind: "property", cost: 5000000, inUse: "2024-04-01", purchaseDate: "2024-04-01", ownerEntityId: C1, sharePct: 50, bookMethod: "slm", bookRatePct: 0,
      openingWdv: { fy: "2025-26", book: 4900000 }, adjustments: [{ date: "2025-10-01", amount: -50000, kind: "impairment", note: "seepage" }] },
    { id: "ast-orphan", name: "Old company printer", kind: "computer", cost: 1000, inUse: "2023-01-01", ownerEntityId: CDEL, sharePct: 100, bookMethod: "wdv", bookRatePct: 40 },
    { id: "ast-laptop", name: "Home laptop", kind: "computer", cost: 120000, inUse: "2025-07-01", sharePct: 100, bookMethod: "wdv", bookRatePct: 40, tag: "LT-1" }, // identical duplicate
    "junk-record",
  ],
  trips: [
    { id: TRIP.goa, name: "Goa offsite", destination: "Goa", start: "2026-03-10", end: "2026-03-14", budget: 80000, currencies: ["INR"], type: "business",
      organisation: "MOVAC", primaryWorkspace: "business", travellers: ["K Kumar", "S Rao"],
      bookings: [
        { id: "bk-1", kind: "flight", provider: "IndiGo", ref: "6E-ABC", date: "2026-03-10", amount: 12000, status: "paid", expenseId: E.flight },
        { id: "bk-2", kind: "hotel", provider: "Taj", ref: "TJ-9", date: "2026-03-10", amount: 20000, status: "unpaid", dueDate: "2026-03-09" },
      ],
      advances: [{ id: "adv-1", date: "2026-03-01", amount: 10000, source: "Office" }],
      itinerary: [{ id: "it-1", date: "2026-03-10", title: "Fly to Goa", bookingId: "bk-1" }],
      budgetLines: [{ category: "Travel", amount: 50000 }], contingency: 5000 },
    { id: TRIP.delhi, name: "Delhi visit", destination: "Delhi", start: "2026-05-01", end: "2026-05-03", budget: 30000, currencies: ["INR"],
      cancelledAt: "2026-04-20T10:00:00.000Z", advances: [{ id: "adv-2", date: "2026-04-10", amount: 5000, source: "Self" }], bookings: [] },
    { id: TRIP.kochi, name: "Kochi", destination: "Kochi", start: "2025-11-01", end: "2025-11-05", budget: 20000, currencies: ["INR"], closedAt: "2025-12-01T09:00:00.000Z" },
    { id: TRIP.pune1, name: "Pune", destination: "Pune", start: "2026-06-01", end: "2026-06-02", budget: 5000, currencies: ["INR"] },
    { id: TRIP.pune2, name: "Pune", destination: "Pune", start: "2026-07-01", end: "2026-07-02", budget: 6000, currencies: ["INR"] },
  ],
  receivables: [
    { id: "rcv-1", customer: "Acme Retail", invoiceNo: "INV-001", date: "2026-02-01", dueDate: "2026-03-01", amount: 118000, gst: 18000 },
    { id: "rcv-2", customer: "Beta Stores", date: "2026-03-05", amount: 5000 },
  ],
  budgets: [
    { id: "bud-home", name: "Home renovation", amount: 500000, period: "annual", kind: "project", value: "Project: Home", start: "2026-01-01", carry: false },
    { id: "bud-food", name: "Food", amount: 20000, period: "monthly", kind: "category", value: "Food", start: "2026-01-01", carry: false },
  ],
  books: {
    entityAccounts: { [C1]: [ACC.A, ACC.FA] },
    assetEvents: [
      { id: "ev-1", assetId: "ast-van", date: "2025-07-01", kind: "maintenance", note: "First service", value: 5000 },
      { id: "ev-2", assetId: "ast-van", date: "2025-12-15", kind: "impairment", note: "Accident", value: 20000, applied: true },
      { id: "ev-x", assetId: "ast-missing", date: "2025-12-15", kind: "location", note: "moved", to: "Pune" },
    ],
    journals: [
      { id: "j-van-2026-02", assetId: "ast-van", period: "2026-02", amount: 11250, kind: "book", status: "posted", postedOn: "2026-03-01", transactionId: E.dep },
      { id: "j-van-2026-03", assetId: "ast-van", period: "2026-03", amount: 11250, kind: "book", status: "prepared" },
      { id: "j-dup", assetId: "ast-van", period: "2026-03", amount: 99, kind: "book", status: "prepared" },
    ],
    properties: [
      { id: "prop-flat", name: "Flat 4B", ownerEntityId: C1, address: "MG Road, Bengaluru", assetId: "ast-flat",
        buildings: [{ id: "b1", name: "Tower A", floors: [{ id: "f4", name: "4th floor", units: [{ id: "u4b", name: "4B", areaSqft: 1200 }, { id: "u4c", name: "4C", areaSqft: 900 }] }] }],
        valuation: { value: 9000000, date: "2026-03-31", source: "Valuer report" }, docIds: [DOC.deed], links: { loanId: LOAN, depositAccountId: ACC.DEP } },
      { id: "prop-plot", name: "Plot 12", ownerEntityId: C2, address: "Hosur", buildings: [], valuation: { value: 2500000, date: "2026-01-31", source: "Guidance value" }, docIds: [] },
    ],
    leases: [
      { id: "lease-1", propertyId: "prop-flat", unitId: "u4c", tenant: "R Iyer", start: "2026-01-01", end: "2026-12-31", rent: 35000, deposit: 100000, dueDay: 5,
        paymentTerms: "Monthly by bank transfer", accountId: ACC.A, currency: "INR", docId: DOC.lease },
      { id: "lease-2", propertyId: "prop-gone", tenant: "Ghost", start: "2026-01-01", end: "2026-12-31", rent: 1000, paymentTerms: "" },
    ],
    holdings: [
      { id: "h-gold", kind: "physical_gold", name: "Gold coins", quantity: 2, grams: 20, karat: 24, sharePct: 100, costBasis: 120000, source: "manual" },
      { id: "h-mf", kind: "mutual_fund", name: "Index fund", isin: "INF000K01ABC", quantity: 100.5, ownerEntityId: C1, sharePct: 100, costBasis: 50000, source: "CAS" },
      { id: "h-eq", kind: "other", name: "Infosys (also in demat)", isin: "INE009A01021", quantity: 10, sharePct: 100, costBasis: 15000, source: "manual" },
    ],
    closedPeriods: [], periodLog: [],
  },
};
const J_DATA = {
  entities: [{ id: JC, name: "Jay Estates Pvt Ltd", kind: "company", pan: "AAACJ2222J", gstins: [], booksFrom: "2025-26" }],
  books: { properties: [{ id: "j-prop-flat", name: "Flat 4B (my half)", ownerEntityId: JC, address: "MG Road, Bengaluru", buildings: [], docIds: [], valuation: { value: 9000000, date: "2026-03-31", source: "Valuer report" } }] },
};
const V_DATA = {
  entities: [{ id: C1, name: "Vee Corp", kind: "company", pan: "AAACV1111V", gstins: [] }],
  assets: [{ id: "ast-van", name: "V's van", kind: "vehicle", cost: 700000, inUse: "2025-01-01", ownerEntityId: C1, sharePct: 100, bookMethod: "slm", bookRatePct: 15 }],
  trips: [{ id: "v-trip", name: "Goa offsite", destination: "Goa", start: "2026-03-10", end: "2026-03-14", budget: 1, currencies: ["INR"] }],
  books: { entityAccounts: {} },
};

type Ex = { id: string; owner?: string; acc?: string | null; date: string; amount: number; tags?: string[]; trip?: string | null };
const EXPENSES: Ex[] = [
  { id: E.van, acc: ACC.A, date: "2025-05-20", amount: 900000 },
  { id: E.dep, acc: ACC.FA, date: "2026-02-28", amount: 11250 },
  { id: E.goa, acc: ACC.A, date: "2026-03-11", amount: 4500, tags: ["Trip: Goa offsite"] },
  { id: E.flight, acc: ACC.A, date: "2026-03-05", amount: 12000, tags: ["Trip: Goa offsite"] },
  { id: E.adv, acc: ACC.A, date: "2026-03-01", amount: 10000, trip: TRIP.goa },
  { id: E.pune, acc: ACC.A, date: "2026-06-01", amount: 800, tags: ["Trip: Pune"] },
  { id: E.home1, acc: ACC.A, date: "2026-02-10", amount: 150000, tags: ["Project: Home"] },
  { id: E.home2, acc: ACC.A, date: "2026-02-20", amount: 50000, tags: ["Project: Home", "Trip: Goa offsite"] },
  { id: E.plain, acc: ACC.A, date: "2026-02-21", amount: 99 },
  { id: E.v1, owner: U.V, acc: ACC.V, date: "2026-03-11", amount: 10, tags: ["Trip: Goa offsite"] },
];

async function seed(db: Db) {
  await addUsers(db, { [U.O]: "o@x.in", [U.V]: "v@x.in", [U.G]: "g@x.in", [U.J]: "j@x.in", [U.X]: "x@x.in" });
  for (const [u, d] of [[U.O, OWNER_DATA], [U.V, V_DATA], [U.J, J_DATA], [U.X, { entities: [], books: {} }]] as const) {
    await q(db, "INSERT INTO public.finance_preferences(owner_id, data) VALUES ($1, $2::jsonb)", [u, JSON.stringify(d)]);
  }
  for (const [k, acc] of Object.entries(ACC)) {
    await q(db, "INSERT INTO public.accounts(id, owner_id, name, kind, opening_balance) VALUES ($1,$2,$3,'savings',1000)", [acc, k === "V" ? U.V : U.O, `Account ${k}`]);
  }
  for (const x of EXPENSES) {
    await q(db, `INSERT INTO public.expenses(id, employee_id, title, merchant, category, amount, original_amount, currency, expense_date, account_id, txn_type, entity_source, scope, tags, trip_id)
      VALUES ($1,$2,'entry','Shop','General',$3,$3,'INR',$4,$5,'expense','account','personal',$6,$7)`, [x.id, x.owner ?? U.O, x.amount, x.date, x.acc ?? null, x.tags ?? [], x.trip ?? null]);
  }
  for (const [d, path] of [[DOC.inv, "van-invoice.pdf"], [DOC.deed, "flat-deed.pdf"], [DOC.lease, "lease.pdf"]] as const) {
    await q(db, "INSERT INTO public.documents(id, owner_id, title, file_path, file_name) VALUES ($1,$2,'doc',$3,'f.pdf')", [d, U.O, `${U.O}/docs/${path}`]);
  }
  await q(db, "INSERT INTO public.loans(id, owner_id, name, principal_outstanding, annual_rate, emi, next_due) VALUES ($1,$2,'Home loan',4000000,8.5,40000,'2026-04-05')", [LOAN, U.O]);
  await q(db, "INSERT INTO public.demat_accounts(id, owner_id, broker, dp_id, client_id) VALUES ($1,$2,'Zerodha','IN300','1234')", [DEMAT, U.O]);
  await q(db, "INSERT INTO public.security_holdings(id, owner_id, demat_id, isin, name, quantity) VALUES ($1,$2,$3,'INE009A01021','INFOSYS',10)", [SEC, U.O, DEMAT]);
  await q(db, "INSERT INTO public.entity_members(owner_id, entity_id, member_id, member_email, can_write) VALUES ($1,$2,$3,'g@x.in',false)", [U.O, C1, U.G]);
}

/** count + md5 of every row of every listed table; P5's legal_entity_id (the one additive column) excluded. */
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
async function publicTables(db: Db) {
  return (await q<{ t: string }>(db, "SELECT c.relname t FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' ORDER BY 1")).map((r) => r.t);
}
async function preexistingTables(db: Db) {
  return (await publicTables(db)).filter((t) => !P4_WRITTEN_BY_TESTS.has(t)).map((t) => `public.${t}`).concat(["storage.objects", "auth.users"]);
}
/** Every row of the given tables as a set of jsonb texts (to prove older rows stay byte-identical). */
async function rowSet(db: Db, tables: string[]) {
  await actAs(db, null);
  const out: Record<string, string[]> = {};
  for (const t of tables) out[t] = (await q<{ r: string }>(db, `SELECT to_jsonb(x)::text r FROM public.${t} x ORDER BY 1`)).map((r) => r.r);
  return out;
}
const P5_TABLES = ["legal_entities", "entity_relationships", "account_entity_assignments", "legacy_backfill_runs", "readable_id_formats", "readable_id_registry", "register_records", "record_ownerships"];
const P6_TABLES = ["assets", "asset_events", "depreciation_journals", "properties", "property_units", "property_assets", "register_valuations", "leases", "trips", "trip_bookings",
  "trip_advances", "register_entry_links", "investment_holdings", "receivables", "projects", "register_legacy_copies", "register_archive_events"];

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
    p4guards: await j("SELECT proname, identity_args, mode FROM security_p4.guarded_functions ORDER BY seq"),
  };
}

// P5 company backfill (prerequisite of every register backfill).
async function entityBackfill(db: Db, owner: string) {
  const p = first(await as(db, owner, () => q<{ p: { source_sha256: string } }>(db, "SELECT public.preview_entity_backfill(false) p"))).p;
  await as(db, owner, async () => { await stepUp(db, owner); await q(db, "SELECT public.commit_entity_backfill($1,false)", [p.source_sha256]); });
}
type PlanRow = { t: string; a: string; path: string; legacy_id: string | null; row: Row };
type Plan = { source_sha256: string; rows: PlanRow[]; exceptions: { code: string; severity: string; legacy_id: string | null; path: string | null }[];
  counts: { to_create: Record<string, number>; existing: Record<string, number>; errors: number; warnings: number }; blocked?: string };
const preview = async (db: Db, owner: string, reg: string, opts: Row = {}) =>
  first(await as(db, owner, () => q<{ p: Plan }>(db, "SELECT public.preview_register_backfill($1,$2::jsonb) p", [reg, JSON.stringify(opts)]))).p;
const commit = async (db: Db, owner: string, reg: string, sha: string, opts: Row = {}) =>
  first(await as(db, owner, async () => { await stepUp(db, owner); return q<{ r: { created: Record<string, number>; run_id: string } }>(db, "SELECT public.commit_register_backfill($1,$2,$3::jsonb) r", [reg, sha, JSON.stringify(opts)]); })).r;
const backfill = async (db: Db, owner: string, reg: string, opts: Row = {}) => commit(db, owner, reg, (await preview(db, owner, reg, opts)).source_sha256, opts);
type Report = { status: string; money: { identical: boolean; differences: { key: string; before: unknown; after: unknown }[] }; orphans: unknown[]; pending: Record<string, number>; links: Record<string, number>; exceptions: Plan["exceptions"] };
const report = async (db: Db, owner: string, reg: string) => first(await as(db, owner, () => q<{ r: Report }>(db, "SELECT public.register_backfill_report($1) r", [reg]))).r;
const codes = (p: { exceptions: Plan["exceptions"] }) => p.exceptions.map((e) => `${e.code}:${e.severity}:${e.legacy_id ?? ""}`);
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

async function setup() {
  const db = await fullSchemaDb(BASE);
  await seed(db);
  const tables = await preexistingTables(db);
  const D0 = await dataSnapshot(db, tables);
  await db.exec(readSql(P5));
  for (const u of [U.O, U.V, U.J]) await entityBackfill(db, u);
  const P5_ROWS = await rowSet(db, P5_TABLES);
  const S5 = await fullCatalog(db);
  await db.exec(readSql(P6));
  return { db, tables, D0, P5_ROWS, S5 };
}
/** P5 rows that existed before P6 stay byte-identical (P6 may only add rows to P5 tables). */
async function expectP5RowsKept(db: Db, before: Record<string, string[]>) {
  const now = await rowSet(db, P5_TABLES);
  for (const t of P5_TABLES) {
    const set = new Set(now[t]);
    expect((before[t] ?? []).filter((r) => !set.has(r)), `P5 table ${t}: a pre-P6 row changed or disappeared`).toEqual([]);
  }
}
const sel = async <R = Row>(db: Db, sql: string, params: unknown[] = []) => { await actAs(db, null); return q<R>(db, sql, params); };
const recordOf = async (db: Db, owner: string, kind: string, legacy: string) =>
  first(await sel<{ id: string; readable_id: string; scope: string }>(db, `SELECT r.id, r.readable_id, coalesce(CASE WHEN e.kind='individual_personal' THEN 'personal' END, e.entity_key) scope
    FROM public.register_records r JOIN public.legal_entities e ON e.id = r.legal_entity_id WHERE r.owner_id=$1 AND r.record_kind=$2 AND r.legacy_id=$3`, [owner, kind, legacy]), `${kind} ${legacy}`);

// ------------------------------------------------------------------------------------------
// One database, in order: assets -> properties (containment, joint property) -> trips -> holdings ->
// receivables -> projects -> access -> archive -> numbers -> erasure
// ------------------------------------------------------------------------------------------
describe("P6 registers: previewed backfill, commit, compare, access and archive", () => {
  let db: Db; let tables: string[]; let D0: Record<string, string>; let P5_ROWS: Record<string, string[]>;
  let json0: Record<string, string>; let srcText = "";
  beforeAll(async () => {
    ({ db, tables, D0, P5_ROWS } = await setup());
    json0 = Object.fromEntries((await sel<{ o: string; h: string }>(db, "SELECT owner_id::text o, public.legacy_sha256(data) h FROM public.finance_preferences")).map((r) => [r.o, r.h]));
  }, T);
  const expectUnchanged = async () => {
    expect(await dataSnapshot(db, tables)).toEqual(D0);
    const json = Object.fromEntries((await sel<{ o: string; h: string }>(db, "SELECT owner_id::text o, public.legacy_sha256(data) h FROM public.finance_preferences")).map((r) => [r.o, r.h]));
    expect(json).toEqual(json0);
    await expectP5RowsKept(db, P5_ROWS);
  };

  // ---------------------------------------------------------------------------------------- slice 1
  it("1a. assets preview: proposed rows, exceptions and source sha256 from the raw JSON; nothing changes", async () => {
    await expect(as(db, U.X, () => q(db, "SELECT public.preview_register_backfill('assets','{}')"))).resolves.toBeDefined();
    const p = await preview(db, U.O, "assets");
    expect(p.counts.to_create).toEqual({ register_records: 5, assets: 5, record_ownerships: 5, asset_events: 2, depreciation_journals: 2 });
    const c = codes(p);
    for (const want of ["orphan_owner_entity:error:ast-orphan", "duplicate_record:warning:ast-laptop", "invalid_record:error:", "event_for_unknown_asset:error:ev-x", "duplicate_journal_period:error:j-dup"]) {
      expect(c, want).toContain(want);
    }
    srcText = first(await sel<{ t: string }>(db, `SELECT jsonb_build_object('assets', data->'assets', 'assetEvents', data->'books'->'assetEvents', 'journals', data->'books'->'journals')::text t
      FROM public.finance_preferences WHERE owner_id=$1`, [U.O])).t;
    expect(p.source_sha256).toBe(sha256(srcText)); // independent hash (node:crypto) of the sections read
    // the flat's 50% JSON share becomes a dated confirmed share of the owning company
    const share = p.rows.find((r) => r.t === "record_ownerships" && r.legacy_id === "ast-flat");
    expect(share?.row).toMatchObject({ share_pct: 50, valid_from: "2024-04-01", status: "confirmed" });
    await expectUnchanged();
  }, T);

  it("1b. commit is refused without step-up, for an assistant with step-up, for anonymous guests, before the company backfill and when the source changed", async () => {
    const sha = (await preview(db, U.O, "assets")).source_sha256;
    const call = () => q(db, "SELECT public.commit_register_backfill('assets',$1,'{}')", [sha]);
    expect(errorText(await attempt(db, U.O, call))).toBe("STEP_UP_REQUIRED: commit_register_backfill");
    expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return call(); }, { clientId: MCP }))).toBe("STEP_UP_REQUIRED: commit_register_backfill");
    expect(errorText(await attempt(db, U.X, async () => { await stepUp(db, U.X); return call(); }, { anon: true }))).toBe("Sign in with your account to import registers");
    expect(errorText(await attempt(db, U.X, async () => { await stepUp(db, U.X); return q(db, "SELECT public.commit_register_backfill('assets',$1,'{}')", ["0".repeat(64)]); }))).toMatch(/company backfill/);
    const changed = await attempt(db, U.O, async () => {
      await q(db, "UPDATE public.finance_preferences SET data = jsonb_set(data, '{assets,0,cost}', '950000') WHERE owner_id=$1", [U.O]);
      await stepUp(db, U.O); return call();
    });
    expect(errorText(changed)).toMatch(/^BACKFILL_SOURCE_CHANGED/);
    expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return q(db, "SELECT public.commit_register_backfill('ledger',$1,'{}')", [sha]); }))).toMatch(/Unknown register/);
    await expectUnchanged();
  }, T);

  it("1c. commit: one register_records anchor + asset row per asset, AST numbers in each owning entity's scope, ledger references by id, legacy amounts read-only; no existing value changes", async () => {
    const r = await backfill(db, U.O, "assets");
    expect(r.created).toEqual({ register_records: 5, assets: 5, record_ownerships: 5, asset_events: 2, depreciation_journals: 2 });
    const nums = Object.fromEntries(await Promise.all(["ast-van", "ast-rack", "ast-laptop", "ast-lift", "ast-flat"].map(async (l) => { const x = await recordOf(db, U.O, "asset", l); return [l, `${x.scope}:${x.readable_id}`]; })));
    expect(nums).toEqual({ "ast-van": `${C1}:AST-000001`, "ast-rack": `${C2}:AST-000001`, "ast-laptop": `${PERSONAL}:AST-000001`, "ast-lift": `${C1}:AST-000002`, "ast-flat": `${C1}:AST-000003` });
    const van = first(await sel<Row>(db, "SELECT * FROM public.assets WHERE owner_id=$1 AND legacy_id='ast-van'", [U.O]));
    expect(van).toMatchObject({ name: "Delivery van", asset_kind: "vehicle", purchase_entry_id: E.van, ledger_account_id: ACC.FA, document_ids: [DOC.inv], tag: "VAN-01",
      legacy_cost: "900000", legacy_id: "ast-van" });
    const elText = first(await sel<{ t: string }>(db, "SELECT (data->'assets'->0)::text t FROM public.finance_preferences WHERE owner_id=$1", [U.O])).t;
    expect(van["source"]).toMatchObject({ from: "finance_preferences", path: "assets[0]", legacy_id: "ast-van", element_sha256: sha256(elText), source_sha256: sha256(srcText) });
    expect(van["legacy_element"]).toEqual(OWNER_DATA.assets[0]);
    const flat = first(await sel<Row>(db, "SELECT legacy_opening_wdv, legacy_adjustments FROM public.assets WHERE legacy_id='ast-flat'"));
    expect(flat).toEqual({ legacy_opening_wdv: { fy: "2025-26", book: 4900000 }, legacy_adjustments: [{ date: "2025-10-01", amount: -50000, kind: "impairment", note: "seepage" }] });
    const js = await sel<{ legacy_id: string; status: string; entry_id: string | null; legacy_amount: string }>(db, "SELECT legacy_id, status, entry_id, legacy_amount::text FROM public.depreciation_journals ORDER BY legacy_id");
    expect(js).toEqual([{ legacy_id: "j-van-2026-02", status: "posted", entry_id: E.dep, legacy_amount: "11250" }, { legacy_id: "j-van-2026-03", status: "prepared", entry_id: null, legacy_amount: "11250" }]);
    expect((await sel<{ k: string }>(db, "SELECT event_kind k FROM public.asset_events ORDER BY legacy_id")).map((x) => x.k)).toEqual(["maintenance", "impairment"]);
    // provenance: run logged with the source sha256
    expect(first(await sel<{ n: number }>(db, "SELECT count(*)::int n FROM public.legacy_backfill_runs WHERE owner_id=$1 AND kind='assets'", [U.O])).n).toBe(1);
    await expectUnchanged();
  }, T);

  it("1d. compare report: counts and legacy money per entity/currency identical except the reported orphan, invalid, duplicate and unknown-asset items", async () => {
    const r = await report(db, U.O, "assets");
    expect(r.status).toBe("differences");
    expect(r.orphans).toEqual([]);
    expect(r.pending).toEqual({});
    expect(r.money.differences.map((d) => d.key).sort()).toEqual(["asset_events|(no asset)|INR", "assets|(invalid)|INR", `assets|${CDEL}|INR`, `journals|${C1}|INR`]);
    // independent check of money per entity (TypeScript over the seed vs the table copies)
    const want: Record<string, number> = {};
    for (const a of OWNER_DATA.assets) if (typeof a === "object" && a.ownerEntityId !== CDEL) want[a.ownerEntityId ?? PERSONAL] = (want[a.ownerEntityId ?? PERSONAL] ?? 0) + a.cost;
    want[PERSONAL] = (want[PERSONAL] ?? 0) - 120000; // the identical duplicate laptop is one asset
    const got = Object.fromEntries((await sel<{ k: string; s: string }>(db, `SELECT coalesce(CASE WHEN e.kind='individual_personal' THEN 'personal' END, e.entity_key) k, sum(a.legacy_cost)::text s
      FROM public.assets a JOIN public.register_records r ON r.id=a.id JOIN public.legal_entities e ON e.id=r.legal_entity_id WHERE a.owner_id=$1 GROUP BY 1`, [U.O])).map((x) => [x.k, Number(x.s)]));
    expect(got).toEqual(want);
  }, T);

  it("1e. re-commit is idempotent: nothing to create, no number spent, no value changed", async () => {
    const counters = await sel(db, "SELECT * FROM public.readable_id_counters ORDER BY 1,2,3");
    const registry = first(await sel<{ n: number }>(db, "SELECT count(*)::int n FROM public.readable_id_registry")).n;
    const p = await preview(db, U.O, "assets");
    expect(p.counts.to_create).toEqual({});
    expect(p.counts.existing).toMatchObject({ assets: 5, asset_events: 2, depreciation_journals: 2 });
    expect((await commit(db, U.O, "assets", p.source_sha256)).created).toEqual({});
    expect(await sel(db, "SELECT * FROM public.readable_id_counters ORDER BY 1,2,3")).toEqual(counters);
    expect(first(await sel<{ n: number }>(db, "SELECT count(*)::int n FROM public.readable_id_registry")).n).toBe(registry);
    await expectUnchanged();
  }, T);

  // ---------------------------------------------------------------------------------------- slice 2
  it("2a. properties: PRP anchors, unit tree, dated valuation, carrying-asset containment and a lease (LSE) in the property's scope", async () => {
    const p = await preview(db, U.O, "properties");
    expect(p.counts.to_create).toEqual({ register_records: 2, properties: 2, property_units: 4, register_valuations: 2, property_assets: 1, leases: 1 });
    expect(codes(p)).toContain("lease_for_unknown_property:error:lease-2");
    await commit(db, U.O, "properties", p.source_sha256);
    const flat = await recordOf(db, U.O, "property", "prop-flat"); const plot = await recordOf(db, U.O, "property", "prop-plot");
    expect([`${flat.scope}:${flat.readable_id}`, `${plot.scope}:${plot.readable_id}`]).toEqual([`${C1}:PRP-0001`, `${C2}:PRP-0001`]);
    expect(await sel(db, "SELECT level, name, legacy_id, legacy_path FROM public.property_units WHERE property_id=$1 ORDER BY legacy_path", [flat.id])).toEqual([
      { level: "building", name: "Tower A", legacy_id: "b1", legacy_path: "buildings[0]" },
      { level: "floor", name: "4th floor", legacy_id: "f4", legacy_path: "buildings[0].floors[0]" },
      { level: "unit", name: "4B", legacy_id: "u4b", legacy_path: "buildings[0].floors[0].units[0]" },
      { level: "unit", name: "4C", legacy_id: "u4c", legacy_path: "buildings[0].floors[0].units[1]" }]);
    const lease = first(await sel<Row>(db, "SELECT l.readable_id, l.tenant, l.legacy_rent::text rent, l.legacy_deposit::text dep, l.receipt_account_id, l.document_id, u.legacy_id unit, e.entity_key scope FROM public.leases l JOIN public.property_units u ON u.id=l.unit_id JOIN public.legal_entities e ON e.id=l.legal_entity_id"));
    expect(lease).toEqual({ readable_id: "LSE-0001", tenant: "R Iyer", rent: "35000", dep: "100000", receipt_account_id: ACC.A, document_id: DOC.lease, unit: "u4c", scope: C1 });
    expect(first(await sel<Row>(db, "SELECT loan_id, deposit_account_id, document_ids FROM public.properties WHERE id=$1", [flat.id]))).toEqual({ loan_id: LOAN, deposit_account_id: ACC.DEP, document_ids: [DOC.deed] });
    expect(await sel(db, "SELECT value::text, as_of::text, basis FROM public.register_valuations WHERE record_id=$1", [flat.id])).toEqual([{ value: "9000000", as_of: "2026-03-31", basis: "market" }]);
    const r = await report(db, U.O, "properties");
    expect(r.money.differences.map((d) => d.key)).toEqual(["leases|(no property)|INR"]);
    expect(r.pending).toEqual({});
    await expectUnchanged();
  }, T);

  it("2b. a property contains several assets; the valuation report counts each component once (Flow 5), and an asset sits in one property at a time", async () => {
    const flat = await recordOf(db, U.O, "property", "prop-flat"); const plot = await recordOf(db, U.O, "property", "prop-plot");
    const lift = await recordOf(db, U.O, "asset", "ast-lift");
    expect(errorText(await attempt(db, U.O, () => q(db, "SELECT public.attach_asset_to_property($1,$2,true,'2024-04-01','lift')", [flat.id, lift.id]), { clientId: MCP }))).toBe("ASSISTANT_READ_ONLY: attach_asset_to_property");
    expect(errorText(await attempt(db, U.V, () => q(db, "SELECT public.attach_asset_to_property($1,$2,true,NULL,NULL)", [flat.id, lift.id])))).toMatch(/Active property and asset of your own/);
    const link = first(await as(db, U.O, () => q<{ r: string }>(db, "SELECT public.attach_asset_to_property($1,$2,true,'2024-04-01','Lift is part of the building') r", [flat.id, lift.id]))).r;
    expect(errorText(await attempt(db, U.O, () => q(db, "SELECT public.attach_asset_to_property($1,$2,false,'2025-01-01',NULL)", [plot.id, lift.id])))).toMatch(/CONTAINMENT_OVERLAP/);
    type V = { totals: Record<string, string | number>; items: { readable_id: string; scope: string; counted: boolean; counted_within: string | null; basis: string }[] };
    const val = async (d: string) => first(await as(db, U.O, () => q<{ r: V }>(db, "SELECT public.register_valuation_report($1) r", [d]))).r;
    const v1 = await val("2026-04-30");
    // C1: flat valuation 90L once (its carrying asset 50L and the lift 8L are inside it) + van 9L; C2: plot 25L + rack 3L; personal laptop
    expect(Object.fromEntries(Object.entries(v1.totals).map(([k, s]) => [k, Number(s)]))).toEqual({ [`${C1}|INR`]: 9900000, [`${C2}|INR`]: 2800000, [`${PERSONAL}|INR`]: 120000 });
    expect(v1.items.filter((i) => !i.counted).map((i) => [i.readable_id, i.scope, i.counted_within])).toEqual([["AST-000002", C1, "PRP-0001"], ["AST-000003", C1, "PRP-0001"]]);
    // ending the containment (step-up) counts the lift on its own from then on, never twice
    expect(errorText(await attempt(db, U.O, () => q(db, "SELECT public.end_asset_containment($1,'2026-05-01')", [link])))).toBe("STEP_UP_REQUIRED: end_asset_containment");
    await as(db, U.O, async () => { await stepUp(db, U.O); await q(db, "SELECT public.end_asset_containment($1,'2026-05-01')", [link]); });
    expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return q(db, "SELECT public.end_asset_containment($1,'2026-06-01')", [link]); }))).toMatch(/Open containment not found/);
    expect(Number((await val("2026-05-15")).totals[`${C1}|INR`])).toBe(9900000 + 800000);
    expect(Number((await val("2026-04-30")).totals[`${C1}|INR`])).toBe(9900000);
    // the containment row is history: never deleted, never edited
    expect(errorText(await attempt(db, null, () => q(db, "DELETE FROM public.property_assets WHERE id=$1", [link])))).toMatch(/never deleted/);
    expect(errorText(await attempt(db, null, () => q(db, "UPDATE public.property_assets SET included_in_property_value=false WHERE id=$1", [link])))).toMatch(/keep their identity/);
    await expectUnchanged();
  }, T);

  it("2c. a jointly owned property keeps ONE id and number: the co-owner's JSON copy attaches to it with dated shares; nobody else can attach", async () => {
    const flat = await recordOf(db, U.O, "property", "prop-flat");
    const oc1 = first(await sel<{ id: string }>(db, "SELECT id FROM public.legal_entities WHERE owner_id=$1 AND entity_key=$2", [U.O, C1])).id;
    const jc = first(await sel<{ id: string }>(db, "SELECT id FROM public.legal_entities WHERE owner_id=$1 AND entity_key=$2", [U.J, JC])).id;
    // without a confirmed share J cannot attach
    expect(codes(await preview(db, U.J, "properties", { attach: { "j-prop-flat": flat.id } }))).toContain("attach_refused:error:j-prop-flat");
    await as(db, U.O, async () => { await stepUp(db, U.O); await q(db, "SELECT public.record_ownership_share($1,$2,50,'2024-04-01',NULL,'Sale deed: 50%')", [flat.id, oc1]); });
    const js = first(await as(db, U.J, async () => { await stepUp(db, U.J); return q<{ r: string }>(db, "SELECT public.record_ownership_share($1,$2,50,'2024-04-01',NULL,'Sale deed: 50%') r", [flat.id, jc]); })).r;
    await as(db, U.O, async () => { await stepUp(db, U.O); await q(db, "SELECT public.decide_ownership_share($1,true)", [js]); });
    const p = await preview(db, U.J, "properties", { attach: { "j-prop-flat": flat.id } });
    expect(p.counts.to_create).toEqual({ register_legacy_copies: 1 });
    await commit(db, U.J, "properties", p.source_sha256, { attach: { "j-prop-flat": flat.id } });
    expect(first(await sel<{ n: number }>(db, "SELECT count(*)::int n FROM public.register_records WHERE record_kind='property' AND label LIKE 'Flat 4B%'")).n).toBe(1);
    expect(first(await sel<{ n: number }>(db, "SELECT count(*)::int n FROM public.properties WHERE legacy_id IN ('prop-flat','j-prop-flat')")).n).toBe(1);
    expect(await sel(db, "SELECT owner_id, share_pct::text, valid_from::text, status FROM public.record_ownerships WHERE record_id=$1 ORDER BY owner_id", [flat.id]))
      .toEqual([{ owner_id: U.O, share_pct: "50.000000", valid_from: "2024-04-01", status: "confirmed" }, { owner_id: U.J, share_pct: "50.000000", valid_from: "2024-04-01", status: "confirmed" }]);
    // the co-owner reads the one property row and its number; a stranger reads nothing
    expect(await as(db, U.J, () => q(db, "SELECT p.name, r.readable_id FROM public.properties p JOIN public.register_records r ON r.id=p.id"))).toEqual([{ name: "Flat 4B", readable_id: "PRP-0001" }]);
    expect(await as(db, U.X, () => q(db, "SELECT 1 FROM public.properties"))).toEqual([]);
    expect((await report(db, U.J, "properties")).status).toBe("match");
    // a further share would exceed 100% on the shared record (P5 rule, every role)
    const oc2 = first(await sel<{ id: string }>(db, "SELECT id FROM public.legal_entities WHERE owner_id=$1 AND entity_key=$2", [U.O, C2])).id;
    expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return q(db, "SELECT public.record_ownership_share($1,$2,10,'2025-01-01',NULL,NULL)", [flat.id, oc2]); }))).toMatch(/OWNERSHIP_OVER_100/);
    // J sells its half later: the share is ended, the record, number and J's copy stay
    await as(db, U.J, async () => { await stepUp(db, U.J); await q(db, "SELECT public.end_ownership_share($1,'2026-01-01')", [js]); });
    expect(first(await sel<{ n: number }>(db, "SELECT count(*)::int n FROM public.register_legacy_copies WHERE owner_id=$1", [U.J])).n).toBe(1);
    await expectUnchanged();
  }, T);

  // ---------------------------------------------------------------------------------------- slice 3
  it("3a. trips: TRP-YYYY-NNNN per scope, itinerary status separate from finance status, bookings and advances with read-only legacy amounts", async () => {
    const p = await preview(db, U.O, "trips");
    expect(p.counts.to_create).toMatchObject({ trips: 5, trip_bookings: 2, trip_advances: 2 });
    expect(codes(p)).toEqual(expect.arrayContaining([`trip_name_ambiguous:error:${TRIP.pune1}`, `trip_name_ambiguous:error:${TRIP.pune2}`, `trip_label_not_an_entity:info:${TRIP.goa}`,
      "advance_entry_not_linked:info:adv-1", "advance_entry_not_linked:info:adv-2"]));
    await commit(db, U.O, "trips", p.source_sha256);
    const trips = await sel<Row>(db, `SELECT t.legacy_id, t.readable_id, itinerary_status, finance_status, legacy_tag, organisation_label, primary_workspace_label, e.kind scope
      FROM public.trips t JOIN public.legal_entities e ON e.id=t.legal_entity_id WHERE t.owner_id=$1 ORDER BY t.readable_id`, [U.O]);
    expect(trips).toEqual([
      { legacy_id: TRIP.kochi, readable_id: "TRP-2025-0001", itinerary_status: "planned", finance_status: "finance_complete", legacy_tag: "Trip: Kochi", organisation_label: null, primary_workspace_label: null, scope: "individual_personal" },
      { legacy_id: TRIP.goa, readable_id: "TRP-2026-0001", itinerary_status: "planned", finance_status: "open", legacy_tag: "Trip: Goa offsite", organisation_label: "MOVAC", primary_workspace_label: "business", scope: "individual_personal" },
      { legacy_id: TRIP.delhi, readable_id: "TRP-2026-0002", itinerary_status: "cancelled", finance_status: "open", legacy_tag: "Trip: Delhi visit", organisation_label: null, primary_workspace_label: null, scope: "individual_personal" },
      { legacy_id: TRIP.pune1, readable_id: "TRP-2026-0003", itinerary_status: "planned", finance_status: "open", legacy_tag: "Trip: Pune", organisation_label: null, primary_workspace_label: null, scope: "individual_personal" },
      { legacy_id: TRIP.pune2, readable_id: "TRP-2026-0004", itinerary_status: "planned", finance_status: "open", legacy_tag: "Trip: Pune", organisation_label: null, primary_workspace_label: null, scope: "individual_personal" }]);
    // a cancelled itinerary never completes finance: Delhi keeps its open advance
    expect(first(await sel<Row>(db, "SELECT a.legacy_amount::text amt, a.entry_id, t.finance_status FROM public.trip_advances a JOIN public.trips t ON t.id=a.trip_id WHERE a.legacy_id='adv-2'"))).toEqual({ amt: "5000", entry_id: null, finance_status: "open" });
    // the statuses cannot be rewritten into each other (identity guard, every role)
    expect(errorText(await attempt(db, null, () => q(db, "UPDATE public.trips SET finance_status='finance_complete', finance_completed_at=now() WHERE legacy_id=$1", [TRIP.delhi])))).toMatch(/keep their identity/);
    expect(await sel(db, "SELECT legacy_id, payment_status, legacy_amount::text amt FROM public.trip_bookings ORDER BY legacy_id")).toEqual([
      { legacy_id: "bk-1", payment_status: "paid", amt: "12000" }, { legacy_id: "bk-2", payment_status: "unpaid", amt: "20000" }]);
    await expectUnchanged();
  }, T);

  it("3b. trip <-> entry links by id (trip_id column, exact tag, booking payment ids); ambiguous names are not linked; tags on entries stay untouched", async () => {
    const links = await sel<{ reg: string; legacy: string; expense_id: string; role: string; basis: string }>(db, `SELECT l.register reg, coalesce(t.legacy_id, b.legacy_id) legacy, l.expense_id, l.role, l.basis
      FROM public.register_entry_links l LEFT JOIN public.trips t ON t.id=l.record_id LEFT JOIN public.trip_bookings b ON b.id=l.record_id WHERE l.owner_id=$1 AND l.register IN ('trips','trip_bookings') ORDER BY 1,2,3,5`, [U.O]);
    expect(links).toEqual([
      { reg: "trip_bookings", legacy: "bk-1", expense_id: E.flight, role: "booking_payment", basis: "booking_expense_id" },
      { reg: "trips", legacy: TRIP.goa, expense_id: E.goa, role: "trip_expense", basis: "trip_tag" },
      { reg: "trips", legacy: TRIP.goa, expense_id: E.flight, role: "trip_expense", basis: "trip_tag" },
      { reg: "trips", legacy: TRIP.goa, expense_id: E.adv, role: "trip_expense", basis: "trip_id_column" },
      { reg: "trips", legacy: TRIP.goa, expense_id: E.home2, role: "trip_expense", basis: "trip_tag" }]);
    expect(links.some((l) => l.expense_id === E.pune)).toBe(false); // "Trip: Pune" names two trips
    expect(links.some((l) => l.expense_id === E.v1)).toBe(false);   // another owner's entry with the same tag
    expect(first(await sel<{ t: string[] }>(db, "SELECT tags t FROM public.expenses WHERE id=$1", [E.goa])).t).toEqual(["Trip: Goa offsite"]);
    const r = await report(db, U.O, "trips");
    expect(r).toMatchObject({ status: "match", orphans: [], pending: {}, links: { "trip_expense:trip_tag": 3, "trip_expense:trip_id_column": 1, "booking_payment:booking_expense_id": 1 } });
    // an entry tagged later shows up as pending (dual-read drift), and links on the next commit
    await actAs(db, null);
    await db.exec("BEGIN");
    await q(db, "UPDATE public.expenses SET tags = ARRAY['Trip: Kochi'] WHERE id=$1", [E.plain]);
    const drift = await report(db, U.O, "trips");
    await db.exec("ROLLBACK");
    expect(drift).toMatchObject({ status: "differences", pending: { register_entry_links: 1 } });
    await expectUnchanged();
  }, T);

  // ---------------------------------------------------------------------------------------- slice 4
  it("4. holdings (HLD per entity, demat link by ISIN) and receivables (RCV-YYYY-NNNN); counts and money identical", async () => {
    const h = await preview(db, U.O, "holdings");
    expect(codes(h)).toContain("demat_overlap:warning:h-eq");
    await commit(db, U.O, "holdings", h.source_sha256);
    expect(await sel(db, `SELECT h.legacy_id, h.readable_id, coalesce(CASE WHEN e.kind='individual_personal' THEN 'personal' END, e.entity_key) scope, h.demat_holding_id, h.legacy_quantity::text q, h.legacy_cost_basis::text c
      FROM public.investment_holdings h JOIN public.legal_entities e ON e.id=h.legal_entity_id ORDER BY h.legacy_id`)).toEqual([
      { legacy_id: "h-eq", readable_id: "HLD-000002", scope: PERSONAL, demat_holding_id: SEC, q: "10", c: "15000" },
      { legacy_id: "h-gold", readable_id: "HLD-000001", scope: PERSONAL, demat_holding_id: null, q: "2", c: "120000" },
      { legacy_id: "h-mf", readable_id: "HLD-000001", scope: C1, demat_holding_id: null, q: "100.5", c: "50000" }]);
    expect((await report(db, U.O, "holdings")).status).toBe("match");
    const rp = await preview(db, U.O, "receivables");
    expect(rp.exceptions.map((e) => `${e.code}:${e.legacy_id ?? ""}`)).toEqual(["receivable_settlement_not_migrated:rcv-1", "receivable_settlement_not_migrated:rcv-2"]);
    await commit(db, U.O, "receivables", rp.source_sha256);
    expect(await sel(db, "SELECT legacy_id, readable_id, legacy_amount::text a, legacy_gst::text g, settled_by_entry_id FROM public.receivables ORDER BY legacy_id")).toEqual([
      { legacy_id: "rcv-1", readable_id: "RCV-2026-0001", a: "118000", g: "18000", settled_by_entry_id: null },
      { legacy_id: "rcv-2", readable_id: "RCV-2026-0002", a: "5000", g: null, settled_by_entry_id: null }]);
    const rr = await report(db, U.O, "receivables");
    expect(rr.status).toBe("match");
    await expectUnchanged();
  }, T);

  // ---------------------------------------------------------------------------------------- slice 5
  it("5. projects: first-class register from budgets[kind=project] with PRJ number, plan and entry links by the exact tag", async () => {
    const p = await preview(db, U.O, "projects");
    expect(p.counts.to_create).toEqual({ projects: 1, register_entry_links: 2 });
    await commit(db, U.O, "projects", p.source_sha256);
    expect(first(await sel<Row>(db, "SELECT readable_id, name, tag, plan FROM public.projects"))).toEqual({ readable_id: "PRJ-0001", name: "Home renovation", tag: "Project: Home",
      plan: { amount: 500000, period: "annual", start: "2026-01-01", carry: false } });
    expect((await sel<{ e: string }>(db, "SELECT expense_id e FROM public.register_entry_links WHERE register='projects' ORDER BY 1")).map((r) => r.e)).toEqual([E.home1, E.home2]);
    expect((await report(db, U.O, "projects")).status).toBe("match");
    // every register is now idempotent for O: a fresh preview proposes nothing and a re-commit creates nothing
    for (const reg of ["assets", "properties", "trips", "holdings", "receivables", "projects"]) {
      const p2 = await preview(db, U.O, reg);
      expect(p2.counts.to_create, reg).toEqual({});
      expect((await commit(db, U.O, reg, p2.source_sha256)).created, reg).toEqual({});
    }
    // independent money check (TypeScript over the seed JSON vs the read-only legacy columns)
    const bookings = OWNER_DATA.trips.flatMap((x) => x.bookings ?? []).reduce((n, b) => n + b.amount, 0);
    const advances = OWNER_DATA.trips.flatMap((x) => x.advances ?? []).reduce((n, b) => n + b.amount, 0);
    expect(first(await sel<{ b: string; a: string }>(db, "SELECT (SELECT sum(legacy_amount) FROM public.trip_bookings WHERE owner_id=$1)::text b, (SELECT sum(legacy_amount) FROM public.trip_advances WHERE owner_id=$1)::text a", [U.O])))
      .toEqual({ b: String(bookings), a: String(advances) });
    const cost: Record<string, number> = {};
    for (const h of OWNER_DATA.books.holdings) cost[h.ownerEntityId ?? PERSONAL] = (cost[h.ownerEntityId ?? PERSONAL] ?? 0) + h.costBasis;
    expect(Object.fromEntries((await sel<{ k: string; s: string }>(db, `SELECT coalesce(CASE WHEN e.kind='individual_personal' THEN 'personal' END, e.entity_key) k, sum(h.legacy_cost_basis)::text s
      FROM public.investment_holdings h JOIN public.legal_entities e ON e.id=h.legal_entity_id WHERE h.owner_id=$1 GROUP BY 1`, [U.O])).map((x) => [x.k, Number(x.s)]))).toEqual(cost);
    await expectUnchanged();
  }, T);

  // ---------------------------------------------------------------------------------------- access
  it("6a. cross-tenant: another owner's backfill touches only its own rows; the same legacy id is a different record with its own scope-local number", async () => {
    await backfill(db, U.V, "assets"); await backfill(db, U.V, "trips");
    const v = await recordOf(db, U.V, "asset", "ast-van");
    expect([v.scope, v.readable_id]).toEqual([C1, "AST-000001"]); // V's own company keyed C1: its own scope
    expect(v.id).not.toBe((await recordOf(db, U.O, "asset", "ast-van")).id);
    for (const t of P6_TABLES) {
      const seen = await as(db, U.V, () => q<{ o: string }>(db, `SELECT DISTINCT owner_id::text o FROM public.${t}`));
      expect(seen.filter((r) => r.o !== U.V), t).toEqual([]);
    }
    const goa = first(await sel<{ id: string }>(db, "SELECT id FROM public.trips WHERE owner_id=$1 AND legacy_id=$2", [U.O, TRIP.goa])).id;
    expect(errorText(await attempt(db, U.V, async () => { await stepUp(db, U.V); return q(db, "SELECT public.archive_register_item('trips',$1,'not mine')", [goa]); }))).toMatch(/not found/);
    expect(first(await sel<{ n: number }>(db, "SELECT count(*)::int n FROM public.register_entry_links WHERE owner_id=$1", [U.V])).n).toBe(1); // V's own tagged entry, V's own trip
    await expectUnchanged();
  }, T);

  it("6b. a P2 grantee of C1 reads only C1's registers (never personal or C2); a stranger reads nothing", async () => {
    const g = async (sql: string) => (await as(db, U.G, () => q<{ l: string }>(db, sql))).map((r) => r.l);
    expect(await g("SELECT legacy_id l FROM public.assets ORDER BY 1")).toEqual(["ast-flat", "ast-lift", "ast-van"]);
    expect(await g("SELECT legacy_id l FROM public.depreciation_journals ORDER BY 1")).toEqual(["j-van-2026-02", "j-van-2026-03"]);
    expect(await g("SELECT legacy_id l FROM public.properties ORDER BY 1")).toEqual(["prop-flat"]);
    expect(await g("SELECT legacy_id l FROM public.leases ORDER BY 1")).toEqual(["lease-1"]);
    expect(await g("SELECT legacy_id l FROM public.investment_holdings ORDER BY 1")).toEqual(["h-mf"]);
    for (const t of ["trips", "trip_bookings", "trip_advances", "receivables", "projects", "register_archive_events"]) expect(await g(`SELECT id::text l FROM public.${t}`), t).toEqual([]);
    for (const t of P6_TABLES) expect(await as(db, U.X, () => q(db, `SELECT 1 FROM public.${t}`)), t).toEqual([]);
  }, T);

  it("6c. assistants read their owner's rows, but previews, reports, writers and table writes are refused; a revoked assistant reads nothing", async () => {
    expect((await as(db, U.O, () => q(db, "SELECT 1 FROM public.trips"), { clientId: MCP })).length).toBe(5);
    for (const [sql, fn] of [["SELECT public.preview_register_backfill('assets','{}')", "preview_register_backfill"], ["SELECT public.register_backfill_report('trips')", "register_backfill_report"],
      ["SELECT public.register_valuation_report(NULL)", "register_valuation_report"]] as const) {
      expect(errorText(await attempt(db, U.O, () => q(db, sql), { clientId: MCP }))).toBe(`ASSISTANT_READ_ONLY: ${fn}`);
    }
    const goa = first(await sel<{ id: string }>(db, "SELECT id FROM public.trips WHERE owner_id=$1 AND legacy_id=$2", [U.O, TRIP.goa])).id;
    const bot = (sql: string, params: unknown[]) => attempt(db, U.O, async () => { await stepUp(db, U.O); return q(db, sql, params); }, { clientId: MCP });
    expect(errorText(await bot("SELECT public.archive_register_item('trips',$1,'bot archive')", [goa]))).toBe("STEP_UP_REQUIRED: archive_register_item");
    expect(errorText(await bot("SELECT public.commit_register_backfill('trips',$1,'{}')", ["0".repeat(64)]))).toBe("STEP_UP_REQUIRED: commit_register_backfill");
    for (const t of P6_TABLES) {
      expect(errorText(await attempt(db, U.O, () => q(db, `DELETE FROM public.${t} WHERE owner_id=$1`, [U.O]))), t).toMatch(/permission denied/);
      expect(errorText(await attempt(db, U.O, () => q(db, `UPDATE public.${t} SET owner_id=owner_id WHERE owner_id=$1`, [U.O]))), t).toMatch(/permission denied/);
    }
    expect(errorText(await attempt(db, U.O, () => q(db, "INSERT INTO public.trips(owner_id, legal_entity_id, itinerary_status, finance_status, legacy_tag, legacy_id, legacy_element) SELECT $1, legal_entity_id, 'planned','open','x','x','{}' FROM public.trips LIMIT 1", [U.O])))).toMatch(/permission denied/);
    const revoked = await attempt(db, U.O, async () => {
      await stepUp(db, U.O); await q(db, "SELECT public.revoke_assistant_client($1)", [MCP]);
      await q(db, "SELECT set_config('test.client_id', $1, false)", [MCP]);
      const out: Record<string, number> = {};
      for (const t of P6_TABLES) out[t] = (await q(db, `SELECT 1 FROM public.${t}`)).length;
      return out;
    });
    expect(revoked).toEqual({ ok: true, value: Object.fromEntries(P6_TABLES.map((t) => [t, 0])) });
  }, T);

  // ---------------------------------------------------------------------------------------- archive
  it("7. archive keeps the record, its number and links; history is append-only; no hard delete or edit for any client or the table owner", async () => {
    const goa = first(await sel<{ id: string }>(db, "SELECT id FROM public.trips WHERE owner_id=$1 AND legacy_id=$2", [U.O, TRIP.goa])).id;
    const laptop = await recordOf(db, U.O, "asset", "ast-laptop");
    expect(errorText(await attempt(db, U.O, () => q(db, "SELECT public.archive_register_item('trips',$1,'Duplicate trip')", [goa])))).toBe("STEP_UP_REQUIRED: archive_register_item");
    await as(db, U.O, async () => { await stepUp(db, U.O); await q(db, "SELECT public.archive_register_item('trips',$1,'Trip merged into another record')", [goa]); });
    await as(db, U.O, async () => { await stepUp(db, U.O); await q(db, "SELECT public.archive_register_item('assets',$1,'Laptop given away (disposal entry booked separately)')", [laptop.id]); });
    expect(errorText(await attempt(db, U.O, async () => { await stepUp(db, U.O); return q(db, "SELECT public.archive_register_item('trips',$1,'again')", [goa]); }))).toMatch(/not found/);
    expect(first(await sel<Row>(db, "SELECT readable_id, archived_at IS NOT NULL a, archive_reason FROM public.trips WHERE id=$1", [goa]))).toEqual({ readable_id: "TRP-2026-0001", a: true, archive_reason: "Trip merged into another record" });
    expect(first(await sel<{ n: number }>(db, "SELECT count(*)::int n FROM public.register_entry_links WHERE record_id=$1", [goa])).n).toBe(4);
    expect(first(await sel<{ n: number }>(db, "SELECT count(*)::int n FROM public.assets WHERE id=$1", [laptop.id])).n).toBe(1);
    expect(await as(db, U.O, () => q(db, "SELECT register, readable_id, action, reason FROM public.register_archive_events ORDER BY at"))).toEqual([
      { register: "trips", readable_id: "TRP-2026-0001", action: "archived", reason: "Trip merged into another record" },
      { register: "assets", readable_id: "AST-000001", action: "archived", reason: "Laptop given away (disposal entry booked separately)" }]);
    for (const sql of ["DELETE FROM public.trips WHERE id=$1", "UPDATE public.trips SET archived_at=NULL, archived_by=NULL, archive_reason=NULL WHERE id=$1", "UPDATE public.trips SET name='renamed' WHERE id=$1",
      "UPDATE public.trips SET readable_id='TRP-2026-0999' WHERE id=$1"]) {
      expect(errorText(await attempt(db, null, () => q(db, sql, [goa]))), sql).toMatch(/never deleted|only be set once|keep their identity|READABLE_ID_IMMUTABLE/);
    }
    expect(errorText(await attempt(db, null, () => q(db, "UPDATE public.assets SET legacy_cost=1 WHERE legacy_id='ast-van'")))).toMatch(/keep their identity/);
    expect(errorText(await attempt(db, null, () => q(db, "DELETE FROM public.register_archive_events")))).toMatch(/never deleted/);
    await expectUnchanged();
  }, T);

  it("8. readable numbers are stable and never reused: a new JSON trip gets the next number, archived numbers stay taken, earlier numbers unchanged", async () => {
    const before = await sel(db, "SELECT legacy_id, readable_id FROM public.trips WHERE owner_id=$1 ORDER BY 1", [U.O]);
    await actAs(db, null);
    await q(db, `UPDATE public.finance_preferences SET data = jsonb_set(data, '{trips}', (data->'trips') || $2::jsonb) WHERE owner_id=$1`,
      [U.O, JSON.stringify([{ id: "trip-new", name: "Mysuru", destination: "Mysuru", start: "2026-08-01", end: "2026-08-02", budget: 3000, currencies: ["INR"] }])]);
    json0[U.O] = first(await sel<{ h: string }>(db, "SELECT public.legacy_sha256(data) h FROM public.finance_preferences WHERE owner_id=$1", [U.O])).h;
    D0 = await dataSnapshot(db, tables);
    const r = await backfill(db, U.O, "trips");
    expect(r.created).toEqual({ trips: 1 });
    expect(first(await sel<{ r: string }>(db, "SELECT readable_id r FROM public.trips WHERE legacy_id='trip-new'")).r).toBe("TRP-2026-0005");
    expect(await sel(db, "SELECT legacy_id, readable_id FROM public.trips WHERE owner_id=$1 AND legacy_id <> 'trip-new' ORDER BY 1", [U.O])).toEqual(before);
    await expectUnchanged();
  }, T);

  it("9. erasure removes the erasing owner's register rows only (counters kept); a co-owned record stops the administrator's erasure", async () => {
    const counters = first(await sel<{ n: number }>(db, "SELECT count(*)::int n FROM public.readable_id_counters")).n;
    const oRows = await rowSet(db, P6_TABLES);
    await as(db, U.V, async () => { await stepUp(db, U.V); await q(db, "SELECT public.delete_my_finance_data()"); });
    for (const t of P6_TABLES) expect(first(await sel<{ n: number }>(db, `SELECT count(*)::int n FROM public.${t} WHERE owner_id=$1`, [U.V])).n, t).toBe(0);
    expect(first(await sel<{ n: number }>(db, "SELECT count(*)::int n FROM public.readable_id_counters")).n).toBe(counters);
    const after = await rowSet(db, P6_TABLES);
    for (const t of P6_TABLES) expect((oRows[t] ?? []).filter((r) => !r.includes(U.V)), t).toEqual(after[t]);
    // O administers the jointly owned flat (J holds a share): O's erasure is refused and changes nothing
    const o = await attempt(db, U.O, async () => { await stepUp(db, U.O); return q(db, "SELECT public.delete_my_finance_data()"); });
    expect(errorText(o)).toMatch(/ERASURE_BLOCKED_COOWNED/);
    expect(await rowSet(db, P6_TABLES)).toEqual(after);
  }, T);
});

// ------------------------------------------------------------------------------------------
// Rollback: exact P1+P2+P4+P5 catalog; P6 rows archived; anchors and numbers kept for re-apply
// ------------------------------------------------------------------------------------------
describe("P6 rollback restores the exact P5 catalog and keeps every row as evidence", () => {
  it("P5 rollback refuses while P6 is installed; P6 rollback restores catalog and data; anchors and numbers survive a re-apply; P5 then rolls back", async () => {
    const { db, tables, D0, P5_ROWS, S5 } = await setup();
    await expect(db.exec(readSql(P6))).rejects.toThrow(/already installed/);
    await db.exec("ROLLBACK").catch(() => undefined);
    await expect(db.exec(readSql(P5_RB))).rejects.toThrow(/Roll back P6/);
    await db.exec("ROLLBACK").catch(() => undefined);
    for (const reg of ["assets", "properties", "trips", "holdings", "receivables", "projects"]) await backfill(db, U.O, reg);
    const anchors = await sel(db, "SELECT id, readable_id, legacy_id FROM public.register_records WHERE owner_id=$1 ORDER BY legacy_id", [U.O]);
    const tripNums = (await sel<{ r: string }>(db, "SELECT readable_id r FROM public.trips ORDER BY 1")).map((x) => x.r);
    const counts = Object.fromEntries(await Promise.all(P6_TABLES.map(async (t) => [t, first(await sel<{ n: number }>(db, `SELECT count(*)::int n FROM public.${t}`)).n] as const)));
    expect(await fullCatalog(db)).not.toEqual(S5);

    await db.exec(readSql(P6_RB));
    const S5b = await fullCatalog(db);
    for (const k of Object.keys(S5) as (keyof typeof S5)[]) expect(S5b[k], `after P6 rollback: ${k}`).toEqual(S5[k]);
    expect(await dataSnapshot(db, tables)).toEqual(D0);
    await expectP5RowsKept(db, P5_ROWS);
    const archived = (await sel<{ t: string }>(db, "SELECT tablename t FROM pg_tables WHERE schemaname='security_rollback_archive' ORDER BY 1")).map((r) => r.t.replace(/_\d{8}T\d{9}$/, ""));
    expect(archived).toEqual(P6_TABLES.map((t) => `p6_${t}`).sort());
    for (const t of P6_TABLES) {
      const name = first(await sel<{ t: string }>(db, "SELECT tablename t FROM pg_tables WHERE schemaname='security_rollback_archive' AND tablename ~ $1", [`^p6_${t}_\\d{8}T\\d{9}$`])).t;
      expect(first(await sel<{ n: number }>(db, `SELECT count(*)::int n FROM security_rollback_archive."${name}"`)).n, t).toBe(counts[t]);
    }
    expect(first(await sel<{ ok: boolean }>(db, "SELECT has_schema_privilege('authenticated','security_rollback_archive','USAGE') ok")).ok).toBe(false);

    // re-apply: assets/properties re-attach to the SAME anchors and numbers; trips get NEW numbers (never a reissue)
    await db.exec(readSql(P6));
    await backfill(db, U.O, "assets"); await backfill(db, U.O, "trips");
    expect(await sel(db, "SELECT a.id, r.readable_id, a.legacy_id FROM public.assets a JOIN public.register_records r ON r.id=a.id ORDER BY a.legacy_id"))
      .toEqual(anchors.filter((x) => (x as { legacy_id: string }).legacy_id.startsWith("ast-")));
    const again = (await sel<{ r: string }>(db, "SELECT readable_id r FROM public.trips ORDER BY 1")).map((x) => x.r);
    expect(again.filter((r) => tripNums.includes(r))).toEqual([]);
    await db.exec(readSql(P6_RB));
    await db.exec(readSql(P5_RB)); // P5 rolls back once P6 is gone
    expect(first(await sel<{ r: string | null }>(db, "SELECT to_regclass('public.legal_entities')::text r")).r).toBeNull();
    await db.close();
  }, 400_000);
});

// ------------------------------------------------------------------------------------------
// Backup decisions for the tables P6 adds (same pattern as P5_BACKUP_DECISIONS; src/lib/backup.ts
// classifies the APPLIED schema only, so these move there when P6 becomes an applied migration).
// ------------------------------------------------------------------------------------------
const P6_BACKUP_DECISIONS: Readonly<Record<string, string>> = {
  assets: "Derived by the reviewed backfill from preferences.assets (backed up) until the gated write switch; then backup format 4 with register_records (claim_readable_id keeps AST numbers) and account/entry/document ids remapped",
  asset_events: "Derived from books.assetEvents until the write switch; then format 4 (asset ids remapped with assets)",
  depreciation_journals: "Derived from books.journals until the write switch; then format 4 with new owner-scoped ids (legacy stableUuid kept in legacy_id, inventory R12)",
  properties: "Derived from books.properties until the write switch; then format 4 with register_records (PRP numbers claimed); a co-owner's shares never travel into another account",
  property_units: "Derived from books.properties[].buildings until the write switch; then format 4 with properties",
  property_assets: "Owner containment decisions; format 4 with properties and assets (ids remapped)",
  register_valuations: "Derived from books.properties[].valuation until the write switch; then format 4 (append-only observations)",
  leases: "Derived from books.leases until the write switch; then format 4 with claim_readable_id (LSE) and account/document ids remapped",
  trips: "Derived from preferences.trips until the write switch; then format 4 with claim_readable_id (TRP)",
  trip_bookings: "Derived from trips[].bookings until the write switch; then format 4 with trips",
  trip_advances: "Derived from trips[].advances until the write switch; then format 4 with trips (entry ids remapped)",
  register_entry_links: "Derived from expenses.trip_id/tags and booking expense ids until the write switch; then format 4 with entry ids remapped",
  investment_holdings: "Derived from books.holdings until the write switch; then format 4 with claim_readable_id (HLD) and demat/account ids remapped",
  receivables: "Derived from preferences.receivables until the write switch; then format 4 with claim_readable_id (RCV)",
  projects: "Derived from budgets[kind=project] until the write switch; then format 4 with claim_readable_id (PRJ)",
  register_legacy_copies: "A co-owner's own JSON copy (its preferences are backed up); never copied into another account; re-attached by the reviewed backfill after restore",
  register_archive_events: "Server audit of archive actions; stays with the source account (like preference_approvals)",
};
describe("P6 backup decisions", () => {
  it("every owner-scoped table P6 adds has exactly one backup decision; the applied-schema lists need no change yet", async () => {
    const owned = async (db: Db) => (await q<{ t: string }>(db, `SELECT DISTINCT c.table_name t FROM information_schema.columns c JOIN information_schema.tables x ON x.table_schema=c.table_schema AND x.table_name=c.table_name AND x.table_type='BASE TABLE'
      WHERE c.table_schema='public' AND c.column_name IN ('owner_id','employee_id') ORDER BY 1`)).map((r) => r.t);
    const db = await fullSchemaDb([...BASE, P5]); const before = new Set(await owned(db));
    await db.exec(readSql(P6));
    const added = (await owned(db)).filter((t) => !before.has(t));
    expect(added.sort()).toEqual(Object.keys(P6_BACKUP_DECISIONS).sort());
    expect([...P6_TABLES].sort()).toEqual(Object.keys(P6_BACKUP_DECISIONS).sort());
    const listed = new Set<string>([...BACKUP_TABLES, ...Object.keys(BACKUP_EXCLUDED_TABLES), ...Object.keys(BACKUP_NOT_OWNER_TABLES)]);
    expect(added.filter((t) => listed.has(t))).toEqual([]);
    await db.close();
  }, T);
});
