import type { Account } from "./ledger";
import type { PaymentInstrument } from "./payment-instruments";

/**
 * Which account paid for a scanned bill — only when the bill itself proves it (financial integrity).
 * A bill that just says "credit card" or "UPI" without identifying digits, or whose digits match more than one
 * account, is insufficient evidence: the account is left unselected and must be chosen by the owner. Usual
 * choices, past payments at the shop and default methods are never treated as evidence for a scanned bill.
 * Every suggestion still needs the owner's explicit confirmation before it can be saved (KK decision D1, applied
 * to the classic review and Signature Flow alike):
 *   - Card bills: a UNIQUE active account or saved card with the printed last four digits; when the bill and the
 *     account both name a card network they must agree (Amex ending 1006 never matches a Visa ending 1006).
 *   - Cash bills: only a cash account is ever a candidate, never a card or bank account.
 *   - Company card / paid by someone else: no personal account is assumed; the owner chooses one if they paid,
 *     or confirms it was not paid from their accounts.
 */

export const CARD_NETWORKS = ["visa", "mastercard", "amex", "rupay", "diners"] as const;
export type CardNetwork = (typeof CARD_NETWORKS)[number];
export const NETWORK_LABEL: Record<CardNetwork, string> = { visa: "Visa", mastercard: "Mastercard", amex: "Amex", rupay: "RuPay", diners: "Diners" };
export interface CardIdentifiers { network: CardNetwork | null; lastFour: string | null }

/** Who paid, as far as the bill shows: an owner's account, cash, or someone else (company card, on behalf of). */
export type BillPayer = "own" | "cash" | "other";

export interface ReceiptAccountEvidence {
  accountId: string | null;
  instrumentId: string | null;
  /** Plain words naming exactly what was used, shown beside the suggestion. Null when nothing was suggested. */
  evidence: string | null;
  /** Why no account was suggested, when none was. */
  reason: string | null;
  /** What the bill says about who paid. "other" means no personal account is assumed. */
  payer: BillPayer;
  /** The bill mentions reimbursement: the owner may mark it to be claimed back (never automatic). */
  reimbursable: boolean;
  /** Card identifiers the decision used (from the reader, else parsed from the bill text). */
  card: CardIdentifiers;
}

const METHOD_WORDS: Record<string, string> = {
  credit_card: "a credit card", debit_card: "a debit card", forex_card: "a forex card", company_card: "a company card",
  upi: "UPI", bank_transfer: "a bank transfer", cash: "cash", other: "another method",
};
const CARD_METHODS = new Set(["credit_card", "debit_card", "forex_card", "company_card"]);

const MASK = "[*xX•·.⋆∗✱#]";
const DIGITS_RE = new RegExp(`(?:${MASK}{2,}\\s?|\\b(?:ending(?:\\s+in)?|ends\\s+with|last\\s+4(?:\\s+digits)?|card\\s*(?:no\\.?|number)?|a\\/c(?:\\s*no\\.?)?|acct\\.?|account)\\s*(?:[:#-]?\\s*)?(?:${MASK}{0,12}\\s?))(\\d{4})\\b`, "g");
/** Last-four candidates printed on a bill: "**** 1006", "XX1006", "ending 1006", "card no. ...1006", "A/c xx4821". */
export function cardDigitsFromText(text: string | null | undefined): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const m of text.matchAll(DIGITS_RE)) if (m[1]) found.add(m[1]);
  return [...found];
}

const NETWORK_PATTERNS: [CardNetwork, RegExp][] = [
  ["amex", /\b(?:amex|american\s+express)\b/i],
  ["visa", /\bvisa\b/i],
  ["mastercard", /\bmaster\s?card\b/i],
  ["rupay", /\bru\s?pay\b/i],
  ["diners", /\bdiners(?:\s+club)?\b/i],
];
/** The one card network a piece of text names, or null when it names none or more than one. */
export function networkFromText(text: string | null | undefined): CardNetwork | null {
  if (!text) return null;
  const hits = NETWORK_PATTERNS.filter(([, re]) => re.test(text)).map(([n]) => n);
  return hits.length === 1 ? hits[0]! : null;
}

/**
 * Card identifiers printed on a bill, read deterministically from its text (the fallback when the reader returns
 * none): the network and the last four digits. More than one distinct set of digits is ambiguous, so none is chosen.
 */
export function cardFromText(text: string | null | undefined): CardIdentifiers {
  const digits = cardDigitsFromText(text);
  return { network: networkFromText(text), lastFour: digits.length === 1 ? digits[0]! : null };
}

