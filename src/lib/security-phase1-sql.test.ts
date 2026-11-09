// @vitest-environment node
// Phase 1 security (database track) acceptance tests for the PROPOSED SQL in .lovable/staged-sql/proposed/:
// P1 (containment) + P2 (V3.1 roles, legacy company roles) + P4 (step-up, assistant limits, audit history),
// plus the optional P4b PostgREST hook. Everything runs in isolated in-memory PGlite replaying
// drizzle/migrations 0000-0088 (src/test/full-schema-pglite.ts). Nothing here connects to Lovable Cloud.
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { fullSchemaDb, actAs, addUsers, readSql } from "../test/full-schema-pglite";
import { BACKUP_TABLES, prepareRestore, type Backup } from "./backup";

const DIR = ".lovable/staged-sql/proposed/";
const P1 = `${DIR}P1_security_containment.sql`;
const P1_RB = `${DIR}P1_security_containment.rollback.sql`;
const P2 = `${DIR}P2_v31_role_model.sql`;
const P2_RB = `${DIR}P2_v31_role_model.rollback.sql`;
const P4 = `${DIR}P4_step_up_and_assistant_limits.sql`;
const P4_RB = `${DIR}P4_step_up_and_assistant_limits.rollback.sql`;
const P4B = `${DIR}P4b_api_pre_request.sql`;
const P4B_RB = `${DIR}P4b_api_pre_request.rollback.sql`;
const ALL = [P1, P2, P4];
const T = 180_000;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U = {
  O: id(1), // owner of companies c1, c2
  V: id(2), // unrelated owner
  M: id(3), // c1 editor (entity_members can_write)
  R: id(4), // c1 read-only member
  G: id(5), // legacy finance role WITH a c1 read grant
  F: id(6), // legacy finance role, no grant
  MGR: id(7), // legacy manager role, no grant
  ADM: id(8), // app admin
  X: id(9), // stranger
  KID: id(10), // adult family member account
  W: id(11), // legacy finance role WITH a c1 write grant
  GUEST: id(12), // anonymous demo visitor
  B: id(13), // second account of a real person (cross-account restore)
} as const;
const EMAIL: Record<string, string> = Object.fromEntries(Object.entries(U).map(([k, v]) => [v, `${k.toLowerCase()}@x.in`]));
const email = (u: string): string => { const e = EMAIL[u]; if (!e) throw new Error(`No fixture email for ${u}`); return e; };
const hex = (s: string) => Buffer.from(s, "utf8").toString("hex");
const C1 = `${U.O}/companies/${hex("c1")}/`;
const PATH = {
  c1doc: `${C1}c1-invoice.pdf`,
  c2doc: `${U.O}/docs/c2-board.pdf`,
  personalDoc: `${U.O}/docs/personal-passport.pdf`,
  c1receipt: `${U.O}/receipts/c1-taxi.jpg`,
  personalReceipt: `${U.O}/receipts/pharmacy.jpg`,
  report: `${U.O}/reports/0f0e0d0c-0000-4000-8000-000000000001.pdf`,
  statement: `${U.O}/statements/hdfc-2026-04.pdf`,
  victimReceipt: `${U.V}/receipts/v-medical.jpg`,
  victimStatement: `${U.V}/statements/v.pdf`,
};
const PASSKEY_ID = id(900);
const MCP = "mcp-client-1", MCP2 = "mcp-client-2";

type Db = PGlite;
const q = async <R = Record<string, unknown>>(db: Db, sql: string, params: unknown[] = []) => (await db.query<R>(sql, params)).rows;
function first<R>(rows: readonly R[], what = "row"): R { const r = rows[0]; if (r === undefined) throw new Error(`Expected a ${what}, got none`); return r; }
const errInfo = (e: unknown) => { const x = e as Error & { code?: unknown }; return { error: String(x.message), code: typeof x.code === "string" ? x.code : "" }; };

type Opts = { anon?: boolean; role?: string; clientId?: string | undefined };
type Attempt<R> = { ok: true; value: R } | { ok: false; error: string; code: string };
/** Run fn as uid inside a transaction that is always rolled back, so probes never leak state. */
async function attempt<R>(db: Db, uid: string | null, fn: () => Promise<R>, opts: Opts = {}): Promise<Attempt<R>> {
  await actAs(db, uid, opts.clientId === undefined ? {} : { clientId: opts.clientId });
  if (opts.role) { await db.exec("RESET ROLE"); await db.exec(`SET ROLE ${opts.role}`); }
  if (opts.anon) await db.query("SELECT set_config('test.anon','true',false)");
  await db.exec("BEGIN");
  try { return { ok: true, value: await fn() }; }
  catch (e) { return { ok: false, ...errInfo(e) }; }
  finally { await db.exec("ROLLBACK"); await db.query("SELECT set_config('test.anon','',false)"); await actAs(db, null); }
}
/** Run fn as uid and keep the effects. */
async function as<R>(db: Db, uid: string, fn: () => Promise<R>, opts: Opts = {}) {
  await actAs(db, uid, opts.clientId === undefined ? {} : { clientId: opts.clientId });
  if (opts.anon) await db.query("SELECT set_config('test.anon','true',false)");
  try { return await fn(); } finally { await db.query("SELECT set_config('test.anon','',false)"); await actAs(db, null); }
}
/** Record a step-up exactly as the server does (service role), then return to the caller's role. Works inside a transaction. */
async function stepUp(db: Db, uid: string, seconds = 300) {
  const caller = first(await q<{ u: string | null }>(db, "SELECT nullif(current_setting('test.uid',true),'') u")).u;
  await db.exec("RESET ROLE");
  await db.exec("SET ROLE service_role");
  try { await q(db, "SELECT public.record_step_up($1,'password',$2)", [uid, seconds]); }
  finally { await db.exec("RESET ROLE"); if (caller) await db.exec("SET ROLE authenticated"); }
}
/** Superuser-only manipulation: make every grant of uid expired (keeps the 5-minute CHECK valid). */
async function expireStepUp(db: Db, uid: string) {
  const caller = first(await q<{ u: string | null }>(db, "SELECT nullif(current_setting('test.uid',true),'') u")).u;
  await db.exec("RESET ROLE");
  try { await q(db, "UPDATE public.step_up_grants SET created_at=clock_timestamp()-interval '10 minutes', expires_at=clock_timestamp()-interval '6 minutes' WHERE owner_id=$1", [uid]); }
  finally { if (caller) await db.exec("SET ROLE authenticated"); }
}
/** Inside an attempt: run a statement that may fail without aborting the surrounding transaction; returns its error text or "". */
async function errorOf(db: Db, fn: () => Promise<unknown>) {
  await db.exec("SAVEPOINT probe");
  try { await fn(); await db.exec("RELEASE SAVEPOINT probe"); return ""; }
  catch (e) { await db.exec("ROLLBACK TO SAVEPOINT probe"); return errInfo(e).error; }
}
const setUid = (db: Db, uid: string) => q(db, "SELECT set_config('test.uid',$1,false)", [uid]);
const setClient = (db: Db, c: string) => q(db, "SELECT set_config('test.client_id',$1,false)", [c]);

async function seedScenario(db: Db) {
  const { GUEST, ...real } = U;
  await addUsers(db, Object.fromEntries(Object.values(real).map((u) => [u, email(u)])));
  await q(db, "INSERT INTO auth.users(id,email,is_anonymous) VALUES ($1,NULL,true)", [GUEST]);
  const prefs = (entities: object[], profiles: object[]) => JSON.stringify({ entities, books: { entityTaxProfiles: profiles }, categories: [{ name: "Food" }, { name: "Travel" }] });
  await q(db, `INSERT INTO public.finance_preferences(owner_id,data) VALUES ($1,$2::jsonb),($3,$4::jsonb)
    ON CONFLICT (owner_id) DO UPDATE SET data=excluded.data`, [
    U.O, prefs([{ id: "c1", name: "Co One", kind: "company" }, { id: "c2", name: "Co Two", kind: "company" }],
      [{ entityId: "c1", fy: "2025-26", pan: "AAACO1111A" }, { entityId: "c2", fy: "2025-26", pan: "AAACO2222B" }]),
    U.V, prefs([{ id: "v1", name: "Victim Pvt Ltd", kind: "company" }], [{ entityId: "v1", fy: "2025-26", pan: "AAACV9999Z" }]),
  ]);
  await q(db, `INSERT INTO public.documents(owner_id,title,file_path,file_name,entity_id) VALUES
    ($1,'c1 invoice',$2,'c1.pdf','c1'),($1,'c2 board pack',$3,'c2.pdf','c2'),($1,'passport',$4,'p.pdf',NULL)`,
    [U.O, PATH.c1doc, PATH.c2doc, PATH.personalDoc]);
  for (const p of Object.values(PATH)) await q(db, "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES ('receipts',$1,$2)", [p, p.slice(0, 36)]);
  const exp = (emp: string, title: string, entity: string | null, receipt: string | null) =>
    q(db, `INSERT INTO public.expenses(employee_id,title,merchant,category,amount,currency,expense_date,entity_id,receipts)
      VALUES ($1,$2,$2,'Travel',100,'INR',current_date,$3,$4::jsonb)`, [emp, title, entity, JSON.stringify(receipt ? [{ path: receipt, name: "r" }] : [])]);
  await exp(U.O, "c1 taxi", "c1", PATH.c1receipt);
  await exp(U.O, "c2 dinner", "c2", null);
  await exp(U.O, "pharmacy", null, PATH.personalReceipt);
  await exp(U.V, "victim medical", null, PATH.victimReceipt);
  await exp(U.V, "victim company", "v1", null);
  await exp(U.F, "finance own lunch", null, null);
  await q(db, "INSERT INTO public.user_roles(user_id,role) VALUES ($1,'finance'),($2,'finance'),($3,'manager'),($4,'finance')", [U.G, U.F, U.MGR, U.W]);
  await q(db, "INSERT INTO public.app_admins(user_id) VALUES ($1)", [U.ADM]);
  await q(db, "UPDATE public.role_permissions SET allowed=true WHERE role='finance' AND action='edit_expenses'");
  await q(db, "INSERT INTO public.department_budgets(department,amount) VALUES ('Engineering',5000),('Sales',9000) ON CONFLICT DO NOTHING");
  await q(db, `INSERT INTO public.preference_approvals(id,owner_id,previous_data,approved_data,changed_sections,transaction_id)
    VALUES (gen_random_uuid(),$1,'{}','{}','{assets}',1)`, [U.O]);
  await q(db, "INSERT INTO public.device_passkeys(owner_id,credential_id,public_key) VALUES ($1,'cred-o-1','pk1')", [U.O]);
  await as(db, U.O, async () => {
    await q(db, "SELECT public.grant_entity_access('c1',$1,true)", [email(U.M)]);
    await q(db, "SELECT public.grant_entity_access('c1',$1,false)", [email(U.R)]);
    await q(db, "SELECT public.grant_entity_access('c1',$1,false)", [email(U.G)]);
    await q(db, "SELECT public.grant_entity_access('c1',$1,true)", [email(U.W)]);
    const x = first(await q<{ g: string }>(db, "SELECT public.grant_entity_access('c2',$1,false) g", [email(U.X)]));
    await q(db, "SELECT public.revoke_entity_access($1)", [x.g]);
  });
}

