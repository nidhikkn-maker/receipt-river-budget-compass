// One change plan for a whole upload: what saves itself, what must be asked, what waits (pure, tested).
import { accountBalance, isLiability, type Account } from "../ledger";
import { money, type Expense } from "../expenses";
import type { CategorySetting } from "../preferences";
import type { StatementContext } from "../statement-auto";
import { classifyMissing, type LineDecision } from "./classify";
import { ledgerRec, matchLines, recordsNotMatched, type LedgerRec, type MatchOutcome } from "./match";
import { projectBalance, totals, type AccountHint, type StmtFile, type StmtLine } from "./line";

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
  matched: MatchOutcome[];
  wrongKind: MatchOutcome[];
  auto: LineDecision[];
  ask: LineDecision[];
  later: { line: StmtLine; reason: string }[];
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
export function buildPlan(files: StmtFile[], accounts: Account[], transactions: Expense[], categories: CategorySetting[]): StatementPlan {
  const live = accounts.filter((a) => !a.archived);
  const first = files.map((file) => {
    const acct = live.find((a) => a.id === file.accountId) ?? null;
    const { from, to } = periodOf(file.lines);
    const records = acct
      ? transactions
        .filter((e) => !e.transferCounterpartOf && (e.accountId === acct.id || e.toAccountId === acct.id) && (!from || e.date >= from) && (!to || e.date <= to))
        .map(ledgerRec)
      : [];
    const outcomes = matchLines(file.lines, records);
    const missing = outcomes.filter((o) => o.result === "missing").map((o) => o.line);
    return { file, acct, records, outcomes, missing };
  });

  const accounts2: AccountPlan[] = first.map((f, index) => {
    const ctx: StatementContext = { transactions, accounts: live, categories, accountId: f.acct?.id ?? null, currency: f.file.currency };
    const otherMissing = first.filter((_, i) => i !== index).flatMap((o) => o.missing);
    const decisions = classifyMissing(f.missing, otherMissing, ctx);

    const gate = f.acct ? projectBalance(accountBalance(f.acct, transactions), decisions.map((d) => d.line), f.file.closing, isLiability(f.acct.kind)) : null;
    let auto = decisions.filter((d) => d.group === "auto");
    let ask = decisions.filter((d) => d.group === "ask");
    const later: { line: StmtLine; reason: string }[] = [];
    // A file that prints no closing figure (CSV exports, wallet statements) has nothing to verify against.
    const verifiable = gate !== null && gate.difference !== null;

    if (verifiable && gate && !gate.ok) {
      const reason = `Balance check failed — after these postings the app would show ${money(gate.after)}, the statement says ${money(gate.after + gate.difference!)} (off by ${money(Math.abs(gate.difference!))}). Fix the account's starting balance or move wrong-account records first.`;
      for (const d of [...auto, ...ask]) later.push({ line: d.line, reason });
      auto = [];
      ask = [];
    } else if (!verifiable) {
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
      matched: f.outcomes.filter((o) => o.result === "matched"),
      wrongKind: f.outcomes.filter((o) => o.result === "wrong_kind"),
      auto,
      ask,
      later,
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
