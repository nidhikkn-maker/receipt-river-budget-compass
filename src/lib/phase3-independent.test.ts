// @vitest-environment node
// Phase 3 independent financial reconciliation (requirement 10). A realistic multi-entity (two companies +
// personal books), multi-currency (INR/USD/EUR) owner ledger is converted through the PROPOSED P7 posting
// layer in isolated PGlite. The expected trial balance is computed HERE, independently of the SQL:
//   (1) a separate TypeScript double-entry model written from the accounting rules in the plan, and
//   (2) the app's own ledger.ts accountBalance for every owned account,
// and both must equal the posted journal to the paisa. The reconciliation report must list exactly the
// known exceptions as differences, each explained, and never fix anything.
import { describe, it, expect, beforeAll } from "vitest";
import { accountBalance, type Account, type AccountKind, type Txn, type TxnType } from "./ledger";
import {
  ACC, C1, C2, LEDGER, T, U, activate, as, e, entityId, first, journalTb, personalKey, q, seededDb, type Db, type Ex,
} from "../test/phase3-fixture";

const KIND: Record<string, AccountKind> = {
  [ACC.A1]: "current", [ACC.A2]: "credit_card", [ACC.B1]: "current", [ACC.P1]: "savings", [ACC.P2]: "credit_card",
  [ACC.P3]: "wallet", [ACC.L1]: "loan", [ACC.I1]: "investment",
};
const PERSONAL = personalKey(U.O);
const ENTITY_OF: Record<string, string> = { [ACC.A1]: C1, [ACC.A2]: C1, [ACC.B1]: C2, [ACC.P1]: PERSONAL, [ACC.P2]: PERSONAL, [ACC.P3]: PERSONAL, [ACC.L1]: PERSONAL, [ACC.I1]: PERSONAL };
/** Entries that must NOT post (each is a listed exception) and the statement counterpart row. */
const NOT_POSTED = new Set([e(2), e(19), e(20), e(22), e(24)]);

// ---- (1) independent double-entry model, written from the plan's rules, in integer paise ----
const paise = (n: number) => Math.round(n * 100);
type Tb = Record<string, Record<string, number>>;
function post(tb: Tb, ent: string, code: string, signedPaise: number) {
  if (!signedPaise) return;
  const m = (tb[ent] ??= {});
  m[code] = (m[code] ?? 0) + signedPaise;
  if (m[code] === 0) delete m[code];
}
function expectedTb(ledger: Ex[]): Tb {
  const tb: Tb = {};
  for (const x of ledger) {
    if (NOT_POSTED.has(x.id)) continue;
    const t = x.type ?? "expense", a = paise(x.amount);
    const acc = x.acc ? `account:${x.acc}` : "", to = x.to ? `account:${x.to}` : "";
    const ea = x.acc ? ENTITY_OF[x.acc]! : PERSONAL, eb = x.to ? ENTITY_OF[x.to]! : PERSONAL;
    const owner = x.manual ?? ea; // effective entity: hand-picked company wins, else the paying account's
    if (t === "expense" || t === "income" || t === "refund" || t === "reimbursement") {
      const out = t === "expense";
      post(tb, ea, acc, out ? -a : a);
      const parts = x.allocations?.length ? x.allocations : [{ category: x.category ?? "General", amount: x.amount }];
      for (const p of parts) post(tb, owner, `${t === "income" ? "income" : "expense"}:${p.category}`, out ? paise(p.amount) : -paise(p.amount));
      if (owner !== ea) { post(tb, ea, `due:${owner}`, out ? a : -a); post(tb, owner, `due:${ea}`, out ? -a : a); }
    } else if (t === "adjustment") { // only the evidence-backed opening posts
      post(tb, ea, acc, a); post(tb, ea, "equity:opening:2026-27", -a);
    } else {
      const interest = t === "loan_repayment" && x.interest != null ? Math.round((a * x.interest) / (x.orig ?? x.amount)) : 0;
      post(tb, ea, acc, -a); post(tb, eb, to, a - interest); post(tb, eb, "expense:Loan interest", interest);
      if (ea !== eb) { post(tb, ea, `due:${eb}`, a); post(tb, eb, `due:${ea}`, -a); }
    }
  }
  return tb;
}