/** Accept only exactly four digits and a known network from the reader; anything else counts as not read. */
export function cleanCard(network: unknown, lastFour: unknown): CardIdentifiers {
  const n = typeof network === "string" ? network.toLowerCase().replace(/[^a-z]/g, "") : "";
  const net = (CARD_NETWORKS as readonly string[]).includes(n) ? (n as CardNetwork) : n === "americanexpress" ? "amex" : null;
  const digits = typeof lastFour === "string" && /^\d{4}$/.test(lastFour.trim()) ? lastFour.trim() : null;
  return { network: net, lastFour: digits };
}

/** The reader's card fields, falling back to the bill text field by field. */
export function billCard(read: { text?: string | null; cardNetwork?: unknown; cardLastFour?: unknown }): CardIdentifiers {
  const fromReader = cleanCard(read.cardNetwork, read.cardLastFour);
  const fromText = cardFromText(read.text);
  return { network: fromReader.network ?? fromText.network, lastFour: fromReader.lastFour ?? fromText.lastFour };
}

const luhn = (digits: string) => {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) { let d = Number(digits[digits.length - 1 - i]); if (i % 2) { d *= 2; if (d > 9) d -= 9; } sum += d; }
  return sum % 10 === 0;
};
/** Full card numbers never travel further than the reader: a 13–19 digit card number keeps only its last four digits. */
export function maskCardNumbers(text: string): string {
  return text.replace(/\b\d(?:[ -]?\d){12,18}\b/g, (run) => { const d = run.replace(/\D/g, ""); return luhn(d) ? `XXXX XXXX XXXX ${d.slice(-4)}` : run; });
}

const CASH_TEXT = /\b(?:paid\s*(?:in|by|via|with)?\s*:?\s*cash|cash\s+(?:paid|tendered|payment|sale)|(?:mode|payment)\s*:?\s*cash)\b/i;
const OTHER_PAYER_TEXT = /\b(?:company|corporate|business)\s+card\b|\bon\s+behalf\s+of\b|\bpaid\s+by\s+(?:the\s+)?(?:company|employer|client|host|organi[sz]ation|office)\b|\bbill\s+to\s+company\b/i;
const REIMBURSE_TEXT = /\breimburs(?:e|able|ed|ement)\b|\bclaimable\b/i;

/** The network an owner's account or saved card is on, from what they saved (issuer, name, card nickname). */
export function accountNetwork(account: Pick<Account, "name" | "issuer"> | undefined, instrument?: Pick<PaymentInstrument, "nickname" | "type"> | null): CardNetwork | null {
  if (instrument?.type === "rupay_upi") return "rupay";
  return networkFromText([instrument?.nickname, account?.issuer, account?.name].filter(Boolean).join(" "));
}

const none = (payer: BillPayer, reimbursable: boolean, card: CardIdentifiers, reason: string): ReceiptAccountEvidence =>
  ({ accountId: null, instrumentId: null, evidence: null, reason, payer, reimbursable, card });

