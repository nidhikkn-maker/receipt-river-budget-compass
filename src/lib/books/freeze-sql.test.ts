// @vitest-environment node
// Isolated in-memory PostgreSQL only: never contacts Lovable Cloud or writes live records.
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const db = new PGlite();
const owner = "00000000-0000-0000-0000-000000000001";
const period = { id: "p1", from: "2024-04-01", to: "2025-03-31", closedOn: "2025-06-01", note: "FY 2024-25 frozen" };
const inv = (id: string, date: string) => ({ id, gstin: "G", kind: "sales", number: id, date, party: "x", partyGstin: "", taxable: 100, igst: 18, cgst: 0, sgst: 0, cess: 0 });
const setBooks = (b: object) => db.exec(`UPDATE public.finance_preferences SET data = jsonb_build_object('books', '${JSON.stringify(b)}'::jsonb) WHERE owner_id='${owner}'`);
beforeAll(async () => {
  await db.exec(`CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.uid',true),'')::uuid $$;
    CREATE TABLE public.finance_preferences(owner_id uuid primary key, data jsonb);
    INSERT INTO public.finance_preferences VALUES ('${owner}', '{"books":{"closedPeriods":${JSON.stringify([period])},"periodLog":[],"gstInvoices":${JSON.stringify([inv("a", "2024-05-01")])}}}');
    SELECT set_config('app.uid','${owner}',false);`);
  await db.exec(readFileSync("drizzle/migrations/0062_freeze_closed_years_books.sql", "utf8").replace(/--> statement-breakpoint/g, ""));
}, 20000);
afterAll(async () => { await db.close(); });
describe("frozen years in isolated PostgreSQL", () => {
  it("refuses changing a GST invoice dated inside a closed year", async () => {
    await expect(setBooks({ closedPeriods: [period], periodLog: [], gstInvoices: [{ ...inv("a", "2024-05-01"), taxable: 999 }] })).rejects.toThrow(/closed period/);
    await expect(setBooks({ closedPeriods: [period], periodLog: [], gstInvoices: [] })).rejects.toThrow(/closed period/);
  });
  it("allows invoices in open months", async () => {
    await setBooks({ closedPeriods: [period], periodLog: [], gstInvoices: [inv("a", "2024-05-01"), inv("b", "2025-05-01")] });
  });
  it("a closed year can't silently disappear; a logged reopening is accepted", async () => {
    await expect(setBooks({ closedPeriods: [], periodLog: [], gstInvoices: [] })).rejects.toThrow(/reopened with a written reason/);
    await setBooks({ closedPeriods: [], periodLog: [{ at: "2026-11-05", action: "reopened", periodId: "p1", reason: "Accountant correction" }], gstInvoices: [] });
    const r = await db.query<{ n: number }>("SELECT jsonb_array_length(data->'books'->'gstInvoices') AS n FROM public.finance_preferences");
    expect(r.rows[0]!.n).toBe(0);
  });
});
