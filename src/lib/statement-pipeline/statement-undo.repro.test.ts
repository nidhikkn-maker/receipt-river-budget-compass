// @vitest-environment node
// P0-002 reproduction: Statement Desk Undo calls public.undo_statement_rows and reads
// public.statement_undo_receipts (atomic-undo.functions.ts:33,46). Neither exists in the applied schema
// (drizzle/migrations 0000-0088) nor in the generated types; both exist only in unapplied staged SQL.
// So every press of Undo fails on the current database. Isolated PGlite only.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { actAs, addUsers, fullSchemaDb } from "@/test/full-schema-pglite";
import { isMissingFunction } from "@/lib/step-up";

const A = "0000000a-0000-4000-8000-0000000000a2";

describe("P0-002 REPRO: the database Undo depends on is not installed", () => {
  it("applied schema has neither statement_undo_receipts nor undo_statement_rows; the call fails as a missing function", async () => {
    const db = await fullSchemaDb();
    try {
      expect((await db.query<{ t: string | null }>("SELECT to_regclass('public.statement_undo_receipts')::text t")).rows[0]?.t).toBeNull();
      expect((await db.query("SELECT 1 FROM pg_proc WHERE proname='undo_statement_rows'")).rows).toHaveLength(0);
      await addUsers(db, { [A]: "a@x.in" });
      await actAs(db, A);
      let error: unknown = null;
      try { await db.query("SELECT public.undo_statement_rows($1::uuid,'[]'::jsonb)", ["00000000-0000-4000-8000-000000000001"]); } catch (e) { error = e; }
      expect(error).not.toBeNull();
      expect((error as { code?: string }).code).toBe("42883"); // undefined_function → PostgREST PGRST202 in Cloud
      expect(isMissingFunction(error)).toBe(true);            // the app can already recognise this state
    } finally { await db.close(); }
  }, 240_000);

  it("the generated database types lack both names; only the staged (unapplied) SQL defines them", () => {
    const types = readFileSync("src/integrations/supabase/types.ts", "utf8");
    expect(types).not.toContain("undo_statement_rows");
    expect(types).not.toContain("statement_undo_receipts");
    const staged = readFileSync(".lovable/staged-sql/statement-atomic-undo.sql", "utf8");
    expect(staged).toContain("CREATE TABLE public.statement_undo_receipts");
    expect(staged).toContain("CREATE FUNCTION public.undo_statement_rows");
  });
});
