/** Proposed opening balances vs audited closing values [§19]. Differences are shown, never forced. */
import { accountBalance, type Account, type Txn } from "../ledger";
import type { Asset } from "../assets";
import { annualBook } from "./depreciation";
import { OPENING_HEADS, type FyRecord, type OpeningHead } from "./types";

export const HEAD_LABEL: Record<OpeningHead, string> = {
  bank: "Bank balances", cash: "Cash", investments: "Investments", fixedAssets: "Fixed assets (gross)", accumulatedDepreciation: "Accumulated depreciation",
  capitalReserves: "Capital & reserves", loans: "Loans", receivables: "Receivables", payables: "Payables", taxBalances: "Tax balances", other: "Other balances",
};
const ASSET_SIDE: OpeningHead[] = ["bank", "cash", "investments", "fixedAssets", "receivables", "taxBalances", "other"];
const LIAB_SIDE: OpeningHead[] = ["capitalReserves", "loans", "payables", "accumulatedDepreciation"];

export interface OpeningLine { head: OpeningHead; audited: number | null; books: number | null; difference: number | null }
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Opening trial balance for the year after `rec.fy`, using audited closing values, compared with what
 * the books currently hold. A head with no audited figure stays null (never invented) [test 4].
 */
export function openingProposal(rec: FyRecord, books: Partial<Record<OpeningHead, number>>): { lines: OpeningLine[]; balanced: boolean | null; gap: number | null; totalsCheck: string | null } {
  const lines = OPENING_HEADS.map((head) => {
    const a = rec.audited[head]; const b = books[head];
    return { head, audited: a ?? null, books: b ?? null, difference: a != null && b != null ? r2(b - a) : null };
  });
  const have = (h: OpeningHead[]) => h.every((x) => rec.audited[x] != null);
  const sum = (h: OpeningHead[]) => r2(h.reduce((s, x) => s + (rec.audited[x] ?? 0), 0));
  const gap = have(ASSET_SIDE.filter((h) => rec.audited[h] != null)) && Object.keys(rec.audited).length ? r2(sum(ASSET_SIDE) - sum(LIAB_SIDE)) : null;
  let totalsCheck: string | null = null;
  if (rec.totalAssets != null && Math.abs(sum(ASSET_SIDE) - (rec.totalAssets - (rec.audited.accumulatedDepreciation ?? 0))) > 1 && Math.abs(sum(ASSET_SIDE) - rec.totalAssets) > 1)
    totalsCheck = `Asset lines add to ${sum(ASSET_SIDE)} but the balance sheet total is ${rec.totalAssets} — a schedule may be missing`;
  return { lines, balanced: gap == null ? null : Math.abs(gap) <= 1, gap, totalsCheck };
}

/** Next financial year label. */
export function nextFy(fy: string): string { const s = Number(fy.slice(0, 4)) + 1; return `${s}-${String((s + 1) % 100).padStart(2, "0")}`; }

/** Confirming copies audited figures as the next year's opening; earlier source figures stay untouched [§20]. */
export function confirmOpening(rec: FyRecord, today: string, chosen?: Partial<Record<OpeningHead, number>>): FyRecord {
  return { ...rec, confirmedOpening: { ...(chosen ?? rec.audited) }, confirmedOn: today };
}

/**
 * What Ledgerline holds at a year end for one entity, head by head, using only that entity's linked
 * accounts and owned assets [§19, §63]. Heads with no linked source stay undefined (not zero).
 */
