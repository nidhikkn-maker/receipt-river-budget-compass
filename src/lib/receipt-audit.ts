// Duplicate-receipt detection and receipt-reading audit trail (pure, tested).
import type { Expense, ReceiptDetails } from "./expenses";

/** Fields the receipt reader fills and the owner can correct before saving. */
export interface ReceiptReadValues { merchant: string; date: string; amount: number; currency: string }

export interface ReceiptAudit {
  /** What the reader extracted, before any correction. */
  read: ReceiptReadValues;
  /** What the owner confirmed; omitted fields matched the reading. */
  corrected: Partial<ReceiptReadValues>;
  confirmedAt: string;
}

/** SHA-256 fingerprint of a receipt file's bytes; falls back to a name+size key when hashing is unavailable. */
export async function receiptFingerprint(file: { name: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> }): Promise<string> {
  try {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return "sha256:" + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return `file:${file.name}:${file.size}`;
  }
}

/** Expenses already using this exact receipt file (by stored fingerprint), excluding the entry being edited. */
export function receiptFingerprintMatches(fingerprint: string | undefined, entries: Expense[], excludeId?: string): Expense[] {
  if (!fingerprint) return [];
  return entries.filter((e) => e.id !== excludeId && e.receiptDetails?.fingerprint === fingerprint);
}

/**
 * Builds the audit record for a scanned receipt: the originally read values plus only the
 * fields the owner actually changed before confirming. Returns null when nothing was read.
 */
export function buildReceiptAudit(read: ReceiptReadValues, confirmed: ReceiptReadValues, confirmedAt: string): ReceiptAudit {
  const corrected: Partial<ReceiptReadValues> = {};
  if (confirmed.merchant.trim() !== read.merchant.trim()) corrected.merchant = confirmed.merchant.trim();
  if (confirmed.date !== read.date) corrected.date = confirmed.date;
  if (Math.round(confirmed.amount * 100) !== Math.round(read.amount * 100)) corrected.amount = confirmed.amount;
  if (confirmed.currency.toUpperCase() !== read.currency.toUpperCase()) corrected.currency = confirmed.currency.toUpperCase();
  return { read, corrected, confirmedAt };
}

/** Human-readable audit lines, e.g. "amount: 450 → 455". Empty when the owner changed nothing. */
export function receiptCorrectionLines(audit: ReceiptAudit): string[] {
  const lines: string[] = [];
  const c = audit.corrected;
  if (c.merchant !== undefined) lines.push(`merchant: ${audit.read.merchant || "(blank)"} → ${c.merchant}`);
  if (c.date !== undefined) lines.push(`date: ${audit.read.date} → ${c.date}`);
  if (c.amount !== undefined) lines.push(`amount: ${audit.read.amount} → ${c.amount}`);
  if (c.currency !== undefined) lines.push(`currency: ${audit.read.currency} → ${c.currency}`);
  return lines;
}

/** True when the details carry a receipt audit worth showing. */
export function hasReceiptAudit(details: ReceiptDetails | undefined): details is ReceiptDetails & { audit: ReceiptAudit } {
  return !!details?.audit?.read;
}
