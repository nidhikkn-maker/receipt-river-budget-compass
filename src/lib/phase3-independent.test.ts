// @vitest-environment node
// Phase 3 independent financial reconciliation (requirement 10 + completion item 9). A realistic
// multi-entity (two companies + personal books), multi-currency (INR/USD/EUR) owner ledger is converted
// through the PROPOSED P7 r2 posting layer (with P6 registers and P8 depreciation) in isolated PGlite, and
// then corrected and extended through the real database functions: an audited reversal on a correction
// date (decision 1/2), a reversed linked transfer, an approved prior-period adjustment against a closed
// period, employee / insurance / inter-party claims, an advance with its claim and return, a bounced
// money-back entry, card payments with a lost-response retry, and approved asset depreciation.
// The expected journal is computed HERE, independently of the SQL:
//   (1) a separate TypeScript double-entry model written from the accounting rules in the plan, in integer
//       paise, per legal entity, month and code (so correction dates are checked, not only totals);
//   (2) the app's own ledger.ts (ledgerView + accountBalance) over the stored rows, for every account;
//   (3) the database's own legacy reader (posting_reconciliation_report, legacy side).
// All must agree with the posted journal to the paisa; every report reader reads the same records.
import { describe, it, expect, beforeAll } from "vitest";
import { accountBalance, cashflow, ledgerView, txnFromRow, type Account, type AccountKind, type LedgerRow } from "./ledger";
import { actAs } from "../test/full-schema-pglite";
import {
  ACC, C1, C2, DIR, INSERT_EXPENSE, LEDGER, T, U, activate, as, e, entityId, exParams, first, id, personalKey, q, seededDb, setClosedPeriods, stepUp, type Db, type Ex,
} from "../test/phase3-fixture";

const P5B = `${DIR}P5b_restore_investments.sql`, P6 = `${DIR}P6_registers.sql`, P7 = `${DIR}P7_balanced_posting.sql`, P8 = `${DIR}P8_asset_depreciation_posting.sql`;
const PERSONAL = personalKey(U.O);
const FA1 = id(161); // Alpha fixed assets (C1)
const KIND: Record<string, AccountKind> = {
  [ACC.A1]: "current", [ACC.A2]: "credit_card", [ACC.B1]: "current", [ACC.P1]: "savings", [ACC.P2]: "credit_card",
  [ACC.P3]: "wallet", [ACC.L1]: "loan", [ACC.I1]: "investment", [FA1]: "other_asset",
};
const ENTITY_OF: Record<string, string> = { [ACC.A1]: C1, [ACC.A2]: C1, [ACC.B1]: C2, [ACC.P1]: PERSONAL, [ACC.P2]: PERSONAL, [ACC.P3]: PERSONAL, [ACC.L1]: PERSONAL, [ACC.I1]: PERSONAL, [FA1]: C1 };
/** Seed entries that must NOT post (each a listed exception) and the statement counterpart row. */
const NOT_POSTED = new Set([e(2), e(19), e(20), e(22), e(24)]);

