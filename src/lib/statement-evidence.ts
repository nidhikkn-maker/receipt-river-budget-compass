import type { Account } from "./ledger";
export interface StatementIdentity { bank: string | null; identifier: string | null; quote: string; page: number | null }
export interface StatementReview {
  identity?: { bank: string; identifier: string; reference: string; confirmed: boolean; missingIdentifierConfirmed: boolean; accountId: string; reviewedAt: string };
  coverage?: { from: string; to: string; reference: string; confirmed: boolean; reviewedAt: string };
  convention?: "asset" | "liability";
}
/** Only explicitly labelled statement headers count; narration and filenames are not account identity. */
export function extractStatementIdentity(text: string, page: number | null = null): StatementIdentity[] {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const bankLine = lines.find(s => /\b(bank|american express|amex)\b/i.test(s) && !/\b(upi|neft|imps|transaction|description|narration)\b/i.test(s));
  const bank = bankLine?.match(/\b(IDFC(?:\s+FIRST)?|HDFC|ICICI|AXIS|STATE BANK OF INDIA|SBI|AMERICAN EXPRESS|AMEX|KOTAK|YES BANK|BANK OF BARODA)\b/i)?.[0] ?? null;
  const identities = lines.flatMap(line => {
    const match = line.match(/(?:account\s*(?:number|no\.?|#)|a\/?c\s*(?:number|no\.?|#)|card\s*(?:number|no\.?|ending(?:\s+in)?))\s*[:\-]?\s*([\dXx*][\dXx* \-]{3,30})/i);
    const identifier = match?.[1]?.replace(/[ \-]/g, "").trim();
    return identifier && /\d{4}$/.test(identifier) ? [{ bank, identifier, quote: line.slice(0, 300), page }] : [];
  });
  return identities.length ? identities : bank ? [{ bank, identifier: null, quote: bankLine?.slice(0, 300) ?? "", page }] : [];
}
const bankKey = (s: string) => s.toUpperCase().replace(/AMERICAN EXPRESS/g, "AMEX").match(/IDFC|HDFC|ICICI|AXIS|SBI|AMEX|KOTAK|YES BANK|BANK OF BARODA/)?.[0] ?? "";
export function identityCandidates(identity: StatementIdentity, accounts: Account[]) {
  if (!identity.identifier) return [];
  const digits = identity.identifier.replace(/\D/g, "");
  const masked = /[Xx*]/.test(identity.identifier);
  return accounts.filter(a => !a.archived && (!bankKey(identity.bank ?? "") || bankKey(`${a.name} ${a.issuer ?? ""}`) === bankKey(identity.bank ?? "")) && (
    masked ? digits.length >= 4 && (a.lastFour === digits.slice(-4) || new RegExp(`\\b\\d*${digits.slice(-4)}\\b`).test(a.name)) : digits.length >= 4 && (new RegExp(`\\b${digits}\\b`).test(a.name) || digits.length === 4 && a.lastFour === digits)
  ));
}
export function statementReviewBlockers(review: StatementReview, account: Account | undefined, rowDates: string[], today: string) {
  const errors: string[] = [];
  const identity = review.identity, coverage = review.coverage;
  if (!account || account.archived || !identity?.confirmed || identity.accountId !== account.id || !identity.reference.trim()) errors.push("Confirm the selected account against the original statement.");
  if (identity && !identity.identifier.trim() && !identity.missingIdentifierConfirmed) errors.push("The account identifier is missing; explicitly confirm manual account matching.");
  if (coverage?.confirmed) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(coverage.from) || !/^\d{4}-\d{2}-\d{2}$/.test(coverage.to) || coverage.from < "2026-04-01" || coverage.to > today || coverage.from > coverage.to || !coverage.reference.trim() || rowDates.some(d => d < coverage.from || d > coverage.to)) errors.push("Confirm the actual statement period containing every parsed row.");
  }
  return errors;
}
/** Stable across JSON object-key ordering, reload and devices. */
export function canonicalEvidence(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalEvidence).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonicalEvidence(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}