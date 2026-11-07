// Safe internal-transfer matching (V5.10.3 §9–12). Pure: suggests pairs, never saves.
// Strong = equal original amount + currency, within 3 days, on two different owned accounts,
// AND independent evidence (shared bank reference, or narration naming the other account).
import type { Expense } from "./expenses";
import { cashflow, type Account } from "./ledger";
import { bankRef } from "./statement-fingerprint";

export interface TransferLinkRow { id: string; debit_id: string; credit_id: string | null; source_account: string; dest_account: string; status: string; cancelled_at: string | null; source_amount: number; source_currency: string; created_at: string }
export interface TransferSuggestion { key: string; debit: Expense; credit: Expense | null; destId: string; strength: "strong" | "ambiguous" | "weak"; evidence: string[]; candidates: number }
export type TransferStatus = "proposed" | "awaiting_source" | "awaiting_destination" | "partially_matched" | "matched" | "reconciled" | "conflict" | "cancelled";
export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = { proposed: "Proposed", awaiting_source: "Awaiting source entry", awaiting_destination: "Awaiting destination entry", partially_matched: "Partially matched", matched: "Matched", reconciled: "Reconciled", conflict: "Conflict", cancelled: "Cancelled" };

const MONEY = ["savings", "current", "cash", "wallet"];
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
const free = (e: Expense) => !e.splits.length && !(e.allocations ?? []).length && !(e.workspaceAllocations ?? []).length && (e.reimbursementStatus ?? "none") === "none" && !e.tripId && !(e.tags??[]).some(t=>t.startsWith('Trip:')) && !/^(Scheduled occurrence:|Reimbursed entries:)/.test(e.description??'');
const text = (e: Expense) => `${e.title} ${e.merchant ?? ""} ${e.description ?? ""} ${e.statementRef ?? ""}`.toUpperCase();
const ref = (e: Expense) => bankRef(`${e.statementRef ?? ""} ${e.description ?? ""}`);
function names(a: Account) { return [a.lastFour, ...(a.name.match(/\d{4,}/g) ?? []).map((d) => d.slice(-4))].filter((x): x is string => !!x && x.length >= 4); }

function evidence(d: Expense, c: Expense, src: Account, dst: Account): string[] {
  const out: string[] = [];
  const r1 = ref(d), r2 = ref(c);
  if (r1 && r1 === r2) out.push(`Same bank reference ${r1}`);
  if (names(dst).some((n) => text(d).includes(n))) out.push(`Debit narration names ${dst.name}`);
  if (names(src).some((n) => text(c).includes(n))) out.push(`Credit narration names ${src.name}`);
  return out;
}

export function activeLinks(links: TransferLinkRow[]) { return links.filter((l) => !l.cancelled_at); }

/** Current canonical ledger cannot preserve independently dated/converted credits. Block rather than change a balance. */
export function transferPairBlocker(debit: Expense, credit: Expense | null) {
  if (!['expense','transfer'].includes(debit.txnType??'expense') || debit.transferCounterpartOf) return 'Source is not an unlinked outgoing entry; review individually.';
  if (![debit.amount,debit.originalAmount,...(credit?[credit.amount,credit.originalAmount]:[])].every(n=>Number.isFinite(n)&&n>0)) return 'Enter valid positive original and converted amounts before linking.';
  if (!free(debit) || Object.keys(debit.reimbursement ?? {}).length) return 'Source has linked claims, trips or splits; review individually.';
  if (!credit) return null;
  if (!free(credit) || Object.keys(credit.reimbursement ?? {}).length || !['income','refund'].includes(credit.txnType ?? 'expense')) return 'Receiving entry has linked financial details or is not incoming; review individually.';
  if (debit.currency !== credit.currency || Math.abs(debit.originalAmount-credit.originalAmount) >= 0.005 || Math.abs(debit.amount-credit.amount) >= 0.005) return 'Independent currency values differ; linking is blocked to preserve both balances.';
  if (debit.date !== credit.date) return 'Different posting dates require individual review to preserve dated balances.';
  return null;
}

export function transferApprovalBlocker(debit: Expense, credit: Expense | null, destId: string, accounts: Account[]) {
  const pair=transferPairBlocker(debit,credit);if(pair)return pair;
  const source=accounts.find(a=>a.id===debit.accountId&&!a.archived),dest=accounts.find(a=>a.id===destId&&!a.archived);
  if(!source||!dest||source.id===dest.id)return 'Choose two different active accounts you own.';
  if(!MONEY.includes(source.kind)||!MONEY.includes(dest.kind))return 'Card payments, loans and investments require their dedicated review.';
  if(credit&&(credit.accountId!==destId||credit.id===debit.id||credit.transferCounterpartOf))return 'Receiving entry must be unlinked and on the destination account.';
  if(debit.txnType==='transfer'&&debit.toAccountId&&debit.toAccountId!==destId)return 'Receiving account differs from the existing transfer.';
  return null;
}

