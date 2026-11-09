// @vitest-environment node
// Acceptance tests for the PROPOSED security package (.lovable/staged-sql/proposed/P1*, P2*).
// Everything runs in isolated in-memory PGlite built from drizzle/migrations 0000-0088
// (src/test/full-schema-pglite.ts). Nothing here connects to Lovable Cloud or any hosted database.
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { fullSchemaDb, actAs, addUsers, readSql } from "../test/full-schema-pglite";

const DIR = ".lovable/staged-sql/proposed/";
const P1 = `${DIR}P1_security_containment.sql`;
const P1_RB = `${DIR}P1_security_containment.rollback.sql`;
const P2 = `${DIR}P2_v31_role_model.sql`;
const P2_RB = `${DIR}P2_v31_role_model.rollback.sql`;
const T = 120_000;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U = {
  O: id(1), // owner of companies c1, c2
  V: id(2), // unrelated owner (victim of the legacy team roles)
  M: id(3), // c1 editor (entity_members can_write)
  R: id(4), // c1 read-only member
  G: id(5), // legacy finance role WITH a c1 read grant
  F: id(6), // legacy finance role, no grant
  MGR: id(7), // legacy manager role, no grant (same default department as everyone)
  ADM: id(8), // app admin
  X: id(9), // stranger
  KID: id(10), // adult family member account
  W: id(11), // legacy finance role WITH a c1 write grant
  GUEST: id(12), // anonymous demo visitor
} as const;
const EMAIL: Record<string, string> = Object.fromEntries(Object.entries(U).map(([k, v]) => [v, `${k.toLowerCase()}@x.in`]));
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

type Db = PGlite;
const q = async <R = Record<string, unknown>>(db: Db, sql: string, params: unknown[] = []) => (await db.query<R>(sql, params)).rows;
/** First row of a result; fails the test (rather than reading undefined) when the query returned no row. */
function first<R>(rows: readonly R[], what = "row"): R { const r = rows[0]; if (r === undefined) throw new Error(`Expected a ${what}, got none`); return r; }
/** Test-user email; fails loudly if a user id is not part of the fixture. */
const email = (u: string): string => { const e = EMAIL[u]; if (!e) throw new Error(`No fixture email for ${u}`); return e; };

/** Run fn as uid inside a transaction that is always rolled back, so probes never leak state. */
async function attempt<R>(db: Db, uid: string | null, fn: () => Promise<R>, opts: { anon?: boolean; role?: string } = {}) {
  await actAs(db, uid);
  if (opts.role) { await db.exec("RESET ROLE"); await db.exec(`SET ROLE ${opts.role}`); }
  if (opts.anon) await db.query("SELECT set_config('test.anon','true',false)");
  await db.exec("BEGIN");
  try { return { ok: true as const, value: await fn() }; }
  catch (e) { return { ok: false as const, error: (e as Error).message }; }
  finally { await db.exec("ROLLBACK"); await db.query("SELECT set_config('test.anon','',false)"); await actAs(db, null); }
}
/** Run fn as uid and keep the effects. */
async function as<R>(db: Db, uid: string, fn: () => Promise<R>, opts: { anon?: boolean } = {}) {
  await actAs(db, uid);
  if (opts.anon) await db.query("SELECT set_config('test.anon','true',false)");
  try { return await fn(); } finally { await db.query("SELECT set_config('test.anon','',false)"); await actAs(db, null); }
}

async function seedScenario(db: Db) {
  const { GUEST, ...real } = U;
  await addUsers(db, Object.fromEntries(Object.values(real).map((u) => [u, email(u)])));
  await q(db, "INSERT INTO auth.users(id,email,is_anonymous) VALUES ($1,NULL,true)", [GUEST]);
  const prefs = (entities: object[], profiles: object[]) => JSON.stringify({ entities, books: { entityTaxProfiles: profiles } });
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
  // Legacy default: finance may edit team expenses (exposes write reach in the baseline).
  await q(db, "UPDATE public.role_permissions SET allowed=true WHERE role='finance' AND action='edit_expenses'");
  await q(db, "INSERT INTO public.department_budgets(department,amount) VALUES ('Engineering',5000),('Sales',9000) ON CONFLICT DO NOTHING");
  await q(db, `INSERT INTO public.preference_approvals(id,owner_id,previous_data,approved_data,changed_sections,transaction_id)
    VALUES (gen_random_uuid(),$1,'{}','{}','{assets}',1)`, [U.O]);
  await as(db, U.O, async () => {
    await q(db, "SELECT public.grant_entity_access('c1',$1,true)", [EMAIL[U.M]]);
    await q(db, "SELECT public.grant_entity_access('c1',$1,false)", [EMAIL[U.R]]);
    await q(db, "SELECT public.grant_entity_access('c1',$1,false)", [EMAIL[U.G]]);
    await q(db, "SELECT public.grant_entity_access('c1',$1,true)", [EMAIL[U.W]]);
    const x = first(await q<{ g: string }>(db, "SELECT public.grant_entity_access('c2',$1,false) g", [EMAIL[U.X]]));
    await q(db, "SELECT public.revoke_entity_access($1)", [x.g]);
  });
}

async function scenarioDb(after: string[] = []) {
  const db = await fullSchemaDb();
  await seedScenario(db);
  for (const f of after) await db.exec(readSql(f));
  return db;
}

