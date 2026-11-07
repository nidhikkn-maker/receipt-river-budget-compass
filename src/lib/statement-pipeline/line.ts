// The one statement-line model every statement flow speaks (pure, tested).
// Bank-specific parsers convert into this shape; matching, planning and posting only ever see it.
import type { AccountKind } from "../ledger";
import type { BalanceLine } from "../statement-crosscheck";
import type { ForexWallet } from "../forex-statement";
import type { StatementLine } from "../expenses";

export type Dir = "debit" | "credit";

/** One printed statement line, whichever bank the file came from. */
export interface StmtLine {
  /** Stable within one upload: file name + position. */
  key: string;
  file: string;
  date: string;
  /** Always positive, in the line's own currency. */
  amount: number;
  direction: Dir;
  /** Running balance printed after this line, when the bank shows one. */
  balance: number | null;
  description: string;
  currency: string;
}

/** What a statement says about its own account, before any ledger lookup. */
export interface AccountHint {
  name: string;
  kind: AccountKind;
  issuer: string;
  lastFour: string | null;
  /** Full printed account number, IFSC and holder — only from labelled header lines. */
  number?: string;
  ifsc?: string;
  holder?: string;
  /** Owner's choice for which company owns the account: "" personal, an entity id, or "__new" (create from holder name). */
  entityChoice?: string;
}

/** One parsed statement file (a forex file can yield one file per currency wallet). */
export interface StmtFile {
  name: string;
  /** Existing ledger account this statement belongs to; null when the app has never seen it. */
  accountId: string | null;
  hint: AccountHint | null;
  currency: string;
  opening: number | null;
  closing: number | null;
  lines: StmtLine[];
  /** Read from a scan on the server; every line is a suggestion until the person confirms it. */
  scanned?: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const key = (file: string, i: number) => `${file}#${i}`;

export function fromBalanceLines(file: string, lines: BalanceLine[], currency = "INR"): StmtLine[] {
  return lines.map((l, i) => ({ key: key(file, i), file, date: l.date, amount: l.amount, direction: l.direction, balance: l.balance, description: l.description, currency }));
}

export function fromForex(file: string, wallet: ForexWallet): StmtLine[] {
  return wallet.lines.map((l, i) => ({
    key: key(file, i),
    file,
    date: l.date,
    amount: r2(l.credit > 0 ? l.credit : l.debit),
    direction: (l.credit > 0 ? "credit" : "debit") as Dir,
    balance: l.balance,
    description: [l.merchant, l.description].filter(Boolean).join(" ").slice(0, 160),
    currency: l.txnCurrency || wallet.currency,
  }));
}

export function fromStatementLines(file: string, lines: StatementLine[], currency = "INR"): StmtLine[] {
  return lines.map((l, i) => ({ key: key(file, i), file, date: l.date, amount: l.amount, direction: (l.direction ?? "debit") as Dir, balance: null, description: l.description, currency }));
}

export function totals(lines: StmtLine[]) {
  const sum = (d: Dir) => r2(lines.filter((l) => l.direction === d).reduce((s, l) => s + l.amount, 0));
  return { debits: sum("debit"), credits: sum("credit"), count: lines.length };
}

/** Does the file's own arithmetic hold: opening, every line, printed closing. Null when a figure is missing. */
export function balanceAddsUp(opening: number | null, closing: number | null, lines: StmtLine[], liability = false) {
  if (opening === null || closing === null) return null;
  const t = totals(lines);
  // An account's balance rises with credits; what you owe on a card rises with debits.
  const expected = r2(opening + (liability ? -1 : 1) * (t.credits - t.debits));
  return r2(closing - expected);
}

/**
 * App balance plus the net effect of these lines, compared with the statement's printed closing figure.
 * On a card a credit lowers what is owed, so the sign flips. This is the posting gate for every flow.
 */
export function projectBalance(appBalance: number, lines: readonly { direction: Dir; amount: number }[], closing: number | null, liability = false) {
  const sign = liability ? -1 : 1;
  const net = r2(lines.reduce((s, l) => s + sign * (l.direction === "credit" ? l.amount : -l.amount), 0));
  const after = r2(appBalance + net);
  const difference = closing === null ? null : r2(closing - after);
  return { net, after, difference, ok: difference !== null && Math.abs(difference) <= 0.01 };
}

/** Projection for the shared classifier, which speaks the ledger's own statement-line shape. */
export function toStatementLine(l: StmtLine): StatementLine {
  return { ref: l.key, date: l.date, description: l.description, amount: l.amount, direction: l.direction };
}