export function receiptAccountEvidence(
  read: { text?: string | null; paymentMethod?: string | null; cardNetwork?: string | null; cardLastFour?: string | null },
  accounts: Account[],
  instruments: PaymentInstrument[],
): ReceiptAccountEvidence {
  const live = accounts.filter((a) => !a.archived);
  const liveInstruments = instruments.filter((p) => !p.archived && live.some((a) => a.id === p.accountId));
  const text = read.text ?? "";
  const card = billCard(read);
  const digits = card.lastFour ? [card.lastFour] : cardDigitsFromText(text);
  const reimbursable = REIMBURSE_TEXT.test(text);
  const method = read.paymentMethod ? METHOD_WORDS[read.paymentMethod] ?? "a payment method" : null;

  // Paid by a company card or by someone else: never force a personal account.
  if (read.paymentMethod === "company_card" || OTHER_PAYER_TEXT.test(text)) {
    return none("other", reimbursable, card, "The bill shows it was paid by a company card or by someone else, so no personal account is assumed. Choose your account only if you paid it, or confirm it wasn't paid from your accounts.");
  }

  // Cash: only a cash account can be a candidate, never a card.
  if (read.paymentMethod === "cash" || (!digits.length && CASH_TEXT.test(text))) {
    if (digits.length) return none("cash", reimbursable, card, `The bill shows both cash and card digits (${digits.join(", ")}), so the account is not clear.`);
    const cash = live.filter((a) => a.kind === "cash");
    if (cash.length === 1) {
      const instrument = liveInstruments.find((p) => p.type === "cash" && p.accountId === cash[0]!.id) ?? null;
      return { accountId: cash[0]!.id, instrumentId: instrument?.id ?? null, evidence: `The bill says it was paid in cash, and ${cash[0]!.name} is your only cash account`, reason: null, payer: "cash", reimbursable, card };
    }
    return none("cash", reimbursable, card, cash.length ? "The bill says it was paid in cash, and you have more than one cash account." : "The bill says it was paid in cash, but you have no cash account. Add one, or choose the account that paid.");
  }

  if (!digits.length) {
    return none("own", reimbursable, card, method ? `The bill says it was paid by ${method} but doesn't show which one.` : "The bill doesn't show how it was paid.");
  }

  const matches: { accountId: string; instrumentId: string | null; label: string; digits: string }[] = [];
  const mismatched: { name: string; network: CardNetwork; digits: string }[] = [];
  const consider = (accountId: string, instrumentId: string | null, label: string, d: string, network: CardNetwork | null) => {
    if (card.network && network && network !== card.network) { mismatched.push({ name: label, network, digits: d }); return; }
    if (!matches.some((m) => m.accountId === accountId)) matches.push({ accountId, instrumentId, label, digits: d });
  };
  for (const d of digits) {
    for (const p of liveInstruments) if (p.lastFour === d && p.type !== "cash") consider(p.accountId, p.id, p.nickname, d, accountNetwork(live.find((a) => a.id === p.accountId), p));
    for (const a of live) if (a.kind !== "cash" && (a.lastFour ?? "").replace(/\D/g, "") === d) consider(a.id, null, a.name, d, accountNetwork(a));
  }
  const shown = card.network ? `${NETWORK_LABEL[card.network]} ending` : read.paymentMethod && CARD_METHODS.has(read.paymentMethod) ? "Card ending" : "Card or account ending";
  if (matches.length === 1) {
    const m = matches[0]!;
    const name = live.find((a) => a.id === m.accountId)?.name ?? m.label;
    return { accountId: m.accountId, instrumentId: m.instrumentId, evidence: `${shown} ${m.digits} printed on the bill matches ${name}`, reason: null, payer: "own", reimbursable, card };
  }
  if (matches.length > 1) return none("own", reimbursable, card, `The digits on the bill (${digits.join(", ")}) match more than one of your accounts.`);
  if (mismatched.length && card.network) {
    const x = mismatched[0]!;
    return none("own", reimbursable, card, `The bill shows ${NETWORK_LABEL[card.network]} ending ${x.digits}, but your ${x.name} ending ${x.digits} is ${NETWORK_LABEL[x.network]}, so it is not treated as a match.`);
  }
  return none("own", reimbursable, card, `The digits on the bill (${digits.join(", ")}) don't match any of your saved accounts or cards.`);
}

export type AccountState = "unselected" | "suggested" | "confirmed";

/**
 * An account counts as confirmed only when the owner chose it (or it was saved before); anything filled for them is a
 * suggestion. "Not paid from my accounts" is confirmed only when the owner said so and no account is set.
 */
export function accountState(accountId: string | null | undefined, confirmedByOwner: boolean, notOwnConfirmed = false): AccountState {
  if (!accountId || accountId === "none") return notOwnConfirmed ? "confirmed" : "unselected";
  return confirmedByOwner ? "confirmed" : "suggested";
}

/** Audit record kept with the saved entry: how the paying account was settled, and by what evidence. */
export interface AccountCheck { decision: "evidence_confirmed" | "chosen" | "not_own_account"; evidence?: string | undefined; card?: CardIdentifiers | undefined; confirmedAt: string }
export function accountCheckRecord(input: { accountId: string; notOwn: boolean; suggestedId: string | null; evidence: string | null; card: CardIdentifiers | null }, at: string): AccountCheck {
  const decision: AccountCheck["decision"] = input.notOwn && input.accountId === "none" ? "not_own_account" : input.suggestedId && input.suggestedId === input.accountId ? "evidence_confirmed" : "chosen";
  return {
    decision,
    ...(decision === "evidence_confirmed" && input.evidence ? { evidence: input.evidence } : {}),
    ...(input.card && (input.card.network || input.card.lastFour) ? { card: input.card } : {}),
    confirmedAt: at,
  };
}