// ------------------------------------------------------------------------------------------
// Exploit probes: each returns true when the attack SUCCEEDS.
// ------------------------------------------------------------------------------------------
const objectsVisible = (db: Db, names: string[]) => q(db, "SELECT name FROM storage.objects WHERE name = ANY($1)", [names]);
// alreadyBlocked: control probe that 0088 already stops (guard_team_expense_edit); it must stay blocked.
const PROBES: { id: string; what: string; alreadyBlocked?: true; run: (db: Db) => Promise<boolean> }[] = [
  { id: "H-1a", what: "manager with no grant reads unrelated owners' personal expenses (shared default department)", run: async (db) => {
    const r = await attempt(db, U.MGR, () => q(db, "SELECT 1 FROM public.expenses WHERE employee_id = ANY($1)", [[U.O, U.V]]));
    return r.ok && r.value.length > 0; } },
  { id: "H-1b", what: "finance with no grant reads statements, vault documents and receipts of every owner", run: async (db) => {
    const r = await attempt(db, U.F, () => objectsVisible(db, [PATH.statement, PATH.personalDoc, PATH.victimReceipt, PATH.victimStatement]));
    return r.ok && r.value.length > 0; } },
  { id: "H-1c", what: "finance with no grant reads every owner's company PAN via team_company_tax()", run: async (db) => {
    const r = await attempt(db, U.F, () => q(db, "SELECT profiles::text p FROM public.team_company_tax()"));
    return r.ok && r.value.some((x) => /AAAC/.test(String(x["p"]))); } },
  { id: "H-1d", what: "finance with only a c1 grant reads personal (no-entity) and c2 rows", run: async (db) => {
    const r = await attempt(db, U.G, () => q(db, "SELECT 1 FROM public.expenses WHERE employee_id <> $1 AND entity_id IS DISTINCT FROM 'c1'", [U.G]));
    return r.ok && r.value.length > 0; } },
  { id: "H-1e", what: "finance with no grant edits an unrelated owner's personal expense", run: async (db) => {
    const r = await attempt(db, U.F, () => q(db, "UPDATE public.expenses SET title='pwned' WHERE employee_id=$1 RETURNING 1", [U.V]));
    return r.ok && r.value.length > 0; } },
  { id: "H-1f", what: "manager with no grant reads an unrelated owner's receipts", run: async (db) => {
    const r = await attempt(db, U.MGR, () => objectsVisible(db, [PATH.victimReceipt]));
    return r.ok && r.value.length > 0; } },
  { id: "H-2/L-4", what: "legacy (possibly self-assigned) finance row changes shared department budgets", run: async (db) => {
    const r = await attempt(db, U.F, () => q(db, "UPDATE public.department_budgets SET amount=1 WHERE department='Sales' RETURNING 1"));
    return r.ok && r.value.length > 0; } },
  { id: "H-3a", what: "c1 editor reassigns the owner's company document to themself", run: async (db) => {
    const r = await attempt(db, U.M, () => q(db, "UPDATE public.documents SET owner_id=$1::uuid, file_path=$1::text||'/stolen.pdf' WHERE file_path=$2 RETURNING 1", [U.M, PATH.c1doc]));
    return r.ok && r.value.length > 0; } },
  { id: "H-3b", what: "finance c1 editor moves an owner's expense to another company / re-points its receipts", run: async (db) => {
    const a = await attempt(db, U.W, () => q(db, "UPDATE public.expenses SET entity_id='c2' WHERE entity_id='c1' AND employee_id=$1 RETURNING 1", [U.O]));
    const b = await attempt(db, U.W, () => q(db, "UPDATE public.expenses SET receipts=jsonb_build_array(jsonb_build_object('path',$2::text)) WHERE entity_id='c1' AND employee_id=$1 RETURNING 1", [U.O, PATH.statement]));
    return (a.ok && a.value.length > 0) || (b.ok && b.value.length > 0); } },
  { id: "H-3c", what: "editor moves an expense to themself (employee_id; control, already blocked at 0088)", alreadyBlocked: true, run: async (db) => {
    const r = await attempt(db, U.W, () => q(db, "UPDATE public.expenses SET employee_id=$2 WHERE entity_id='c1' AND employee_id=$1 RETURNING 1", [U.O, U.W]));
    return r.ok && r.value.length > 0; } },
  { id: "M-1a", what: "c1 editor adds a c1 document pointing at the owner's personal vault file, then reads the file", run: async (db) => {
    const r = await attempt(db, U.M, async () => {
      await q(db, "INSERT INTO public.documents(owner_id,title,file_path,file_name,entity_id) VALUES ($1,'x',$2,'x','c1')", [U.O, PATH.personalDoc]);
      return objectsVisible(db, [PATH.personalDoc]); });
    return r.ok && r.value.length > 0; } },
  { id: "M-1b", what: "c1 editor re-points a c1 document at the owner's c2 original, then reads it", run: async (db) => {
    const r = await attempt(db, U.M, async () => {
      await q(db, "UPDATE public.documents SET file_path=$1 WHERE file_path=$2", [PATH.c2doc, PATH.c1doc]);
      return objectsVisible(db, [PATH.c2doc]); });
    return r.ok && r.value.length > 0; } },
  { id: "M-2", what: "c1 editor writes a file outside the company namespace (owner report path)", run: async (db) => {
    const r = await attempt(db, U.M, () => q(db, "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES ('receipts',$1,$2) RETURNING 1", [`${U.O}/reports/11111111-0000-4000-8000-000000000009.pdf`, U.M]));
    return r.ok; } },
  { id: "L-3", what: "has_role() answers for another user (role oracle) to a stranger and to anon", run: async (db) => {
    const a = await attempt(db, U.X, () => q<{ r: boolean }>(db, "SELECT public.has_role($1,'finance') r", [U.F]));
    const b = await attempt(db, null, () => q<{ r: boolean }>(db, "SELECT public.has_role($1,'finance') r", [U.F]), { role: "anon" });
    return (a.ok && first(a.value).r === true) || (b.ok && first(b.value).r === true); } },
  { id: "ERASE", what: "delete_my_finance_data leaves preference_approvals and entity_members behind", run: async (db) => {
    const r = await attempt(db, U.O, async () => {
      await q(db, "SELECT public.delete_my_finance_data()");
      await db.exec("RESET ROLE");
      return q<{ n: number }>(db, "SELECT (SELECT count(*) FROM public.preference_approvals WHERE owner_id=$1)+(SELECT count(*) FROM public.entity_members WHERE owner_id=$1 OR member_id=$1) n", [U.O]); });
    return r.ok && Number(first(r.value).n) > 0; } },
];

describe("0088 baseline: every finding reproduces (isolated PGlite)", () => {
  let db: Db;
  beforeAll(async () => { db = await scenarioDb(); }, T);
  for (const p of PROBES) it(`${p.id} ${p.alreadyBlocked ? "stays blocked" : "reproduces"}: ${p.what}`, async () => { expect(await p.run(db)).toBe(!p.alreadyBlocked); }, T);
});

