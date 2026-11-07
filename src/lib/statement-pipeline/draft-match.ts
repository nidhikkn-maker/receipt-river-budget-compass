// Pairs confirmed receipt drafts with bank statement debits (pure, tested).
// The bank line stays the source of money and date; the draft only adds receipt, shop and category.
import type { DraftData, DraftReceipt } from "../drafts";
import type { StmtLine } from "./line";

export interface MatchableDraft { id: string; data: DraftData; receipts: DraftReceipt[]; status: string }
export interface DraftMatch {
  lineKey: string;
  draftId: string;
  /** "sure" is applied with the statement; "check" waits for the owner to confirm the pairing. */
  certainty: "sure" | "check";
  reasons: string[];
  amountGap: number;
  dayGap: number;
}

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / DAY);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 4);
/** Bank posting can lag a bill by a few days; tips or round-off can add a little. */
export const DRAFT_WINDOW_DAYS = 4;
export const DRAFT_AMOUNT_TOLERANCE = 0.02;

/** A draft counts only once its receipt was confirmed: an amount, a date, no pending reading and not already saved. */
export function confirmedReceiptDraft(d: MatchableDraft): boolean {
  const x = d.data;
  return d.status !== "saved" && !x.scan && (x.txnType ?? "expense") === "expense" && Number(x.amount) > 0 && !!x.date && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && d.receipts.length > 0;
}

function shopNamed(line: StmtLine, d: DraftData): boolean {
  const desc = line.description.toLowerCase().replace(/[^a-z0-9]/g, "");
  return words(d.merchant ?? d.title ?? "").some((w) => desc.includes(w));
}

/**
 * One-to-one pairing. "sure" needs the exact amount in the same currency, within two days, the shop named in
 * the narration and no rival on either side. Anything looser (small amount gap, no shop name, competing
 * candidates) is offered as "check" — never applied without the owner.
 */
export function matchDraftsToLines(lines: StmtLine[], drafts: MatchableDraft[]): DraftMatch[] {
  const debits = lines.filter((l) => l.direction === "debit");
  const ds = drafts.filter(confirmedReceiptDraft);
  type Cand = { line: StmtLine; d: MatchableDraft; gap: number; dayGap: number; named: boolean };
  const cands: Cand[] = [];
  for (const d of ds) {
    const amt = Number(d.data.amount); const cur = d.data.currency ?? "INR";
    for (const l of debits) {
      if (l.currency !== cur) continue;
      const gap = l.amount - amt; const dayGap = days(l.date, d.data.date!);
      if (dayGap > DRAFT_WINDOW_DAYS || Math.abs(gap) > Math.max(0.01, amt * DRAFT_AMOUNT_TOLERANCE)) continue;
      cands.push({ line: l, d, gap: Math.round(gap * 100) / 100, dayGap, named: shopNamed(l, d.data) });
    }
  }
  const perLine = new Map<string, number>(); const perDraft = new Map<string, number>();
  for (const c of cands) { perLine.set(c.line.key, (perLine.get(c.line.key) ?? 0) + 1); perDraft.set(c.d.id, (perDraft.get(c.d.id) ?? 0) + 1); }
  const rank = (c: Cand) => (Math.abs(c.gap) < 0.005 ? 0 : 100) + c.dayGap * 10 + (c.named ? 0 : 5);
  const out: DraftMatch[] = []; const usedL = new Set<string>(); const usedD = new Set<string>();
  for (const c of [...cands].sort((a, b) => rank(a) - rank(b))) {
    if (usedL.has(c.line.key) || usedD.has(c.d.id)) continue;
    usedL.add(c.line.key); usedD.add(c.d.id);
    const exact = Math.abs(c.gap) < 0.005; const alone = perLine.get(c.line.key) === 1 && perDraft.get(c.d.id) === 1;
    const reasons = [exact ? "same amount" : `amount differs by ${Math.abs(c.gap).toFixed(2)}`, c.dayGap === 0 ? "same day" : `${c.dayGap} day${c.dayGap > 1 ? "s" : ""} apart`, c.named ? "shop named in bank narration" : "shop not named by the bank"];
    if (!alone) reasons.push("another receipt or bank line could also fit");
    out.push({ lineKey: c.line.key, draftId: c.d.id, certainty: exact && c.dayGap <= 2 && c.named && alone ? "sure" : "check", reasons, amountGap: c.gap, dayGap: c.dayGap });
  }
  return out;
}