// ---- (1) independent double-entry model, in integer paise, keyed entity|month|code ----
const paise = (n: number) => Math.round(n * 100);
type Leg = { ent: string; code: string; p: number };
type Batch = { date: string; legs: Leg[] };
const model = new Map<string, Batch[]>(); // event -> its batches (as posted, for reversals)
function book(event: string, date: string, legs: Leg[]) { (model.get(event) ?? model.set(event, []).get(event)!).push({ date, legs: legs.filter((l) => l.p !== 0) }); }
function reverseModel(event: string, date: string) { for (const b of [...(model.get(event) ?? [])]) book(event, date, b.legs.map((l) => ({ ...l, p: -l.p }))); }
const L = (ent: string, code: string, p: number): Leg => ({ ent, code, p });
/** One ledger entry by the plan's rules (expense/income/refund, moves, loan interest, openings, claims, advances). */
function modelEntry(x: Ex & { claimOf?: string; claimEntity?: string }) {
  const t = x.type ?? "expense", a = paise(x.amount);
  const acc = x.acc ? `account:${x.acc}` : "", to = x.to ? `account:${x.to}` : "";
  const ea = x.acc ? ENTITY_OF[x.acc]! : PERSONAL, eb = x.to ? ENTITY_OF[x.to]! : PERSONAL;
  const owner = x.manual ?? ea; // effective entity: hand-picked company wins, else the paying account's
  const ev = `entry:${x.id}`;
  if (t === "expense" || t === "income" || t === "refund") {
    const out = t === "expense";
    const parts = x.allocations?.length ? x.allocations : [{ category: x.category ?? "General", amount: x.amount }];
    const legs = [L(ea, acc, out ? -a : a), ...parts.map((p) => L(owner, `${t === "income" ? "income" : "expense"}:${p.category}`, out ? paise(p.amount) : -paise(p.amount)))];
    if (owner !== ea) legs.push(L(ea, `due:${owner}`, out ? a : -a), L(owner, `due:${ea}`, out ? -a : a));
    book(ev, x.date, legs);
    // decision 4: a tracked claim recognises receivable + separate recovery; the gross expense stays
    const r = x.reimb as { kind?: string; reimbursable?: number; stage?: string; receipts?: { amount: number }[] } | undefined;
    if (out && r && (x.reimbStatus ?? "none") !== "none") {
      const got = (r.receipts ?? []).reduce((s, q) => s + q.amount, 0);
      const rec = paise(r.stage === "rejected" || r.stage === "written_off" ? Math.min(got, r.reimbursable ?? x.amount) : Math.min(x.amount, r.reimbursable ?? x.amount));
      const kind = r.kind ?? "claim";
      book(`claim:${x.id}`, x.date, [L(owner, kind === "advance" ? "advance:received" : `receivable:claim:${x.id}`, rec), L(owner, `recovery:${kind}:${x.category}`, -rec)]);
    }
  } else if (t === "reimbursement") { // settles the claim receivable (in the claim's entity)
    const ce = x.claimEntity ?? PERSONAL;
    const legs = [L(ea, acc, a), L(ce, `receivable:claim:${x.claimOf}`, -a)];
    if (ce !== ea) legs.push(L(ea, `due:${ce}`, -a), L(ce, `due:${ea}`, a));
    book(ev, x.date, legs);
  } else if (t === "advance" || t === "advance_settlement") {
    const s = t === "advance" ? 1 : -1;
    book(ev, x.date, [L(ea, acc, s * a), L(ea, "advance:received", -s * a)]);
  } else if (t === "adjustment") { // the evidence-backed opening, or approved depreciation (P8)
    if (x.category === "Depreciation") book(ev, x.date, [L(ea, "expense:Depreciation", a), L(ea, acc, -a)]);
    else book(ev, x.date, [L(ea, acc, a), L(ea, "equity:opening:2026-27", -a)]);
  } else {
    const interest = t === "loan_repayment" && x.interest != null ? Math.round((a * x.interest) / (x.orig ?? x.amount)) : 0;
    const legs = [L(ea, acc, -a), L(eb, to, a - interest), L(eb, "expense:Loan interest", interest)];
    if (ea !== eb) legs.push(L(ea, `due:${eb}`, a), L(eb, `due:${ea}`, -a));
    book(ev, x.date, legs);
  }
}
type Tb = Record<string, Record<string, number>>;
function fold(byMonth: boolean): Tb {
  const tb: Tb = {};
  for (const bs of model.values()) for (const b of bs) for (const l of b.legs) {
    const k = byMonth ? `${l.ent}|${b.date.slice(0, 7)}` : l.ent;
    const m = (tb[k] ??= {});
    m[l.code] = (m[l.code] ?? 0) + l.p;
    if (m[l.code] === 0) delete m[l.code];
  }
  for (const k of Object.keys(tb)) if (!Object.keys(tb[k]!).length) delete tb[k];
  return tb;
}