/** Scenario seeded at 0088, then the proposed files applied in order (P4 also gives the fixture passkey a known id). */
async function scenarioDb(after: string[] = []) {
  const db = await fullSchemaDb();
  await seedScenario(db);
  for (const f of after) await db.exec(readSql(f));
  if (after.includes(P4)) await q(db, "UPDATE public.device_passkeys SET id=$1 WHERE credential_id='cred-o-1'", [PASSKEY_ID]);
  return db;
}

// ------------------------------------------------------------------------------------------
// A. Findings: each probe returns true when the attack SUCCEEDS.
// ------------------------------------------------------------------------------------------
const objectsVisible = (db: Db, names: string[]) => q(db, "SELECT name FROM storage.objects WHERE name = ANY($1)", [names]);
const rows = <R>(r: Attempt<R[]>) => (r.ok ? r.value.length : 0);
const PROBES: { id: string; what: string; run: (db: Db) => Promise<boolean> }[] = [
  { id: "H-1a", what: "manager with no grant reads unrelated owners' personal expenses", run: async (db) =>
    rows(await attempt(db, U.MGR, () => q(db, "SELECT 1 FROM public.expenses WHERE employee_id = ANY($1)", [[U.O, U.V]]))) > 0 },
  { id: "H-1b", what: "finance with no grant reads statements, vault documents and receipts", run: async (db) =>
    rows(await attempt(db, U.F, () => objectsVisible(db, [PATH.statement, PATH.personalDoc, PATH.victimReceipt, PATH.victimStatement]))) > 0 },
  { id: "H-1c", what: "finance with no grant reads every owner's company PAN", run: async (db) => {
    const r = await attempt(db, U.F, () => q(db, "SELECT profiles::text p FROM public.team_company_tax()"));
    return r.ok && r.value.some((x) => /AAAC/.test(String(x["p"]))); } },
  { id: "H-1d", what: "finance with only a c1 grant reads personal and c2 rows", run: async (db) =>
    rows(await attempt(db, U.G, () => q(db, "SELECT 1 FROM public.expenses WHERE employee_id <> $1 AND entity_id IS DISTINCT FROM 'c1'", [U.G]))) > 0 },
  { id: "H-1e", what: "finance with no grant edits an unrelated owner's expense", run: async (db) =>
    rows(await attempt(db, U.F, () => q(db, "UPDATE public.expenses SET title='pwned' WHERE employee_id=$1 RETURNING 1", [U.V]))) > 0 },
  { id: "H-1f", what: "manager with no grant reads an unrelated owner's receipts", run: async (db) =>
    rows(await attempt(db, U.MGR, () => objectsVisible(db, [PATH.victimReceipt]))) > 0 },
  { id: "H-2", what: "legacy (possibly self-assigned) finance row changes shared department budgets", run: async (db) =>
    rows(await attempt(db, U.F, () => q(db, "UPDATE public.department_budgets SET amount=1 WHERE department='Sales' RETURNING 1"))) > 0 },
  { id: "H-3a", what: "c1 editor reassigns the owner's company document to themself", run: async (db) =>
    rows(await attempt(db, U.M, () => q(db, "UPDATE public.documents SET owner_id=$1::uuid, file_path=$1::text||'/stolen.pdf' WHERE file_path=$2 RETURNING 1", [U.M, PATH.c1doc]))) > 0 },
  { id: "H-3b", what: "finance c1 editor moves an owner's expense to another company / re-points its receipts", run: async (db) => {
    const a = await attempt(db, U.W, () => q(db, "UPDATE public.expenses SET entity_id='c2' WHERE entity_id='c1' AND employee_id=$1 RETURNING 1", [U.O]));
    const b = await attempt(db, U.W, () => q(db, "UPDATE public.expenses SET receipts=jsonb_build_array(jsonb_build_object('path',$2::text)) WHERE entity_id='c1' AND employee_id=$1 RETURNING 1", [U.O, PATH.statement]));
    return rows(a) > 0 || rows(b) > 0; } },
  { id: "M-1a", what: "c1 editor adds a c1 document pointing at the owner's personal vault file, then reads it", run: async (db) =>
    rows(await attempt(db, U.M, async () => {
      await q(db, "INSERT INTO public.documents(owner_id,title,file_path,file_name,entity_id) VALUES ($1,'x',$2,'x','c1')", [U.O, PATH.personalDoc]);
      return objectsVisible(db, [PATH.personalDoc]); })) > 0 },
  { id: "M-1b", what: "c1 editor re-points a c1 document at the owner's c2 original, then reads it", run: async (db) =>
    rows(await attempt(db, U.M, async () => {
      await q(db, "UPDATE public.documents SET file_path=$1 WHERE file_path=$2", [PATH.c2doc, PATH.c1doc]);
      return objectsVisible(db, [PATH.c2doc]); })) > 0 },
  { id: "M-2", what: "c1 editor writes a file outside the company namespace", run: async (db) =>
    (await attempt(db, U.M, () => q(db, "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES ('receipts',$1,$2) RETURNING 1", [`${U.O}/reports/11111111-0000-4000-8000-000000000009.pdf`, U.M]))).ok },
  { id: "M-4", what: "an external assistant token writes the user's own records and files", run: async (db) => {
    const a = await attempt(db, U.O, () => q(db, "INSERT INTO public.expenses(employee_id,title,merchant,category,amount,currency,expense_date) VALUES ($1,'mcp','x','Food',1,'INR',current_date) RETURNING 1", [U.O]), { clientId: MCP });
    const b = await attempt(db, U.O, () => q(db, "UPDATE public.expenses SET title='mcp' WHERE employee_id=$1 RETURNING 1", [U.O]), { clientId: MCP });
    const c = await attempt(db, U.O, () => q(db, "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES ('receipts',$1,$2) RETURNING 1", [`${U.O}/receipts/mcp.jpg`, U.O]), { clientId: MCP });
    return rows(a) > 0 || rows(b) > 0 || rows(c) > 0; } },
];

describe("A. findings reproduce at 0088 and are blocked after P1+P2+P4", () => {
  let base: Db; let after: Db;
  beforeAll(async () => { base = await scenarioDb(); after = await scenarioDb(ALL); }, T);
  for (const p of PROBES) {
    it(`${p.id} reproduces at 0088: ${p.what}`, async () => { expect(await p.run(base)).toBe(true); }, T);
    it(`${p.id} blocked after P1+P2+P4: ${p.what}`, async () => { expect(await p.run(after)).toBe(false); }, T);
  }
});

