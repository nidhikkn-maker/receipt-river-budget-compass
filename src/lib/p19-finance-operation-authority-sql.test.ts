// @vitest-environment node
// P0-038 row 13 (owner decision KK, Option 1): proposed P19 makes the money-movement workflow (finance_operation) and
// its claim-receipt step (receive_claim_receipt) SECURITY DEFINER with explicit ownership predicates, replaces the
// client-settable app.finance_owner exemption with a transaction-bound authority row, closes client writes to the
// idempotency records and binds each record to the canonical request (strict idempotency).
// Each describe shows the original bypass on the schema WITHOUT P19, installs P19, shows the same attacks refused,
// exercises strict idempotency (a)-(e), receipt claiming, the other operations and definer safety, and rolls back to
// the exact previous catalog. Runs on the applied schema and on the whole proposed stack P1..P18 + P19.
// Isolated in-memory PGlite only (never Cloud or a hosted database). Review: docs/security/p0-038/P19_REVIEW.md.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { actAs, addUsers, fullSchemaDb, readSql } from "@/test/full-schema-pglite";

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const O = u(1), V = u(2), M = u(3);
const ACC_O = u(101), CARD_O = u(102), ARCH_O = u(103), ACC_V = u(201);
const D = ".lovable/staged-sql/proposed/";
const P19 = `${D}P19_finance_operation_authority.sql`, P19_RB = `${D}P19_finance_operation_authority.rollback.sql`;
const STACK = ["P1_security_containment", "P2_v31_role_model", "P4_step_up_and_assistant_limits", "P5_legal_entities_foundation", "P5b_restore_investments", "P6_registers",
  "P7_balanced_posting", "P8_asset_depreciation_posting", "P9_statement_import_idempotency_and_archive_guards", "P10_unposted_entry_withdrawal", "P11_backup_restore_receipts",
  "P13_team_change_requests", "P14_asset_disposal_approval", "P15_export_authorisation", "P16_statement_undo_withdraw", "P17_locked_evidence_storage", "P18_erasure_authority"];
const CATALOG = `
  SELECT 'f' k, n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' n, md5(p.prosrc) || coalesce(p.proacl::text, '') || p.prosecdef::text || coalesce(p.proconfig::text, '') || p.provolatile::text v
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_%'
  UNION ALL SELECT 't', c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal
  UNION ALL SELECT 'r', c.oid::regclass::text, coalesce(c.relacl::text, '') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname IN ('public', 'storage') AND c.relkind = 'r'
  UNION ALL SELECT 'c', table_name || '.' || column_name, data_type FROM information_schema.columns WHERE table_schema = 'public'
  UNION ALL SELECT 'p', schemaname || '.' || tablename || '.' || policyname, cmd || coalesce(qual, '') || coalesce(with_check, '') FROM pg_policies
  UNION ALL SELECT 'n', nspname, coalesce(nspacl::text, '') FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY 1, 2`;
const catalog = async (db: PGlite) => { await actAs(db, null); return (await db.query<{ k: string; n: string; v: string }>(CATALOG)).rows.map((r) => `${r.k}|${r.n}|${r.v}`); };
const sql = async <T = Record<string, unknown>>(db: PGlite, s: string, p: unknown[] = []) => { await actAs(db, null); return (await db.query<T>(s, p)).rows; };
const num = async (db: PGlite, s: string, p: unknown[] = []) => (await sql<{ n: number }>(db, `SELECT (${s})::int n`, p))[0]!.n;
type Step = [string, unknown[]?];
type Out = { error: string; rows: Record<string, unknown>[][] };
/**
 * Steps in ONE transaction, committed when every step succeeds. who: a uid = that signed-in client (role authenticated,
 * RLS); { privileged: uid } = the function owner's role with auth.uid() = uid, i.e. a caller that holds EXECUTE on
 * everything (shows what the function body itself refuses). opts.clientId simulates an external assistant token.
 */
