// @vitest-environment node
// P9 (PROPOSED .lovable/staged-sql/proposed/P9_statement_import_idempotency_and_archive_guards.sql), tested only in an
// isolated in-memory PGlite (drizzle/migrations 0000-0088 + proposed SQL). Never Cloud.
//  A. P0-025: statement lines are claimed once per owner + account + fingerprint before any entry is saved;
//     repeated import, retry after a partial failure, a lost response and a double submit give one entry id per line.
//  B. P0-007..P0-016 / P0-026: loans, goals, commitments, asset_valuations and documents rows cannot be deleted by
//     signed-in users (archive only); confirmed erasure, the service path and the verified post-save cleanup of a
//     used "saved to add later" receipt still work; the recordArchive history in owner preferences is append-only.
//  Rollback restores the exact pre-P9 catalog and keeps every row; P9 also installs on, and rolls back off, the whole P1..P8 stack.
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { actAs, addUsers, fullSchemaDb, readSql } from "../test/full-schema-pglite";
import { DIR, T, insertExpense, stepUp } from "../test/phase3-fixture";

const P9 = `${DIR}P9_statement_import_idempotency_and_archive_guards.sql`;
const P9_RB = `${DIR}P9_statement_import_idempotency_and_archive_guards.rollback.sql`;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const O = id(1), V = id(2);
const ACC = { o: id(101), v: id(201) };
type Db = PGlite;
const q = async <R = Record<string, unknown>>(db: Db, sql: string, params: unknown[] = []) => (await db.query<R>(sql, params)).rows;

/** Run fn as uid (null = service / operator) in one transaction; commit when keep, else roll back. Returns the error text or "". */
async function run(db: Db, uid: string | null, fn: () => Promise<unknown>, keep = true): Promise<string> {
  await actAs(db, uid);
  await db.exec("BEGIN");
  try { await fn(); await db.exec(keep ? "COMMIT" : "ROLLBACK"); return ""; }
  catch (e) { await db.exec("ROLLBACK"); return (e as Error).message; }
  finally { await actAs(db, null); }
}
const CATALOG = `
  SELECT 'f' k, p.oid::regprocedure::text n, md5(p.prosrc) || coalesce(p.proacl::text, '') || p.prosecdef::text v FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
  UNION ALL SELECT 't', c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid) || t.tgenabled::text FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace
  UNION ALL SELECT 'i', indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'
  UNION ALL SELECT 'c', table_name || '.' || column_name, data_type || is_nullable FROM information_schema.columns WHERE table_schema = 'public'
  UNION ALL SELECT 'n', nspname, '' FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY 1, 2`;
const catalog = async (db: Db) => { await actAs(db, null); return (await q<{ k: string; n: string; v: string }>(db, CATALOG)).map((r) => `${r.k}|${r.n}|${r.v}`); };

async function seed(db: Db) {
  await addUsers(db, { [O]: "o@x.in", [V]: "v@x.in" });
  await q(db, "INSERT INTO public.accounts(id, owner_id, name, kind) VALUES ($1,$2,'HDFC Savings','savings'), ($3,$4,'V bank','savings')", [ACC.o, O, ACC.v, V]);
  await q(db, "INSERT INTO public.finance_preferences(owner_id, data) VALUES ($1,'{}'), ($2,'{}')", [O, V]);
  for (const [owner, n] of [[O, 0], [V, 50]] as const) {
    await q(db, "INSERT INTO public.loans(id, owner_id, name, principal_outstanding, annual_rate, emi, next_due) VALUES ($1,$2,'Home loan',100000,9,2000,'2026-12-05')", [id(1000 + n), owner]);
    await q(db, "INSERT INTO public.goals(id, owner_id, name, target) VALUES ($1,$2,'Emergency fund',50000)", [id(1001 + n), owner]);
    await q(db, "INSERT INTO public.commitments(id, owner_id, name, amount, next_due, status) VALUES ($1,$2,'Rent',15000,'2026-12-01','cancelled')", [id(1002 + n), owner]);
    await q(db, "INSERT INTO public.asset_valuations(id, owner_id, account_id, value, valued_on) VALUES ($1,$2,$3,250000,'2026-10-31')", [id(1003 + n), owner, owner === O ? ACC.o : ACC.v]);
    await q(db, "INSERT INTO public.documents(id, owner_id, title, file_path, file_name, size_bytes, notes) VALUES ($1,$2,'LIC policy',$3,'lic.pdf',1000,'')", [id(1004 + n), owner, `${owner}/docs/lic.pdf`]);
  }
}
const ROWS = (n: number) => ({ loans: id(1000 + n), goals: id(1001 + n), commitments: id(1002 + n), asset_valuations: id(1003 + n), documents: id(1004 + n) });
const TABLES = ["loans", "goals", "commitments", "asset_valuations", "documents"] as const;