// ------------------------------------------------------------------------------------------
// B. Legacy company grants: effective rights per V3.1 action, before and after P2 (and P4).
//    Each probe exercises the real database path for that action against the owner's company c1.
// ------------------------------------------------------------------------------------------
const ACTIONS = ["view", "upload", "draft_edit", "propose", "post", "approve", "export", "share", "delete_unposted", "manage_access", "reopen"] as const;
type Action = (typeof ACTIONS)[number];
const LEGACY_EXPECTED: Record<"legacy_company_editor" | "legacy_company_viewer", Action[]> = {
  legacy_company_editor: ["view", "upload", "draft_edit", "export"],
  legacy_company_viewer: ["view", "export"],
};
const affected = (r: Attempt<unknown[]>) => r.ok && r.value.length > 0;
async function effectiveRights(db: Db, u: string): Promise<Action[]> {
  const p4 = first(await q<{ x: boolean }>(db, "SELECT to_regprocedure('public.record_step_up(uuid,text,integer)') IS NOT NULL x")).x;
  // Under P4 the member also holds a fresh step-up, so every refusal below is about authority, not re-confirmation.
  const run = (fn: () => Promise<unknown[]>) => attempt(db, u, async () => { if (p4) await stepUp(db, u); return fn(); });
  const grantId = first(await q<{ id: string }>(db, "SELECT id FROM public.entity_members WHERE member_id=$1 AND revoked_at IS NULL", [U.R])).id;
  const view = affected(await run(async () => {
    const d = await q(db, "SELECT 1 FROM public.documents WHERE owner_id=$1 AND entity_id='c1'", [U.O]);
    const f = await objectsVisible(db, [PATH.c1doc]);
    return d.length > 0 && f.length > 0 ? [1] : [];
  }));
  const probes: Record<Action, boolean> = {
    view,
    // export: the only member export path (SharedWithMe CSV/PDF/Excel) is built in the browser from the
    // rows the member can read; there is no server-side export for members, so export == view.
    export: view,
    upload: affected(await run(async () => {
      const f = `${C1}${id(777)}-upload.pdf`;
      await q(db, "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES ('receipts',$1,$2)", [f, u]);
      return q(db, "INSERT INTO public.documents(owner_id,title,file_path,file_name,entity_id) VALUES ($1,'up',$2,'up.pdf','c1') RETURNING 1", [U.O, f]);
    })),
    draft_edit: affected(await run(() => q(db, "UPDATE public.documents SET title='edited', notes='checked' WHERE file_path=$1 RETURNING 1", [PATH.c1doc]))),
    propose: affected(await run(() => q(db, "INSERT INTO public.expense_drafts(id,owner_id,data) VALUES (gen_random_uuid(),$1,'{\"entityId\":\"c1\"}') RETURNING 1", [U.O]))),
    post: affected(await run(() => q(db, "INSERT INTO public.expenses(employee_id,title,merchant,category,amount,currency,expense_date,entity_id) VALUES ($1,'posted','x','Travel',5,'INR',current_date,'c1') RETURNING 1", [U.O]))),
    approve: affected(await run(() => q(db, "UPDATE public.finance_preferences SET updated_at=now() WHERE owner_id=$1 RETURNING 1", [U.O]))),
    share: affected(await run(async () => [await q(db, "SELECT public.grant_entity_access('c1',$1,false)", [email(U.X)])])),
    delete_unposted: affected(await run(() => q(db, "DELETE FROM public.documents WHERE owner_id=$1 AND entity_id='c1' RETURNING 1", [U.O]))),
    manage_access: affected(await run(async () => {
      await q(db, "SELECT public.revoke_entity_access($1)", [grantId]);
      return q(db, "SELECT 1 FROM public.entity_members WHERE id=$1 AND revoked_at IS NOT NULL", [grantId]);
    })) || affected(await run(async () => [await q(db, "SELECT public.invite_access($1,'c1','z@x.in','auditor',NULL)", [U.O])])),
    reopen: affected(await run(() => q(db, "UPDATE public.period_close_evidence SET evidence=evidence WHERE owner_id=$1 RETURNING 1", [U.O])))
      || affected(await run(() => q(db, "UPDATE public.finance_preferences SET data=jsonb_set(data,'{books,closedPeriods}','[]') WHERE owner_id=$1 RETURNING 1", [U.O]))),
  };
  return ACTIONS.filter((a) => probes[a]);
}
const hasPerm = async (db: Db, u: string, entity: string | null) => {
  const r = await attempt(db, u, () => q<{ a: string; ok: boolean }>(db, "SELECT a, public.has_permission($1,$2,a) ok FROM unnest($3::text[]) a", [U.O, entity, ACTIONS]));
  if (!r.ok) throw new Error(r.error);
  return r.value.filter((x) => x.ok).map((x) => x.a);
};

describe("B. legacy company grants keep exactly their rights (no escalation, no loss)", () => {
  const states: [string, string[]][] = [["0088", []], ["P1", [P1]], ["P1+P2", [P1, P2]], ["P1+P2+P4", ALL]];
  const dbs: Record<string, Db> = {};
  beforeAll(async () => { for (const [n, f] of states) dbs[n] = await scenarioDb(f); }, T);
  const db = (n: string): Db => { const d = dbs[n]; if (!d) throw new Error(`no db ${n}`); return d; };

  for (const [user, role] of [[U.M, "legacy_company_editor"], [U.R, "legacy_company_viewer"]] as const) {
    it(`${role}: effective rights identical at 0088, P1, P1+P2 and P1+P2+P4, and equal to the stored role`, async () => {
      const seen: Record<string, Action[]> = {};
      for (const [n] of states) seen[n] = await effectiveRights(db(n), user);
      for (const [n] of states) expect(seen[n], n).toEqual(LEGACY_EXPECTED[role]);
      for (const n of ["P1+P2", "P1+P2+P4"]) {
        const g = first(await q<{ role: string }>(db(n), "SELECT role FROM public.access_grants WHERE grantee_id=$1 AND source='entity_members' AND revoked_at IS NULL", [user]));
        expect(g.role).toBe(role);
        expect(await hasPerm(db(n), user, "c1"), n).toEqual(LEGACY_EXPECTED[role]);
        expect(await hasPerm(db(n), user, "c2"), n).toEqual([]);
        expect(await hasPerm(db(n), user, null), n).toEqual([]);
      }
    }, T);
  }

  it("the legacy roles never carry propose, post, approve, share, delete_unposted, manage_access or reopen", async () => {
    const stored = await q<{ role: string; action: string }>(db("P1+P2"), "SELECT role, action FROM public.access_role_permissions WHERE allowed AND role LIKE 'legacy_%' ORDER BY 1,2");
    expect(stored.filter((r) => r.role === "legacy_company_editor").map((r) => r.action)).toEqual([...LEGACY_EXPECTED.legacy_company_editor].sort());
    expect(stored.filter((r) => r.role === "legacy_company_viewer").map((r) => r.action)).toEqual([...LEGACY_EXPECTED.legacy_company_viewer].sort());
    expect(stored.filter((r) => ["propose", "post", "approve", "share", "delete_unposted", "manage_access", "reopen"].includes(r.action))).toEqual([]);
  }, T);

  it("can_write toggles and revocation are mirrored onto the legacy roles; legacy roles cannot be invited", async () => {
    const d = db("P1+P2+P4");
    await as(d, U.O, async () => { await stepUp(d, U.O); await q(d, "SELECT public.grant_entity_access('c1',$1,true)", [email(U.R)]); });
    expect(await hasPerm(d, U.R, "c1")).toEqual(LEGACY_EXPECTED.legacy_company_editor);
    expect(await effectiveRights(d, U.R)).toEqual(LEGACY_EXPECTED.legacy_company_editor);
    await as(d, U.O, async () => { await stepUp(d, U.O); await q(d, "SELECT public.grant_entity_access('c1',$1,false)", [email(U.R)]); });
    expect(await hasPerm(d, U.R, "c1")).toEqual(LEGACY_EXPECTED.legacy_company_viewer);
    expect(await effectiveRights(d, U.R)).toEqual(LEGACY_EXPECTED.legacy_company_viewer);
    const inv = await attempt(d, U.O, async () => { await stepUp(d, U.O); return q(d, "SELECT public.invite_access($1,'c1','z@x.in','legacy_company_editor',NULL)", [U.O]); });
    expect(inv.ok ? "" : inv.error).toMatch(/Unknown role/);
  }, T);
});

// ------------------------------------------------------------------------------------------
// C. Step-up guarded functions
// ------------------------------------------------------------------------------------------
type Case = { name: string; uid: string; call: (db: Db) => Promise<unknown> };
const STEP_UP_CASES: Case[] = [
  { name: "grant_entity_access", uid: U.O, call: (db) => q(db, "SELECT public.grant_entity_access('c2',$1,false)", [email(U.X)]) },
  { name: "revoke_entity_access", uid: U.O, call: async (db) => {
    const g = first(await q<{ id: string }>(db, "SELECT id FROM public.entity_members WHERE member_id=$1 AND revoked_at IS NULL", [U.R]));
    return q(db, "SELECT public.revoke_entity_access($1)", [g.id]); } },
  { name: "admin_set_member", uid: U.ADM, call: (db) => q(db, "SELECT public.admin_set_member($1,'finance','Ops')", [U.X]) },
  { name: "admin_set_permission", uid: U.ADM, call: (db) => q(db, "SELECT public.admin_set_permission('manager','view_receipts',false)") },
  { name: "delete_my_finance_data", uid: U.O, call: (db) => q(db, "SELECT public.delete_my_finance_data()") },
  { name: "restore_finance_backup", uid: U.O, call: (db) => q(db, "SELECT public.restore_finance_backup('{}'::jsonb)") },
  { name: "change_accounting_period", uid: U.O, call: (db) => q(db, "SELECT public.change_accounting_period(gen_random_uuid(),'closed','fy-2025','2025-04-01','2026-03-31','Reviewed',$1::jsonb,NULL)", [JSON.stringify({ closedPeriods: [], periodLog: [] })]) },
  { name: "invite_access", uid: U.O, call: (db) => q(db, "SELECT public.invite_access($1,'c1','new@x.in','auditor',NULL)", [U.O]) },
  { name: "accept_access", uid: U.KID, call: async (db) => {
    const g = first(await q<{ grant_id: string }>(db, "SELECT grant_id FROM public.my_access_invites()"));
    return q(db, "SELECT public.accept_access($1)", [g.grant_id]); } },
  { name: "revoke_access", uid: U.O, call: async (db) => {
    const g = first(await q<{ id: string }>(db, "SELECT id FROM public.access_grants WHERE grantee_email=$1 AND revoked_at IS NULL", [email(U.KID)]));
    return q(db, "SELECT public.revoke_access($1)", [g.id]); } },
  { name: "save_reviewed_preferences", uid: U.O, call: (db) => q(db, "SELECT public.save_reviewed_preferences(gen_random_uuid(), data, revision, true) FROM public.finance_preferences WHERE owner_id=$1", [U.O]) },
  { name: "remove_device_passkey", uid: U.O, call: (db) => q(db, "SELECT public.remove_device_passkey($1)", [PASSKEY_ID]) },
  { name: "revoke_assistant_client", uid: U.O, call: (db) => q(db, "SELECT public.revoke_assistant_client($1)", [MCP]) },
];
const stepUpError = (name: string) => new RegExp(`^STEP_UP_REQUIRED: ${name}$`);