async function run(db: PGlite, who: string | { privileged: string }, steps: Step[], opts: { clientId?: string } = {}): Promise<Out> {
  const rows: Record<string, unknown>[][] = [];
  if (typeof who === "string") await actAs(db, who, opts.clientId ? { clientId: opts.clientId } : {});
  else { await actAs(db, null); await db.query("SELECT set_config('test.uid', $1, false)", [who.privileged]); }
  await db.exec("BEGIN");
  try { for (const [s, p] of steps) rows.push((await db.query(s, p ?? [])).rows as Record<string, unknown>[]); await db.exec("COMMIT"); return { error: "", rows }; }
  catch (e) { await db.exec("ROLLBACK"); return { error: (e as Error).message, rows }; }
  finally { await actAs(db, null); }
}
const err = async (db: PGlite, who: string | { privileged: string }, steps: Step[], opts: { clientId?: string } = {}) => (await run(db, who, steps, opts)).error;
const opStep = (action: string, payload: Record<string, unknown>): Step => ["SELECT public.finance_operation($1, $2::jsonb) r", [action, JSON.stringify(payload)]];
/** finance_operation as uid: the result (throws the database error). */
async function op(db: PGlite, uid: string, action: string, payload: Record<string, unknown>) {
  const out = await run(db, uid, [opStep(action, payload)]);
  if (out.error) throw new Error(out.error);
  return out.rows[0]![0]!["r"] as Record<string, unknown>;
}
const opErr = async (db: PGlite, uid: string, action: string, payload: Record<string, unknown>) => err(db, uid, [opStep(action, payload)]);
const DAY = "2026-11-02";
/** O's pending reimbursement claim (an expense on O's savings account). */
async function claim(db: PGlite, id: string, amount: number, extra: { entity?: string; owner?: string; account?: string; status?: string } = {}) {
  await sql(db, `INSERT INTO public.expenses(id, employee_id, title, category, amount, original_amount, currency, expense_date, account_id, description, entity_id, reimbursement, reimbursement_status)
    VALUES ($1,$2,'Client travel','Travel',$3,$3,'INR','2026-10-20',$4,'',$5,$6::jsonb,$7)`,
  [id, extra.owner ?? O, amount, extra.account ?? ACC_O, extra.entity ?? null, JSON.stringify({ kind: "employer", payer: "Alpha Traders", reimbursable: amount, receipts: [] }), extra.status ?? "pending"]);
}
const entries = (db: PGlite, owner = O) => num(db, "SELECT count(*) FROM public.expenses WHERE employee_id = $1", [owner]);
const markers = (db: PGlite, key?: string) => key ? num(db, "SELECT count(*) FROM public.finance_operations WHERE owner_id = $1 AND operation_key = $2", [O, key]) : num(db, "SELECT count(*) FROM public.finance_operations");
const claimState = async (db: PGlite, id: string) => (await sql<{ s: string; r: { receipts: { amount: number; txnId: string }[] } }>(db, "SELECT reimbursement_status s, reimbursement r FROM public.expenses WHERE id = $1", [id]))[0]!;
const authorityRows = (db: PGlite) => num(db, "SELECT count(*) FROM phase3_p19.authority");

async function setup(extra: string[]) {
  const db = await fullSchemaDb(extra);
  await addUsers(db, { [O]: "o@x.in", [V]: "v@x.in", [M]: "m@x.in" });
  await sql(db, "INSERT INTO public.finance_preferences(owner_id, data) VALUES ($1,$2::jsonb),($3,'{}'),($4,'{}') ON CONFLICT (owner_id) DO UPDATE SET data = EXCLUDED.data",
    [O, JSON.stringify({ entities: [{ id: "c1", name: "Alpha Traders Pvt Ltd", kind: "company" }] }), V, M]);
  await sql(db, `INSERT INTO public.accounts(id, owner_id, name, kind, opening_balance, archived) VALUES ($1,$2,'HDFC savings','savings',50000,false), ($3,$2,'HDFC card','credit_card',0,false),
    ($4,$2,'Old savings','savings',0,true), ($5,$6,'V savings','savings',1000,false)`, [ACC_O, O, CARD_O, ARCH_O, ACC_V, V]);
  // M: a company member with write access to O's company c1 (0075 entity grant)
  await sql(db, "INSERT INTO public.entity_members(owner_id, entity_id, member_id, member_email, can_write) VALUES ($1,'c1',$2,'m@x.in',true)", [O, M]);
  return db;
}

