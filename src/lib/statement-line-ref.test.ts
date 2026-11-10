// @vitest-environment node
// P0-027 / RB-STM-01 regression: identical same-day statement lines (two real purchases) got the same statement_ref, which P7 uses as the
// statement_row source key, so the second line's reconcile was refused (P7_DUPLICATE_SOURCE) on every attempt and its P9 claim
// stayed pending. statementLineRef makes the reference unique per line (same discriminators as the fingerprint) while keeping the
// readable "file · date · description" prefix. The end-to-end app path (save, reconcile, post, re-import) is covered by
// failure-injection.test.ts "2/3 (P7)". Isolated PGlite only.
import { describe, expect, it } from "vitest";
import { actAs, addUsers, fullSchemaDb } from "@/test/full-schema-pglite";
import { statementLineRef } from "./statement-line-claims";
import { fingerprintLines, isLineSourceRef, statementRefOrigin } from "./statement-fingerprint";
import type { StatementLine } from "./expenses";

const ACC = "00000000-0000-4000-8000-000000000101";
const FILE = "HDFC_Statement_05112026.csv";
const LINES: StatementLine[] = [
  {
    ref: "1",
    date: "2026-11-03",
    description: "POS AMAZON RETAIL",
    amount: 2999,
    direction: "debit",
  },
  {
    ref: "2",
    date: "2026-11-03",
    description: "POS AMAZON RETAIL",
    amount: 2999,
    direction: "debit",
  },
  {
    ref: "3",
    date: "2026-11-03",
    description: "POS AMAZON RETAIL",
    amount: 499,
    direction: "debit",
  },
  {
    ref: "4",
    date: "2026-11-03",
    description: "POS AMAZON RETAIL",
    amount: 2999,
    direction: "credit",
  },
  {
    ref: "5",
    date: "2026-11-05",
    description: "NETFLIX SUBSCRIPTION 412345678905",
    amount: 649,
    direction: "debit",
  },
];
const refs = (lines: StatementLine[]) => {
  const fps = fingerprintLines(lines, ACC);
  return lines.map((_, i) => statementLineRef(fps[i]!));
};

