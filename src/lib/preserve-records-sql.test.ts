// @vitest-environment node
// Phase 0 evidence against the real save path: the applied save_reviewed_preferences function (migration 0080/0082)
// in isolated PGlite with every applied migration. Never connects to Cloud.
import { describe, expect, it } from "vitest";
import { fullSchemaDb, actAs, addUsers } from "../test/full-schema-pglite";
import { normalizePreferences, type FinancePreferences } from "./preferences";
import { canonical, preserveForSave } from "./preserve-records";
import { alignUnchangedSections, preferenceReviewSections } from "./preference-review";

/** Exactly the store.savePreferences pipeline (src/lib/store.tsx). */
const storePayload = (storedData: Record<string, unknown>, view: FinancePreferences, next: FinancePreferences) => {
  const sections = preferenceReviewSections(view, next);
  return { payload: alignUnchangedSections(storedData, preserveForSave(storedData, next), sections), sections };
};

const OWNER = "00000000-0000-4000-8000-0000000000c1";
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const day = (n: number) => new Date(Date.UTC(2021, 0, 1) + n * 864e5).toISOString().slice(0, 10);
const stored = {
  theme: "light",
  assets: [...range(230).map((i) => ({ id: `a${i}`, name: `Asset ${i}`, kind: "computer", cost: 500, inUse: day(i), sharePct: i === 0 ? 150 : 100, bookMethod: "slm", bookRatePct: 20 })), { id: "a-bad", name: "No cost", kind: "computer" }],
  books: {
    journals: [...range(5200).map((i) => ({ id: `j${i}`, assetId: `a${i % 230}`, period: "2026-01", amount: 1, kind: "book", status: "posted" })), { id: "j-bad", amount: "x" }],
    leases: range(520).map((i) => ({ id: `l${i}`, start: day(i), end: day(i + 365), rent: 100 })),
  },
};

async function setup() {
  const db = await fullSchemaDb();
  await addUsers(db, { [OWNER]: "owner@x.in" });
  await actAs(db, OWNER);
  await db.query("INSERT INTO public.finance_preferences(owner_id,data) VALUES ($1,$2::jsonb)", [OWNER, JSON.stringify(stored)]);
  const row = (await db.query<{ data: Record<string, unknown>; revision: number }>("SELECT data, revision FROM public.finance_preferences WHERE owner_id=$1", [OWNER])).rows[0]!;
  return { db, row };
}
const save = (db: Awaited<ReturnType<typeof fullSchemaDb>>, data: unknown, rev: number, approved: boolean) =>
  db.query("SELECT public.save_reviewed_preferences(gen_random_uuid(), $1::jsonb, $2, $3) AS r", [JSON.stringify(data), rev, approved]);

describe("preserved saves through the real database save function", () => {
  it("an unrelated settings change saves without a financial-approval prompt and keeps every stored record", async () => {
    const { db, row } = await setup();
    const view = normalizePreferences(row.data as Partial<FinancePreferences>);
    const { payload, sections } = storePayload(row.data, view, { ...view, theme: "dark" } as FinancePreferences);
    expect(sections).toEqual([]); // the app asks for no financial approval
    await save(db, payload, row.revision, false);
    const after = (await db.query<{ data: Record<string, unknown> }>("SELECT data FROM public.finance_preferences WHERE owner_id=$1", [OWNER])).rows[0]!.data;
    expect(after["theme"]).toBe("dark");
    expect(canonical(after["assets"])).toBe(canonical(stored.assets)); // 231 incl. the unreadable one; clamp not written
    expect(canonical(after["books"])).toBe(canonical(stored.books)); // 5,201 journals, 520 leases
    await db.close();
  }, 120000);

  it("the old behaviour (writing the tidied view back) changes financial sections; the database refuses it without approval", async () => {
    const { db, row } = await setup();
    const view = normalizePreferences(row.data as Partial<FinancePreferences>);
    // Pre-Phase-0 pipeline: alignUnchangedSections applied to the tidied view itself.
    const old = alignUnchangedSections(row.data, { ...view, theme: "dark" } as FinancePreferences, []);
    await expect(save(db, old, row.revision, false)).rejects.toThrow(/Approve the financial changes/);
    const after = (await db.query<{ data: Record<string, unknown> }>("SELECT data FROM public.finance_preferences WHERE owner_id=$1", [OWNER])).rows[0]!.data;
    expect(canonical(after)).toBe(canonical(stored));
    await db.close();
  }, 120000);
});
