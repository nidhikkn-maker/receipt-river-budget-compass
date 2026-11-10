// @vitest-environment node
// P0-003 verification against the applied schema (isolated PGlite). ReviewHistory.tsx hard-codes
// undone:false for account/type and mapping batches, but the store reads only rows with undone_at IS NULL
// (store.tsx financialCorrectionHistory / reviewMetadataHistory), so a batch restored through the app is
// not listed and Undo is not offered for it. Result: the claimed defect does NOT reproduce. Two related
// facts are recorded: restored batches vanish from history (no "Restored" record), and a second
// restoration of the same batch returns silently, so a stale screen would report a restoration that did nothing.
import { describe, expect, it } from "vitest";
import { actAs, addUsers, fullSchemaDb } from "@/test/full-schema-pglite";

const A = "0000000a-0000-4000-8000-0000000000a3";
const FIN = "00000000-0000-4000-8000-0000000000f1", MAP = "00000000-0000-4000-8000-0000000000f2";

describe("P0-003 verification: restored correction batches", () => {
  it("undo sets undone_at; the store's own filter then hides the batch; a repeat undo is a silent no-op", async () => {
    const db = await fullSchemaDb();
    try {
      await addUsers(db, { [A]: "a@x.in" });
      await actAs(db, null);
      await db.query("INSERT INTO public.finance_preferences(owner_id,data) VALUES ($1,'{}'::jsonb)", [A]);
      await db.query(`INSERT INTO public.financial_corrections(id,owner_id,request,entries) VALUES ($1,$3,'{"kind":"financial"}','[]'),($2,$3,'{"kind":"review_metadata"}','[]')`, [FIN, MAP, A]);
      await actAs(db, A);
      await db.query("SELECT public.undo_financial_correction($1)", [FIN]);
      await db.query("SELECT public.undo_review_metadata($1)", [MAP]);
      const all = (await db.query<{ id: string; undone_at: string | null }>("SELECT id, undone_at FROM public.financial_corrections ORDER BY id")).rows;
      expect(all.every((r) => r.undone_at !== null)).toBe(true);
      // Exactly the filters the store sends (.is('undone_at', null)):
      expect((await db.query("SELECT id FROM public.financial_corrections WHERE undone_at IS NULL")).rows).toHaveLength(0);
      expect((await db.query("SELECT id FROM public.financial_corrections WHERE request->>'kind'='review_metadata' AND undone_at IS NULL")).rows).toHaveLength(0);
      // Repeat restoration: no error, nothing changes — a stale "Confirm undo" would show a success message.
      const before = (await db.query<{ undone_at: string }>("SELECT undone_at FROM public.financial_corrections WHERE id=$1", [FIN])).rows[0]!.undone_at;
      await expect(db.query("SELECT public.undo_financial_correction($1)", [FIN])).resolves.toBeDefined();
      expect((await db.query<{ undone_at: string }>("SELECT undone_at FROM public.financial_corrections WHERE id=$1", [FIN])).rows[0]!.undone_at).toEqual(before);
    } finally { await db.close(); }
  }, 240_000);
});
