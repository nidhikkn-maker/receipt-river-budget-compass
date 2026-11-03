import type { EmiTarget } from "../emi-match";
// One change plan for a whole upload: what saves itself, what must be asked, what waits (pure, tested).
import { accountBalance, isLiability, type Account } from "../ledger";
import { money, type Expense } from "../expenses";
import type { CategorySetting } from "../preferences";
import type { StatementContext } from "../statement-auto";
import { classifyMissing, type LineDecision } from "./classify";
import { isOut, ledgerRec, matchLines, recordsNotMatched, type LedgerRec, type MatchOutcome } from "./match";
import { balanceAddsUp, projectBalance, totals, type AccountHint, type StmtFile, type StmtLine } from "./line";

export interface Gate { net: number; after: number; difference: number | null; ok: boolean }

/** Everything one statement file would change, grouped by what still needs a person. */
export interface AccountPlan {
  file: StmtFile;
  accountId: string | null;
  name: string;
  isNew: boolean;
  hint: AccountHint | null;
  liability: boolean;
  appBalance: number | null;
  /** Null when the file prints no closing figure, so nothing can be verified against it. */
  gate: Gate | null;
  /** The account already has entries newer than this statement, so its closing balance can't be compared with the app. */
  newerEntries: boolean;
  /** Postings are held because the app's balance doesn't reach the statement's printed closing figure. */
  gateHeld: boolean;
  matched: MatchOutcome[];
  wrongKind: MatchOutcome[];
  auto: LineDecision[];
  ask: LineDecision[];
  later: { line: StmtLine; reason: string }[];
  /** Lines missing here that exactly one unconfirmed record on another account explains: offered as a move, never posted twice. */
  elsewhere: { line: StmtLine; record: LedgerRec; accountName: string }[];
  /** Records on this account no uploaded statement explains. */
  unexplained: LedgerRec[];
}

export interface StatementPlan {
  accounts: AccountPlan[];
  totals: { files: number; lines: number; matched: number; wrongKind: number; auto: number; ask: number; later: number; unexplained: number };
}

const periodOf = (lines: StmtLine[]) => {
  const dates = lines.map((l) => l.date).sort();
  return { from: dates[0] ?? null, to: dates[dates.length - 1] ?? null };
};

/**
 * Reads every uploaded file against the ledger and says what would happen.
 * Nothing is posted here: an account whose balance check fails has every posting held.
 */