for (const [label, extra, stack] of [["applied schema", [] as string[], false], ["proposed stack P1..P18", STACK.map((n) => `${D}${n}.sql`), true]] as const) {
  describe(`P19 finance operation authority — ${label} (SQL, isolated PGlite)`, () => {
    let db: PGlite;
    let before: string[];
    beforeAll(async () => { db = await setup(extra); before = await catalog(db); }, 600_000);
    afterAll(async () => { await db?.close(); });

    it("before P19 the app.finance_owner bypass works; after P19 the same attacks are refused and the workflow still works", async () => {
      // ---- BEFORE (schema without P19): reproduction of GUC_INVENTORY row 13 ----
      const C1 = u(1001);
      await claim(db, C1, 1000);
      const forge = (key: string, set: string): Step[] => [[set, set.includes("$1") ? [O] : []],
        ["INSERT INTO public.finance_operations(owner_id, operation_key, result) VALUES ($1, $2, '{\"id\":\"forged\"}')", [O, key]]];
      expect(await err(db, O, forge("claim_receipt:op-forged-1", "SELECT set_config('app.finance_owner', $1, true)"))).toBe("");
      expect(await err(db, O, forge("claim_receipt:op-forged-2", `SET LOCAL app.finance_owner = '${O}'`))).toBe("");
      // (a) a real money movement with the forged key "replays" the forged result and saves nothing
      const n0 = await entries(db);
      expect(await op(db, O, "claim_receipt", { operationId: "op-forged-1", id: C1, amount: 400, date: DAY, accountId: ACC_O })).toEqual({ id: "forged", replayed: true });
      expect(await entries(db)).toBe(n0);
      expect((await claimState(db, C1)).r.receipts).toEqual([]);
      // (b) receive_claim_receipt outside the workflow: no idempotency record, no per-owner lock
      const m0 = await markers(db);
      expect(await err(db, O, [["SELECT set_config('app.finance_owner', $1, true)", [O]], ["SELECT public.receive_claim_receipt($1, 100, $2::date, $3, 'outside')", [C1, DAY, ACC_O]]])).toBe("");
      expect(await markers(db)).toBe(m0);
      expect((await claimState(db, C1)).r.receipts.map((r) => r.amount)).toEqual([100]);

      // ---- install P19 ----
      await db.exec(readSql(P19));
      await expect(db.exec(readSql(P19))).rejects.toThrow(/already installed/);
      await db.exec("ROLLBACK");

      // (e) no client can forge, change or delete an idempotency record, setting or not
      for (const set of ["SELECT set_config('app.finance_owner', $1, true)", `SET LOCAL app.finance_owner = '${O}'`]) {
        expect(await err(db, O, forge("claim_receipt:op-forged-3", set))).toMatch(/permission denied/);
        expect(await err(db, O, [[set, set.includes("$1") ? [O] : []], ["UPDATE public.finance_operations SET result = '{\"id\":\"rewritten\"}' WHERE owner_id = $1", [O]]])).toMatch(/permission denied/);
        expect(await err(db, O, [[set, set.includes("$1") ? [O] : []], ["DELETE FROM public.finance_operations WHERE owner_id = $1", [O]]])).toMatch(/permission denied/);
        // the claim step cannot be called outside the workflow
        expect(await err(db, O, [[set, set.includes("$1") ? [O] : []], ["SELECT public.receive_claim_receipt($1, 100, $2::date, $3, 'outside')", [C1, DAY, ACC_O]]])).toMatch(/permission denied/);
      }
      // even a caller holding EXECUTE (function owner role, auth.uid() = O) is refused outside the workflow transaction
      expect(await err(db, { privileged: O }, [["SELECT set_config('app.finance_owner', $1, true)", [O]], ["SELECT public.receive_claim_receipt($1, 100, $2::date, $3, 'outside')", [C1, DAY, ACC_O]]])).toMatch(/Use the payment workflow/);
      // the authority table and its writer are closed to clients
      for (const s of ["INSERT INTO phase3_p19.authority(transaction_id, scope, actor_id) VALUES (txid_current(), 'finance_operation', auth.uid())", "SELECT phase3_p19.grant_authority('finance_operation')", "SELECT phase3_p19.authorised('finance_operation')"])
        expect(await err(db, O, [[s]])).toMatch(/permission denied/);
      expect((await claimState(db, C1)).r.receipts.map((r) => r.amount)).toEqual([100]);
      // the legitimate workflow still works and no longer sets the setting
      const out = await run(db, O, [opStep("claim_receipt", { operationId: "op-after-1", id: C1, amount: 400, date: DAY, accountId: ACC_O }), ["SELECT coalesce(current_setting('app.finance_owner', true), '') s"]]);
      expect(out.error).toBe("");
      expect(out.rows[0]![0]!["r"]).toMatchObject({ amount: 400 });
      expect(out.rows[1]![0]!["s"]).toBe("");
      expect((await claimState(db, C1)).r.receipts.map((r) => r.amount)).toEqual([100, 400]);
      expect(await authorityRows(db)).toBe(0);
      // no function or policy reads app.finance_owner any more
      expect(await num(db, "SELECT count(*) FROM pg_proc WHERE prosrc LIKE '%app.finance_owner%'")).toBe(0);
      expect(await num(db, "SELECT count(*) FROM pg_policies WHERE coalesce(qual,'') || coalesce(with_check,'') LIKE '%app.finance_owner%'")).toBe(0);
    }, 600_000);

    it("strict idempotency (a) same key + same request replays without a new effect; (b) same key + different request is a conflict", async () => {
      const C2 = u(1002);
      await claim(db, C2, 1200);
      const p = { operationId: "op-idem-1", id: C2, amount: 500, date: DAY, accountId: ACC_O, note: "NEFT" };
      const first = await op(db, O, "claim_receipt", p);
      const n1 = await entries(db);
      const again = await op(db, O, "claim_receipt", { ...p });
      expect(again).toEqual({ ...first, replayed: true });
      // canonical request: key order and spacing of the JSON do not matter
      const reordered = await run(db, O, [["SELECT public.finance_operation('claim_receipt', $1::jsonb) r", [`{ "note":"NEFT", "accountId":"${ACC_O}", "date":"${DAY}", "amount":500, "id":"${C2}", "operationId":"op-idem-1" }`]]]);
      expect(reordered.rows[0]?.[0]?.["r"]).toEqual({ ...first, replayed: true });
      expect(await entries(db)).toBe(n1);
      expect(await markers(db, "claim_receipt:op-idem-1")).toBe(1);
      expect((await claimState(db, C2)).r.receipts.map((r) => r.amount)).toEqual([500]);
      // (b) same key, different request: refused, nothing changes
      for (const changed of [{ amount: 600 }, { accountId: CARD_O }, { note: "IMPS" }, { date: "2026-11-01" }])
        expect(await opErr(db, O, "claim_receipt", { ...p, ...changed })).toMatch(/P19_IDEMPOTENCY_CONFLICT/);
      expect(await opErr(db, O, "reimbursement", { operationId: "op-idem-1", ids: [C2], accountId: ACC_O, date: DAY })).toBe(""); // another action is another key
      expect(await opErr(db, O, "reimbursement", { operationId: "op-idem-1", ids: [C2], accountId: ACC_O, date: "2026-11-01" })).toMatch(/P19_IDEMPOTENCY_CONFLICT/);
      expect((await claimState(db, C2)).r.receipts.map((r) => r.amount)).toEqual([500, 700]);
      expect(await entries(db)).toBe(n1 + 1);
      // a record written before P19 (no request hash) still replays as before
      await sql(db, "INSERT INTO public.finance_operations(owner_id, operation_key, result) VALUES ($1, 'claim_receipt:op-legacy', '{\"id\":\"legacy\"}')", [O]);
      expect(await op(db, O, "claim_receipt", { operationId: "op-legacy", id: C2, amount: 1, date: DAY, accountId: ACC_O })).toEqual({ id: "legacy", replayed: true });
      expect(await authorityRows(db)).toBe(0);
    }, 600_000);

    it("strict idempotency (c) concurrent identical requests: the per-owner lock serialises them and the key admits one record", async () => {
      const C3 = u(1003);
      await claim(db, C3, 900);
      const p = { operationId: "op-race-1", id: C3, amount: 900, date: DAY, accountId: ACC_O };
      // Request A holds the per-owner advisory lock from before it reads the idempotency record until its transaction
      // ends, so a concurrent request B of the same owner waits, then reads A's committed record (PGlite has one
      // connection: B is run after A commits, exactly where the lock releases it).
      const lockHeld = `SELECT count(*)::int n FROM pg_locks l, (SELECT hashtextextended($1::text, 0) k) h WHERE l.locktype = 'advisory' AND l.pid = pg_backend_pid() AND l.granted
        AND l.classid::text::bigint = ((h.k >> 32) & 4294967295) AND l.objid::text::bigint = (h.k & 4294967295)`;
      const a = await run(db, O, [opStep("claim_receipt", p), [lockHeld, [O]]]);
      expect(a.error).toBe("");
      expect(a.rows[1]![0]!["n"]).toBe(1);
      expect((await sql<{ n: number }>(db, lockHeld, [O]))[0]!.n).toBe(0); // released at commit
      const n1 = await entries(db);
      const b = await run(db, O, [opStep("claim_receipt", p)]);
      expect(b.rows[0]?.[0]?.["r"]).toEqual({ ...(a.rows[0]![0]!["r"] as object), replayed: true });
      // B inside the same transaction as A (a client retrying before its first call returned) is also a replay
      const C4 = u(1004);
      await claim(db, C4, 300);
      const n2 = await entries(db);
      const p4 = { operationId: "op-race-2", id: C4, amount: 300, date: DAY, accountId: ACC_O };
      const both = await run(db, O, [opStep("claim_receipt", p4), opStep("claim_receipt", p4)]);
      expect(both.error).toBe("");
      expect(both.rows[1]![0]!["r"]).toMatchObject({ replayed: true });
      expect(await entries(db)).toBe(n2 + 1);
      expect((await claimState(db, C3)).r.receipts.length).toBe(1);
      expect((await claimState(db, C4)).r.receipts.length).toBe(1);
      // second barrier: even a writer that skipped the lock could not record a second result for the key
      expect(await err(db, { privileged: O }, [["INSERT INTO public.finance_operations(owner_id, operation_key, result) VALUES ($1, 'claim_receipt:op-race-1', '{}')", [O]]])).toMatch(/duplicate key|unique/i);
      // ...and the transaction that loses the key rolls back with its effect: emulate B having read before A committed
      const C5 = u(1005);
      await claim(db, C5, 500);
      const n3 = await entries(db);
      const p5 = { operationId: "op-race-3", id: C5, amount: 200, date: DAY, accountId: ACC_O };
      await op(db, O, "claim_receipt", p5); // A
      const lost = await run(db, { privileged: O }, [
        ["DELETE FROM public.finance_operations WHERE owner_id = $1 AND operation_key = 'claim_receipt:op-race-3'", [O]], // B's snapshot without A's record
        opStep("claim_receipt", p5), // B saves the same receipt again
        ["INSERT INTO public.finance_operations(owner_id, operation_key, result) VALUES ($1, 'claim_receipt:op-race-3', '{}')", [O]]]); // A's record holds the key
      expect(lost.error).toMatch(/duplicate key|unique/i);
      expect(await markers(db, "claim_receipt:op-race-3")).toBe(1);
      expect((await claimState(db, C5)).r.receipts.map((r) => r.amount)).toEqual([200]);
      expect(await entries(db)).toBe(n3 + 1);
      expect(await authorityRows(db)).toBe(0);
    }, 600_000);

    it("strict idempotency (d) a failure mid-way leaves no partial effect, no success record and no authority", async () => {
      const A = u(1011), B = u(1012); // ORDER BY id: A is received first, then B fails
      await claim(db, A, 250);
      await claim(db, B, 350, { status: "received" });
      const n0 = await entries(db), m0 = await markers(db);
      const p = { operationId: "op-fail-1", ids: [A, B], accountId: ACC_O, date: DAY };
      expect(await opErr(db, O, "reimbursement", p)).toMatch(/no longer pending/);
      expect(await entries(db)).toBe(n0);
      expect(await markers(db)).toBe(m0);
      expect(await markers(db, "reimbursement:op-fail-1")).toBe(0);
      expect((await claimState(db, A)).s).toBe("pending");
      expect((await claimState(db, A)).r.receipts).toEqual([]);
      expect(await authorityRows(db)).toBe(0);
      // a client that catches the failure inside its own transaction gets no authority either
      await actAs(db, null); await db.query("SELECT set_config('test.uid', $1, false)", [O]);
      await db.exec("BEGIN");
      await db.exec("SAVEPOINT s");
      await expect(db.query("SELECT public.finance_operation('reimbursement', $1::jsonb)", [JSON.stringify(p)])).rejects.toThrow(/no longer pending/);
      await db.exec("ROLLBACK TO SAVEPOINT s");
      expect((await db.query<{ n: number }>("SELECT count(*)::int n FROM phase3_p19.authority")).rows[0]!.n).toBe(0);
      await expect(db.query("SELECT public.receive_claim_receipt($1, 250, $2::date, $3, 'after failure')", [A, DAY, ACC_O])).rejects.toThrow(/Use the payment workflow/);
      await db.exec("ROLLBACK");
      await actAs(db, null);
      // a successful call leaves no authority behind either, inside the same transaction
      const after = await run(db, { privileged: O }, [opStep("reimbursement", { ...p, ids: [A] }), ["SELECT count(*)::int n FROM phase3_p19.authority"],
        ["SELECT public.receive_claim_receipt($1, 1, $2::date, $3, 'after success')", [A, DAY, ACC_O]]]);
      expect(after.rows[1]?.[0]?.["n"]).toBe(0);
      expect(after.error).toMatch(/Use the payment workflow/);
      // the same key with a corrected request works afterwards (the failure recorded nothing)
      expect(await op(db, O, "reimbursement", { ...p, ids: [A] })).toMatchObject({ amount: 250 });
      expect((await claimState(db, A)).s).toBe("received");
      expect(await entries(db)).toBe(n0 + 1);
    }, 600_000);

    it("receipt claiming: double claims, cross-owner, cross-entity and outside-workflow attempts are refused; history is append-only", async () => {
      const C = u(1021), X = u(1022), E = u(1023);
      await claim(db, C, 1000);
      await claim(db, E, 800, { entity: "c1" });
      await sql(db, `INSERT INTO public.expenses(id, employee_id, title, category, amount, original_amount, currency, expense_date, account_id, description, reimbursement, reimbursement_status)
        VALUES ($1,$2,'V travel','Travel',500,500,'INR','2026-10-21',$3,'','{"reimbursable":500,"receipts":[]}'::jsonb,'pending')`, [X, V, ACC_V]);
      const audit0 = await num(db, "SELECT count(*) FROM public.transaction_audit WHERE transaction_id = $1", [C]);
      // two partial receipts are appended in order; a third over the outstanding amount is refused
      expect(await op(db, O, "claim_receipt", { operationId: "rc-1", id: C, amount: 600, date: "2026-11-01", accountId: ACC_O })).toMatchObject({ amount: 600 });
      expect(await opErr(db, O, "claim_receipt", { operationId: "rc-2", id: C, amount: 600, date: "2026-11-02", accountId: ACC_O })).toMatch(/no more than the outstanding claim \(400/);
      expect(await op(db, O, "claim_receipt", { operationId: "rc-3", id: C, amount: 400, date: "2026-11-02", accountId: ACC_O })).toMatchObject({ amount: 400 });
      const st = await claimState(db, C);
      expect(st.s).toBe("received");
      expect(st.r.receipts.map((r) => r.amount)).toEqual([600, 400]);
      // double claim of a settled claim (new key) and a whole-claim reimbursement of it: refused
      expect(await opErr(db, O, "claim_receipt", { operationId: "rc-4", id: C, amount: 1, date: DAY, accountId: ACC_O })).toMatch(/no longer pending/);
      expect(await opErr(db, O, "reimbursement", { operationId: "rc-5", ids: [C], accountId: ACC_O, date: DAY })).toMatch(/no longer pending/);
      expect(await num(db, "SELECT count(*) FROM public.transaction_audit WHERE transaction_id = $1", [C])).toBeGreaterThan(audit0); // audit trigger still records each change
      // cross-owner: V on O's claim (with V's own account), O on V's claim, O into V's account, O into an archived account
      const n0 = await entries(db), nv = await entries(db, V);
      expect(await opErr(db, V, "claim_receipt", { operationId: "x-1", id: E, amount: 100, date: DAY, accountId: ACC_V })).toMatch(/This claim is no longer pending/);
      expect(await opErr(db, V, "reimbursement", { operationId: "x-2", ids: [E], accountId: ACC_V, date: DAY })).toMatch(/Claim not found/);
      expect(await opErr(db, O, "claim_receipt", { operationId: "x-3", id: X, amount: 100, date: DAY, accountId: ACC_O })).toMatch(/This claim is no longer pending/);
      expect(await opErr(db, O, "claim_receipt", { operationId: "x-4", id: E, amount: 100, date: DAY, accountId: ACC_V })).toMatch(/Choose a cash or bank account/);
      expect(await opErr(db, O, "claim_receipt", { operationId: "x-5", id: E, amount: 100, date: DAY, accountId: ARCH_O })).toMatch(/Choose a cash or bank account/);
      expect(await opErr(db, O, "claim_receipt", { operationId: "x-6", id: E, amount: 100, date: "2099-01-01", accountId: ACC_O })).toMatch(/future/);
      // cross-entity: M has write access to O's company c1, but the workflow is the owner's only
      expect(await opErr(db, M, "claim_receipt", { operationId: "x-7", id: E, amount: 100, date: DAY, accountId: ACC_O })).toMatch(/This claim is no longer pending/);
      expect(await opErr(db, M, "reimbursement", { operationId: "x-8", ids: [E], accountId: ACC_O, date: DAY })).toMatch(/Claim not found/);
      // outside the workflow: no EXECUTE for clients; without the workflow's authority even the owner role is refused
      for (const who of [O, M, V]) expect(await err(db, who, [["SELECT public.receive_claim_receipt($1, 100, $2::date, $3, '')", [E, DAY, ACC_O]]])).toMatch(/permission denied/);
      expect(await err(db, { privileged: O }, [["SELECT public.receive_claim_receipt($1, 100, $2::date, $3, '')", [E, DAY, ACC_O]]])).toMatch(/Use the payment workflow/);
      expect(await entries(db)).toBe(n0);
      expect(await entries(db, V)).toBe(nv);
      expect((await claimState(db, E)).r.receipts).toEqual([]);
      expect(await markers(db, "claim_receipt:x-1")).toBe(0);
      // the claim row is locked (FOR UPDATE) and the workflow takes the per-owner advisory lock
      const src = await sql<{ f: string; r: string }>(db, "SELECT (SELECT prosrc FROM pg_proc WHERE oid = 'public.finance_operation(text,jsonb)'::regprocedure) f, (SELECT prosrc FROM pg_proc WHERE oid = 'public.receive_claim_receipt(uuid,numeric,date,uuid,text)'::regprocedure) r");
      expect(src[0]!.f).toContain("pg_advisory_xact_lock(hashtextextended(uid::text, 0))");
      expect(src[0]!.f).toMatch(/ORDER BY x\.id FOR UPDATE/);
      expect(src[0]!.r).toMatch(/x\.employee_id = uid FOR UPDATE/);
      // the owner's legitimate claim on the company entry still works
      expect(await op(db, O, "claim_receipt", { operationId: "rc-6", id: E, amount: 800, date: DAY, accountId: ACC_O })).toMatchObject({ amount: 800 });
      expect(await authorityRows(db)).toBe(0);
    }, 600_000);

    it("the other money movements still work for the owner and refuse other people's records", async () => {
      // commitment (scheduled payment)
      const S = u(1031);
      await sql(db, "INSERT INTO public.commitments(id, owner_id, name, amount, frequency, next_due, account_id) VALUES ($1,$2,'Rent',15000,'monthly','2026-11-01',$3)", [S, O, ACC_O]);
      expect(await opErr(db, V, "commitment", { id: S, expectedDue: "2026-11-01", amount: 15000, accountId: ACC_V, date: DAY })).toMatch(/payment schedule changed/);
      expect(await opErr(db, O, "commitment", { id: S, expectedDue: "2026-11-01", amount: 15000, accountId: ACC_V, date: DAY })).toMatch(/Choose an active payment account/);
      expect(await op(db, O, "commitment", { id: S, expectedDue: "2026-11-01", amount: 15000, date: DAY })).toMatchObject({ amount: 15000 });
      expect((await sql<{ d: string }>(db, "SELECT next_due::text d FROM public.commitments WHERE id = $1", [S]))[0]!.d).toBe("2026-12-01");
      // create_loan + loan_payment
      const loan = await op(db, O, "create_loan", { operationId: "loan-1", name: "Car loan", principal: 100000, emi: 5000, rate: 12, nextDue: "2026-11-05", startDate: "2026-10-05" });
      const L = loan["id"] as string;
      expect(await opErr(db, V, "loan_payment", { id: L, expectedDue: "2026-11-05", fromAccountId: ACC_V, date: DAY })).toMatch(/Loan changed/);
      expect(await opErr(db, O, "loan_payment", { id: L, expectedDue: "2026-11-05", fromAccountId: ACC_V, date: DAY })).toMatch(/Choose the bank or cash account/);
      expect(await op(db, O, "loan_payment", { id: L, expectedDue: "2026-11-05", fromAccountId: ACC_O, date: DAY })).toMatchObject({ principal: 4000, interest: 1000 });
      // convert_emi on a card purchase
      const P = u(1032);
      await sql(db, "INSERT INTO public.expenses(id, employee_id, title, category, amount, original_amount, currency, expense_date, account_id, description) VALUES ($1,$2,'Laptop','Electronics',60000,60000,'INR','2026-10-25',$3,'')", [P, O, CARD_O]);
      expect(await opErr(db, V, "convert_emi", { id: P, months: 6, rate: 0, fee: 199, date: DAY })).toMatch(/Select a purchase on your credit card/);
      expect(await op(db, O, "convert_emi", { id: P, months: 6, rate: 0, fee: 199, date: DAY })).toMatchObject({ emi: 10000 });
      expect(await opErr(db, O, "convert_emi", { id: P, months: 12, rate: 0, fee: 0, date: DAY })).toMatch(/P19_IDEMPOTENCY_CONFLICT/);
      // confirm_irregular (yearly bill) upserts the owner's preferences only
      expect(await op(db, O, "confirm_irregular", { operationId: "irr-1", candidateKey: "insurance|lic", name: "LIC premium", category: "Insurance", amount: 24000, nextDue: "2027-03-01", frequency: "yearly", kind: "insurance" })).toMatchObject({ amount: 24000 });
      expect((await sql<{ k: unknown }>(db, "SELECT data->'irregularConfirmed' k FROM public.finance_preferences WHERE owner_id = $1", [O]))[0]!.k).toEqual(["insurance|lic"]);
      expect((await sql<{ k: unknown }>(db, "SELECT data->'irregularConfirmed' k FROM public.finance_preferences WHERE owner_id = $1", [V]))[0]!.k).toBeNull();
      expect(await opErr(db, O, "nonsense", { operationId: "z" })).toMatch(/Unknown operation/);
      expect(await opErr(db, O, "claim_receipt", {})).toMatch(/Missing operation identifier/);
      if (stack) {
        // P4: an external assistant session is refused before anything runs (P4's inline check is kept)
        expect(await err(db, O, [opStep("confirm_irregular", { operationId: "irr-2", candidateKey: "x", name: "X", amount: 1, nextDue: "2027-01-01", frequency: "yearly" })], { clientId: "mcp-client-1" })).toMatch(/ASSISTANT_READ_ONLY: finance_operation/);
      }
      expect(await authorityRows(db)).toBe(0);
    }, 600_000);

    it("definer safety: pinned search_path, minimal EXECUTE, no dynamic SQL, closed private schema", async () => {
      const fns = await sql<{ s: string; d: boolean; c: string[]; acl: string; src: string }>(db, `SELECT p.oid::regprocedure::text s, p.prosecdef d, p.proconfig c, coalesce(p.proacl::text, '') acl, p.prosrc src
        FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('finance_operation', 'finance_operation__unguarded', 'receive_claim_receipt', 'receive_claim_receipt__unguarded') ORDER BY 1`);
      expect(fns.map((f) => f.s)).toEqual(stack
        ? ["finance_operation(text,jsonb)", "finance_operation__unguarded(text,jsonb)", "receive_claim_receipt(uuid,numeric,date,uuid,text)", "receive_claim_receipt__unguarded(uuid,numeric,date,uuid,text)"]
        : ["finance_operation(text,jsonb)", "receive_claim_receipt(uuid,numeric,date,uuid,text)"]);
      for (const f of fns) {
        expect(f.d, f.s).toBe(true);
        expect(f.c, f.s).toEqual(["search_path=public, pg_temp"]);
        expect(f.src, f.s).not.toMatch(/\bEXECUTE\b|format\(|set_config|current_setting/i);
        // every relation is schema-qualified (public. / phase3_p19.)
        expect(f.src.match(/\b(FROM|JOIN|INTO|UPDATE)\s+(?!public\.|phase3_p19\.|jsonb_array_elements|SET\b|LOOP\b|uid\b|e\b|c\b|l\b|w\b|acc\b|done\b|outstanding\b|cnt\b|ids\b|got\b)[a-z_]+/gi) ?? [], f.s).toEqual([]);
        expect(f.acl, f.s).toBe(f.s === "finance_operation(text,jsonb)" ? "{postgres=X/postgres,authenticated=X/postgres}" : "{postgres=X/postgres}");
      }
      const priv = await sql<Record<string, boolean>>(db, `SELECT has_schema_privilege('authenticated', 'phase3_p19', 'USAGE') a, has_schema_privilege('service_role', 'phase3_p19', 'USAGE') b,
        has_schema_privilege('anon', 'phase3_p19', 'USAGE') c, has_table_privilege('anon', 'public.finance_operations', 'SELECT') d,
        has_table_privilege('authenticated', 'public.finance_operations', 'SELECT') e, has_table_privilege('authenticated', 'public.finance_operations', 'INSERT') f,
        has_table_privilege('authenticated', 'public.finance_operations', 'TRIGGER') g`);
      expect(priv[0]).toEqual({ a: false, b: false, c: false, d: false, e: true, f: false, g: false });
      // no helper in phase3_p19 is executable by any client or service role
      expect(await num(db, `SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'phase3_p19'::regnamespace
        AND (has_function_privilege('authenticated', p.oid, 'EXECUTE') OR has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('service_role', p.oid, 'EXECUTE'))`)).toBe(0);
      // the owner still reads their own records (app and backup inventory read them)
      const own = await run(db, O, [["SELECT count(*)::int n, bool_and(owner_id = auth.uid()) mine FROM public.finance_operations"]]);
      expect(own.rows[0]![0]).toMatchObject({ mine: true });
    }, 600_000);

    it("rollback restores the exact previous catalog (and re-opens the setting, which shows it really was the fix)", async () => {
      await db.exec(readSql(P19_RB));
      expect(await catalog(db)).toEqual(before);
      expect(await err(db, O, [["SELECT set_config('app.finance_owner', $1, true)", [O]], ["INSERT INTO public.finance_operations(owner_id, operation_key, result) VALUES ($1, 'claim_receipt:after-rollback', '{}')", [O]]])).toBe("");
      await expect(db.exec(readSql(P19_RB))).rejects.toThrow(/not installed/);
      await db.exec("ROLLBACK");
      // and it can be installed again
      await db.exec(readSql(P19));
      await db.exec(readSql(P19_RB));
      expect(await catalog(db)).toEqual(before);
    }, 600_000);
  });
}

describe("P19 in the whole proposed stack: install order and exact rollback", () => {
  it("applied → P1..P18 → P19 installs in order; rolling back P19, P18 .. P8 restores each previous catalog exactly; P7 .. P1 still roll back", async () => {
    const db = await fullSchemaDb();
    const all = [...STACK, "P19_finance_operation_authority"];
    const snaps = [await catalog(db)];
    for (const n of all) { try { await db.exec(readSql(`${D}${n}.sql`)); } catch (e) { throw new Error(`${n}: ${(e as Error).message}`); } snaps.push(await catalog(db)); }
    expect(await num(db, "SELECT count(*) FROM pg_proc WHERE prosrc LIKE '%app.finance_owner%'")).toBe(0);
    for (let i = all.length - 1; i >= 0; i--) {
      const n = all[i]!;
      try { await db.exec(readSql(`${D}${n}.rollback.sql`)); } catch (e) { throw new Error(`${n} rollback: ${(e as Error).message}`); }
      // P7 and earlier rollbacks keep archives / re-grant in another ACL order by design, with or without P19 (checked
      // separately: identical result when P19 is not installed), so exactness is asserted from P19 down to P8.
      if (i >= all.indexOf("P8_asset_depreciation_posting")) expect(await catalog(db), `${n} rollback`).toEqual(snaps[i]);
    }
    await db.close();
  }, 900_000);

  it("P19 refuses to install over an unreviewed function body", async () => {
    const db = await fullSchemaDb();
    await sql(db, "CREATE OR REPLACE FUNCTION public.receive_claim_receipt(expense_id uuid, receipt_amount numeric, receipt_date date, receipt_account uuid, receipt_note text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN RETURN '{}'; END $$");
    await expect(db.exec(readSql(P19))).rejects.toThrow(/is not the reviewed body/);
    await db.close();
  }, 600_000);
});