let db: Db;
let ids: Record<string, string>;
const CLOSED = [{ id: "c2-jun", from: "2026-06-01", to: "2026-06-30", entityId: C2 }];
const PPA_LINES = [{ code: "expense:Audit fees", role: "expense", debit: 1500, credit: 0 }, { code: "payable:Auditor", role: "liability", debit: 0, credit: 1500 }];
const NEW: Record<string, Ex & { claimOf?: string; claimEntity?: string }> = {
  party: { id: id(9201), acc: ACC.P2, date: "2026-07-02", amount: 3000, category: "Dining", title: "Group dinner", reimb: { kind: "party", payer: "Ravi", reimbursable: 1500, receipts: [] }, reimbStatus: "pending" },
  insurance: { id: id(9202), acc: ACC.P2, date: "2026-07-03", amount: 2000, category: "Medical", title: "Hospital", reimb: { kind: "insurance", payer: "Star Health", reimbursable: 1500, receipts: [] }, reimbStatus: "pending" },
  advance: { id: id(9203), acc: ACC.P1, date: "2026-07-04", amount: 10000, type: "advance", category: "Travel advance", title: "Advance from Alpha" },
  advClaim: { id: id(9204), acc: ACC.P1, date: "2026-07-06", amount: 7000, category: "Travel", title: "Client visit", reimb: { kind: "advance", payer: "Alpha", reimbursable: 7000, receipts: [] }, reimbStatus: "pending" },
  advReturn: { id: id(9205), acc: ACC.P1, date: "2026-07-08", amount: 3000, type: "advance_settlement", category: "Advance return", title: "Unused advance returned" },
};
const CARD1 = id(9301), CARD2 = id(9302), REV_RENT = id(9401), REV_TRF = id(9402), BOUNCE = id(9403), PPA = id(9404), DEP = id(9405);
let receipts: Record<string, string> = {};
let rows: (LedgerRow & Record<string, unknown>)[] = [];
let journal: { k: string; m: string; code: string; s: string }[] = [];
const toTb = (byMonth: boolean): Tb => {
  const rev = Object.fromEntries(Object.entries(ids).map(([k, v]) => [v, k]));
  const out: Tb = {};
  for (const r of journal) {
    const code = r.code.startsWith("due:") ? `due:${rev[r.code.slice(4)] ?? r.code.slice(4)}` : r.code;
    const k = byMonth ? `${r.k}|${r.m}` : r.k;
    const m = (out[k] ??= {});
    m[code] = (m[code] ?? 0) + paise(Number(r.s));
    if (m[code] === 0) delete m[code];
  }
  for (const k of Object.keys(out)) if (!Object.keys(out[k]!).length) delete out[k];
  return out;
};

