import { accountBalance, type Account, type Txn } from "./ledger";

export interface CardTxn extends Txn { title?: string; merchant?: string | null; currency?: string }
export type CardLineKind = "spend" | "payment" | "refund" | "other";
export interface CardLine { txn: CardTxn; kind: CardLineKind; change: number; balanceAfter: number; reconciled: boolean; issue: string | null }

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Running amount owed on one card, using the same ledger rule as accountBalance.
 * Payments lower what is owed and are never income. Reconciled only when a statement confirmed it.
 */
export function cardLedger(card: Account, txns: CardTxn[]) {
  const mine = txns.filter((t) => t.accountId === card.id || t.toAccountId === card.id).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  let bal = card.openingBalance;
  const lines: CardLine[] = [];
  let spends = 0, payments = 0, refunds = 0;
  for (const t of mine) {
    const before = bal;
    bal = accountBalance({ ...card, openingBalance: before }, [t]);
    const change = r2(bal - before);
    const k = t.txnType ?? "expense";
    const kind: CardLineKind = k === "card_payment" && t.toAccountId === card.id ? "payment" : k === "refund" ? "refund" : change > 0 ? "spend" : "other";
    if (kind === "spend") spends += change; else if (kind === "payment") payments += -change; else if (kind === "refund") refunds += -change;
    const reconciled = !!t.reconciledAt;
    const issue = kind !== "payment" ? null : !t.accountId ? "Paying account missing" : !reconciled ? "Not matched to a card statement yet" : null;
    lines.push({ txn: t, kind, change, balanceAfter: bal, reconciled, issue });
  }
  const unreconciled = lines.filter((l) => l.issue);
  return {
    opening: card.openingBalance,
    spends: r2(spends), payments: r2(payments), refunds: r2(refunds),
    outstanding: r2(bal),
    limitUsed: card.creditLimit ? r2((bal / card.creditLimit) * 100) : null,
    lines: lines.reverse(),
    unreconciled: { count: unreconciled.length, total: r2(unreconciled.reduce((a, l) => a + Math.abs(l.change), 0)) },
  };
}