describe("C. step-up: every guarded function refuses without a fresh re-confirmation", () => {
  let db: Db;
  beforeAll(async () => {
    db = await scenarioDb(ALL);
    // a pending V3.1 invitation for KID (accept_access / revoke_access cases)
    await as(db, U.O, async () => { await stepUp(db, U.O); await q(db, "SELECT public.invite_access($1,'c1',$2,'auditor',NULL)", [U.O, email(U.KID)]); });
    await q(db, "DELETE FROM public.step_up_grants"); // every case starts without a re-confirmation
  }, T);

  it("the guarded set is exactly the contract's list (all change_accounting_period overloads)", async () => {
    const reg = await q<{ proname: string; mode: string }>(db, "SELECT proname, mode FROM security_p4.guarded_functions WHERE mode LIKE 'step_up%' ORDER BY proname");
    expect(reg.map((r) => r.proname)).toEqual(["accept_access", "admin_set_member", "admin_set_permission", "change_accounting_period", "delete_my_finance_data",
      "grant_entity_access", "invite_access", "restore_finance_backup", "revoke_access", "revoke_entity_access", "save_reviewed_preferences"]);
    expect(reg.find((r) => r.proname === "save_reviewed_preferences")?.mode).toBe("step_up_if_approved");
    const overloads = await q(db, "SELECT 1 FROM pg_proc WHERE proname='change_accounting_period' AND pronamespace='public'::regnamespace");
    const guarded = await q(db, "SELECT 1 FROM security_p4.guarded_functions WHERE proname='change_accounting_period'");
    expect(guarded.length).toBe(overloads.length);
  }, T);

  for (const c of STEP_UP_CASES) {
    it(`${c.name}: refuses without step-up, works after record_step_up, refuses after expiry and for an assistant session`, async () => {
      const none = await attempt(db, c.uid, () => c.call(db));
      expect(none.ok ? "succeeded" : none.error).toMatch(stepUpError(c.name));
      expect(none.ok ? "" : none.code).toBe("42501");
      const fresh = await attempt(db, c.uid, async () => { await stepUp(db, c.uid); return c.call(db); });
      expect(fresh.ok ? "ok" : fresh.error).toBe("ok");
      const expired = await attempt(db, c.uid, async () => { await stepUp(db, c.uid); await expireStepUp(db, c.uid); return c.call(db); });
      expect(expired.ok ? "succeeded" : expired.error).toMatch(stepUpError(c.name));
      const assistant = await attempt(db, c.uid, async () => { await stepUp(db, c.uid); return c.call(db); }, { clientId: MCP });
      expect(assistant.ok ? "succeeded" : assistant.error).toMatch(stepUpError(c.name));
    }, T);
  }

  it("a short-lived grant expires on its own; another person's grant never helps", async () => {
    const other = await attempt(db, U.O, async () => { await stepUp(db, U.V); return q(db, "SELECT public.delete_my_finance_data()"); });
    expect(other.ok ? "" : other.error).toMatch(stepUpError("delete_my_finance_data"));
    const r = await attempt(db, U.O, async () => {
      await stepUp(db, U.O, 1);
      const before = first(await q<{ ok: boolean }>(db, "SELECT public.has_recent_step_up() ok")).ok;
      await q(db, "SELECT pg_sleep(1.2)");
      return { before, after: first(await q<{ ok: boolean }>(db, "SELECT public.has_recent_step_up() ok")).ok };
    });
    expect(r).toEqual({ ok: true, value: { before: true, after: false } });
  }, T);

  it("save_reviewed_preferences without approval needs no step-up (and still refuses assistants)", async () => {
    const sql = "SELECT public.save_reviewed_preferences(gen_random_uuid(), data, revision, false) r FROM public.finance_preferences WHERE owner_id=$1";
    expect((await attempt(db, U.O, () => q(db, sql, [U.O]))).ok).toBe(true);
    const a = await attempt(db, U.O, () => q(db, sql, [U.O]), { clientId: MCP });
    expect(a.ok ? "" : a.error).toBe("ASSISTANT_READ_ONLY: save_reviewed_preferences");
  }, T);

  it("record_step_up is service-role only; clients cannot write grants; owners read only their own", async () => {
    for (const role of ["authenticated", "anon"]) {
      const r = await attempt(db, null, () => q(db, "SELECT public.record_step_up($1,'password')", [U.O]), { role });
      expect(r.ok ? "" : r.error, role).toMatch(/permission denied/);
    }
    const asUser = await attempt(db, U.O, () => q(db, "SELECT public.record_step_up($1,'password')", [U.O]));
    expect(asUser.ok ? "" : asUser.error).toMatch(/permission denied/);
    const ins = await attempt(db, U.O, () => q(db, "INSERT INTO public.step_up_grants(owner_id,method,expires_at) VALUES ($1,'password',now()+interval '1 minute')", [U.O]));
    expect(ins.ok).toBe(false);
    const r = await attempt(db, U.O, async () => {
      await stepUp(db, U.O); await stepUp(db, U.V);
      return {
        mine: (await q(db, "SELECT owner_id FROM public.step_up_grants")).map((x) => x["owner_id"]),
        upd: await errorOf(db, () => q(db, "UPDATE public.step_up_grants SET expires_at=expires_at RETURNING 1")),
        del: await errorOf(db, () => q(db, "DELETE FROM public.step_up_grants RETURNING 1")),
      };
    });
    expect(r).toEqual({ ok: true, value: { mine: [U.O], upd: "permission denied for table step_up_grants", del: "permission denied for table step_up_grants" } });
    for (const [args, msg] of [[[U.O, "pin", 60], /passkey or password/], [[U.O, "password", 301], /between 1 and 300/], [[U.O, "password", 0], /between 1 and 300/], [[id(999), "password", 60], /Unknown account/]] as const) {
      const bad = await attempt(db, null, () => q(db, "SELECT public.record_step_up($1,$2,$3)", [...args]), { role: "service_role" });
      expect(bad.ok ? "" : bad.error).toMatch(msg);
    }
  }, T);

  it("each __unguarded original is not executable by clients; wrappers keep name, signature, return type, SECURITY and grants", async () => {
    const base = await fullSchemaDb([P1, P2]);
    const sigOf = async (d: Db, name: string, args: string) => first(await q<{ ret: string; def: boolean; acl: string; vol: string; args: string }>(d,
      `SELECT pg_get_function_result(p.oid) ret, p.prosecdef def, p.provolatile vol, pg_get_function_arguments(p.oid) args,
        (SELECT string_agg(regexp_replace(a::text, '/.*$', ''), ',' ORDER BY a::text) FROM unnest(coalesce(p.proacl, '{}'::aclitem[])) a) acl
       FROM pg_proc p WHERE p.oid = to_regprocedure($1)`, [`public.${name}(${args})`]), `${name}(${args})`);
    const reg = await q<{ proname: string; identity_args: string; technique: string }>(db, "SELECT proname, identity_args, technique FROM security_p4.guarded_functions ORDER BY seq");
    expect(reg.length).toBe(43);
    for (const g of reg) {
      const before = await sigOf(base, g.proname, g.identity_args);
      const after = await sigOf(db, g.proname, g.identity_args);
      expect(after, g.proname).toEqual(before);
      const orig = await q<{ c: boolean }>(db, "SELECT bool_or(has_function_privilege(r, to_regprocedure($1), 'EXECUTE')) c FROM unnest(ARRAY['anon','authenticated']) r", [`public.${g.proname}__unguarded(${g.identity_args})`]);
      expect(first(orig).c, `${g.proname}__unguarded`).toBe(false);
      const pub = first(await q<{ acl: string }>(db, "SELECT coalesce(array_to_string(proacl, ','), '') acl FROM pg_proc WHERE oid=to_regprocedure($1)", [`public.${g.proname}__unguarded(${g.identity_args})`]));
      expect(pub.acl, g.proname).not.toMatch(/(^|,)=X/);
    }
    // invoker originals use the inline technique (a definer wrapper would bypass RLS)
    expect(reg.filter((g) => g.technique === "inline").map((g) => g.proname).sort()).toEqual(["finance_operation", "move_expense_category", "receive_claim_receipt", "restore_finance_backup", "save_import_balance_review"]);
    const direct = await attempt(db, U.O, () => q(db, "SELECT public.delete_my_finance_data__unguarded()"));
    expect(direct.ok ? "" : direct.error).toMatch(/permission denied/);
    await base.close();
  }, T);
});

// ------------------------------------------------------------------------------------------
// D. External assistant sessions (OAuth token with a client_id claim)
// ------------------------------------------------------------------------------------------
const WRITER_FUNCTIONS = ["accept_family_invite", "apply_review_metadata", "archive_backup_period_history", "bulk_category_change", "cancel_transfer",
  "commit_document_intake_reviewed", "confirm_transfer", "correct_financial_entries", "decide_family_request", "finance_operation", "finish_my_report_job",
  "link_activity_expenses", "manage_trip_expenses", "move_expense_category", "post_opening_balances", "receive_claim_receipt", "retry_my_report_job",
  "review_statement_evidence", "revise_import_rows", "save_claim_preparation", "save_import_balance_review", "start_demo_workspace",
  "undo_category_change", "undo_financial_correction", "undo_opening_balances", "undo_review_metadata"];
const nullCall = (name: string, args: string) => {
  const types = args.trim() ? args.split(", ") : [];
  return `SELECT * FROM public.${name}(${types.map((t) => `NULL::${t}`).join(", ")})`;
};