describe("Phase 3 independent reconciliation after corrections, claims, card payments and depreciation", () => {
  beforeAll(async () => {
    db = await seededDb([P5B, P6, P7, P8]);
    ids = { [C1]: await entityId(db, U.O, C1), [C2]: await entityId(db, U.O, C2), [PERSONAL]: await entityId(db, U.O, PERSONAL) };
    // seed claim e15 is settled by e16 (fixture); a C1 asset with its ledger asset account
    await actAs(db, null);
    await q(db, "INSERT INTO public.accounts(id, owner_id, name, kind) VALUES ($1,$2,'Alpha fixed assets','other_asset')", [FA1, U.O]);
    await q(db, "UPDATE public.finance_preferences SET data = jsonb_set(jsonb_set(data, '{assets}', $2::jsonb), ('{books,entityAccounts,' || $3 || '}')::text[], (data->'books'->'entityAccounts'->$3) || to_jsonb($4::text)) WHERE owner_id = $1",
      [U.O, JSON.stringify([{ id: "ast-laptop", name: "Design laptop", kind: "computer", cost: 120000, inUse: "2026-04-01", ownerEntityId: C1, sharePct: 100, bookMethod: "slm", bookRatePct: 0, usefulLifeYears: 5, accountId: FA1 }]), C1, FA1]);
    const r = await activate(db, U.O);
    expect(r["entriesPosted"]).toBe(LEDGER.length - NOT_POSTED.size);
    // ---- corrections and new events through the real database functions ----
    await as(db, U.O, async () => {
      for (const x of Object.values(NEW)) await q(db, INSERT_EXPENSE, exParams(x));
      for (const [op, claim, amount, date] of [["party-1", NEW["party"]!.id, 1500, "2026-07-09"], ["ins-1", NEW["insurance"]!.id, 500, "2026-07-10"]] as const) {
        await q(db, "SELECT public.finance_operation('claim_receipt', $1::jsonb)", [JSON.stringify({ operationId: op, id: claim, amount, date, accountId: ACC.P1 })]);
      }
      // card payments: the first response is "lost" and the person retries with the same id
      for (const [req, amount, date] of [[CARD1, 6000, "2026-07-20"], [CARD1, 6000, "2026-07-20"], [CARD2, 1500, "2026-07-21"]] as const) {
        await q(db, "SELECT public.record_card_payment($1,$2,$3,$4,$5,'Card bill')", [req, ACC.P1, ACC.P2, amount, date]);
      }
      // approved depreciation (the app's Approve & add): entry first, then the journal marked posted
      await q(db, INSERT_EXPENSE, exParams({ id: DEP, acc: FA1, date: "2026-05-31", amount: 2000, type: "adjustment", adjSign: -1, category: "Depreciation", title: "Depreciation · Design laptop · 2026-05", tags: ["depreciation"] }));
    });
    await actAs(db, null);
    await q(db, "UPDATE public.finance_preferences SET data = jsonb_set(data, '{books,journals}', $2::jsonb) WHERE owner_id = $1",
      [U.O, JSON.stringify([{ id: "j-l-05", assetId: "ast-laptop", period: "2026-05", amount: 2000, kind: "book", status: "posted", postedOn: "2026-06-02", transactionId: DEP }])]);
    receipts = Object.fromEntries((await q<{ id: string; t: string }>(db, "SELECT id::text, reimbursement->'receipts'->0->>'txnId' t FROM public.expenses WHERE id = ANY($1::uuid[])", [[NEW["party"]!.id, NEW["insurance"]!.id]])).map((x) => [x.id, x.t]));
    // decision 1+2: reverse April rent (C1) and the personal card bill transfer on July correction dates; bounce the party money back
    await as(db, U.O, async () => {
      await stepUp(db, U.O); await q(db, "SELECT public.reverse_ledger_entry($1,$2,'Rent belonged to Beta','2026-07-15')", [REV_RENT, e(3)]);
      await stepUp(db, U.O); await q(db, "SELECT public.reverse_ledger_entry($1,$2,'Card bill paid from the wrong account','2026-07-16')", [REV_TRF, e(23)]);
      await stepUp(db, U.O); await q(db, "SELECT public.reverse_ledger_entry($1,$2,'Ravi''s transfer bounced','2026-07-22')", [BOUNCE, receipts[NEW["party"]!.id]]);
    });
    // decision 2: June closes for Beta; an approved prior-period adjustment posts in July
    await setClosedPeriods(db, U.O, CLOSED);
    await as(db, U.O, async () => {
      await q(db, "SELECT public.submit_posting_request($1,'prior_period_adjustment',$2::jsonb,'Audit fee accrual missed at close')",
        [PPA, JSON.stringify({ entityId: ids[C2], periodId: "c2-jun", correctionDate: "2026-07-31", lines: PPA_LINES, memo: "June audit fee accrual", sources: [] })]);
      await stepUp(db, U.O); await q(db, "SELECT public.decide_posting_request($1,'approve','')", [PPA]);
    });
    // ---- the independent model of everything above ----
    for (const x of LEDGER) if (!NOT_POSTED.has(x.id)) modelEntry(x.id === e(16) ? { ...x, claimOf: e(15) } : x);
    for (const x of Object.values(NEW)) modelEntry(x);
    modelEntry({ id: receipts[NEW["party"]!.id]!, acc: ACC.P1, date: "2026-07-09", amount: 1500, type: "reimbursement", claimOf: NEW["party"]!.id });
    modelEntry({ id: receipts[NEW["insurance"]!.id]!, acc: ACC.P1, date: "2026-07-10", amount: 500, type: "reimbursement", claimOf: NEW["insurance"]!.id });
    modelEntry({ id: CARD1, acc: ACC.P1, to: ACC.P2, date: "2026-07-20", amount: 6000, type: "card_payment" }); // once, despite the retry
    modelEntry({ id: CARD2, acc: ACC.P1, to: ACC.P2, date: "2026-07-21", amount: 1500, type: "card_payment" });
    modelEntry({ id: DEP, acc: FA1, date: "2026-05-31", amount: 2000, type: "adjustment", category: "Depreciation" });
    reverseModel(`entry:${e(3)}`, "2026-07-15");
    reverseModel(`entry:${e(23)}`, "2026-07-16");
    reverseModel(`entry:${receipts[NEW["party"]!.id]}`, "2026-07-22"); // the claim stays recognised: 1,500 receivable again
    book(`journal:${PPA}`, "2026-07-31", [L(C2, "expense:Audit fees", paise(1500)), L(C2, "payable:Auditor", -paise(1500))]);
    // ---- what the database holds ----
    await actAs(db, null);
    journal = await q(db, `SELECT le.entity_key k, to_char(b.posting_date, 'YYYY-MM') m, l.code, l.signed_amount::text s FROM public.posting_lines l
      JOIN public.posting_batches b ON b.id = l.batch_id JOIN public.legal_entities le ON le.id = b.legal_entity_id WHERE b.owner_id = $1`, [U.O]);
    // rows exactly as the API serialises them (dates as YYYY-MM-DD strings)
    rows = (await q<{ j: LedgerRow & Record<string, unknown> }>(db, "SELECT to_jsonb(x) j FROM public.expenses x WHERE employee_id = $1", [U.O])).map((r) => r.j);
  }, T);

  it("posted journal = the independent model, per legal entity, MONTH and code (correction dates included)", () => {
    expect(toTb(true)).toEqual(fold(true));
    expect(toTb(false)).toEqual(fold(false));
  });

  it("decision 1: every reversed original is still in the working ledger, with exactly one linked reversal row", () => {
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const [orig, date] of [[e(3), "2026-07-15"], [e(23), "2026-07-16"], [receipts[NEW["party"]!.id]!, "2026-07-22"]] as const) {
      expect(byId.has(orig)).toBe(true);
      const rv = rows.filter((r) => r["reverses_entry_id"] === orig);
      expect(rv.map((r) => String(r.expense_date))).toEqual([date]);
    }
    expect(rows.filter((r) => r.txn_type === "card_payment" && r.id === CARD1)).toHaveLength(1); // retry recorded once
  });

  it("every legal entity balances; inter-entity balances eliminate; hand-checked figures", () => {
    const tb = toTb(false);
    for (const [ent, codes] of Object.entries(tb)) expect([ent, Object.values(codes).reduce((s, n) => s + n, 0)]).toEqual([ent, 0]);
    expect(tb[C1]![`due:${PERSONAL}`]).toBe(-(tb[PERSONAL]![`due:${C1}`] ?? 0));
    expect(tb[C1]!["expense:Rent"]).toBeUndefined(); // April rent reversed in July
    expect(tb[C1]![`account:${ACC.A1}`]).toBe(paise(100000 + 200000 - 10020 - 40000)); // rent back
    expect(tb[PERSONAL]!["expense:Medical"]).toBe(paise(1200 + 2000)); // gross preserved
    expect(tb[PERSONAL]!["recovery:employer:Medical"]).toBe(-paise(1200));
    expect(tb[PERSONAL]!["recovery:insurance:Medical"]).toBe(-paise(1500));
    expect(tb[PERSONAL]![`receivable:claim:${NEW["insurance"]!.id}`]).toBe(paise(1000)); // 500 of 1,500 received
    expect(tb[PERSONAL]![`receivable:claim:${NEW["party"]!.id}`]).toBe(paise(1500)); // money back bounced: owed again
    expect(tb[PERSONAL]!["advance:received"]).toBeUndefined(); // 10,000 - 7,000 claimed - 3,000 returned
    expect(Object.keys(tb[PERSONAL]!).filter((c) => c.startsWith("income:") && /Reimb|Medical|Travel|advance/i.test(c))).toEqual([]); // never income
    expect(tb[C1]!["expense:Depreciation"]).toBe(paise(2000));
    expect(tb[C1]![`account:${FA1}`]).toBe(-paise(2000));
    expect(tb[C2]!["payable:Auditor"]).toBe(-paise(1500)); // prior-period adjustment posted in July
  });

  it("the prior-period adjustment never changes the closed June: June as closed + the July adjustment, reported separately", async () => {
    const byMonth = toTb(true);
    expect(byMonth[`${C2}|2026-06`]?.["expense:Audit fees"]).toBe(paise(7500));
    expect(byMonth[`${C2}|2026-07`]?.["expense:Audit fees"]).toBe(paise(1500));
    const rep = first(await as(db, U.O, () => q<{ r: { periods: { periodId: string; entityKey: string; asClosed: Record<string, string>; restated: Record<string, string> }[] } }>(db, "SELECT public.prior_period_adjustment_report() r"))).r;
    const jun = rep.periods.find((p) => p.periodId === "c2-jun" && p.entityKey === C2)!;
    expect(paise(Number(jun.asClosed["expense:Audit fees"]))).toBe(paise(7500));
    expect(paise(Number(jun.restated["expense:Audit fees"]))).toBe(paise(9000));
  });

  it("account lines = the app's own ledger.ts balances (ledgerView over the stored rows) for every account, to the paisa", () => {
    const txns = ledgerView(rows.filter((r) => !NOT_POSTED.has(r.id)).map(txnFromRow));
    const tb = toTb(false);
    for (const [acc, kind] of Object.entries(KIND)) {
      const a: Account = { id: acc, name: acc, kind, openingBalance: 0, archived: false };
      const liability = kind === "credit_card" || kind === "loan";
      const j = tb[ENTITY_OF[acc]!]?.[`account:${acc}`] ?? 0;
      expect([acc, (liability ? -j : j) + 0]).toEqual([acc, paise(accountBalance(a, txns)) + 0]);
    }
  });

  it("the database's legacy reader (reconciliation report) agrees with ledger.ts for every account; only the 3 seeded differences remain, explained", async () => {
    const r = first(await as(db, U.O, () => q<{ r: { rows: { accountId: string; period: string; legacy: number }[]; differences: { accountId: string; period: string; explained: boolean }[]; balanced: boolean } }>(db, "SELECT public.posting_reconciliation_report() r"))).r;
    const all = ledgerView(rows.map(txnFromRow)); // every stored row, exceptions included (what the app shows)
    for (const [acc, kind] of Object.entries(KIND)) {
      const legacy = r.rows.filter((x) => x.accountId === acc && x.period !== "opening").reduce((s, x) => s + paise(Number(x.legacy)), 0);
      const liability = kind === "credit_card" || kind === "loan";
      expect([acc, (liability ? -legacy : legacy) + 0]).toEqual([acc, paise(accountBalance({ id: acc, name: acc, kind, openingBalance: 0, archived: false }, all)) + 0]);
    }
    expect(r.balanced).toBe(true);
    expect(r.differences.map((d) => `${d.accountId}|${d.period}|${d.explained}`).sort()).toEqual([`${ACC.B1}|2026-04|true`, `${ACC.P1}|2026-06|true`, `${ACC.P1}|opening|true`].sort());
  });

  it("income and spending: the app's cash view and the journal's accrual view differ only by the explained claim timing", () => {
    const txns = ledgerView(rows.filter((r) => !NOT_POSTED.has(r.id)).map(txnFromRow));
    const app = cashflow(txns);
    const tb = toTb(false);
    const sum = (pred: (c: string) => boolean) => Object.values(tb).flatMap((m) => Object.entries(m)).filter(([c]) => pred(c)).reduce((s, [, n]) => s + n, 0);
    const journalCost = sum((c) => c.startsWith("expense:") || c.startsWith("recovery:"));
    const outstanding = sum((c) => c.startsWith("receivable:claim:"));        // recognised, not yet received
    const advanceClaims = -sum((c) => c.startsWith("recovery:advance:"));     // costs settled against an advance
    // the depreciation and the prior-period accrual are non-cash journal costs the cash view never shows
    expect(paise(app.spent)).toBe(journalCost + outstanding + advanceClaims - paise(2000) - paise(1500));
    expect(paise(app.income)).toBe(-sum((c) => c.startsWith("income:")));
  });

  it("multi-currency source facts are preserved on the batches; lines are functional INR", async () => {
    await actAs(db, null);
    const fx = await q<{ e: string; c: string; a: string; r: string }>(db, `SELECT ev.source_entry_id::text e, b.source_currency c, (b.source_amount::numeric(20,2))::text a, (b.fx_rate::numeric(20,4))::text r
      FROM public.posting_batches b JOIN public.posting_events ev ON ev.id = b.event_id WHERE b.owner_id = $1 AND ev.source_entry_id = $2 AND b.kind = 'entry'`, [U.O, e(4)]);
    expect(fx).toEqual([{ e: e(4), c: "USD", a: "120.00", r: "83.5000" }]);
    expect(new Set(journal.map((x) => x.code)).size).toBeGreaterThan(20);
    const cur = await q<{ c: string }>(db, "SELECT DISTINCT currency c FROM public.posting_lines WHERE owner_id = $1", [U.O]);
    expect(cur).toEqual([{ c: "INR" }]);
  });

  it("exception entries remain in the ledger untouched; no suspense or fabricated balancing line", async () => {
    await actAs(db, null);
    expect(first(await q<{ n: number }>(db, "SELECT count(*)::int n FROM public.expenses WHERE id = ANY($1::uuid[])", [[...NOT_POSTED]])).n).toBe(NOT_POSTED.size);
    expect(first(await q<{ n: number }>(db, "SELECT count(*)::int n FROM public.posting_lines WHERE owner_id = $1 AND (code ILIKE '%suspense%' OR code ILIKE '%unclassified%')", [U.O])).n).toBe(0);
  });
});