/** Unlinked outgoing entries paired with incoming entries on another owned account. */
export function suggestTransfers(txns: Expense[], accounts: Account[], links: TransferLinkRow[]): TransferSuggestion[] {
  const used = new Set(activeLinks(links).flatMap((l) => [l.debit_id, l.credit_id ?? ""]));
  const awaiting = new Map(activeLinks(links).filter((l) => !l.credit_id).map((l) => [l.debit_id, l]));
  const acc = (id?: string | null) => accounts.find((a) => a.id === id && !a.archived);
  const debits = txns.filter((t) => (awaiting.has(t.id) || !used.has(t.id)) && free(t) && MONEY.includes(acc(t.accountId)?.kind ?? "") && ((t.txnType ?? "expense") === "expense" || ((t.txnType === "transfer") && (!t.toAccountId || awaiting.has(t.id)))));
  const credits = txns.filter((t) => !used.has(t.id) && !t.transferCounterpartOf && ["income", "refund"].includes(t.txnType ?? "expense") && acc(t.accountId));
  const out: TransferSuggestion[] = [];
  const claimed = new Map<string, number>();
  for (const d of debits) {
    const src = acc(d.accountId);
    if (!src) continue;
    const fixedDest = awaiting.get(d.id)?.dest_account ?? (d.txnType === "transfer" ? d.toAccountId : null);
    const cands = credits.filter((c) => c.accountId !== d.accountId && (!fixedDest || c.accountId === fixedDest) && c.currency === d.currency && Math.abs(c.originalAmount - d.originalAmount) < 0.005 && days(c.date, d.date) <= 3);
    const scored = cands.flatMap(c => { const dst=acc(c.accountId);return dst?[{c,ev:evidence(d,c,src,dst)}]:[]; });
    const strong = scored.filter((s) => s.ev.length);
    if (strong.length === 1) { const s = strong[0]; if(!s?.c.accountId)continue;const blocker=transferApprovalBlocker(d,s.c,s.c.accountId,accounts);out.push({ key: `${d.id}:${s.c.id}`, debit: d, credit: s.c, destId: s.c.accountId, strength: blocker?'ambiguous':"strong", evidence: blocker?[...s.ev,blocker]:s.ev, candidates: cands.length }); claimed.set(s.c.id, (claimed.get(s.c.id) ?? 0) + 1); }
    else if (strong.length > 1) out.push({ key: `${d.id}:?`, debit: d, credit: null, destId: "", strength: "ambiguous", evidence: [`${strong.length} entries look equally likely`], candidates: cands.length });
    else { const first=cands[0];if(first)out.push({ key: `${d.id}:${first.id}`, debit: d, credit: cands.length === 1 ? first : null, destId: cands.length === 1 ? first.accountId??'' : "", strength: "weak", evidence: ["Same amount and date only — confirm it yourself"], candidates: cands.length }); }
  }
  // A credit claimed by two strong suggestions is a conflict, never auto-linked.
  return out.map((s) => (s.strength === "strong" && s.credit && (claimed.get(s.credit.id) ?? 0) > 1 ? { ...s, strength: "ambiguous" as const, evidence: ["Receiving entry matches more than one debit"] } : s));
}

export function transferStatus(l: TransferLinkRow, txns: Expense[], counterparts: Expense[]): TransferStatus {
  if (l.cancelled_at) return "cancelled";
  const d = txns.find((t) => t.id === l.debit_id);
  if (!d) return "awaiting_source";
  if (!l.credit_id) return "awaiting_destination";
  const c = counterparts.find((t) => t.id === l.credit_id);
  if (!c) return "conflict";
  return d.reconciledAt && c.reconciledAt ? "reconciled" : d.reconciledAt || c.reconciledAt ? "partially_matched" : "matched";
}

/** What confirming does: income and spending fall by what was double counted; balances unchanged when both sides exist. */
export function transferImpact(debit: Expense, credit: Expense | null) {
  const before = cashflow([debit, ...(credit ? [credit] : [])]);
  return { incomeChange: -before.income, spendingChange: -before.spent, newPostings: 0 };
}