type Claim = { fingerprint: string; entry_id: string; outcome: string };
const line = (n: number, acc = ACC.o) => ({ fingerprint: `${acc}|2026-11-0${n}|debit|${n}00.00|R41234567890${n}`, line_date: `2026-11-0${n}`, entry_id: id(5000 + n) });
const claim = (db: Db, lines: unknown[], acc = ACC.o, batch = id(7001)) =>
  q<Claim>(db, "SELECT * FROM public.claim_statement_lines($1, $2, 'hdfc statement', $3::jsonb)", [acc, batch, JSON.stringify(lines)]);
const saveEntry = (db: Db, entry: string, owner = O, acc = ACC.o) =>
  q(db, "INSERT INTO public.expenses(id, employee_id, title, category, amount, original_amount, currency, expense_date, account_id) VALUES ($1,$2,'Swiggy','Food',450,450,'INR','2026-11-02',$3) ON CONFLICT (id) DO NOTHING", [entry, owner, acc]);
const count = async (db: Db, sql: string, params: unknown[] = []) => { await actAs(db, null); return Number((await q<{ n: string }>(db, sql, params))[0]!.n); };

describe("P9 on the applied schema (0000-0088 only)", () => {
  let db: Db;
  let before: string[];
  beforeAll(async () => {
    db = await fullSchemaDb();
    await seed(db);
    // An earlier (pre-P9) import: a plain "seen" row, exactly as markSeen writes it today.
    await q(db, "INSERT INTO public.statement_line_imports(owner_id, account_key, fingerprint, line_date, batch_id, file_label) VALUES ($1,$2,$3,'2026-10-30',$4,'hdfc')", [O, ACC.o, `${ACC.o}|2026-10-30|debit|99.00|DOLD`, id(7000)]);
    before = await catalog(db);
    await db.exec(readSql(P9));
    await db.exec(readSql(P9)); // re-running is safe
  }, T);

  describe("A. statement line claims (P0-025)", () => {
    it("claims new lines once; a repeated import of the same lines returns the stored entry ids and never 'claimed' again", async () => {
      let first: Claim[] = [];
      expect(await run(db, O, async () => { first = await claim(db, [line(1), line(2)]); })).toBe("");
      expect(first.map((c) => [c.entry_id, c.outcome])).toEqual([[id(5001), "claimed"], [id(5002), "claimed"]]);
      // Saved and confirmed (what the app does after a successful save)
      expect(await run(db, O, async () => { await saveEntry(db, id(5001)); await saveEntry(db, id(5002)); await q(db, "SELECT public.confirm_statement_lines($1::uuid[])", [[id(5001), id(5002)]]); })).toBe("");
      let again: Claim[] = [];
      // Re-import proposes different (random) entry ids: the database keeps and returns the original ones.
      expect(await run(db, O, async () => { again = await claim(db, [{ ...line(1), entry_id: id(6001) }, { ...line(2), entry_id: id(6002) }], ACC.o, id(7002)); })).toBe("");
      expect(again.map((c) => [c.entry_id, c.outcome])).toEqual([[id(5001), "registered"], [id(5002), "registered"]]);
      expect(await count(db, "SELECT count(*) n FROM public.statement_line_imports WHERE owner_id=$1 AND account_key=$2 AND fingerprint LIKE '%R41234567890%'", [O, ACC.o])).toBe(2);
    });

    it("a line imported before P9 (plain seen row) reads as registered and is never claimed", async () => {
      let r: Claim[] = [];
      expect(await run(db, O, async () => { r = await claim(db, [{ fingerprint: `${ACC.o}|2026-10-30|debit|99.00|DOLD`, line_date: "2026-10-30", entry_id: id(5099) }]); }, false)).toBe("");
      expect(r).toEqual([{ fingerprint: `${ACC.o}|2026-10-30|debit|99.00|DOLD`, entry_id: null, outcome: "registered" }]);
    });

    it("retry after a partial failure: the unsaved line stays pending with the same entry id until it is saved and confirmed", async () => {
      expect(await run(db, O, async () => { await claim(db, [line(3), line(4)]); await saveEntry(db, id(5003)); await q(db, "SELECT public.confirm_statement_lines($1::uuid[])", [[id(5003), id(5004)]]); })).toBe("");
      // line 4's save failed: confirm did not mark it (no entry), so it is pending and offered again
      await actAs(db, O);
      expect(await q(db, "SELECT fingerprint, entry_id FROM public.pending_statement_lines($1)", [ACC.o])).toEqual([{ fingerprint: line(4).fingerprint, entry_id: id(5004) }]);
      let retry: Claim[] = [];
      expect(await run(db, O, async () => { retry = await claim(db, [{ ...line(3), entry_id: id(6003) }, { ...line(4), entry_id: id(6004) }], ACC.o, id(7003)); })).toBe("");
      expect(retry.map((c) => [c.entry_id, c.outcome])).toEqual([[id(5003), "registered"], [id(5004), "pending"]]);
      expect(await run(db, O, async () => { await saveEntry(db, id(5004)); await q(db, "SELECT public.confirm_statement_lines($1::uuid[])", [[id(5004)]]); })).toBe("");
      await actAs(db, O);
      expect(await q(db, "SELECT * FROM public.pending_statement_lines($1)", [ACC.o])).toEqual([]);
      expect(await count(db, "SELECT count(*) n FROM public.expenses WHERE id IN ($1,$2,$3,$4)", [id(5003), id(5004), id(6003), id(6004)])).toBe(2);
    });

    it("a lost response (entry saved, confirm never ran) is retried as pending with the same id; saving again adds nothing", async () => {
      expect(await run(db, O, async () => { await claim(db, [line(5)]); await saveEntry(db, id(5005)); })).toBe("");
      let r: Claim[] = [];
      expect(await run(db, O, async () => { r = await claim(db, [{ ...line(5), entry_id: id(6005) }], ACC.o, id(7004)); await saveEntry(db, r[0]!.entry_id); await q(db, "SELECT public.confirm_statement_lines($1::uuid[])", [[r[0]!.entry_id]]); })).toBe("");
      expect(r[0]).toMatchObject({ entry_id: id(5005), outcome: "pending" });
      expect(await count(db, "SELECT count(*) n FROM public.expenses WHERE id IN ($1,$2)", [id(5005), id(6005)])).toBe(1);
    });

    it("a concurrent double submit resolves to one row and one entry id per line (the unique index serialises the claims)", async () => {
      // PGlite has one connection, so the two submits run back to back with the second not seeing the first's
      // response: exactly what the unique index enforces when two sessions race (the loser waits, then DO NOTHING).
      const a: Claim[][] = [];
      expect(await run(db, O, async () => { a.push(await claim(db, [line(6), line(7)], ACC.o, id(7005))); })).toBe("");
      expect(await run(db, O, async () => { a.push(await claim(db, [{ ...line(6), entry_id: id(6006) }, { ...line(7), entry_id: id(6007) }], ACC.o, id(7006))); })).toBe("");
      expect(a[0]!.map((c) => c.outcome)).toEqual(["claimed", "claimed"]);
      expect(a[1]!.map((c) => [c.entry_id, c.outcome])).toEqual([[id(5006), "pending"], [id(5007), "pending"]]);
      expect(await count(db, "SELECT count(*) n FROM public.statement_line_imports WHERE fingerprint IN ($1,$2)", [line(6).fingerprint, line(7).fingerprint])).toBe(2);
      // The unique guarantee itself: a direct second row for the same owner/account/fingerprint is refused.
      expect(await run(db, O, () => q(db, "INSERT INTO public.statement_line_imports(owner_id, account_key, fingerprint, line_date, batch_id) VALUES ($1,$2,$3,'2026-11-06',$4)", [O, ACC.o, line(6).fingerprint, id(7007)]))).toMatch(/duplicate key|unique/i);
    });

    it("one entry id can register only one line; invalid input is refused before anything is written", async () => {
      expect(await run(db, O, () => claim(db, [{ ...line(8), entry_id: id(5001) }]))).toMatch(/P9_ENTRY_CONFLICT/);
      expect(await run(db, O, () => claim(db, [line(8), { ...line(9), entry_id: id(5008) }]))).toMatch(/P9_INVALID: a line or entry id appears twice/);
      expect(await run(db, O, () => claim(db, [{ fingerprint: "", line_date: "2026-11-08", entry_id: id(5010) }]))).toMatch(/P9_INVALID/);
      expect(await run(db, null, () => claim(db, [line(8)]))).toMatch(/Unauthorized/);
      expect(await count(db, "SELECT count(*) n FROM public.statement_line_imports WHERE fingerprint=$1", [line(8).fingerprint])).toBe(0);
    });

    it("clients cannot write the registration columns directly, and owners only see and claim their own lines", async () => {
      // plain seen rows still work (markSeen upsert); registration columns are cleared on a direct insert
      expect(await run(db, O, () => q(db, "INSERT INTO public.statement_line_imports(owner_id, account_key, fingerprint, line_date, batch_id, entry_id, registered_at) VALUES ($1,$2,'direct','2026-11-09',$3,$4,now())", [O, ACC.o, id(7008), id(5020)]))).toBe("");
      expect(await count(db, "SELECT count(*) n FROM public.statement_line_imports WHERE fingerprint='direct' AND entry_id IS NULL AND registered_at IS NULL")).toBe(1);
      expect(await run(db, O, () => q(db, "UPDATE public.statement_line_imports SET registered_at = NULL WHERE entry_id = $1", [id(5001)]))).toMatch(/P9_LINE_CLAIM/);
      // V claims the same fingerprint text in V's own namespace: independent, and V cannot see O's rows
      let r: Claim[] = [];
      expect(await run(db, V, async () => { r = await claim(db, [line(1)], ACC.o, id(7009)); })).toBe("");
      expect(r[0]).toMatchObject({ outcome: "claimed", entry_id: id(5001) }); // same id text is fine per owner (unique per owner)
      await actAs(db, V);
      expect(await q(db, "SELECT * FROM public.pending_statement_lines($1)", [ACC.o])).toEqual([{ fingerprint: line(1).fingerprint, entry_id: id(5001) }]);
      expect((await q(db, "SELECT owner_id FROM public.statement_line_imports")).every((x) => x["owner_id"] === V)).toBe(true);
      // V cannot confirm against O's entry (the entry must belong to the caller)
      expect(await run(db, V, async () => { expect(Number((await q<{ n: number }>(db, "SELECT public.confirm_statement_lines($1::uuid[]) n", [[id(5001)]]))[0]!.n)).toBe(0); })).toBe("");
    });
  });

  describe("B. archive-controlled rows (P0-007..P0-016, P0-026)", () => {
    it("an authenticated delete is refused for each table, even by the owner; nothing is removed", async () => {
      for (const t of TABLES) {
        expect(await run(db, O, () => q(db, `DELETE FROM public.${t} WHERE id = $1`, [ROWS(0)[t]]))).toMatch(new RegExp(`P9_ARCHIVE_ONLY: ${t} records are archived, not deleted`));
        expect(await run(db, O, () => q(db, `TRUNCATE public.${t} CASCADE`))).toMatch(/P9_ARCHIVE_ONLY|permission denied/);
        expect(await count(db, `SELECT count(*) n FROM public.${t} WHERE id = $1`, [ROWS(0)[t]])).toBe(1);
      }
    });

    it("owner isolation: another user can neither delete nor see the owner's rows", async () => {
      for (const t of TABLES) {
        await run(db, V, () => q(db, `DELETE FROM public.${t} WHERE id = $1`, [ROWS(0)[t]]));
        expect(await count(db, `SELECT count(*) n FROM public.${t} WHERE id = $1`, [ROWS(0)[t]])).toBe(1);
        await actAs(db, V);
        expect(await q(db, `SELECT id FROM public.${t} WHERE id = $1`, [ROWS(0)[t]])).toEqual([]);
      }
    });

    it("archive and restore (owner preferences) are allowed, audited, and the history is append-only", async () => {
      const at1 = "2026-11-10T09:00:00.000Z", at2 = "2026-11-10T10:00:00.000Z";
      const archived = { id: `loans:${ROWS(0).loans}`, table: "loans", recordId: ROWS(0).loans, name: "Home loan", archivedAt: at1, archivedBy: O, archiveReason: "Closed early",
        archiveHistory: [{ action: "archived", at: at1, by: O, reason: "Closed early" }] };
      const save = (list: unknown) => q(db, "UPDATE public.finance_preferences SET data = jsonb_set(data, '{recordArchive}', $2::jsonb) WHERE owner_id = $1", [O, JSON.stringify(list)]);
      const stored = async () => { await actAs(db, null); return (await q<{ r: Record<string, unknown>[] }>(db, "SELECT data->'recordArchive' r FROM public.finance_preferences WHERE owner_id=$1", [O]))[0]!.r; };
      expect(await run(db, O, () => save([archived]))).toBe("");
      const restored = { id: archived.id, table: "loans", recordId: ROWS(0).loans, name: "Home loan", archiveHistory: [...archived.archiveHistory, { action: "restored", at: at2, by: O, reason: "Archived by mistake" }] };
      expect(await run(db, O, () => save([restored]))).toBe("");
      expect((await stored())[0]!["archiveHistory"]).toHaveLength(2);
      // dropping the entry or sending an older copy (older backup restore) keeps the stored history
      expect(await run(db, O, () => save([]))).toBe("");
      expect(await stored()).toEqual([restored]);
      expect(await run(db, O, () => save([archived]))).toBe("");
      expect(await stored()).toEqual([restored]);
      // rewriting history, skipping the reason, acting for someone else or a status that disagrees: refused
      expect(await run(db, O, () => save([{ ...restored, archiveHistory: [{ ...archived.archiveHistory[0], reason: "Something else" }, restored.archiveHistory[1]] }]))).toMatch(/P9_ARCHIVE_HISTORY: archive history is append-only/);
      const again = (ev: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ ...restored, archivedAt: ev["at"], archivedBy: ev["by"], archiveReason: ev["reason"], archiveHistory: [...restored.archiveHistory, ev], ...extra });
      expect(await run(db, O, () => save([again({ action: "archived", at: at2, by: O, reason: "no" })]))).toMatch(/at least 5 letters/);
      expect(await run(db, O, () => save([again({ action: "archived", at: at2, by: V, reason: "Paid off in full" })]))).toMatch(/signed-in owner/);
      expect(await run(db, O, () => save([again({ action: "archived", at: at2, by: O, reason: "Paid off in full" }, { archivedAt: null })]))).toMatch(/archive status must match/);
      expect(await run(db, O, () => save([again({ action: "restored", at: at2, by: O, reason: "Paid off in full" })]))).toMatch(/alternate/);
      expect(await run(db, O, () => save([again({ action: "archived", at: at2, by: O, reason: "Paid off in full" })]))).toBe("");
      expect(((await stored())[0]!["archiveHistory"] as { action: string }[]).map((e) => e.action)).toEqual(["archived", "restored", "archived"]);
      // the loan row itself never changed
      expect(await count(db, "SELECT count(*) n FROM public.loans WHERE id=$1 AND name='Home loan' AND principal_outstanding=100000", [ROWS(0).loans])).toBe(1);
      // V cannot write O's preferences (RLS) and V's own preferences are independent
      await run(db, V, () => save([]));
      expect(await stored()).toHaveLength(1);
    });

    it("the service / operator path and confirmed erasure of the caller's own data still delete", async () => {
      expect(await run(db, null, () => q(db, "DELETE FROM public.goals WHERE id = $1", [ROWS(50).goals]), false)).toBe("");
      // the service role (demo cleanup cron, server maintenance) has no auth.uid() and is not a signed-in role
      expect(await run(db, null, async () => { await db.exec("SET LOCAL ROLE service_role"); await q(db, "DELETE FROM public.loans WHERE id = $1", [ROWS(50).loans]); }, false)).toBe("");
      // delete_my_finance_data (sets ledgerline.erasing) removes V's rows and nobody else's
      expect(await run(db, V, () => q(db, "SELECT public.delete_my_finance_data()"), false)).toBe("");
    });

    it("the used 'saved to add later' receipt is cleared only once its bytes are stored with an entry of the owner", async () => {
      const doc = id(1100), path = `${O}/docs/bill.jpg`;
      await actAs(db, null);
      await q(db, "INSERT INTO public.documents(id, owner_id, title, file_path, file_name, size_bytes, notes) VALUES ($1,$2,'Receipt to add · bill.jpg',$3,'bill.jpg',2048,'pending-receipt')", [doc, O, path]);
      const discard = (uid: string) => run(db, uid, () => q(db, "SELECT public.discard_used_pending_document($1)", [doc]));
      expect(await discard(O)).toMatch(/P9_NOT_COPIED/); // not used yet: kept
      expect(await discard(V)).toMatch(/P9_NOT_FOUND/); // another owner: not even found
      // the entry saved with a copy of the bytes (same name and size, new path), as store.save uploads it
      await actAs(db, null);
      await insertExpense(db, { id: id(5100), owner: O, acc: ACC.o, date: "2026-11-09", amount: 450, receipts: [{ name: "bill.jpg", type: "image/jpeg", path: `${O}/abc-bill.jpg` }] });
      await q(db, "INSERT INTO storage.objects(bucket_id, name, owner_id, metadata) VALUES ('receipts', $1, $2, $3::jsonb)", [`${O}/abc-bill.jpg`, O, JSON.stringify({ size: 1024 })]);
      expect(await discard(O)).toMatch(/P9_NOT_COPIED/); // a different size is not this file
      await q(db, "UPDATE storage.objects SET metadata = '{\"size\":2048}' WHERE name = $1", [`${O}/abc-bill.jpg`]);
      // archived pending receipts are kept
      await q(db, "UPDATE public.finance_preferences SET data = jsonb_set(data, '{recordArchive}', (data->'recordArchive') || $2::jsonb) WHERE owner_id=$1",
        [O, JSON.stringify([{ id: `documents:${doc}`, table: "documents", recordId: doc, name: "bill.jpg", archivedAt: "2026-11-10T11:00:00.000Z", archivedBy: O, archiveReason: "Duplicate photo", archiveHistory: [{ action: "archived", at: "2026-11-10T11:00:00.000Z", by: O, reason: "Duplicate photo" }] }])]);
      expect(await discard(O)).toMatch(/P9_ARCHIVED/);
      await q(db, "UPDATE public.finance_preferences SET data = jsonb_set(data, '{recordArchive}', (SELECT jsonb_agg(CASE WHEN e->>'id' = $2 THEN (e - 'archivedAt' - 'archivedBy' - 'archiveReason') || jsonb_build_object('archiveHistory', (e->'archiveHistory') || jsonb_build_array(jsonb_build_object('action','restored','at','2026-11-10T11:05:00.000Z','by',$1::text,'reason','Still needed'))) ELSE e END) FROM jsonb_array_elements(data->'recordArchive') e)) WHERE owner_id=$1", [O, `documents:${doc}`]);
      // a direct delete is still refused; the verified cleanup works
      expect(await run(db, O, () => q(db, "DELETE FROM public.documents WHERE id = $1", [doc]))).toMatch(/P9_ARCHIVE_ONLY/);
      expect(await discard(O)).toBe("");
      expect(await count(db, "SELECT count(*) n FROM public.documents WHERE id=$1", [doc])).toBe(0);
      // other documents (not a pending receipt) are never cleared this way
      expect(await run(db, O, () => q(db, "SELECT public.discard_used_pending_document($1)", [ROWS(0).documents]))).toMatch(/P9_NOT_STAGING/);
    });
  });

  it("rollback refuses while unconfirmed claims exist (unless approved), then restores the exact pre-P9 catalog and keeps every row", async () => {
    await actAs(db, null);
    // unconfirmed claims from the tests above (V's line, the double-submit lines never saved) are still there
    expect(await count(db, "SELECT count(*) n FROM public.statement_line_imports WHERE entry_id IS NOT NULL AND registered_at IS NULL")).toBe(3);
    await expect(db.exec(readSql(P9_RB))).rejects.toThrow(/unconfirmed statement line claims exist/);
    await db.exec("ROLLBACK");
    const lines = await count(db, "SELECT count(*) n FROM public.statement_line_imports");
    await db.exec(readSql(P9_RB).replace("BEGIN;", "BEGIN; SET LOCAL phase3_p9.rollback_with_pending = 'on';"));
    expect(await catalog(db)).toEqual(before);
    expect(await count(db, "SELECT count(*) n FROM public.statement_line_imports")).toBe(lines);
    // archive history in preferences is app data and stays; deletes behave as before P9
    expect(await count(db, "SELECT jsonb_array_length(data->'recordArchive') n FROM public.finance_preferences WHERE owner_id=$1", [O])).toBe(2);
    expect(await run(db, O, () => q(db, "DELETE FROM public.goals WHERE id = $1", [ROWS(0).goals]), false)).toBe("");
    // and P9 installs again after its rollback
    await db.exec(readSql(P9));
    expect(await run(db, O, () => q(db, "DELETE FROM public.goals WHERE id = $1", [ROWS(0).goals]), false)).toMatch(/P9_ARCHIVE_ONLY/);
  }, T);
});