describe("D. assistant sessions: read own rows, never write, revocable immediately", () => {
  let db: Db;
  beforeAll(async () => { db = await scenarioDb(ALL); }, T);

  it("the assistant-refusing writer set equals every client-callable VOLATILE non-trigger function of 0088+P1+P2 not already step-up guarded", async () => {
    const base = await fullSchemaDb([P1, P2]);
    const enumerated = (await q<{ n: string }>(base, `SELECT DISTINCT p.proname n FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind='f'
      AND p.provolatile='v' AND p.prorettype <> 'trigger'::regtype AND has_function_privilege('authenticated', p.oid, 'EXECUTE') ORDER BY 1`)).map((r) => r.n);
    const stepUpNames = (await q<{ n: string }>(db, "SELECT DISTINCT proname n FROM security_p4.guarded_functions WHERE mode LIKE 'step_up%'")).map((r) => r.n);
    expect(enumerated.filter((n) => !stepUpNames.includes(n))).toEqual(WRITER_FUNCTIONS);
    const assistantNames = (await q<{ n: string }>(db, "SELECT DISTINCT proname n FROM security_p4.guarded_functions WHERE mode='assistant' ORDER BY 1")).map((r) => r.n);
    expect(assistantNames).toEqual(WRITER_FUNCTIONS);
    // the definer ones: prosecdef AND EXECUTE for authenticated AND volatile (the task's criterion) are all covered
    const definer = (await q<{ n: string }>(base, `SELECT DISTINCT p.proname n FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind='f' AND p.prosecdef
      AND p.provolatile='v' AND p.prorettype <> 'trigger'::regtype AND has_function_privilege('authenticated', p.oid, 'EXECUTE') ORDER BY 1`)).map((r) => r.n);
    expect(definer.filter((n) => !stepUpNames.includes(n) && !assistantNames.includes(n))).toEqual([]);
    await base.close();
  }, T);

  it("every RLS table in public carries the four RESTRICTIVE assistant policies; owner-column detection is documented", async () => {
    const tables = (await q<{ t: string }>(db, "SELECT relname t FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relrowsecurity ORDER BY 1")).map((r) => r.t);
    const allTables = (await q<{ t: string }>(db, "SELECT relname t FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' ORDER BY 1")).map((r) => r.t);
    expect(tables).toEqual(allTables); // no table is skipped for lack of RLS
    const pol = await q<{ t: string; n: string; cmd: string; permissive: string }>(db, "SELECT tablename t, policyname n, cmd, permissive FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'P4 %assistants%'");
    for (const t of tables) {
      const mine = pol.filter((p) => p.t === t);
      expect(mine.map((p) => p.cmd).sort(), t).toEqual(["DELETE", "INSERT", "SELECT", "UPDATE"]);
      expect(mine.every((p) => p.permissive === "RESTRICTIVE"), t).toBe(true);
    }
    const noOwner = await q<{ t: string }>(db, "SELECT tablename t FROM pg_policies WHERE schemaname='public' AND policyname='P4 revoked assistants cannot read' AND qual ~ 'assistant_client_revoked\\(NULL' ORDER BY 1");
    expect(noOwner.map((r) => r.t)).toEqual(["access_role_permissions", "department_budgets", "expense_history", "job_state", "market_quotes", "profiles",
      "regulatory_changes", "regulatory_snapshots", "role_permission_audit", "role_permissions"]);
  }, T);

  it("assistant reads the user's own rows and files exactly like the user", async () => {
    const read = (clientId?: string) => attempt(db, U.O, async () => ({
      exp: (await q(db, "SELECT id FROM public.expenses ORDER BY id")).length,
      docs: (await q(db, "SELECT id FROM public.documents")).length,
      files: (await q(db, "SELECT name FROM storage.objects")).length,
      prefs: (await q(db, "SELECT 1 FROM public.finance_preferences")).length,
    }), { clientId });
    const human = await read();
    expect(human.ok && human.value.exp).toBe(3);
    expect(await read(MCP)).toEqual(human);
  }, T);

  it("assistant writes are refused on tables (insert/update/delete) and files", async () => {
    const probes: [string, string, unknown[]][] = [
      ["insert expense", "INSERT INTO public.expenses(employee_id,title,merchant,category,amount,currency,expense_date) VALUES ($1,'x','x','Food',1,'INR',current_date) RETURNING 1", [U.O]],
      ["insert account", "INSERT INTO public.accounts(owner_id,name,kind,opening_balance) VALUES ($1,'x','savings',0) RETURNING 1", [U.O]],
      ["insert draft", "INSERT INTO public.expense_drafts(id,owner_id,data) VALUES (gen_random_uuid(),$1,'{}') RETURNING 1", [U.O]],
      ["insert document", "INSERT INTO public.documents(owner_id,title,file_path,file_name) VALUES ($1,'x',$2,'x') RETURNING 1", [U.O, PATH.personalDoc]],
      ["insert file", "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES ('receipts',$1,$2) RETURNING 1", [`${U.O}/receipts/mcp.jpg`, U.O]],
      ["insert passkey", "INSERT INTO public.device_passkeys(owner_id,credential_id,public_key) VALUES ($1,'mcp','k') RETURNING 1", [U.O]],
      ["update expense", "UPDATE public.expenses SET title='x' WHERE employee_id=$1 RETURNING 1", [U.O]],
      ["update prefs", "UPDATE public.finance_preferences SET updated_at=now() WHERE owner_id=$1 RETURNING 1", [U.O]],
      ["update file", "UPDATE storage.objects SET metadata='{}' WHERE name=$1 RETURNING 1", [PATH.personalDoc]],
      ["delete expense", "DELETE FROM public.expenses WHERE employee_id=$1 RETURNING 1", [U.O]],
      ["delete document", "DELETE FROM public.documents WHERE owner_id=$1 RETURNING 1", [U.O]],
      ["delete file", "DELETE FROM storage.objects WHERE name=$1 RETURNING 1", [PATH.personalReceipt]],
    ];
    for (const [what, sql, params] of probes) {
      const human = await attempt(db, U.O, () => q(db, sql, params));
      const bot = await attempt(db, U.O, () => q(db, sql, params), { clientId: MCP });
      expect(bot.ok ? bot.value.length : 0, what).toBe(0);
      if (what.startsWith("insert")) {
        expect(human.ok, `${what} (human control)`).toBe(true);
        expect(bot.ok ? "" : bot.error, what).toMatch(/row-level security/);
      }
    }
  }, T);

  it("every wrapped RPC refuses an assistant session before doing anything; the same call as the user is not refused for being an assistant", async () => {
    const reg = await q<{ proname: string; identity_args: string; mode: string }>(db, "SELECT proname, identity_args, mode FROM security_p4.guarded_functions WHERE mode <> 'revoked_read' ORDER BY seq");
    for (const g of reg) {
      const sql = nullCall(g.proname, g.identity_args);
      const bot = await attempt(db, U.O, async () => { await stepUp(db, U.O); return q(db, sql); }, { clientId: MCP });
      expect(bot.ok ? "succeeded" : bot.error, g.proname).toMatch(g.mode === "assistant" ? new RegExp(`^ASSISTANT_READ_ONLY: ${g.proname}$`) : stepUpError(g.proname));
      const human = await attempt(db, U.O, async () => { await stepUp(db, U.O); return q(db, sql); });
      expect(human.ok ? "" : human.error, g.proname).not.toMatch(/^(ASSISTANT_|STEP_UP_REQUIRED)/);
    }
  }, T);

  it("revocation: the revoked client loses reads at once (own rows, shared company rows, definer readers); the user and other clients keep working", async () => {
    const reads = (uid: string, clientId?: string) => attempt(db, uid, async () => ({
      exp: (await q(db, "SELECT 1 FROM public.expenses")).length,
      docs: (await q(db, "SELECT 1 FROM public.documents")).length,
      files: (await q(db, "SELECT 1 FROM storage.objects")).length,
      grants: (await q(db, "SELECT 1 FROM public.step_up_grants")).length >= 0,
    }), { clientId });
    const r = await attempt(db, U.O, async () => {
      const before = { exp: (await q(db, "SELECT 1 FROM public.expenses")).length };
      await stepUp(db, U.O);
      await q(db, "SELECT public.revoke_assistant_client($1)", [MCP]);
      await setClient(db, MCP); // next statement as the revoked assistant
      const revoked = {
        exp: (await q(db, "SELECT 1 FROM public.expenses")).length,
        docs: (await q(db, "SELECT 1 FROM public.documents")).length,
        files: (await q(db, "SELECT 1 FROM storage.objects")).length,
        prefs: (await q(db, "SELECT 1 FROM public.finance_preferences")).length,
        profile: (await q(db, "SELECT 1 FROM public.profiles")).length,
      };
      const definer = await errorOf(db, () => q(db, "SELECT * FROM public.my_shared_companies()"));
      await setClient(db, MCP2);
      const other = (await q(db, "SELECT 1 FROM public.expenses")).length;
      await setClient(db, "");
      const human = (await q(db, "SELECT 1 FROM public.expenses")).length;
      // the read-only member's assistant using the same client loses the owner's company rows (owner revoked it)
      await setUid(db, U.R); await setClient(db, MCP);
      const memberBot = (await q(db, "SELECT 1 FROM public.documents")).length;
      await setClient(db, "");
      const member = (await q(db, "SELECT 1 FROM public.documents")).length;
      const saved = (await q(db, "SELECT 1 FROM public.revoked_assistant_clients")).length;
      return { before, revoked, definer, other, human, memberBot, member, saved };
    });
    expect(r).toEqual({ ok: true, value: {
      before: { exp: 3 }, revoked: { exp: 0, docs: 0, files: 0, prefs: 0, profile: 0 },
      definer: "ASSISTANT_REVOKED: my_shared_companies", other: 3, human: 3, memberBot: 0, member: 1, saved: 0 } });
    // not revoked: definer readers keep working for an assistant
    expect((await reads(U.R, MCP)).ok).toBe(true);
    expect((await attempt(db, U.R, () => q(db, "SELECT * FROM public.my_shared_companies()"), { clientId: MCP })).ok).toBe(true);
    // clients cannot un-revoke or write revocations directly
    const direct = await attempt(db, U.O, () => q(db, "INSERT INTO public.revoked_assistant_clients(owner_id,client_id) VALUES ($1,'x')", [U.O]));
    expect(direct.ok).toBe(false);
  }, T);

  it("P4b (optional hook): blocks non-GET assistant requests and revoked clients; humans unaffected; rollback removes only the hook", async () => {
    const before = await fullCatalog(db);
    await db.exec(readSql(P4B));
    const call = (uid: string, method: string, clientId?: string) => attempt(db, uid, async () => {
      await q(db, "SELECT set_config('request.method',$1,true)", [method]);
      return q(db, "SELECT public.api_pre_request()");
    }, { clientId });
    expect((await call(U.O, "POST")).ok).toBe(true);
    expect((await call(U.O, "GET", MCP)).ok).toBe(true);
    for (const m of ["POST", "PATCH", "DELETE", "PUT"]) {
      const r = await call(U.O, m, MCP);
      expect(r.ok ? "" : r.error, m).toMatch(/^ASSISTANT_READ_ONLY/);
    }
    const revoked = await attempt(db, U.O, async () => {
      await stepUp(db, U.O); await q(db, "SELECT public.revoke_assistant_client($1)", [MCP]);
      await setClient(db, MCP); await q(db, "SELECT set_config('request.method','GET',true)");
      return q(db, "SELECT public.api_pre_request()");
    });
    expect(revoked.ok ? "" : revoked.error).toMatch(/^ASSISTANT_REVOKED/);
    await db.exec(readSql(P4B_RB));
    expect(await fullCatalog(db)).toEqual(before);
  }, T);
});

