// Read-only historical audit (V5.10.3 §18–19). Derives findings from saved records and uploaded
// statement lines; it never writes, posts, pairs or rewrites anything.
import { matchScore, type Expense, type StatementLine } from "./expenses";
import type { Account } from "./ledger";
import { bankRef } from "./statement-fingerprint";

export const AUDIT_FROM = "2026-04-01";
const BANK = ["savings", "current", "cash", "wallet"];
export type AuditIssue =
  | "transfer_as_expense" | "transfer_as_income" | "duplicate_transfer" | "multiple_links"
  | "unmatched_transfer" | "account_mapping" | "missing_in_ledger" | "missing_in_statement" | "currency";
export const AUDIT_LABEL: Record<AuditIssue, string> = {
  transfer_as_expense: "Transfer counted as spending",
  transfer_as_income: "Transfer counted as income",
  duplicate_transfer: "Possible duplicate transfer",
  multiple_links: "Statement line matches several entries",
  unmatched_transfer: "Transfer missing the other side",
  account_mapping: "Account or type looks wrong",
  missing_in_ledger: "Statement line not in your records",
  missing_in_statement: "Entry not on the uploaded statement",
  currency: "Currency details missing",
};
export type Confidence = "high" | "medium" | "low";
export interface AuditFinding {
  key: string; issue: AuditIssue; date: string; amount: number; currency: string;
  reference: string; source: string; destination: string; currentType: string; suggestedType: string;
  proposal: string; confidence: Confidence; impact: string; entryId?: string; batchId?: string;
}
export interface AuditStatement { id: string; accountId: string; currency: string; lines: StatementLine[]; from: string | null; to: string | null }