describe.each([["P1", [P1]], ["P1+P2", [P1, P2]]])("after %s: every exploit is blocked", (_name, files) => {
  let db: Db;
  beforeAll(async () => { db = await scenarioDb(files); }, T);
  for (const p of PROBES) it(`${p.id} blocked: ${p.what}`, async () => { expect(await p.run(db)).toBe(false); }, T);
});

// ------------------------------------------------------------------------------------------
// Legitimate flows keep working after P1 (and after P1+P2).
// ------------------------------------------------------------------------------------------
describe.each([["P1", [P1]], ["P1+P2", [P1, P2]]])("after %s: legitimate flows", (_name, files) => {
  let db: Db;
  beforeAll(async () => { db = await scenarioDb(files); }, T);

  it("owner CRUD on own expenses, documents and files is unaffected", async () => {
    const r = await attempt(db, U.O, async () => {
      const e = first(await q<{ id: string }>(db, `INSERT INTO public.expenses(employee_id,title,merchant,category,amount,currency,expense_date) VALUES ($1,'new','Shop','Food',10,'INR',current_date) RETURNING id`, [U.O]));
      expect(await q(db, "UPDATE public.expenses SET title='renamed', entity_id='c2', receipts='[]' WHERE id=$1 RETURNING 1", [e.id])).toHaveLength(1);
      expect(await q(db, "DELETE FROM public.expenses WHERE id=$1 RETURNING 1", [e.id])).toHaveLength(1);
      await q(db, "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES ('receipts',$1,$2)", [`${U.O}/docs/new.pdf`, U.O]);
      const d = first(await q<{ id: string }>(db, "INSERT INTO public.documents(owner_id,title,file_path,file_name) VALUES ($1,'new',$2,'n.pdf') RETURNING id", [U.O, `${U.O}/docs/new.pdf`]));
      expect(await q(db, "UPDATE public.documents SET file_path=$2, entity_id='c1' WHERE id=$1 RETURNING 1", [d.id, PATH.c2doc])).toHaveLength(1);
      expect(await q(db, "SELECT 1 FROM public.expenses WHERE employee_id=$1", [U.O])).toHaveLength(3);
      expect(await q(db, "SELECT name FROM storage.objects WHERE split_part(name,'/',1)=$1", [U.O])).toHaveLength(8);
      expect(await q(db, "DELETE FROM storage.objects WHERE name=$1 RETURNING 1", [`${U.O}/docs/new.pdf`])).toHaveLength(1);
      return true;
    });
    expect(r).toEqual({ ok: true, value: true });
  }, T);

  it("c1 editor: reads c1 only, uploads into the company namespace, links own upload, cleans unlinked uploads", async () => {
    const up = `${C1}aaaaaaaa-0000-4000-8000-000000000001-new.pdf`, spare = `${C1}aaaaaaaa-0000-4000-8000-000000000002-spare.pdf`;
    const r = await attempt(db, U.M, async () => {
      expect((await q<{ title: string }>(db, "SELECT title FROM public.documents ORDER BY 1")).map((x) => x.title)).toEqual(["c1 invoice"]);
      expect((await objectsVisible(db, Object.values(PATH))).map((x) => x["name"])).toEqual([PATH.c1doc]);
      expect(first(await q<{ ok: boolean }>(db, "SELECT public.can_access_entity($1,'c1',true) ok", [U.O])).ok).toBe(true);
      await q(db, "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES ('receipts',$1,$3),('receipts',$2,$3)", [up, spare, U.M]);
      expect(await objectsVisible(db, [up, spare])).toHaveLength(2); // own pending uploads
      await q(db, "INSERT INTO public.documents(owner_id,title,file_path,file_name,entity_id) VALUES ($1,'new',$2,'new.pdf','c1')", [U.O, up]);
      expect(await q(db, "UPDATE public.documents SET title='renamed', notes='checked' WHERE file_path=$1 RETURNING 1", [up])).toHaveLength(1);
      expect(await q(db, "DELETE FROM storage.objects WHERE name=$1 RETURNING 1", [up])).toHaveLength(0); // linked: kept
      expect(await q(db, "DELETE FROM storage.objects WHERE name=$1 RETURNING 1", [spare])).toHaveLength(1); // unlinked: cleaned
      return true;
    });
    expect(r).toEqual({ ok: true, value: true });
    for (const bad of [`${U.O}/companies/${hex("c2")}/x.pdf`, `${U.O}/docs/x.pdf`, `${C1}sub/x.pdf`, `${C1}../x.pdf`]) {
      const b = await attempt(db, U.M, () => q(db, "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES ('receipts',$1,$2)", [bad, U.M]));
      expect(b.ok, bad).toBe(false);
    }
    // Upload must carry the editor's own storage owner; metadata must reference that own upload.
    expect((await attempt(db, U.M, () => q(db, "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES ('receipts',$1,$2)", [`${C1}y.pdf`, U.O]))).ok).toBe(false);
    const foreign = await attempt(db, U.M, () => q(db, "INSERT INTO public.documents(owner_id,title,file_path,file_name,entity_id) VALUES ($1,'x',$2,'x','c1')", [U.O, PATH.c1doc]));
    expect(foreign.ok).toBe(false);
  }, T);

  it("read-only member reads c1 documents and files but cannot write", async () => {
    const r = await attempt(db, U.R, async () => ({
      docs: (await q(db, "SELECT title FROM public.documents")).length,
      files: (await objectsVisible(db, Object.values(PATH))).map((x) => x["name"]),
      edit: (await q(db, "UPDATE public.documents SET title='x' RETURNING 1")).length,
    }));
    expect(r).toEqual({ ok: true, value: { docs: 1, files: [PATH.c1doc], edit: 0 } });
    expect((await attempt(db, U.R, () => q(db, "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES ('receipts',$1,$2)", [`${C1}r.pdf`, U.R]))).ok).toBe(false);
  }, T);

  it("legacy finance with a c1 grant sees only c1 rows, the referenced c1 receipt and c1 tax profile", async () => {
    const r = await attempt(db, U.G, async () => ({
      exp: (await q<{ title: string }>(db, "SELECT title FROM public.expenses WHERE employee_id<>$1 ORDER BY 1", [U.G])).map((x) => x.title),
      files: (await objectsVisible(db, Object.values(PATH))).map((x) => x["name"]).sort(),
      tax: await q<{ owner_id: string; entities: unknown; profiles: unknown }>(db, "SELECT owner_id, entities, profiles FROM public.team_company_tax()"),
      names: (await q<{ id: string }>(db, "SELECT id FROM public.team_names()")).map((x) => x.id),
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.exp).toEqual(["c1 taxi"]);
    expect(r.value.files).toEqual([PATH.c1doc, PATH.c1receipt].sort());
    expect(r.value.tax).toEqual([{ owner_id: U.O, entities: [{ id: "c1", name: "Co One", kind: "company" }], profiles: [{ entityId: "c1", fy: "2025-26", pan: "AAACO1111A" }] }]);
    expect(r.value.names).toEqual([U.O]);
  }, T);

  it("legacy finance/manager without a grant see nothing of others but keep their own data", async () => {
    for (const u of [U.F, U.MGR]) {
      const r = await attempt(db, u, async () => ({
        others: (await q(db, "SELECT 1 FROM public.expenses WHERE employee_id<>$1", [u])).length,
        files: (await q(db, "SELECT 1 FROM storage.objects WHERE split_part(name,'/',1)<>$1", [u])).length,
        names: (await q(db, "SELECT 1 FROM public.team_names()")).length,
        own: (await q(db, "SELECT 1 FROM public.expenses WHERE employee_id=$1", [u])).length,
        role: first(await q<{ r: string }>(db, "SELECT public.my_team_role()::text r")).r,
      }));
      expect(r).toEqual({ ok: true, value: { others: 0, files: 0, names: 0, own: u === U.F ? 1 : 0, role: u === U.F ? "finance" : "manager" } });
    }
    expect(await attempt(db, U.F, () => q(db, "SELECT * FROM public.team_company_tax()"))).toEqual({ ok: true, value: [] });
  }, T);

  it("finance c1 editor can still edit permitted fields; category switch still enforced", async () => {
    const ok = await attempt(db, U.W, () => q(db, "UPDATE public.expenses SET title='fixed' WHERE entity_id='c1' AND employee_id=$1 RETURNING 1", [U.O]));
    expect(ok).toEqual({ ok: true, value: [{ "?column?": 1 }] });
    const cat = await attempt(db, U.W, () => q(db, "UPDATE public.expenses SET category='Food' WHERE entity_id='c1' AND employee_id=$1", [U.O]));
    expect(cat.ok ? "" : cat.error).toMatch(/switched off/);
  }, T);

  it("admin still manages roles, switches and history but cannot read other owners' finances", async () => {
    const r = await attempt(db, U.ADM, async () => {
      const team = await q(db, "SELECT user_id FROM public.admin_team()");
      await q(db, "SELECT public.admin_set_member($1,'finance','Ops')", [U.X]);
      await q(db, "SELECT public.admin_set_permission('manager','view_receipts',false)");
      return {
        team: team.length > 5,
        roleRows: (await q(db, "SELECT 1 FROM public.role_permissions")).length,
        history: (await q(db, "SELECT change FROM public.role_permission_audit ORDER BY created_at")).map((x) => x["change"]),
        others: (await q(db, "SELECT 1 FROM public.expenses")).length,
        files: (await q(db, "SELECT 1 FROM storage.objects")).length,
        budgetEdit: (await q(db, "UPDATE public.department_budgets SET amount=amount RETURNING 1")).length,
      };
    });
    expect(r).toEqual({ ok: true, value: { team: true, roleRows: 24, history: ["member", "switch"], others: 0, files: 0, budgetEdit: 0 } });
    // Verified finance = app admin who also holds the finance role: may edit department budgets.
    const v = await attempt(db, U.ADM, async () => {
      await q(db, "SELECT public.admin_set_member($1,'finance',NULL)", [U.ADM]);
      return (await q(db, "UPDATE public.department_budgets SET amount=amount RETURNING 1")).length;
    });
    expect(v.ok && v.value).toBeGreaterThan(0);
  }, T);

  it("revoked company member loses rows, files, pending uploads and upload rights immediately", async () => {
    const pending = `${C1}bbbbbbbb-0000-4000-8000-000000000001-p.pdf`;
    await as(db, U.M, () => q(db, "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES ('receipts',$1,$2)", [pending, U.M]));
    const before = await attempt(db, U.M, async () => (await objectsVisible(db, [PATH.c1doc, pending])).length);
    expect(before).toEqual({ ok: true, value: 2 });
    const r = await attempt(db, U.O, async () => {
      const g = first(await q<{ id: string }>(db, "SELECT id FROM public.entity_members WHERE member_id=$1 AND revoked_at IS NULL", [U.M]));
      await q(db, "SELECT public.revoke_entity_access($1)", [g.id]);
      await q(db, "SELECT set_config('test.uid',$1,false)", [U.M]); // next statement as the member
      return {
        docs: (await q(db, "SELECT 1 FROM public.documents")).length,
        files: (await objectsVisible(db, [PATH.c1doc, pending])).length,
        companies: (await q(db, "SELECT 1 FROM public.my_shared_companies()")).length,
        write: first(await q<{ ok: boolean }>(db, "SELECT public.can_access_entity($1,'c1',true) ok", [U.O])).ok,
        cleanup: (await q(db, "DELETE FROM storage.objects WHERE name=$1 RETURNING 1", [pending])).length,
      };
    });
    expect(r).toEqual({ ok: true, value: { docs: 0, files: 0, companies: 0, write: false, cleanup: 0 } });
    await actAs(db, null);
    await q(db, "DELETE FROM storage.objects WHERE name=$1", [pending]);
  }, T);

  it("family flow: invite, verified acceptance, request with evidence, owner reads evidence and decides", async () => {
    const evidence = `${U.KID}/requests/e1.jpg`;
    const r = await attempt(db, U.O, async () => {
      const m = first(await q<{ id: string }>(db, "INSERT INTO public.family_members(owner_id,name) VALUES ($1,'Kid') RETURNING id", [U.O]));
      const i = first(await q<{ id: string }>(db, "INSERT INTO public.family_invites(owner_id,member_id,email) VALUES ($1,$2,$3) RETURNING id", [U.O, m.id, EMAIL[U.KID]]));
      await q(db, "SELECT set_config('test.uid',$1,false)", [U.KID]);
      await q(db, "SELECT public.accept_family_invite($1)", [i.id]);
      await q(db, "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES ('receipts',$1,$2)", [evidence, U.KID]);
      const req = first(await q<{ id: string }>(db, "INSERT INTO public.family_requests(owner_id,requester_id,invite_id,title,amount,evidence_path) VALUES ($1,$2,$3,'Books',500,$4) RETURNING id", [U.O, U.KID, i.id, evidence]));
      const kidSeesOwner = (await q(db, "SELECT 1 FROM public.expenses WHERE employee_id=$1", [U.O])).length + (await q(db, "SELECT 1 FROM public.documents")).length;
      await q(db, "SELECT set_config('test.uid',$1,false)", [U.O]);
      const ownerEvidence = (await objectsVisible(db, [evidence])).length;
      await q(db, "SELECT public.decide_family_request($1,'approved','ok')", [req.id]);
      await q(db, "SELECT set_config('test.uid',$1,false)", [U.KID]);
      const status = first(await q<{ status: string }>(db, "SELECT status FROM public.family_requests")).status;
      return { kidSeesOwner, ownerEvidence, status };
    });
    expect(r).toEqual({ ok: true, value: { kidSeesOwner: 0, ownerEvidence: 1, status: "approved" } });
  }, T);

  it("visitor demo: guest session seeds and sees only its own sample rows", async () => {
    const r = await attempt(db, U.GUEST, async () => {
      await q(db, "SELECT public.start_demo_workspace('guest@demo.in')");
      return {
        own: (await q(db, "SELECT 1 FROM public.expenses WHERE employee_id=$1", [U.GUEST])).length > 0,
        others: (await q(db, "SELECT 1 FROM public.expenses WHERE employee_id<>$1", [U.GUEST])).length,
        files: (await q(db, "SELECT 1 FROM storage.objects")).length,
      };
    }, { anon: true });
    expect(r).toEqual({ ok: true, value: { own: true, others: 0, files: 0 } });
  }, T);
});

// ------------------------------------------------------------------------------------------
// Generic seeding across ALL public tables (FKs/triggers disabled, CHECKs honoured) for
// data-preservation and erasure coverage.
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
      if (t === "entity_members") { names.splice(0, names.length, '"owner_id"', '"entity_id"', '"member_id"', '"member_email"'); vals.splice(0, vals.length, `'${owner}'`, "'seed'", `'${first(owners.slice((oi + 1) % owners.length))}'`, `'${EMAIL[first(owners.slice((oi + 1) % owners.length))] ?? "seed@x.in"}'`); }
      try { await db.exec(`INSERT INTO public.${t}(${names.join(",")}) VALUES (${vals.join(",")})`); }
      catch (e) { failed.push(`${t}: ${(e as Error).message}`); }
    }
  } finally { await db.exec("SET session_replication_role = origin"); }
  return { tables, failed };
}