describe("P0-027 statementLineRef", () => {
  it("is unique per statement line, stable for the same line, readable, and at most 300 characters", () => {
    const r = refs(LINES);
    expect(new Set(r).size).toBe(LINES.length);
    expect(r[0]).toBe(`Statement line · 2026-11-03 · debit 2999.00 · POS AMAZON RETAIL · account ${ACC}`);
    expect(r[1]).toBe(`Statement line · 2026-11-03 · debit 2999.00 · POS AMAZON RETAIL · #2 · account ${ACC}`);
    expect(r[4]).toBe(`Statement line · 2026-11-05 · debit 649.00 · ref 412345678905 · account ${ACC}`);
    expect(refs(LINES)).toEqual(r); // the same file again gives the same references
    for (const x of r) expect(isLineSourceRef(x)).toBe(true);
    expect(statementRefOrigin(r[0]!)).toBe("the statement line of 2026-11-03"); // inbox.ts wording
    const longFp = (d: string) => fingerprintLines([{ ref: "x", date: "2026-11-03", description: d, amount: 1, direction: "debit" }], ACC)[0]!;
    const a = statementLineRef(longFp("X".repeat(400)));
    const b = statementLineRef(longFp(`${"X".repeat(399)}Y`));
    expect(a.length).toBeLessThanOrEqual(300);
    expect(b.length).toBeLessThanOrEqual(300);
    expect(a).not.toBe(b); // shortened narrations stay distinct
    expect(a.endsWith(` · account ${ACC}`)).toBe(true);
  });

  it("RB-STM-01: identity = account + content evidence, never the file name", () => {
    const OTHER = "00000000-0000-4000-8000-000000000102";
    const line = [LINES[0]!];
    // two accounts, same file name, identical line → two different sources
    expect(statementLineRef(fingerprintLines(line, ACC)[0]!)).not.toBe(statementLineRef(fingerprintLines(line, OTHER)[0]!));
    // the same line re-downloaded (any file name: it is not an input) with different narration punctuation → the same source
    const redownload = [{ ...LINES[0]!, ref: "z", description: "pos  amazon-retail" }];
    expect(statementLineRef(fingerprintLines(redownload, ACC)[0]!)).toBe(statementLineRef(fingerprintLines(line, ACC)[0]!));
    for (const x of refs(LINES)) expect(x).not.toContain(FILE);
    // older stored references are still read as before
    expect(isLineSourceRef(`${FILE} · 2026-11-03 · POS AMAZON RETAIL`)).toBe(false);
    expect(statementRefOrigin(`${FILE} · 2026-11-03 · POS AMAZON RETAIL · debit 2999.00 · #2`)).toBe(FILE);
    expect(() => statementLineRef("not-a-fingerprint")).toThrow();
  });

  it("on active P7 books both identical lines post once each; a true duplicate source is still refused", async () => {
    // Expected: two entries with the two distinct references → 2 posting events; a third entry reusing the first reference →
    // P7_DUPLICATE_SOURCE; an entry with an old-format reference (stored before this change) still posts.
    const D = ".lovable/staged-sql/proposed/";
    const db = await fullSchemaDb(
      [
        "P1_security_containment",
        "P2_v31_role_model",
        "P4_step_up_and_assistant_limits",
        "P5_legal_entities_foundation",
        "P5b_restore_investments",
        "P6_registers",
        "P7_balanced_posting",
        "P8_asset_depreciation_posting",
        "P9_statement_import_idempotency_and_archive_guards",
      ].map((f) => `${D}${f}.sql`),
    );
    const O = "00000000-0000-4000-8000-000000000001";
    await addUsers(db, { [O]: "o@x.in" });
    await actAs(db, null);
    await db.query(
      "INSERT INTO public.accounts(id,owner_id,name,kind) VALUES ($1,$2,'HDFC Savings','savings')",
      [ACC, O],
    );
    await db.query("INSERT INTO public.finance_preferences(owner_id,data) VALUES ($1,$2::jsonb)", [
      O,
      JSON.stringify({
        entities: [{ id: "c1", name: "Alpha Pvt Ltd", kind: "company" }],
        books: { entityAccounts: { c1: [ACC] } },
      }),
    ]);
    const stepUp = async () => {
      await actAs(db, null);
      await db.exec("SET ROLE service_role");
      await db.query("SELECT public.record_step_up($1,'password',300)", [O]);
      await actAs(db, O);
    };
    const one = async <T>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows[0]!;
    await actAs(db, O);
    const ep = (
      await one<{ p: { source_sha256: string } }>("SELECT public.preview_entity_backfill(false) p")
    ).p;
    await stepUp();
    await db.query("SELECT public.commit_entity_backfill($1,false)", [ep.source_sha256]);
    const ap = (
      await one<{ p: { source_sha256: string } }>(
        "SELECT public.preview_register_backfill('assets','{}') p",
      )
    ).p;
    await stepUp();
    await db.query("SELECT public.commit_register_backfill('assets',$1,'{}')", [ap.source_sha256]);
    const pp = (
      await one<{ p: { fingerprint: string } }>("SELECT public.preview_posting_backfill() p")
    ).p;
    await stepUp();
    await db.query("SELECT public.commit_posting_backfill($1,$2)", [
      "00000000-0000-4000-8000-000000009001",
      pp.fingerprint,
    ]);

    const r = refs(LINES);
    const save = async (id: string, ref: string) => {
      await actAs(db, O);
      try {
        await db.query(
          "INSERT INTO public.expenses(id,employee_id,title,merchant,category,amount,original_amount,currency,expense_date,account_id,description) VALUES ($1,$2,'Pos Amazon Retail','Amazon','Shopping',2999,2999,'INR','2026-11-03',$3,'Statement import')",
          [id, O, ACC],
        );
        await db.query(
          "UPDATE public.expenses SET statement_ref=$2, reconciled_at=now() WHERE id=$1",
          [id, ref],
        );
        return "ok";
      } catch (e) {
        return (e as Error).message;
      } finally {
        await actAs(db, null);
      }
    };
    const ids = [
      "00000000-0000-4000-8000-000000000e01",
      "00000000-0000-4000-8000-000000000e02",
      "00000000-0000-4000-8000-000000000e03",
      "00000000-0000-4000-8000-000000000e04",
    ];
    expect(await save(ids[0]!, r[0]!)).toBe("ok");
    expect(await save(ids[1]!, r[1]!)).toBe("ok");
    expect(await save(ids[2]!, r[0]!)).toMatch(/P7_DUPLICATE_SOURCE/);
    expect(await save(ids[3]!, `${FILE} · 2026-11-03 · POS AMAZON RETAIL`)).toBe("ok"); // a reference in the format stored before P0-027
    await actAs(db, null);
    const posted = await db.query<{ n: number }>(
      "SELECT count(*)::int n FROM public.posting_events WHERE owner_id=$1 AND event_key = ANY($2)",
      [O, ids.map((x) => `ledger_entry:${x}`)],
    );
    expect(posted.rows[0]!.n).toBe(4); // e03 was inserted and posted; only its reconcile (duplicate source) was refused
    const reconciled = await db.query<{ id: string }>(
      "SELECT id FROM public.expenses WHERE id = ANY($1) AND statement_ref IS NOT NULL ORDER BY id",
      [ids],
    );
    expect(reconciled.rows.map((x) => x.id)).toEqual([ids[0], ids[1], ids[3]]);
    await db.close();
  }, 600_000);
});
