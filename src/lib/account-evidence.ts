import type { Account } from "./ledger";
import type { PaymentInstrument } from "./payment-instruments";

/**
 * Which account paid for a scanned bill — only when the bill itself proves it (financial integrity).
 * A bill that just says "credit card" or "UPI" without identifying digits, or whose digits match more than one
 * account, is insufficient evidence: the account is left unselected and must be chosen by the owner. Usual
 * choices, past payments at the shop and default methods are never treated as evidence for a scanned bill.
 */

export interface ReceiptAccountEvidence {
  accountId: string | null;
  instrumentId: string | null;
  /** Plain words naming exactly what was used, shown beside the suggestion. Null when nothing was suggested. */
  evidence: string | null;
  /** Why no account was suggested, when none was. */
  reason: string | null;
}

const METHOD_WORDS: Record<string, string> = {
  credit_card: "a credit card", debit_card: "a debit card", forex_card: "a forex card", company_card: "a company card",
  upi: "UPI", bank_transfer: "a bank transfer", cash: "cash", other: "another method",
};

/** Last-four candidates printed on a bill: "**** 1006", "XX1006", "ending 1006", "card no. ...1006", "A/c xx4821". */
export function cardDigitsFromText(text: string | null | undefined): string[] {
  if (!text) return [];
  const found = new Set<string>();
  const re = /(?:[*xX•·.]{2,}\s?|\b(?:ending(?:\s+in)?|ends\s+with|last\s+4(?:\s+digits)?|card\s*(?:no\.?|number)?|a\/c(?:\s*no\.?)?|acct\.?|account)\s*(?:[:#-]?\s*)?(?:[*xX•·.]{0,12}\s?))(\d{4})\b/g;
  for (const m of text.matchAll(re)) if (m[1]) found.add(m[1]);
  return [...found];
}

export function receiptAccountEvidence(
  read: { text?: string | null; paymentMethod?: string | null },
  accounts: Account[],
  instruments: PaymentInstrument[],
): ReceiptAccountEvidence {
  const live = accounts.filter((a) => !a.archived);
  const digits = cardDigitsFromText(read.text);
  const method = read.paymentMethod ? METHOD_WORDS[read.paymentMethod] ?? "a payment method" : null;
  if (!digits.length) {
    return { accountId: null, instrumentId: null, evidence: null, reason: method ? `The bill says it was paid by ${method} but doesn't show which one.` : "The bill doesn't show how it was paid." };
  }
  const matches: { accountId: string; instrumentId: string | null; label: string; digits: string }[] = [];
  for (const d of digits) {
    for (const p of instruments) if (!p.archived && p.lastFour === d && live.some((a) => a.id === p.accountId)) matches.push({ accountId: p.accountId, instrumentId: p.id, label: p.nickname, digits: d });
    for (const a of live) if ((a.lastFour ?? "").replace(/\D/g, "") === d && !matches.some((m) => m.accountId === a.id)) matches.push({ accountId: a.id, instrumentId: null, label: a.name, digits: d });
  }
  const accountsHit = [...new Set(matches.map((m) => m.accountId))];
  if (accountsHit.length === 1) {
    const m = matches.find((x) => x.accountId === accountsHit[0])!;
    const name = live.find((a) => a.id === m.accountId)?.name ?? m.label;
    return { accountId: m.accountId, instrumentId: m.instrumentId, evidence: `Card or account ending ${m.digits} printed on the bill matches ${name}`, reason: null };
  }
  if (accountsHit.length > 1) return { accountId: null, instrumentId: null, evidence: null, reason: `The digits on the bill (${digits.join(", ")}) match more than one of your accounts.` };
  return { accountId: null, instrumentId: null, evidence: null, reason: `The digits on the bill (${digits.join(", ")}) don't match any of your saved accounts or cards.` };
}

export type AccountState = "unselected" | "suggested" | "confirmed";

/** An account counts as confirmed only when the owner chose it (or it was saved before); anything filled for them is a suggestion. */
export function accountState(accountId: string | null | undefined, confirmedByOwner: boolean): AccountState {
  if (!accountId || accountId === "none") return "unselected";
  return confirmedByOwner ? "confirmed" : "suggested";
}
