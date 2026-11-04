// Whose statement is this? Pure: reads only the file's own words, never guesses from amounts.
import type { Account, AccountKind } from "../ledger";
import type { StmtLine } from "./line";
import type { AccountHint } from "./line";

const BANKS: { issuer: string; kind: AccountKind; re: RegExp }[] = [
  { issuer: "American Express", kind: "credit_card", re: /american express|\bamex\b/i },
  { issuer: "IDFC FIRST", kind: "savings", re: /\bidfc\b/i },
  { issuer: "HDFC Bank", kind: "savings", re: /\bhdfc\b/i },
  { issuer: "ICICI Bank", kind: "savings", re: /\bicici\b/i },
  { issuer: "City Union Bank", kind: "savings", re: /city union bank|\bcub\b/i },
  { issuer: "State Bank of India", kind: "savings", re: /state bank of india|\bsbi\b/i },
  { issuer: "Axis Bank", kind: "savings", re: /\baxis bank\b/i },
  { issuer: "Kotak Mahindra Bank", kind: "savings", re: /\bkotak\b/i },
  { issuer: "Yes Bank", kind: "savings", re: /\byes bank\b/i },
  { issuer: "IndusInd Bank", kind: "savings", re: /\bindusind\b/i },
  { issuer: "Bank of Baroda", kind: "savings", re: /bank of baroda/i },
  { issuer: "Canara Bank", kind: "savings", re: /\bcanara bank\b/i },
  { issuer: "Punjab National Bank", kind: "savings", re: /punjab national bank|\bpnb\b/i },
  { issuer: "Indian Bank", kind: "savings", re: /\bindian bank\b/i },
  { issuer: "Indian Overseas Bank", kind: "savings", re: /indian overseas bank/i },
  { issuer: "Karur Vysya Bank", kind: "savings", re: /karur vysya/i },
  { issuer: "Tamilnad Mercantile Bank", kind: "savings", re: /tamilnad mercantile/i },
  { issuer: "Federal Bank", kind: "savings", re: /\bfederal bank\b/i },
  { issuer: "Standard Chartered", kind: "savings", re: /standard chartered/i },
  { issuer: "HSBC", kind: "savings", re: /\bhsbc\b/i },
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
  const known = BANKS.find((b) => b.re.test(h));
  if (known) return known;
  // Any other bank whose name is printed in the header, e.g. "Saraswat Co-operative Bank".
  const m = h.match(/\b([A-Z][A-Za-z&.]+(?:[ -][A-Z][A-Za-z&.]+){0,4} Bank)\b/);
  if (!m?.[1] || /^(the )?bank$/i.test(m[1])) return null;
  const issuer = m[1].trim();
  return { issuer, kind: "savings" as AccountKind, re: new RegExp(issuer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") };
}

export interface AccountDetailsRead { holder: string | null; ifsc: string | null; kind: AccountKind | null }

/** Labelled header facts only: holder name, IFSC and account type. Unlabelled text is never used. */
export function detectAccountDetails(rows: string[]): AccountDetailsRead {
  const h = header(rows);
  const ifsc = h.match(/\bIFSC(?:\s*code)?\s*[:\-]?\s*([A-Z]{4}0[A-Z0-9]{6})\b/i)?.[1]?.toUpperCase() ?? null;
  const holder = h.match(/(?:account\s*holder|customer\s*name|account\s*name|name)\s*[:\-]\s*([A-Za-z][A-Za-z .']{2,60})/i)?.[1]?.trim().replace(/\s+/g, " ") ?? null;
  const type = h.match(/(?:account\s*type|type\s*of\s*account|product)\s*[:\-]?\s*([A-Za-z ]{3,40})/i)?.[1] ?? "";
  const kind: AccountKind | null = CARD_HINT.test(h) ? "credit_card" : /current/i.test(type) ? "current" : /saving/i.test(type) ? "savings" : null;
  return { holder, ifsc, kind };
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

  const details = detectAccountDetails(rows);
  const kind: AccountKind = details.kind ?? bank.kind;
  const named = live.filter((a) => (a.issuer && a.issuer === bank.issuer) || new RegExp(bank.re.source, "i").test(a.name));
  const sameKind = named.filter((a) => a.kind === kind);
  const pick = (sameKind.length === 1 ? sameKind : named.length === 1 ? named : [])[0];
  if (pick) return { accountId: pick.id, hint: null, currency };

  return {
    accountId: null,
    hint: { name: `${bank.issuer}${kind === "current" ? " Current" : ""}${lastFour ? ` …${lastFour}` : ""}`, kind, issuer: bank.issuer, lastFour, ...(number ? { number } : {}), ...(details.ifsc ? { ifsc: details.ifsc } : {}), ...(details.holder ? { holder: details.holder } : {}) },
    currency,
  };
}