// ------------------------------------------------------------------------------------------
// E. Audit history is append-only for clients
// ------------------------------------------------------------------------------------------
const AUDIT_TABLES = ["transaction_audit", "role_permission_audit", "access_grant_audit", "period_close_evidence", "imported_period_history", "preference_approvals"];

// ------------------------------------------------------------------------------------------
// Generic seeding across ALL public tables (FKs/triggers disabled, CHECKs honoured).
// ------------------------------------------------------------------------------------------
const OWNERISH = /^(owner_id|employee_id|user_id|requester_id|actor_id|member_id|accepted_by|posted_by|granted_by|undone_by|updated_by|revoked_by|workspace_owner_id)$/;
async function seedAllTables(db: Db, owners: string[]) {
  await actAs(db, null);
  const tables = (await q<{ t: string }>(db, "SELECT table_name t FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1")).map((r) => r.t);
  const cols = await q<{ t: string; n: string; u: string; ty: string; nn: boolean; d: string | null }>(db,
    "SELECT table_name t, column_name n, udt_name u, data_type ty, is_nullable='NO' nn, column_default d FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position");
  const checks = await q<{ t: string; d: string }>(db, "SELECT conrelid::regclass::text t, pg_get_constraintdef(oid) d FROM pg_constraint WHERE contype='c' AND connamespace='public'::regnamespace");
  const enumFirst = async (u: string) => first(await q<{ v: string }>(db, `SELECT (enum_range(NULL::public.${u}))[1]::text v`)).v;
  const failed: string[] = [];
  await db.exec("SET session_replication_role = replica");
  try {
    for (const [oi, owner] of owners.entries()) for (const t of tables) {
      const ck = checks.filter((c) => c.t === t || c.t === `public.${t}`).map((c) => c.d).join(" ");
      const names: string[] = [], vals: string[] = [];
      for (const c of cols.filter((x) => x.t === t)) {
        const own = OWNERISH.test(c.n);
        if (!own && (c.d !== null || !c.nn)) continue;
        const m = ck.match(new RegExp(`\\(?${c.n}\\)?(?:::text)? = ANY \\(\\(?ARRAY\\[([^\\]]+)\\]`)) ?? ck.match(new RegExp(`${c.n}(?:::text)? IN \\(([^)]+)\\)`));
        let v: string | null = null;
        if (m) v = `'${(m[1] ?? "").split(",")[0]?.trim().replace(/::text.*/, "").replace(/^'+|'+$/g, "") ?? ""}'`;
        else if (c.u === "uuid") v = own ? `'${owner}'` : "gen_random_uuid()";
        else if (c.u === "text" || c.u === "varchar") v = /path$/.test(c.n) ? `'${owner}/seed/${t}.pdf'` : /email/.test(c.n) ? `'seed${oi}@${t.replace(/_/g, "")}.in'` : c.n === "month" ? "'2026-04'" : `'${t}-${c.n}-${oi}'`;
        else if (/^(int|numeric|float)/.test(c.u)) v = String(oi + 1);
        else if (c.u === "bool") v = "false";
        else if (c.u === "date") v = "'2026-04-01'";
        else if (/timestamp/.test(c.u)) v = "'2026-04-01T00:00:00Z'";
        else if (c.u === "jsonb" || c.u === "json") v = "'{}'";
        else if (c.u.startsWith("_")) v = "'{}'";
        else if (c.ty === "USER-DEFINED") v = `'${await enumFirst(c.u)}'`;
        if (v === null) continue;
        names.push(`"${c.n}"`); vals.push(v);
      }
      if (t === "step_up_grants") { // CHECK: expires within 5 minutes after creation
        names.push('"created_at"'); vals.push("'2026-04-01T00:00:00Z'");
        const i = names.indexOf('"expires_at"'); if (i >= 0) vals[i] = "'2026-04-01T00:04:00Z'";
      }
      if (t === "entity_members") {
        const peer = first(owners.slice((oi + 1) % owners.length));
        names.splice(0, names.length, '"owner_id"', '"entity_id"', '"member_id"', '"member_email"');
        vals.splice(0, vals.length, `'${owner}'`, "'seed'", `'${peer}'`, `'${EMAIL[peer] ?? "seed@x.in"}'`);
      }
      try { await db.exec(`INSERT INTO public.${t}(${names.join(",")}) VALUES (${vals.join(",")})`); }
      catch (e) { failed.push(`${t}: ${(e as Error).message}`); }
    }
  } finally { await db.exec("SET session_replication_role = origin"); }
  return { tables, failed: failed.filter((f) => !/duplicate key/.test(f)) };
}

/** Per-table count + md5 of every row. P4 adds device_passkeys.id; it is excluded so original columns are compared. */
async function dataSnapshot(db: Db, tables: string[]) {
  await actAs(db, null);
  const out: Record<string, string> = {};
  for (const t of [...tables.map((x) => `public.${x}`), "storage.objects", "auth.users"]) {
    const row = t === "public.device_passkeys" ? "(to_jsonb(x) - 'id')::text" : "to_jsonb(x)::text";
    const r = first(await q<{ n: number; h: string }>(db, `SELECT count(*)::int n, md5(coalesce(string_agg(${row}, '|' ORDER BY ${row}), '')) h FROM ${t} x`));
    out[t] = `${r.n}:${r.h}`;
  }
  return out;
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
    tables: await j("SELECT c.relname, c.relrowsecurity FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' ORDER BY 1"),
    columns: await j("SELECT table_name, column_name, data_type, column_default, is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY 1, ordinal_position"),
    grants: await j("SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' ORDER BY 1,2,3"),
    schemas: await j("SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('information_schema','security_rollback_archive') ORDER BY 1"),
  };
}

describe("E. audit history cannot be changed or deleted by clients; owner erasure still works", () => {
  let db: Db; let base: Db;
  beforeAll(async () => {
    base = await fullSchemaDb([P1, P2]);
    db = await fullSchemaDb(ALL);
    for (const d of [db, base]) {
      await addUsers(d, { [U.O]: email(U.O), [U.V]: email(U.V) });
      const s = await seedAllTables(d, [U.O, U.V]);
      expect(s.failed).toEqual([]);
    }
  }, T);
  const ownerCol = (t: string) => (t === "role_permission_audit" ? "actor_id" : t === "access_grant_audit" ? "workspace_owner_id" : "owner_id");

  for (const t of AUDIT_TABLES) {
    it(`${t}: UPDATE and DELETE refused even where a permissive policy would allow them (defence in depth)`, async () => {
      const probe = (d: Db) => attempt(d, U.O, async () => {
        // a hypothetical future permissive policy that would open the table to its owner
        await d.exec("RESET ROLE");
        await d.exec(`CREATE POLICY "test open" ON public.${t} FOR ALL TO authenticated USING (true) WITH CHECK (true)`);
        await d.exec(`GRANT UPDATE, DELETE ON public.${t} TO authenticated`);
        await d.exec("SET ROLE authenticated");
        const col = ownerCol(t);
        return {
          upd: (await q(d, `UPDATE public.${t} SET ${col}=${col} WHERE ${col}=$1 RETURNING 1`, [U.O])).length,
          del: (await q(d, `DELETE FROM public.${t} WHERE ${col}=$1 RETURNING 1`, [U.O])).length,
        };
      });
      const without = await probe(base);
      if (t === "access_grant_audit") expect(without.ok ? "" : without.error, "P2 trigger already blocks it").toMatch(/append-only/);
      else expect(without.ok && without.value.upd + without.value.del, "control without P4").toBeGreaterThan(0);
      expect(await probe(db)).toEqual({ ok: true, value: { upd: 0, del: 0 } });
    }, T);
  }

  it("delete_my_finance_data (with step-up) still erases the owner's audit rows and nobody else's", async () => {
    const count = async (who: string) => {
      const out: Record<string, number> = {};
      for (const t of AUDIT_TABLES) out[t] = first(await q<{ n: number }>(db, `SELECT count(*)::int n FROM public.${t} WHERE ${ownerCol(t)}=$1`, [who])).n;
      return out;
    };
    const vBefore = await count(U.V); const oBefore = await count(U.O);
    expect(Object.values(oBefore).every((n) => n > 0)).toBe(true);
    await as(db, U.O, async () => { await stepUp(db, U.O); await q(db, "SELECT public.delete_my_finance_data()"); });
    // role_permission_audit is identity/access history kept by erasure on purpose (P1 decision)
    expect(await count(U.O)).toEqual({ ...Object.fromEntries(AUDIT_TABLES.map((t) => [t, 0])), role_permission_audit: oBefore["role_permission_audit"] });
    expect(await count(U.V)).toEqual(vBefore);
  }, T);
});

