// @vitest-environment node
// P0-002 regression: the Undo capability probe classifies the real database errors, so the Statement Desk
// offers Undo only when undo_statement_rows / statement_undo_receipts are installed.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { actAs, addUsers, fullSchemaDb } from "@/test/full-schema-pglite";
import { isMissingSchemaObject, undoCapabilityFrom, UNDO_NEEDS_UPDATE } from "./undo-capability";

const A = "0000000a-0000-4000-8000-0000000000a4";
async function probe(db: Awaited<ReturnType<typeof fullSchemaDb>>) {
  try { await db.query("SELECT id FROM public.statement_undo_receipts WHERE owner_id=$1 LIMIT 1", [A]); return null; } catch (e) { return e; }
}

describe("Statement Undo capability", () => {
  it("applied schema → needs-update; with the staged SQL installed → available", async () => {
    const db = await fullSchemaDb();
    try {
      await addUsers(db, { [A]: "a@x.in" });
      await actAs(db, A);
      expect(undoCapabilityFrom(await probe(db))).toBe("needs-update");
      await actAs(db, null);
      await db.exec(readFileSync(".lovable/staged-sql/statement-atomic-undo.sql", "utf8")); // isolated copy only
      await actAs(db, A);
      expect(undoCapabilityFrom(await probe(db))).toBe("available");
    } finally { await db.close(); }
  }, 240_000);

  it("recognises PostgREST missing table/function codes; network or permission errors stay unknown", () => {
    expect(undoCapabilityFrom({ code: "PGRST205", message: "Could not find the table 'public.statement_undo_receipts' in the schema cache" })).toBe("needs-update");
    expect(undoCapabilityFrom({ code: "PGRST202", message: "Could not find the function public.undo_statement_rows" })).toBe("needs-update");
    expect(undoCapabilityFrom({ code: "PGRST000", message: "Could not connect" })).toBe("unknown");
    expect(undoCapabilityFrom({ code: "42501", message: "permission denied" })).toBe("unknown");
    expect(undoCapabilityFrom(null)).toBe("available");
    expect(isMissingSchemaObject(new Error("relation \"public.statement_undo_receipts\" does not exist"))).toBe(true);
    expect(UNDO_NEEDS_UPDATE).toMatch(/needs an approved database update/);
  });
});