let db: Db;
let ids: Record<string, string>;
let posted: Tb;
const toPaise = (tb: Record<string, Record<string, number>>) => Object.fromEntries(Object.entries(tb).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([c, n]) => [c, paise(n)]))]));
/** The journal names inter-entity counterparts by legal entity uuid; map them back to entity keys. */
function byKeys(tb: Tb): Tb {
  const rev = Object.fromEntries(Object.entries(ids).map(([k, v]) => [v, k]));
  return Object.fromEntries(Object.entries(tb).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([c, n]) => [c.startsWith("due:") ? `due:${rev[c.slice(4)] ?? c.slice(4)}` : c, n]))]));
}

describe("Phase 3 independent reconciliation (seeded multi-entity, multi-currency ledger)", () => {
  beforeAll(async () => {
    db = await seededDb();
    ids = { [C1]: await entityId(db, U.O, C1), [C2]: await entityId(db, U.O, C2), [PERSONAL]: await entityId(db, U.O, PERSONAL) };
    const r = await activate(db, U.O);
    expect(r["entriesPosted"]).toBe(LEDGER.length - NOT_POSTED.size);
    posted = byKeys(toPaise(await journalTb(db, U.O)));
  }, T);

  it("posted trial balance equals the independently computed one, per legal entity and code", () => {
    expect(posted).toEqual(expectedTb(LEDGER));
  });

  it("every legal entity balances and inter-entity balances eliminate exactly", () => {
    for (const [ent, codes] of Object.entries(posted)) expect([ent, Object.values(codes).reduce((s, n) => s + n, 0)]).toEqual([ent, 0]);
    expect(posted[C1]![`due:${PERSONAL}`]).toBe(-(posted[PERSONAL]![`due:${C1}`] ?? 0));
    // hand-checked figures (paise): Alpha bank, Alpha card settled to nil, personal loan principal only
    expect(posted[C1]![`account:${ACC.A1}`]).toBe(paise(100000 - 50000 + 200000 - 10020 - 40000));
    expect(posted[C1]![`account:${ACC.A2}`]).toBeUndefined(); // card spend 10,020 then settled 10,020: no expense from the settlement
    expect(posted[C1]!["expense:Software"]).toBe(paise(10020));
    expect(posted[PERSONAL]![`account:${ACC.L1}`]).toBe(paise(22000));
    expect(posted[PERSONAL]!["expense:Loan interest"]).toBe(paise(8000));
    expect(posted[PERSONAL]!["expense:Medical"]).toBeUndefined(); // claim 1,200 fully reimbursed: never income
    expect(Object.keys(posted[PERSONAL]!).some((c) => c.startsWith("income:Reimb"))).toBe(false);
    expect(posted[C1]!["expense:Travel"]).toBe(paise(4500)); // company expense paid personally: due to the owner
    expect(posted[C2]!["income:Interest"]).toBe(-paise(12345.67));
  });

  it("account lines equal the app's own ledger.ts balances over the posted entries", () => {
    const txns: Txn[] = LEDGER.filter((x) => !NOT_POSTED.has(x.id)).map((x) => ({
      id: x.id, txnType: (x.type ?? "expense") as TxnType, amount: x.amount, accountId: x.acc ?? null, toAccountId: x.to ?? null, date: x.date,
      adjustmentSign: x.adjSign ?? 1, principal: x.principal ?? null, interest: x.interest ?? null, originalAmount: x.orig ?? x.amount,
    }));
    for (const [acc, kind] of Object.entries(KIND)) {
      const a: Account = { id: acc, name: acc, kind, openingBalance: 0, archived: false };
      const liability = kind === "credit_card" || kind === "loan";
      const journal = posted[ENTITY_OF[acc]!]?.[`account:${acc}`] ?? 0;
      expect([acc, (liability ? -journal : journal) + 0]).toEqual([acc, paise(accountBalance(a, txns)) + 0]);
    }
  });

  it("multi-currency source facts are preserved on the batches (original amount, currency, rate, date, source)", async () => {
    const rows = await q<{ e: string; c: string; a: string; r: string; d: string; s: string }>(db, `SELECT ev.source_entry_id::text e, b.source_currency c, (b.source_amount::numeric(20,2))::text a, (b.fx_rate::numeric(20,4))::text r, b.fx_date::text d, b.fx_source s
      FROM public.posting_batches b JOIN public.posting_events ev ON ev.id = b.event_id WHERE b.owner_id = $1 AND ev.source_entry_id = ANY($2::uuid[]) ORDER BY 1, 2`, [U.O, [e(4), e(12), e(3)]]);
    expect(rows.find((x) => x.e === e(4))).toMatchObject({ c: "USD", a: "120.00", r: "83.5000", d: "2026-04-10", s: "server_fx_rate" });
    expect(rows.filter((x) => x.e === e(12)).map((x) => [x.c, x.a, x.r])).toEqual([["EUR", "50.00", "90.0000"], ["EUR", "50.00", "90.0000"]]); // both legal entities
    expect(rows.find((x) => x.e === e(3))).toMatchObject({ c: "INR", s: "functional_currency" });
    const lines = await q<{ c: string }>(db, "SELECT DISTINCT currency c FROM public.posting_lines WHERE owner_id = $1", [U.O]);
    expect(lines).toEqual([{ c: "INR" }]); // functional-currency lines; source currency kept on the batch
  });

  it("reconciliation report: journal vs legacy ledger per entity/account/currency/period; differences listed and explained, never fixed", async () => {
    const r = first(await as(db, U.O, () => q<{ r: Record<string, unknown> }>(db, "SELECT public.posting_reconciliation_report() r"))).r;
    type Diff = { entityKey: string; accountId: string; period: string; legacy: number; journal: number; difference: number; explained: boolean; explainedBy: string[] };
    const diffs = (r["differences"] as Diff[]).map((d) => ({ key: d.entityKey, acc: d.accountId, period: d.period, diff: paise(d.difference), explained: d.explained, by: [...d.explainedBy].sort() }))
      .sort((a, b) => (a.key + a.acc + a.period).localeCompare(b.key + b.acc + b.period));
    expect(diffs).toEqual([
      { key: C2, acc: ACC.B1, period: "2026-04", diff: paise(20000), explained: true, by: [e(2)] },                 // opening without evidence
      { key: PERSONAL, acc: ACC.P1, period: "2026-06", diff: paise(250 - 2100), explained: true, by: [e(19), e(22)] }, // unexplained adjustment + duplicate row
      { key: PERSONAL, acc: ACC.P1, period: "opening", diff: paise(50000), explained: true, by: [] },               // static opening balance
    ].sort((a, b) => (a.key + a.acc + a.period).localeCompare(b.key + b.acc + b.period)));
    expect(r["balanced"]).toBe(true);
    expect(r["allDifferencesExplained"]).toBe(true);
    expect(r["matches"]).toBe(false); // differences exist and stay visible
    const ex = (r["exceptions"] as { exception: string; entryId?: string; accountId?: string }[]).map((x) => `${x.exception}:${x.entryId ?? x.accountId}`).sort();
    expect(ex).toEqual([`account_opening_balance:${ACC.P1}`, `duplicate_source:${e(22)}`, `no_account:${e(20)}`, `opening_without_evidence:${e(2)}`, `unclassified_adjustment:${e(19)}`].sort());
    // every other (entity, account, currency, period) row matches exactly
    const rows = r["rows"] as Diff[];
    expect(rows.filter((x) => x.difference === 0).length).toBeGreaterThanOrEqual(12);
    expect(rows.every((x) => x.difference === 0 || diffs.some((d) => d.acc === x.accountId && d.period === x.period))).toBe(true);
  });

  it("exception entries remain in the legacy ledger untouched (no fabricated balancing line)", async () => {
    const n = first(await q<{ n: number }>(db, "SELECT count(*)::int n FROM public.expenses WHERE id = ANY($1::uuid[])", [[...NOT_POSTED]])).n;
    expect(n).toBe(NOT_POSTED.size);
    const susp = first(await q<{ n: number }>(db, "SELECT count(*)::int n FROM public.posting_lines WHERE owner_id = $1 AND (code ILIKE '%suspense%' OR code ILIKE '%unclassified%')", [U.O])).n;
    expect(susp).toBe(0);
  });
});