// ------------------------------------------------------------------------------------------
// F. Normal owner flows keep working after P1+P2+P4
// ------------------------------------------------------------------------------------------
describe("F. normal flows after P1+P2+P4", () => {
  let db: Db;
  beforeAll(async () => { db = await scenarioDb(ALL); }, T);

  it("owner creates, edits and deletes own expense, document and file without any step-up", async () => {
    const r = await attempt(db, U.O, async () => {
      const e = first(await q<{ id: string }>(db, "INSERT INTO public.expenses(employee_id,title,merchant,category,amount,currency,expense_date) VALUES ($1,'new','Shop','Food',10,'INR',current_date) RETURNING id", [U.O]));
      const edit = (await q(db, "UPDATE public.expenses SET title='renamed', amount=12 WHERE id=$1 RETURNING 1", [e.id])).length;
      const del = (await q(db, "DELETE FROM public.expenses WHERE id=$1 RETURNING 1", [e.id])).length;
      await q(db, "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES ('receipts',$1,$2)", [`${U.O}/docs/new.pdf`, U.O]);
      const d = first(await q<{ id: string }>(db, "INSERT INTO public.documents(owner_id,title,file_path,file_name) VALUES ($1,'new',$2,'n.pdf') RETURNING id", [U.O, `${U.O}/docs/new.pdf`]));
      const dedit = (await q(db, "UPDATE public.documents SET title='x' WHERE id=$1 RETURNING 1", [d.id])).length;
      const fdel = (await q(db, "DELETE FROM storage.objects WHERE name=$1 RETURNING 1", [`${U.O}/docs/new.pdf`])).length;
      return { edit, del, dedit, fdel };
    });
    expect(r).toEqual({ ok: true, value: { edit: 1, del: 1, dedit: 1, fdel: 1 } });
  }, T);

  it("finance_operation (reimbursement), bulk category change + undo, and transfer confirm + cancel work for the owner", async () => {
    const r = await attempt(db, U.O, async () => {
      const acct = first(await q<{ id: string }>(db, "INSERT INTO public.accounts(owner_id,name,kind,opening_balance) VALUES ($1,'Bank','savings',1000) RETURNING id", [U.O])).id;
      const dst = first(await q<{ id: string }>(db, "INSERT INTO public.accounts(owner_id,name,kind,opening_balance) VALUES ($1,'Wallet','savings',0) RETURNING id", [U.O])).id;
      const pend = first(await q<{ id: string }>(db, "INSERT INTO public.expenses(employee_id,title,merchant,category,amount,currency,expense_date,account_id,txn_type,reimbursement_status) VALUES ($1,'claim','Shop','Travel',300,'INR',current_date,$2,'expense','pending') RETURNING id", [U.O, acct])).id;
      const reimb = first(await q<{ r: { id: string; amount: number } }>(db, "SELECT public.finance_operation('reimbursement', $1::jsonb) r", [JSON.stringify({ operationId: id(501), ids: [pend], accountId: acct })])).r;
      const status = first(await q<{ s: string }>(db, "SELECT reimbursement_status s FROM public.expenses WHERE id=$1", [pend])).s;
      const replay = first(await q<{ r: { replayed?: boolean } }>(db, "SELECT public.finance_operation('reimbursement', $1::jsonb) r", [JSON.stringify({ operationId: id(501), ids: [pend], accountId: acct })])).r;
      const items = await q<{ id: string; revision: number }>(db, "SELECT id, category_revision revision FROM public.expenses WHERE employee_id=$1 AND category='Travel' AND txn_type='expense' ORDER BY id", [U.O]);
      const batch = first(await q<{ b: string }>(db, "SELECT public.bulk_category_change($1,$2::jsonb,'Food') b", [id(502), JSON.stringify(items)])).b;
      const moved = (await q(db, "SELECT 1 FROM public.expenses WHERE employee_id=$1 AND category='Food'", [U.O])).length;
      await q(db, "SELECT public.undo_category_change($1)", [batch]);
      const restored = (await q(db, "SELECT 1 FROM public.expenses WHERE employee_id=$1 AND category='Travel' AND id = ANY($2)", [U.O, items.map((i) => i.id)])).length;
      const debit = first(await q<{ id: string }>(db, "INSERT INTO public.expenses(employee_id,title,merchant,category,amount,original_amount,currency,expense_date,account_id,txn_type) VALUES ($1,'to wallet','Self','Transfer',500,500,'INR','2026-04-01',$2,'expense') RETURNING id", [U.O, acct])).id;
      const credit = first(await q<{ id: string }>(db, "INSERT INTO public.expenses(employee_id,title,merchant,category,amount,original_amount,currency,expense_date,account_id,txn_type) VALUES ($1,'from bank','Self','Income',500,500,'INR','2026-04-01',$2,'income') RETURNING id", [U.O, dst])).id;
      await q(db, "SELECT public.confirm_transfer($1,$2,0,$3,$4,0)", [id(503), debit, dst, credit]);
      const linked = first(await q<{ t: string }>(db, "SELECT txn_type t FROM public.expenses WHERE id=$1", [debit])).t;
      await q(db, "SELECT public.cancel_transfer($1)", [id(503)]);
      const unlinked = first(await q<{ t: string }>(db, "SELECT txn_type t FROM public.expenses WHERE id=$1", [debit])).t;
      return { amount: Number(reimb.amount), status, replayed: replay.replayed === true, moved: moved >= items.length, restored: restored === items.length, linked, unlinked };
    });
    expect(r).toEqual({ ok: true, value: { amount: 300, status: "received", replayed: true, moved: true, restored: true, linked: "transfer", unlinked: "expense" } });
  }, T);

  it("company sharing: grant and revoke with step-up; the editor uploads and links into the company namespace; viewer reads", async () => {
    const up = `${C1}aaaaaaaa-0000-4000-8000-000000000001-new.pdf`;
    const r = await attempt(db, U.O, async () => {
      await stepUp(db, U.O);
      const g = first(await q<{ g: string }>(db, "SELECT public.grant_entity_access('c2',$1,false) g", [email(U.KID)])).g;
      await setUid(db, U.KID);
      const kidDocs = (await q(db, "SELECT title FROM public.documents")).map((x) => x["title"]);
      await setUid(db, U.M);
      await q(db, "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES ('receipts',$1,$2)", [up, U.M]);
      await q(db, "INSERT INTO public.documents(owner_id,title,file_path,file_name,entity_id) VALUES ($1,'new',$2,'new.pdf','c1')", [U.O, up]);
      const editorDocs = (await q(db, "SELECT 1 FROM public.documents")).length;
      await setUid(db, U.O);
      await q(db, "SELECT public.revoke_entity_access($1)", [g]);
      await setUid(db, U.KID);
      return { kidDocs, editorDocs, kidAfter: (await q(db, "SELECT 1 FROM public.documents")).length };
    });
    expect(r).toEqual({ ok: true, value: { kidDocs: ["c2 board pack"], editorDocs: 2, kidAfter: 0 } });
  }, T);

  it("family flow: invite, verified acceptance, request with evidence, owner decides (no step-up needed)", async () => {
    const evidence = `${U.KID}/requests/e1.jpg`;
    const r = await attempt(db, U.O, async () => {
      const m = first(await q<{ id: string }>(db, "INSERT INTO public.family_members(owner_id,name) VALUES ($1,'Kid') RETURNING id", [U.O]));
      const i = first(await q<{ id: string }>(db, "INSERT INTO public.family_invites(owner_id,member_id,email) VALUES ($1,$2,$3) RETURNING id", [U.O, m.id, email(U.KID)]));
      await setUid(db, U.KID);
      await q(db, "SELECT public.accept_family_invite($1)", [i.id]);
      await q(db, "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES ('receipts',$1,$2)", [evidence, U.KID]);
      const req = first(await q<{ id: string }>(db, "INSERT INTO public.family_requests(owner_id,requester_id,invite_id,title,amount,evidence_path) VALUES ($1,$2,$3,'Books',500,$4) RETURNING id", [U.O, U.KID, i.id, evidence]));
      await setUid(db, U.O);
      const ownerEvidence = (await objectsVisible(db, [evidence])).length;
      await q(db, "SELECT public.decide_family_request($1,'approved','ok')", [req.id]);
      await setUid(db, U.KID);
      return { ownerEvidence, status: first(await q<{ status: string }>(db, "SELECT status FROM public.family_requests")).status };
    });
    expect(r).toEqual({ ok: true, value: { ownerEvidence: 1, status: "approved" } });
  }, T);

  it("visitor demo: the guest session seeds and sees only its own sample rows", async () => {
    const r = await attempt(db, U.GUEST, async () => {
      await q(db, "SELECT public.start_demo_workspace('guest@demo.in')");
      return {
        own: (await q(db, "SELECT 1 FROM public.expenses WHERE employee_id=$1", [U.GUEST])).length > 0,
        others: (await q(db, "SELECT 1 FROM public.expenses WHERE employee_id<>$1", [U.GUEST])).length,
      };
    }, { anon: true });
    expect(r).toEqual({ ok: true, value: { own: true, others: 0 } });
  }, T);

  it("passkeys: registration and counter updates keep working; removal only through remove_device_passkey with step-up", async () => {
    const r = await attempt(db, U.O, async () => {
      await q(db, "INSERT INTO public.device_passkeys(owner_id,credential_id,public_key) VALUES ($1,'cred-o-2','pk2')", [U.O]);
      const counter = (await q(db, "UPDATE public.device_passkeys SET counter=counter+1 WHERE credential_id='cred-o-2' RETURNING 1")).length;
      const direct = (await q(db, "DELETE FROM public.device_passkeys WHERE owner_id=$1 RETURNING 1", [U.O])).length;
      const bot = await errorOf(db, async () => { await setClient(db, MCP); await stepUp(db, U.O); await q(db, "SELECT public.remove_device_passkey($1)", [PASSKEY_ID]); });
      await setClient(db, "");
      const ids = (await q<{ id: string }>(db, "SELECT id FROM public.device_passkeys ORDER BY credential_id")).map((x) => x.id);
      await stepUp(db, U.O);
      await q(db, "SELECT public.remove_device_passkey($1)", [PASSKEY_ID]);
      await setUid(db, U.V); await stepUp(db, U.V);
      const foreign = await errorOf(db, () => q(db, "SELECT public.remove_device_passkey($1)", [ids[1]]));
      await setUid(db, U.O);
      return { counter, direct, bot, left: (await q(db, "SELECT credential_id FROM public.device_passkeys")).map((x) => x["credential_id"]), foreign, idsUnique: new Set(ids).size === 2 };
    });
    expect(r).toEqual({ ok: true, value: { counter: 1, direct: 0, bot: "STEP_UP_REQUIRED: remove_device_passkey", left: ["cred-o-2"], foreign: "Passkey not found", idsUnique: true } });
  }, T);
});