async function dataSnapshot(db: Db, tables: string[]) {
  await actAs(db, null);
  const out: Record<string, string> = {};
  for (const t of [...tables.map((x) => `public.${x}`), "storage.objects", "auth.users"]) {
    const r = first(await q<{ n: number; h: string }>(db, `SELECT count(*)::int n, md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) h FROM ${t} x`));
    out[t] = `${r.n}:${r.h}`;
  }
  return out;
}

async function schemaSnapshot(db: Db) {
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
    grants: await j("SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' ORDER BY 1,2,3"),
  };
}

describe("data preservation and exact rollback", () => {
  let db: Db; let tables: string[]; let S0: Awaited<ReturnType<typeof schemaSnapshot>>; let D0: Record<string, string>;
  beforeAll(async () => {
    db = await scenarioDb();
    const seeded = await seedAllTables(db, [U.O, U.V]);
    tables = seeded.tables;
    expect(seeded.failed.filter((f) => !/duplicate key/.test(f))).toEqual([]); // matrix already seeded by 0066
    S0 = await schemaSnapshot(db); D0 = await dataSnapshot(db, tables);
  }, T);

  it("every public table holds seeded rows before P1", async () => {
    const empty = Object.entries(D0).filter(([, v]) => v.startsWith("0:")).map(([k]) => k);
    expect(empty).toEqual([]);
    expect(tables.length).toBe(63);
  }, T);

  it("P1 then P2 change no pre-existing row (count + md5 per table); rollback restores 0088 objects exactly", async () => {
    await db.exec(readSql(P1));
    expect(await dataSnapshot(db, tables)).toEqual(D0);
    const S1 = await schemaSnapshot(db);
    expect(S1.policies).not.toEqual(S0.policies);
    await db.exec(readSql(P2));
    expect(await dataSnapshot(db, tables)).toEqual(D0);
    const backfilled = await q<{ n: number }>(db, "SELECT count(*)::int n FROM public.access_grants WHERE source='entity_members'");
    const members = await q<{ n: number }>(db, "SELECT count(*)::int n FROM public.entity_members");
    expect(first(backfilled).n).toBe(first(members).n);
    // P1 rollback refuses to run while P2 is installed
    await expect(db.exec(readSql(P1_RB))).rejects.toThrow(/Roll back P2/);
    await db.exec("ROLLBACK").catch(() => undefined);
    await db.exec(readSql(P2_RB));
    await db.exec(readSql(P1_RB));
    const S3 = await schemaSnapshot(db);
    for (const k of Object.keys(S0) as (keyof typeof S0)[]) expect(S3[k], k).toEqual(S0[k]);
    expect(await dataSnapshot(db, tables)).toEqual(D0);
    // P2 history is archived, not lost
    const archived = await q<{ n: number }>(db, "SELECT count(*)::int n FROM pg_tables WHERE schemaname='security_rollback_archive'");
    expect(first(archived).n).toBe(3);
    // and the package can be re-applied after a rollback
    await db.exec(readSql(P1)); await db.exec(readSql(P2));
    expect(await dataSnapshot(db, tables)).toEqual(D0);
  }, T);
});