export function buildPlan(files: StmtFile[], accounts: Account[], transactions: Expense[], categories: CategorySetting[], emiTargets: EmiTarget[] = []): StatementPlan {
  const live = accounts.filter((a) => !a.archived);
  const first = files.map((file) => {
    const acct = live.find((a) => a.id === file.accountId) ?? null;
    const { from, to } = periodOf(file.lines);
    const records = acct
      ? transactions
        .filter((e) => !e.transferCounterpartOf && (e.accountId === acct.id || e.toAccountId === acct.id) && (!from || e.date >= from) && (!to || e.date <= to))
        .map(ledgerRec)
      : [];
    const outcomes = matchLines(file.lines, records, 3, acct?.id ?? null);
    const missing = outcomes.filter((o) => o.result === "missing").map((o) => o.line);
    return { file, acct, records, outcomes, missing };
  });

  const accounts2: AccountPlan[] = first.map((f, index) => {
    const ctx: StatementContext = { transactions, accounts: live, categories, accountId: f.acct?.id ?? null, currency: f.file.currency, emiTargets };
    const otherMissing = first.filter((_, i) => i !== index).flatMap((o) => o.missing);
    const claimed = new Set(first.flatMap((o) => o.outcomes.flatMap((x) => (x.record ? [x.record.id] : []))));
    const elsewhere: AccountPlan["elsewhere"] = [];
    const used = new Set<string>();
    const stillMissing = f.acct ? f.missing.filter((line) => {
      const out = line.direction === "debit";
      const hits = transactions.filter((t) => !t.transferCounterpartOf && !t.reconciledAt && !t.statementRef && t.accountId && t.accountId !== f.acct!.id && !t.toAccountId && !claimed.has(t.id) && !used.has(t.id)
        && t.currency === line.currency && Math.abs((t.originalAmount ?? t.amount) - line.amount) < 0.005 && Math.abs(Date.parse(t.date) - Date.parse(line.date)) <= 3 * 86400000
        && isOut(t.txnType ?? "expense") === out);
      if (hits.length !== 1) return true;
      const t = hits[0]!;
      used.add(t.id);
      elsewhere.push({ line, record: ledgerRec(t), accountName: live.find((a) => a.id === t.accountId)?.name ?? "another account" });
      return false;
    }) : f.missing;
    const decisions = classifyMissing(stillMissing, otherMissing, ctx);

    const gate = f.acct ? projectBalance(accountBalance(f.acct, transactions), decisions.map((d) => d.line), f.file.closing, isLiability(f.acct.kind)) : null;
    let auto = decisions.filter((d) => d.group === "auto");
    let ask = decisions.filter((d) => d.group === "ask");
    const later: { line: StmtLine; reason: string }[] = [];
    const liability = f.acct ? isLiability(f.acct.kind) : f.file.hint?.kind === "credit_card";
    // Does the file's own arithmetic hold? A file whose printed figures contradict each other was probably misread.
    const selfCheck = balanceAddsUp(f.file.opening, f.file.closing, f.file.lines, liability);
    const selfOk = selfCheck === 0;
    // A statement that ends before the account's newest entry can't be compared with today's balance.
    const lastDate = f.file.lines.reduce((m, l) => (l.date > m ? l.date : m), "");
    const newerEntries = !!f.acct && lastDate !== "" && transactions.some((t) => !t.transferCounterpartOf && (t.accountId === f.acct!.id || t.toAccountId === f.acct!.id) && t.date > lastDate);
    const verifiable = gate !== null && gate.difference !== null && !newerEntries;
    let gateHeld = false;

    if (selfCheck !== null && !selfOk) {
      const reason = `The statement's own figures don't add up — its opening balance, ${totals(f.file.lines).count} entries and printed closing balance are off by ${money(Math.abs(selfCheck))}. The file may not have been read correctly, so nothing from it is posted.`;
      for (const d of [...auto, ...ask]) later.push({ line: d.line, reason });
      auto = [];
      ask = [];
    } else if (verifiable && gate && !gate.ok) {
      gateHeld = true;
      const reason = `Balance check failed — after these postings the app would show ${money(gate.after)}, the statement says ${money(gate.after + gate.difference!)} (off by ${money(Math.abs(gate.difference!))}). Fix the account's starting balance or move wrong-account records first.`;
      for (const d of [...auto, ...ask]) later.push({ line: d.line, reason });
      auto = [];
      ask = [];
    } else if (!selfOk && !verifiable) {
      // Nothing printed adds up and the app can't be compared with it: ask rather than save itself.
      ask = [...ask, ...auto.map((d) => ({ ...d, group: "ask" as const, reason: `${d.reason} · no printed closing balance to check against` }))];
      auto = [];
    }

    return {
      file: f.file,
      accountId: f.acct?.id ?? null,
      name: f.acct?.name ?? f.file.hint?.name ?? "New account",
      isNew: !f.acct,
      hint: f.file.hint,
      liability: f.acct ? isLiability(f.acct.kind) : f.file.hint?.kind === "credit_card",
      appBalance: f.acct ? accountBalance(f.acct, transactions) : null,
      gate,
      newerEntries,
      gateHeld,
      matched: f.outcomes.filter((o) => o.result === "matched"),
      wrongKind: f.outcomes.filter((o) => o.result === "wrong_kind"),
      auto,
      ask,
      later,
      elsewhere,
      unexplained: f.acct ? recordsNotMatched(f.records, f.outcomes).filter((r) => !r.reconciledAt) : [],
    };
  });

  const count = (pick: (a: AccountPlan) => number) => accounts2.reduce((s, a) => s + pick(a), 0);
  return {
    accounts: accounts2,
    totals: {
      files: files.length,
      lines: count((a) => totals(a.file.lines).count),
      matched: count((a) => a.matched.length),
      wrongKind: count((a) => a.wrongKind.length),
      auto: count((a) => a.auto.length),
      ask: count((a) => a.ask.length),
      later: count((a) => a.later.length),
      unexplained: count((a) => a.unexplained.length),
    },
  };
}