export const maskAccount = (a?: Account) => !a ? "—" : `${a.name.replace(/\d{5,}/g, (d) => "••" + d.slice(-4))}`;
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Pure: identical input gives identical findings, so the report is reproducible. */
export function auditRecords(txns: Expense[], accounts: Account[], statements: AuditStatement[], from = AUDIT_FROM): AuditFinding[] {
  const out: AuditFinding[] = [];
  const acc = (id?: string | null) => accounts.find((a) => a.id === id);
  const owned = (id?: string | null) => !!acc(id);
  const rows = txns.filter((t) => t.date >= from);
  const type = (t: Expense) => t.txnType ?? "expense";
  const base = (t: Expense) => ({ date: t.date, amount: t.originalAmount ?? t.amount, currency: t.currency, reference: t.statementRef ?? bankRef(t.description ?? "") ?? "—", currentType: type(t), entryId: t.id });

  // A/B: a spend on one owned account mirrored by money arriving on another owned account.
  const credits = rows.filter((t) => ["income", "refund"].includes(type(t)) && owned(t.accountId));
  const usedCredit = new Set<string>();
  for (const d of rows.filter((t) => type(t) === "expense" && BANK.includes(acc(t.accountId)?.kind ?? ""))) {
    const pairs = credits.filter((c) => c.accountId !== d.accountId && !usedCredit.has(c.id) && c.currency === d.currency && Math.abs(c.originalAmount - d.originalAmount) < 0.005 && days(c.date, d.date) <= 2);
    if (pairs.length === 0) continue;
    const ref = bankRef(d.description ?? "");
    const strong = pairs.filter((c) => ref && bankRef(c.description ?? "") === ref);
    const pick = strong.length === 1 ? strong[0]! : pairs.length === 1 ? pairs[0]! : null;
    if (!pick) { out.push({ ...base(d), key: `multi-${d.id}`, issue: "multiple_links", source: maskAccount(acc(d.accountId)), destination: `${pairs.length} possible accounts`, suggestedType: "transfer", proposal: "Choose the matching credit yourself — several entries have the same amount and date", confidence: "low", impact: "None until you choose" }); continue; }
    usedCredit.add(pick.id);
    const conf: Confidence = strong.length === 1 ? "high" : "low";
    out.push({ ...base(d), key: `tx-${d.id}`, issue: "transfer_as_expense", source: maskAccount(acc(d.accountId)), destination: maskAccount(acc(pick.accountId)), suggestedType: "transfer", proposal: `Link with the ${pick.date} credit on ${maskAccount(acc(pick.accountId))} as one internal transfer`, confidence: conf, impact: `Spending −${r2(d.amount)}, income −${r2(pick.amount)}; balances unchanged` });
    out.push({ ...base(pick), key: `ti-${pick.id}`, issue: "transfer_as_income", source: maskAccount(acc(d.accountId)), destination: maskAccount(acc(pick.accountId)), suggestedType: "transfer", proposal: "Treat as the receiving side of that transfer, not income", confidence: conf, impact: `Income −${r2(pick.amount)}` });
  }

  // C: two transfer records for the same movement.
  const moves = rows.filter((t) => type(t) === "transfer");
  const seen = new Map<string, Expense>();
  for (const t of moves) {
    const k = `${t.accountId}|${t.toAccountId}|${t.currency}|${t.originalAmount.toFixed(2)}|${t.date}`;
    const prev = seen.get(k);
    if (prev) out.push({ ...base(t), key: `dup-${t.id}`, issue: "duplicate_transfer", source: maskAccount(acc(t.accountId)), destination: maskAccount(acc(t.toAccountId)), suggestedType: "transfer", proposal: `Compare with entry ${prev.id.slice(0, 8)}; keep one`, confidence: t.statementRef && t.statementRef === prev.statementRef ? "high" : "medium", impact: `Both balances overstated by ${r2(t.amount)} if duplicate` });
    else seen.set(k, t);
  }

  // F: account/type mismatches.
  for (const t of rows) {
    const src = acc(t.accountId), dst = acc(t.toAccountId);
    if (type(t) === "card_payment" && /interest|cashback|reward/i.test(`${t.title} ${t.description ?? ""}`)) out.push({ ...base(t), key: `map-${t.id}`, issue: "account_mapping", source: maskAccount(src), destination: maskAccount(dst), suggestedType: "income", proposal: "Looks like interest or cashback, not a card bill payment", confidence: "medium", impact: `Card owed may be understated by ${r2(t.amount)}` });
    if (type(t) === "income" && src?.kind === "credit_card") out.push({ ...base(t), key: `cci-${t.id}`, issue: "account_mapping", source: maskAccount(src), destination: "—", suggestedType: "card_payment", proposal: "Credit-card credits are repayments or refunds, never income", confidence: "high", impact: `Income −${r2(t.amount)}` });
    if (t.currency !== "INR" && (!t.fxRate || t.fxRate === 1)) out.push({ ...base(t), key: `fx-${t.id}`, issue: "currency", source: maskAccount(src), destination: maskAccount(dst), suggestedType: type(t), proposal: "Record the exchange rate used", confidence: "high", impact: "Rupee value may be wrong" });
  }

  // E/G: compare uploaded statement lines with records, pooling every statement for the same account.
  for (const accountId of [...new Set(statements.map((s) => s.accountId))]) {
    const group = statements.filter((s) => s.accountId === accountId);
    const seenLine = new Set<string>();
    const lines = group.flatMap((s) => s.lines.filter((l) => l.date >= from).map((l) => ({ l, s }))).filter(({ l }) => { const k = `${l.date}|${l.amount}|${l.direction}|${l.description}`; if (seenLine.has(k)) return false; seenLine.add(k); return true; });
    const onAccount = rows.filter((t) => t.accountId === accountId || t.toAccountId === accountId);
    const matched = new Set<string>();
    for (const { l, s } of lines) {
      const hits = onAccount.filter((t) => !matched.has(t.id) && matchScore(l, t, s.currency, accountId) >= 0.5);
      if (hits.length === 0) out.push({ key: `ml-${s.id}-${l.ref}-${l.date}-${l.amount}`, issue: "missing_in_ledger", date: l.date, amount: l.amount, currency: s.currency, reference: bankRef(l.description) ?? l.ref, source: maskAccount(acc(accountId)), destination: "—", currentType: "not recorded", suggestedType: l.direction === "credit" ? "income / transfer in" : "expense / transfer out", proposal: `Review “${l.description.slice(0, 60)}” in Statements`, confidence: "medium", impact: `${l.direction === "credit" ? "Money in" : "Money out"} ${r2(l.amount)} not reflected`, batchId: s.id });
      else { const best = hits.sort((a, b) => matchScore(l, b, s.currency, accountId) - matchScore(l, a, s.currency, accountId))[0]!; matched.add(best.id); }
    }
    // Coverage = dates the statement lines actually span (claimed periods can be wider than the file).
    const spans = group.map((s) => { const ds = s.lines.map((l) => l.date).sort(); return [ds[0], ds[ds.length - 1]] as const; }).filter(([a, b]) => a && b);
    const covered = (d: string) => spans.some(([a, b]) => d >= a! && d <= b!);
    for (const t of onAccount.filter((t) => covered(t.date) && !matched.has(t.id))) {
      out.push({ ...base(t), key: `ms-${accountId}-${t.id}`, issue: type(t) === "transfer" && t.toAccountId === accountId ? "unmatched_transfer" : "missing_in_statement", source: maskAccount(acc(t.accountId)), destination: maskAccount(acc(t.toAccountId)), suggestedType: type(t), proposal: "Check whether this entry is a duplicate or belongs to another account", confidence: "low", impact: "Balance differs from the statement by this amount" });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
}