// The integrated proposed stack (same order as src/lib/integration-stack.test.ts), then P9 on top.
const STACK = ["P1_security_containment", "P2_v31_role_model", "P4_step_up_and_assistant_limits", "P5_legal_entities_foundation", "P5b_restore_investments", "P6_registers", "P7_balanced_posting", "P8_asset_depreciation_posting"].map((f) => `${DIR}${f}`);

describe("P9 with the whole proposed stack (P1, P2, P4, P5, P5b, P6, P7, P8)", () => {
  it("installs after P8, keeps P1's confirmed erasure working, blocks authenticated deletes, and every rollback runs in reverse", async () => {
    const db = await fullSchemaDb([...STACK.map((f) => `${f}.sql`), P9]);
    await seed(db);
    for (const t of TABLES) expect(await run(db, O, () => q(db, `DELETE FROM public.${t} WHERE id = $1`, [ROWS(0)[t]]))).toMatch(/P9_ARCHIVE_ONLY/);
    let c: Claim[] = [];
    expect(await run(db, O, async () => { c = await claim(db, [line(1)]); await saveEntry(db, c[0]!.entry_id); await q(db, "SELECT public.confirm_statement_lines($1::uuid[])", [[c[0]!.entry_id]]); })).toBe("");
    expect(c[0]).toMatchObject({ outcome: "claimed", entry_id: id(5001) });
    expect(await run(db, O, async () => { await stepUp(db, O); await q(db, "SELECT public.delete_my_finance_data()"); })).toBe("");
    expect(await count(db, "SELECT (SELECT count(*) FROM public.loans WHERE owner_id=$1) + (SELECT count(*) FROM public.documents WHERE owner_id=$1) n", [O])).toBe(0);
    expect(await count(db, "SELECT count(*) n FROM public.loans WHERE owner_id=$1", [V])).toBe(1);
    await actAs(db, null);
    await db.exec(readSql(P9_RB));
    await db.exec("SET phase3_p7.rollback_archive_postings = 'on'");
    for (const f of [...STACK].reverse()) {
      try { await db.exec(readSql(`${f}.rollback.sql`)); } catch (e) { throw new Error(`${f} rollback: ${(e as Error).message}`); }
    }
    expect(await count(db, "SELECT count(*) n FROM pg_namespace WHERE nspname = 'phase3_p9'")).toBe(0);
    await db.close();
  }, 600_000);
});