export function booksHeads(p: { accounts: Account[]; txns: Txn[]; assets: Asset[]; accountIds: Set<string>; entityId: string; fyEnd: string; fy: string }): Partial<Record<OpeningHead, number>> {
  const mine = p.accounts.filter((a) => p.accountIds.has(a.id));
  const upTo = p.txns.filter((t) => t.date <= p.fyEnd);
  const sum = (kinds: string[], sign = 1) => { const xs = mine.filter((a) => kinds.includes(a.kind)); return xs.length ? r2(sign * xs.reduce((s, a) => s + accountBalance(a, upTo), 0)) : undefined; };
  const own = p.assets.filter((a) => a.ownerEntityId === p.entityId && a.inUse <= p.fyEnd && !(a.soldOn && a.soldOn <= p.fyEnd));
  const out: Partial<Record<OpeningHead, number | undefined>> = {
    bank: sum(["savings", "current"]), cash: sum(["cash"]), investments: sum(["investment", "fixed_deposit"]),
    // Liability accounts already hold the amount owed as a positive number, matching audited figures.
    receivables: sum(["other_asset"]), loans: sum(["loan"]), payables: sum(["other_liability", "credit_card"]),
    fixedAssets: own.length ? r2(own.reduce((s, a) => s + a.cost * (a.sharePct / 100), 0)) : undefined,
    accumulatedDepreciation: own.length ? r2(own.reduce((s, a) => s + annualBook(a, p.fy).accumulated * (a.sharePct / 100), 0)) : undefined,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as Partial<Record<OpeningHead, number>>;
}


/** Heads that are carried by money accounts and can be posted; the others stay register-only. */
export const POSTABLE_HEADS: OpeningHead[] = ["bank", "cash", "investments", "receivables", "loans", "payables", "taxBalances", "other"];
export interface OpeningLink { accountId: string; target: number }
export interface OpeningPostLine { head: OpeningHead; accountId: string; current: number; target: number; amount: number; sign: 1 | -1; txnId: string }
export interface OpeningPlan {
  rows: { head: OpeningHead; audited: number | null; linked: number | null; status: "agrees" | "to post" | "unlinked" | "split mismatch" | "register only" | "exception" | "not in upload"; note: string }[];
  postings: OpeningPostLine[]; blockers: string[]; openingDate: string;
}

/** Stable id from text so the same opening line always maps to the same entry (retries never duplicate). */
export function stableId(text: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193, h3 = 0x9e3779b9, h4 = 0x85ebca6b;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519); h3 = Math.imul(h3 ^ c, 3266489917); h4 = Math.imul(h4 ^ c, 668265263); }
  const hex = [h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${"89ab"[parseInt(hex[16]!, 16) % 4]}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Opening-entry plan for the year after rec.fy [§19]: each audited head is linked to accounts with a target
 * per account; the entry posted is exactly target − balance at the year end, dated 1 April. Nothing is
 * forced: unbalanced figures, missing schedules, unlinked heads or splits that don't add up block posting
 * unless a written reason is recorded for that line.
 */
export function openingPlan(p: { rec: FyRecord; links: Partial<Record<OpeningHead, OpeningLink[]>>; exceptions: Partial<Record<OpeningHead | "balance" | "schedules", string>>; accounts: Account[]; txns: Txn[]; missingSchedules: string[]; fyEnd: string }): OpeningPlan {
  const openingDate = `${Number(p.rec.fy.slice(0, 4)) + 1}-04-01`;
  const upTo = p.txns.filter((t) => t.date <= p.fyEnd);
  const prop = openingProposal(p.rec, {});
  const why = (k: OpeningHead | "balance" | "schedules") => (p.exceptions[k] ?? "").trim();
  const blockers: string[] = [];
  if (prop.balanced === false && why("balance").length < 5) blockers.push(`Audited figures don't balance by ${prop.gap} — upload the missing schedule or record why`);
  if (prop.totalsCheck && why("balance").length < 5) blockers.push(prop.totalsCheck);
  if (p.missingSchedules.length && why("schedules").length < 5) blockers.push(`Schedules not uploaded: ${p.missingSchedules.join(", ")} — upload them or record why`);
  const rows: OpeningPlan["rows"] = []; const postings: OpeningPostLine[] = [];
  for (const head of OPENING_HEADS) {
    const audited = p.rec.audited[head] ?? null;
    const links = (p.links[head] ?? []).filter((l) => p.accounts.some((a) => a.id === l.accountId));
    if (!POSTABLE_HEADS.includes(head)) { if (audited != null) rows.push({ head, audited, linked: null, status: "register only", note: head === "capitalReserves" ? "Recorded for the balance check; not a money account" : "Compared with the asset register" }); continue; }
    if (audited == null && !links.length) continue;
    if (audited == null) { rows.push({ head, audited, linked: null, status: "not in upload", note: "No audited figure — nothing is posted" }); continue; }
    if (!links.length) {
      if (why(head).length >= 5) rows.push({ head, audited, linked: null, status: "exception", note: why(head) });
      else { rows.push({ head, audited, linked: null, status: "unlinked", note: "Choose the account(s) that hold this balance" }); blockers.push(`${HEAD_LABEL[head]}: choose the account(s) or record why it is left out`); }
      continue;
    }
    const total = r2(links.reduce((s, l) => s + l.target, 0));
    if (Math.abs(total - audited) > 1 && why(head).length < 5) { rows.push({ head, audited, linked: total, status: "split mismatch", note: `Account amounts add to ${total}, audited is ${audited}` }); blockers.push(`${HEAD_LABEL[head]}: account amounts must add up to the audited figure`); continue; }
    let moves = 0;
    for (const l of links) {
      const a = p.accounts.find((x) => x.id === l.accountId)!;
      const current = accountBalance(a, upTo);
      const diff = r2(l.target - current);
      if (Math.abs(diff) < 0.005) continue;
      moves++;
      postings.push({ head, accountId: a.id, current, target: l.target, amount: Math.abs(diff), sign: diff > 0 ? 1 : -1, txnId: stableId(`opening|${p.rec.entityId}|${p.rec.fy}|${a.id}`) });
    }
    rows.push({ head, audited, linked: total, status: moves ? "to post" : "agrees", note: Math.abs(total - audited) > 1 ? `Exception: ${why(head)}` : "" });
  }
  const dup = new Set<string>();
  for (const x of postings) { if (dup.has(x.accountId)) blockers.push("An account is linked to more than one balance line"); dup.add(x.accountId); }
  return { rows, postings, blockers: [...new Set(blockers)], openingDate };
}