// ------------------------------------------------------------------------------------------
// G. Erasure and backup restore with step-up (same account and cross account, app's prepareRestore)
// ------------------------------------------------------------------------------------------
async function exportBackup(db: Db, owner: string): Promise<Backup> {
  await actAs(db, owner);
  const data: Backup["data"] = {};
  for (const t of BACKUP_TABLES) {
    const col = t === "expenses" ? "employee_id" : "owner_id";
    data[t] = (await q<{ j: Record<string, unknown> }>(db, `SELECT to_jsonb(x) j FROM public.${t} x WHERE ${col} = $1`, [owner])).map((r) => r.j);
  }
  await actAs(db, null);
  return { app: "ledgerline", version: 2, owner, exportedAt: "2026-11-09", data } as Backup;
}
const restoreCounts = async (db: Db, owner: string) => {
  const out: Record<string, number> = {};
  for (const t of ["accounts", "expenses", "documents"]) out[t] = first(await q<{ n: number }>(db, `SELECT count(*)::int n FROM public.${t} WHERE ${t === "expenses" ? "employee_id" : "owner_id"} = $1`, [owner])).n;
  return out;
};

describe("G. erasure and restore work with step-up after P1+P2+P4", () => {
  async function restoreDb() {
    const db = await fullSchemaDb(ALL);
    await addUsers(db, { [U.O]: email(U.O), [U.B]: email(U.B) });
    await as(db, U.O, async () => {
      const acct = first(await q<{ id: string }>(db, "INSERT INTO public.accounts(owner_id,name,kind,opening_balance) VALUES ($1,'Bank','savings',1000) RETURNING id", [U.O]));
      const exp = first(await q<{ id: string }>(db,
        "INSERT INTO public.expenses(employee_id,title,merchant,amount,currency,category,expense_date,account_id,receipts) VALUES ($1,'Lunch','Cafe',250.5,'INR','Food','2026-10-10',$2,$3::jsonb) RETURNING id",
        [U.O, acct.id, JSON.stringify([{ path: `${U.O}/receipts/lunch.jpg`, name: "lunch.jpg", type: "image/jpeg" }])]));
      await q(db, "INSERT INTO public.documents(owner_id,title,file_path,file_name,transaction_id) VALUES ($1,'Bill',$2,'bill.pdf',$3)", [U.O, `${U.O}/docs/bill.pdf`, exp.id]);
    });
    return db;
  }
  const restore = (db: Db, payload: unknown) => q(db, "SELECT public.restore_finance_backup($1::jsonb)", [JSON.stringify(payload)]);

  it("same-account restore: refused without step-up, succeeds with it and keeps one copy of each record", async () => {
    const db = await restoreDb();
    const backup = await exportBackup(db, U.O);
    const payload = prepareRestore(backup, U.O).data;
    const refused = await attempt(db, U.O, () => restore(db, payload));
    expect(refused.ok ? "" : refused.error).toBe("STEP_UP_REQUIRED: restore_finance_backup");
    await as(db, U.O, async () => { await stepUp(db, U.O); await restore(db, payload); });
    expect(await restoreCounts(db, U.O)).toEqual({ accounts: 1, expenses: 1, documents: 1 });
    await db.close();
  }, T);

  it("cross-account restore with step-up remaps ids and leaves the source account untouched; an assistant cannot restore", async () => {
    const db = await restoreDb();
    const backup = await exportBackup(db, U.O);
    const payload = prepareRestore(backup, U.B, undefined, true).data;
    const bot = await attempt(db, U.B, async () => { await stepUp(db, U.B); return restore(db, payload); }, { clientId: MCP });
    expect(bot.ok ? "" : bot.error).toBe("STEP_UP_REQUIRED: restore_finance_backup");
    await as(db, U.B, async () => { await stepUp(db, U.B); await restore(db, payload); });
    expect(await restoreCounts(db, U.B)).toEqual({ accounts: 1, expenses: 1, documents: 1 });
    expect(await restoreCounts(db, U.O)).toEqual({ accounts: 1, expenses: 1, documents: 1 });
    const link = first(await as(db, U.B, () => q<{ ok: boolean }>(db, "SELECT d.transaction_id = e.id AS ok FROM public.documents d JOIN public.expenses e ON e.employee_id = d.owner_id WHERE d.owner_id = $1", [U.B])));
    expect(link.ok).toBe(true);
    await db.close();
  }, T);

  it("erasure with step-up leaves no owner-linked row outside the documented kept tables; other owners keep theirs", async () => {
    const KEPT = new Set(["profiles", "user_roles", "app_admins", "role_permission_audit", "expense_history", "demo_sessions", "device_passkeys", "passkey_challenges",
      "step_up_grants", "revoked_assistant_clients"]);
    const db = await fullSchemaDb(ALL);
    await addUsers(db, { [U.O]: email(U.O), [U.V]: email(U.V) });
    const { tables, failed } = await seedAllTables(db, [U.O, U.V]);
    expect(failed).toEqual([]);
    const ownerCols = await q<{ t: string; c: string }>(db, `SELECT table_name t, column_name c FROM information_schema.columns
      WHERE table_schema='public' AND udt_name='uuid' AND column_name ~ '^(owner_id|employee_id|user_id|requester_id|member_id|accepted_by|actor_id|workspace_owner_id|grantee_id)$'`);
    const count = async (u: string) => {
      const res: Record<string, number> = {};
      for (const t of tables) {
        const cs = ownerCols.filter((x) => x.t === t).map((x) => x.c);
        if (cs.length) res[t] = first(await q<{ n: number }>(db, `SELECT count(*)::int n FROM public.${t} WHERE ${cs.map((c) => `${c}=$1`).join(" OR ")}`, [u])).n;
      }
      return res;
    };
    const vBefore = await count(U.V);
    await as(db, U.O, async () => { await stepUp(db, U.O); await q(db, "SELECT public.delete_my_finance_data()"); });
    const left = Object.entries(await count(U.O)).filter(([t, n]) => n > 0 && !KEPT.has(t)).map(([t]) => t);
    expect(left).toEqual([]);
    expect({ ...(await count(U.V)), entity_members: 0 }).toEqual({ ...vBefore, entity_members: 0 });
    await db.close();
  }, T);
});

// ------------------------------------------------------------------------------------------
// H. Data preservation and exact rollback: 0088 -> P1 -> P2 -> P4 -> rollback P4 -> P2 -> P1
// ------------------------------------------------------------------------------------------
describe("H. data preservation and exact rollback", () => {
  it("no pre-existing row changes through P1, P2 and P4; each rollback restores the previous catalog exactly", async () => {
    const db = await scenarioDb();
    const seeded = await seedAllTables(db, [U.O, U.V]);
    expect(seeded.failed).toEqual([]);
    const tables = seeded.tables;
    const S0 = await fullCatalog(db); const D0 = await dataSnapshot(db, tables);
    expect(Object.entries(D0).filter(([, v]) => v.startsWith("0:")).map(([k]) => k)).toEqual([]);
    const passkeysBefore = await q(db, "SELECT owner_id, credential_id, public_key, counter FROM public.device_passkeys ORDER BY 2");

    await db.exec(readSql(P1));
    expect(await dataSnapshot(db, tables)).toEqual(D0);
    await db.exec(readSql(P2));
    expect(await dataSnapshot(db, tables)).toEqual(D0);
    const S2 = await fullCatalog(db);
    await db.exec(readSql(P4));
    expect(await dataSnapshot(db, tables)).toEqual(D0);
    expect(await q(db, "SELECT owner_id, credential_id, public_key, counter FROM public.device_passkeys ORDER BY 2")).toEqual(passkeysBefore);
    expect(first(await q<{ n: number }>(db, "SELECT count(DISTINCT id)::int n FROM public.device_passkeys")).n).toBe(passkeysBefore.length);
    // some P4 state that must be archived, not lost
    await as(db, U.O, async () => { await stepUp(db, U.O); await q(db, "SELECT public.revoke_assistant_client($1)", [MCP]); });
    expect(await fullCatalog(db)).not.toEqual(S2);

    // ordering guards
    await expect(db.exec(readSql(P2_RB))).rejects.toThrow(/Roll back P4/);
    await db.exec("ROLLBACK").catch(() => undefined);
    await expect(db.exec(readSql(P4))).rejects.toThrow(/already installed/);
    await db.exec("ROLLBACK").catch(() => undefined);

    await db.exec(readSql(P4_RB));
    const S2b = await fullCatalog(db);
    for (const k of Object.keys(S2) as (keyof typeof S2)[]) expect(S2b[k], `after P4 rollback: ${k}`).toEqual(S2[k]);
    expect(await dataSnapshot(db, tables)).toEqual(D0);
    const archived = await q<{ t: string }>(db, "SELECT tablename t FROM pg_tables WHERE schemaname='security_rollback_archive' ORDER BY 1");
    expect(archived.map((r) => r.t.replace(/_\d{8}T\d{6}$/, ""))).toEqual(["revoked_assistant_clients", "step_up_grants"]);
    const kept = first(await q<{ n: number }>(db, `SELECT count(*)::int n FROM security_rollback_archive."${first(archived).t}"`)).n;
    expect(kept).toBe(1);

    await db.exec(readSql(P2_RB));
    await db.exec(readSql(P1_RB));
    const S0b = await fullCatalog(db);
    for (const k of Object.keys(S0) as (keyof typeof S0)[]) expect(S0b[k], `after full rollback: ${k}`).toEqual(S0[k]);
    expect(await dataSnapshot(db, tables)).toEqual(D0);

    // the whole package re-applies after a rollback and still preserves the data
    for (const f of ALL) await db.exec(readSql(f));
    expect(await dataSnapshot(db, tables)).toEqual(D0);
    await db.close();
  }, 300_000);
});
