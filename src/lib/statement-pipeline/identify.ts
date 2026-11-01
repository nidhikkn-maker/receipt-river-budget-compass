// Whose statement is this? Pure: reads only the file's own words, never guesses from amounts.
import type { Account, AccountKind } from "../ledger";
import type { StmtLine } from "./line";
import type { AccountHint } from "./line";

const BANKS: { issuer: string; kind: AccountKind; re: RegExp }[] = [
  { issuer: "American Express", kind: "credit_card", re: /american express|\bamex\b/i },
  { issuer: "IDFC FIRST", kind: "savings", re: /\bidfc\b/i },
  { issuer: "HDFC Bank", kind: "savings", re: /\bhdfc\b/i },
  { issuer: "ICICI Bank", kind: "savings", re: /\bicici\b/i },
];
const CURRENCIES: [RegExp, string][] = [
  [/\bEUR\b|€/, "EUR"],
  [/\bUSD\b/, "USD"],
  [/\bGBP\b|£/, "GBP"],
  [/\bSGD\b/, "SGD"],
];
/** Anything that proves the file is about a card rather than a savings account. */
const CARD_HINT = /credit card|card statement|total dues|amount due|outstanding|statement of account\s*:\s*card/i;

const header = (rows: string[]) => rows.slice(0, 40).join("\n");

export function detectIssuer(rows: string[]) {
  const h = header(rows);
  return BANKS.find((b) => b.re.test(h)) ?? null;
}

/** Only a clearly labelled account/card number counts, so a transaction amount is never mistaken for one. */
export function detectAccountNumber(rows: string[]): string | null {
  const m = header(rows).match(/(?:account\s*(?:no|number)|a\/c\s*(?:no|number)?|card\s*(?:no|number)|membership\s*number)\D{0,12}(\d{4,16})/i);
  return m?.[1] ?? null;
}

export function detectCurrency(rows: string[], lines: StmtLine[]): string {
  const fromLines = lines.find((l) => l.currency && l.currency !== "INR")?.currency;
  if (fromLines) return fromLines;
  return CURRENCIES.find(([re]) => re.test(header(rows)))?.[1] ?? "INR";
}

export interface Identification {
  accountId: string | null;
  hint: AccountHint | null;
  currency: string;
}

/**
 * Ties a file to one live account. A printed account number wins; otherwise the issuer is used,
 * and only when exactly one account could be the one. Anything vaguer is reported as unknown
 * with a suggested name, so the flow can offer to create the account rather than guess.
 */
export function identifyFile(rows: string[], lines: StmtLine[], accounts: Account[]): Identification {
  const bank = detectIssuer(rows);
  const number = detectAccountNumber(rows);
  const lastFour = number ? number.slice(-4) : null;
  const currency = detectCurrency(rows, lines);
  const live = accounts.filter((a) => !a.archived);

  if (lastFour) {
    const hit = live.filter((a) => a.lastFour && a.lastFour === lastFour);
    if (hit.length === 1 && hit[0]) return { accountId: hit[0].id, hint: null, currency };
  }
  if (!bank) return { accountId: null, hint: null, currency };

  const kind: AccountKind = CARD_HINT.test(header(rows)) ? "credit_card" : bank.kind;
  const named = live.filter((a) => (a.issuer && a.issuer === bank.issuer) || new RegExp(bank.re.source, "i").test(a.name));
  const sameKind = named.filter((a) => a.kind === kind);
  const pick = (sameKind.length === 1 ? sameKind : named.length === 1 ? named : [])[0];
  if (pick) return { accountId: pick.id, hint: null, currency };

  return {
    accountId: null,
    hint: { name: `${bank.issuer}${lastFour ? ` …${lastFour}` : ""}`, kind, issuer: bank.issuer, lastFour },
    currency,
  };
}
