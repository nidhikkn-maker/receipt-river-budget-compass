// Statement Desk rules applied to one hand-typed New entry (pure, tested). Suggestions only — never saves.
import { classifyStatementLine } from "../statement-auto";
import type { Account, TxnType } from "../ledger";
import type { Expense } from "../expenses";
import type { CategorySetting } from "../preferences";
import { ledgerRec, pairOpposites, scoreRecord, type LedgerRec } from "./match";
import { detectIssuer } from "./identify";
import { toStatementLine, type StmtLine } from "./line";

export interface EntryDraft {
  id?: string | undefined;
  date: string;
  amount: number;
  currency: string;
  txnType: TxnType;
  text: string;
  accountId: string | null;
}

export interface EntryMatch { record: LedgerRec; score: number; exact: boolean; reasons: string[] }

export interface EntrySuggestion {
  category?: string;
  categoryReason?: string;
  accountId?: string;
  accountReason?: string;
  txnType?: TxnType;
  toAccountId?: string;
  typeReason?: string;
  matches: EntryMatch[];
  /** The other side of an own-account movement that is already saved. */
  opposite?: LedgerRec;
}

const IN: TxnType[] = ["income", "refund"];
const dirOf = (k: TxnType): "credit" | "debit" => (IN.includes(k) ? "credit" : "debit");
const MOVE: TxnType[] = ["transfer", "card_payment"];

/** Account named in the text: full account name, last four digits in the name, or the bank/card issuer when only one account fits. */
export function accountFromText(text: string, accounts: Account[], exclude?: string | null): { id: string; reason: string } | null {
  const live = accounts.filter((a) => !a.archived && a.id !== exclude);
  const t = text.toLowerCase();
  const byName = live.find((a) => a.name.length >= 4 && t.includes(a.name.toLowerCase()));
  if (byName) return { id: byName.id, reason: `Mentions “${byName.name}”` };
  for (const d of t.match(/\b\d{4}\b/g) ?? []) {
    const hit = live.filter((a) => a.name.includes(d));
    if (hit.length === 1 && hit[0]) return { id: hit[0].id, reason: `Ends in ${d}` };
  }
  const issuer = detectIssuer([text]);
  if (issuer) {
    const word = issuer.issuer.split(" ")[0]!.toLowerCase();
    const hit = live.filter((a) => a.name.toLowerCase().includes(word === "american" ? "amex" : word) || a.name.toLowerCase().includes(issuer.issuer.toLowerCase()));
    if (hit.length === 1 && hit[0]) return { id: hit[0].id, reason: `${issuer.issuer} account` };
  }
  return null;
}

export function suggestForEntry(d: EntryDraft, ctx: { transactions: Expense[]; accounts: Account[]; categories: CategorySetting[] }): EntrySuggestion {
  const out: EntrySuggestion = { matches: [] };
  const text = d.text.trim();
  const line: StmtLine = { key: "new", file: "New entry", date: d.date, amount: d.amount, direction: dirOf(d.txnType), balance: null, description: text, currency: d.currency };
  const others = ctx.transactions.filter((t) => t.id !== d.id);

  if (text.length >= 3) {
    const draft = classifyStatementLine(toStatementLine(line), { transactions: others, accounts: ctx.accounts, categories: ctx.categories, accountId: d.accountId, currency: d.currency });
    if (!draft.uncertain && draft.category) { out.category = draft.category; out.categoryReason = draft.reason; }
    const acct = accountFromText(text, ctx.accounts);
    if (acct && !d.accountId) { out.accountId = acct.id; out.accountReason = acct.reason; }
    if (MOVE.includes(draft.txnType) && d.txnType === "expense") {
      const to = accountFromText(text, ctx.accounts, d.accountId ?? acct?.id);
      const toAcct = to && ctx.accounts.find((a) => a.id === to.id);
      out.txnType = toAcct?.kind === "credit_card" ? "card_payment" : "transfer";
      out.typeReason = draft.reason;
      if (to) out.toAccountId = to.id;
    }
  }

  if (d.amount > 0 && d.date) {
    const recs = others.map(ledgerRec).filter((r) => r.currency === d.currency);
    const near = recs.filter((r) => Math.abs(r.amount - d.amount) < 0.005 && Math.abs(Date.parse(r.date) - Date.parse(d.date)) <= 3 * 864e5);
    out.matches = near
      .filter((r) => !d.accountId || r.accountId === d.accountId || r.toAccountId === d.accountId)
      .map((r) => { const s = scoreRecord(r, line); return { record: r, score: s.score, exact: s.score >= 80, reasons: s.reasons }; })
      .filter((m) => m.score >= 55)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    // Opposite side of an own-account move: only when the type is already a move (never inferred from amount alone).
    const kind = out.txnType ?? d.txnType;
    if (MOVE.includes(kind) && d.accountId) {
      const cands = near.filter((r) => r.accountId && r.accountId !== d.accountId && r.toAccountId !== d.accountId && (r.kind === "income" || r.kind === "transfer"));
      const pair = pairOpposites([{ key: "new", date: d.date, amount: d.amount, direction: "debit" }], cands.map((r) => ({ key: r.id, date: r.date, amount: r.amount, direction: "credit" as const })));
      const id = pair.get("new");
      const o = id && cands.length === 1 ? cands.find((r) => r.id === id) : undefined;
      if (o) out.opposite = o;
    }
  }
  return out;
}