describe("erasure coverage (delete_my_finance_data)", () => {
  const KEPT = new Set(["profiles", "user_roles", "app_admins", "role_permission_audit", "expense_history", "demo_sessions", "device_passkeys", "passkey_challenges"]);
  async function erase(files: string[]) {
    const db = await fullSchemaDb(files);
    await addUsers(db, { [U.O]: email(U.O), [U.V]: email(U.V) });
    const { tables, failed } = await seedAllTables(db, [U.O, U.V]);
    expect(failed.filter((f) => !/duplicate key/.test(f))).toEqual([]);
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
    const r = await attempt(db, U.O, () => q(db, "SELECT public.delete_my_finance_data()"));
    expect(r.ok, r.ok ? "" : r.error).toBe(true);
    await as(db, U.O, () => q(db, "SELECT public.delete_my_finance_data()"));
    return { left: Object.entries(await count(U.O)).filter(([t, n]) => n > 0 && !KEPT.has(t)).map(([t]) => t).sort(), vBefore, vAfter: await count(U.V) };
  }

  it("0088 baseline leaves owner-linked rows in tables added after 0058", async () => {
    const { left } = await erase([]);
    expect(left).toEqual(expect.arrayContaining(["preference_approvals", "entity_members", "upload_links", "opening_postings", "report_jobs"]));
  }, T);

  it("after P1 (+P2) no owner-linked row remains outside the documented kept tables; other owners keep theirs", async () => {
    for (const files of [[P1], [P1, P2]]) {
      const { left, vBefore, vAfter } = await erase(files);
      expect(left).toEqual([]);
      // V's rows survive, except entity_members rows that named the erased owner as member
      expect({ ...vAfter, entity_members: 0 }).toEqual({ ...vBefore, entity_members: 0 });
    }
  }, T);

  it("P1 keeps the delete_my_finance_data contract (no args, void, definer, authenticated only)", async () => {
    const db = await fullSchemaDb([P1]);
    const f = first(await q<{ args: string; ret: string; def: boolean; acl: string }>(db, `SELECT pg_get_function_identity_arguments(p.oid) args, p.prorettype::regtype::text ret, p.prosecdef def, array_to_string(p.proacl, ',') acl FROM pg_proc p WHERE p.oid='public.delete_my_finance_data'::regproc`));
    expect(f).toMatchObject({ args: "", ret: "void", def: true });
    expect(f.acl).not.toMatch(/(^|,)=X|anon=/);
    expect(await attempt(db, null, () => q(db, "SELECT public.delete_my_finance_data()"), { role: "anon" })).toMatchObject({ ok: false });
  }, T);
});

describe("SECURITY DEFINER hygiene of the proposed functions", () => {
  it("every new or replaced definer function sets search_path, checks auth.uid() and is not executable by anon/PUBLIC", async () => {
    const db = await fullSchemaDb([P1, P2]);
    const names = ["can_access_expense", "can_read_team_receipt", "team_company_tax", "has_role", "can_upload_company_file", "is_unlinked_company_file",
      "is_own_unlinked_company_upload", "delete_my_finance_data", "guard_team_expense_edit", "has_permission", "invite_access", "accept_access",
      "revoke_access", "my_access_invites", "sync_entity_member_grant"];
    const rows = await q<{ sig: string; def: boolean; cfg: string[] | null; src: string; acl: string }>(db, `SELECT p.oid::regprocedure::text sig, p.prosecdef def, p.proconfig cfg, p.prosrc src, array_to_string(p.proacl, ',') acl
      FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname = ANY($1)`, [names]);
    expect(rows.length).toBe(names.length + 1); // can_access_expense has two overloads
    for (const r of rows) {
      expect(r.def, r.sig).toBe(true);
      expect((r.cfg ?? []).some((c) => c.startsWith("search_path=")), r.sig).toBe(true);
      expect(r.acl, r.sig).not.toMatch(/(^|,)=X|anon=X/);
      if (!/guard_team_expense_edit|sync_entity_member_grant/.test(r.sig)) expect(r.src, r.sig).toMatch(/auth\.uid\(\)|has_permission|can_upload_company_file|is_unlinked_company_file/);
    }
  }, T);
});

// ------------------------------------------------------------------------------------------
// P2: V3.1 role model
// ------------------------------------------------------------------------------------------
const ACTIONS = ["view", "upload", "draft_edit", "propose", "post", "approve", "export", "share", "delete_unposted", "manage_access", "reopen"] as const;
const MATRIX: Record<string, readonly string[]> = {
  owner: ACTIONS,
  adult_family_member: ["view", "upload", "draft_edit", "propose"],
  delegate: ["view", "upload", "draft_edit", "propose", "post", "export", "delete_unposted"],
  bookkeeper: ["view", "upload", "draft_edit", "propose", "post", "export", "delete_unposted"],
  accountant: ["view", "upload", "draft_edit", "propose", "post", "approve", "export", "delete_unposted"],
  auditor: ["view", "export"],
  company_secretary: ["view", "upload", "draft_edit", "propose", "export"],
  authorised_reviewer: ["view", "approve", "export"],
  administrator: ["manage_access"],
};
/** Expected permissions for a role; fails loudly for a role missing from the matrix. */
const matrix = (role: string): readonly string[] => { const m = MATRIX[role]; if (!m) throw new Error(`No expected permissions for ${role}`); return m; };

describe("P2 V3.1 scoped grants", () => {
  let db: Db;
  const roleUser = (i: number) => id(100 + i);
  const perms = async (uid: string, owner: string, entity: string | null) => {
    const r = await attempt(db, uid, () => q<{ a: string; ok: boolean }>(db, "SELECT a, public.has_permission($1,$2,a) ok FROM unnest($3::text[]) a", [owner, entity, ACTIONS]));
    if (!r.ok) throw new Error(r.error);
    return r.value.filter((x) => x.ok).map((x) => x.a);
  };
  beforeAll(async () => {
    db = await scenarioDb([P1, P2]);
    const roles = Object.keys(MATRIX).filter((r) => r !== "owner");
    await addUsers(db, Object.fromEntries(roles.map((r, i) => [roleUser(i), `${r}@pro.in`])));
    await addUsers(db, { [id(200)]: "idn@pro.in", [id(201)]: "other@pro.in", [id(203)]: "exp@pro.in", [id(204)]: "scope@pro.in" });
    await q(db, "INSERT INTO auth.users(id,email) VALUES ($1,'idn2@pro.in')", [id(202)]); // unconfirmed
    for (const [i, r] of roles.entries()) {
      const g = first(await as(db, U.O, () => q<{ g: string }>(db, "SELECT public.invite_access($1,NULL,$2,$3,NULL) g", [U.O, `${r}@pro.in`, r])));
      await as(db, roleUser(i), () => q(db, "SELECT public.accept_access($1)", [g!.g]));
    }
  }, T);

  it("the stored matrix equals the documented V3.1 matrix", async () => {
    const rows = await q<{ role: string; action: string }>(db, "SELECT role, action FROM public.access_role_permissions WHERE allowed ORDER BY 1,2");
    const stored: Record<string, string[]> = {};
    for (const r of rows) (stored[r.role] ??= []).push(r.action);
    expect(Object.keys(stored).sort()).toEqual(Object.keys(MATRIX).sort());
    for (const [role, acts] of Object.entries(MATRIX)) expect(stored[role], role).toEqual([...acts].sort());
    expect((await q(db, "SELECT 1 FROM public.access_role_permissions")).length).toBe(9 * 11);
  }, T);

  it("has_permission follows the matrix for every role; owner has all; strangers none", async () => {
    expect(await perms(U.O, U.O, "c1")).toEqual([...ACTIONS]);
    for (const [i, role] of Object.keys(MATRIX).filter((r) => r !== "owner").entries()) expect(await perms(roleUser(i), U.O, "c1"), role).toEqual([...matrix(role)]);
    expect(await perms(U.X, U.O, "c1")).toEqual([]);
    expect(await perms(roleUser(0), U.V, null)).toEqual([]); // grant is per workspace owner
    expect((await attempt(db, null, () => q(db, "SELECT public.has_permission($1,'c1','view')", [U.O]), { role: "anon" })).ok).toBe(false);
  }, T);

  it("entity scope: a company grant never reaches another company or personal (no-entity) records", async () => {
    const g = first(await as(db, U.O, () => q<{ g: string }>(db, "SELECT public.invite_access($1,'c1','scope@pro.in','accountant',NULL) g", [U.O])));
    await as(db, id(204), () => q(db, "SELECT public.accept_access($1)", [g!.g]));
    expect(await perms(id(204), U.O, "c1")).toEqual([...MATRIX["accountant"]!]);
    expect(await perms(id(204), U.O, "c2")).toEqual([]);
    expect(await perms(id(204), U.O, null)).toEqual([]);
  }, T);

  it("revocation and expiry take effect on the very next statement", async () => {
    const g = first(await as(db, U.O, () => q<{ g: string }>(db, "SELECT public.invite_access($1,NULL,'exp@pro.in','auditor',now() + interval '1 day') g", [U.O])));
    await as(db, id(203), () => q(db, "SELECT public.accept_access($1)", [g!.g]));
    expect(await perms(id(203), U.O, "c1")).toEqual(["view", "export"]);
    await q(db, "UPDATE public.access_grants SET created_at=now()-interval '2 days', expires_at=now()-interval '1 second' WHERE id=$1", [g!.g]);
    expect(await perms(id(203), U.O, "c1")).toEqual([]);
    await q(db, "UPDATE public.access_grants SET expires_at=now()+interval '1 day' WHERE id=$1", [g!.g]);
    expect(await perms(id(203), U.O, "c1")).toEqual(["view", "export"]);
    const same = await attempt(db, U.O, async () => {
      await q(db, "SELECT public.revoke_access($1)", [g!.g]);
      await q(db, "SELECT set_config('test.uid',$1,false)", [id(203)]);
      return first(await q<{ ok: boolean }>(db, "SELECT public.has_permission($1,'c1','view') ok", [U.O])).ok;
    });
    expect(same).toEqual({ ok: true, value: false });
    await as(db, id(203), () => q(db, "SELECT public.revoke_access($1)", [g!.g])); // grantee may leave
    expect(await perms(id(203), U.O, "c1")).toEqual([]);
    const log = await as(db, U.O, () => q<{ event: string }>(db, "SELECT event FROM public.access_grant_audit WHERE grant_id=$1 ORDER BY created_at, event", [g!.g]));
    expect(log.map((x) => x.event)).toEqual(["invited", "accepted", "revoked"]);
    expect((await attempt(db, U.O, () => q(db, "UPDATE public.access_grant_audit SET details='{}'"))).ok).toBe(false);
    expect((await attempt(db, null, () => q(db, "DELETE FROM public.access_grant_audit"))).ok).toBe(false);
  }, T);

  it("acceptance requires the signed-in account's confirmed email to match the invite", async () => {
    const g = first(await as(db, U.O, () => q<{ g: string }>(db, "SELECT public.invite_access($1,'c1','IDN@pro.in ','bookkeeper',NULL) g", [U.O])));
    expect((await attempt(db, id(201), () => q(db, "SELECT public.accept_access($1)", [g!.g]))).ok).toBe(false); // other email
    await q(db, "UPDATE auth.users SET email='idn@pro.in' WHERE id=$1", [id(202)]); // same address, unconfirmed account
    expect((await attempt(db, id(202), () => q(db, "SELECT public.accept_access($1)", [g!.g]))).ok).toBe(false);
    expect((await attempt(db, U.GUEST, () => q(db, "SELECT public.accept_access($1)", [g!.g]), { anon: true })).ok).toBe(false);
    expect(await perms(id(200), U.O, "c1")).toEqual([]); // invited but not accepted
    const pending = await attempt(db, id(200), () => q<{ grant_id: string }>(db, "SELECT grant_id FROM public.my_access_invites()"));
    expect(pending).toEqual({ ok: true, value: [{ grant_id: g.g }] });
    expect((await attempt(db, id(200), () => q(db, "SELECT public.accept_access($1)", [g!.g]))).ok).toBe(true);
    await as(db, id(200), () => q(db, "SELECT public.accept_access($1)", [g!.g]));
    await as(db, id(200), () => q(db, "SELECT public.accept_access($1)", [g!.g])); // idempotent
    expect(await perms(id(200), U.O, "c1")).toEqual([...MATRIX["bookkeeper"]!]);
    const row = first(await q<{ identity_check: string; grantee_id: string }>(db, "SELECT identity_check, grantee_id FROM public.access_grants WHERE id=$1", [g!.g]));
    expect(row).toEqual({ identity_check: "confirmed_email_match", grantee_id: id(200) });
  }, T);

  it("only the owner or a manage_access holder may invite; no escalation to owner/administrator; clients cannot write grants directly", async () => {
    expect((await attempt(db, U.X, () => q(db, "SELECT public.invite_access($1,NULL,'z@pro.in','auditor',NULL)", [U.O]))).ok).toBe(false);
    expect((await attempt(db, U.O, () => q(db, "SELECT public.invite_access($1,NULL,'z@pro.in','owner',NULL)", [U.O]))).ok).toBe(false);
    expect((await attempt(db, U.O, () => q(db, "SELECT public.invite_access($1,'nope','z@pro.in','auditor',NULL)", [U.O]))).ok).toBe(false);
    expect((await attempt(db, U.O, () => q(db, "SELECT public.invite_access($1,NULL,'z@pro.in','auditor',now()-interval '1 hour')", [U.O]))).ok).toBe(false);
    const admin = roleUser(Object.keys(MATRIX).filter((r) => r !== "owner").indexOf("administrator"));
    expect((await attempt(db, admin, () => q(db, "SELECT public.invite_access($1,NULL,'z@pro.in','auditor',NULL)", [U.O]))).ok).toBe(true);
    expect((await attempt(db, admin, () => q(db, "SELECT public.invite_access($1,NULL,'z@pro.in','administrator',NULL)", [U.O]))).ok).toBe(false);
    expect(await perms(admin, U.O, "c1")).toEqual(["manage_access"]); // administrators manage access, never read finances
    expect((await attempt(db, U.O, () => q(db, "INSERT INTO public.access_grants(workspace_owner_id,role,grantee_email,granted_by) VALUES ($1,'auditor','q@pro.in',$1)", [U.O]))).ok).toBe(false);
    expect((await attempt(db, U.X, () => q(db, "UPDATE public.access_grants SET revoked_at=NULL RETURNING 1"))).ok).toBe(false);
    expect((await attempt(db, U.O, () => q(db, "DELETE FROM public.access_grants RETURNING 1"))).ok).toBe(false);
    const vis = await attempt(db, U.V, () => q(db, "SELECT 1 FROM public.access_grants"));
    expect(vis).toEqual({ ok: true, value: [] });
  }, T);

  it("backfill copied entity_members (can_write->bookkeeper, read-only->auditor) and did not map legacy user_roles", async () => {
    const rows = await q<{ grantee_id: string; role: string; entity_id: string; revoked: boolean; accepted: boolean }>(db,
      "SELECT grantee_id, role, entity_id, revoked_at IS NOT NULL revoked, accepted_at IS NOT NULL accepted FROM public.access_grants WHERE source='entity_members' ORDER BY grantee_id");
    expect(rows).toEqual([
      { grantee_id: U.M, role: "bookkeeper", entity_id: "c1", revoked: false, accepted: true },
      { grantee_id: U.R, role: "auditor", entity_id: "c1", revoked: false, accepted: true },
      { grantee_id: U.G, role: "auditor", entity_id: "c1", revoked: false, accepted: true },
      { grantee_id: U.X, role: "auditor", entity_id: "c2", revoked: true, accepted: true },
      { grantee_id: U.W, role: "bookkeeper", entity_id: "c1", revoked: false, accepted: true },
    ]);
    expect(await q(db, "SELECT 1 FROM public.access_grants WHERE grantee_id = ANY($1)", [[U.F, U.MGR, U.ADM]])).toEqual([]);
    expect((await q<{ n: number }>(db, "SELECT count(*)::int n FROM public.user_roles"))[0]?.n).toBe(4); // legacy rows untouched
    expect((await q<{ n: number }>(db, "SELECT count(*)::int n FROM public.access_grant_audit WHERE event='backfilled'"))[0]?.n).toBe(5);
  }, T);

  it("transition sync: grant_entity_access / revoke_entity_access are mirrored immediately", async () => {
    const x = first(await as(db, U.O, () => q<{ g: string }>(db, "SELECT public.grant_entity_access('c2',$1,true) g", [EMAIL[U.KID]])));
    expect(await perms(U.KID, U.O, "c2")).toEqual([...MATRIX["bookkeeper"]!]);
    await as(db, U.O, () => q(db, "SELECT public.grant_entity_access('c2',$1,false)", [EMAIL[U.KID]]));
    expect(await perms(U.KID, U.O, "c2")).toEqual([...MATRIX["auditor"]!]);
    await as(db, U.O, () => q(db, "SELECT public.revoke_entity_access($1)", [x!.g]));
    expect(await perms(U.KID, U.O, "c2")).toEqual([]);
    expect(await perms(U.M, U.O, "c1")).toEqual([...MATRIX["bookkeeper"]!]);
  }, T);

  it("P2 does not switch live policies: database reach still comes from entity_members only", async () => {
    // an accepted workspace-wide accountant grant gives no table/storage access yet
    const acct = roleUser(Object.keys(MATRIX).filter((r) => r !== "owner").indexOf("accountant"));
    const r = await attempt(db, acct, async () => ({
      docs: (await q(db, "SELECT 1 FROM public.documents")).length,
      exp: (await q(db, "SELECT 1 FROM public.expenses")).length,
      files: (await q(db, "SELECT 1 FROM storage.objects")).length,
    }));
    expect(r).toEqual({ ok: true, value: { docs: 0, exp: 0, files: 0 } });
    const pol = await q<{ n: number }>(db, "SELECT count(*)::int n FROM pg_policies WHERE coalesce(qual,'')||coalesce(with_check,'') ~ 'has_permission'");
    expect(pol[0]?.n).toBe(0);
  }, T);
});
