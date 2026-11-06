/**
 * Assets in the shared ledger [v6 §21, §26–30, §34]. Pure rules plus a deterministic id helper:
 * approved depreciation is posted once per asset per month as a non-cash "adjustment" that lowers the
 * asset's own ledger account (never a bank account), so book value in reports and net worth agree.
 */
import type { Asset } from "../assets";
import type { AssetEvent, ClosedPeriod, Journal } from "./types";
import { monthlyBook, nextMonth, prepareJournals } from "./depreciation";
import { closedPeriodFor } from "./periods";

/** Stable UUID (v5-style, SHA-1) so a retried post finds the entry it already created. */
export async function stableUuid(...parts: string[]): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(`ledgerline:${parts.join("|")}`))).slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const h = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export const depreciationEntryKey = (assetId: string, month: string) => ["depreciation", assetId, month] as const;

const monthEnd = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);

/** Ledger entry for one approved journal, or the reason it can't be posted. */
export function depreciationEntry(j: Journal, a: Asset | undefined, closed: ClosedPeriod[]): { ok: true; entry: { title: string; category: string; date: string; amount: number; accountId: string; description: string } } | { ok: false; reason: string } {
  if (!a) return { ok: false, reason: "asset no longer exists" };
  if (!a.accountId) return { ok: false, reason: `${a.name}: link a ledger asset account first` };
  if (j.amount <= 0) return { ok: false, reason: `${a.name}: nothing to post` };
  const date = monthEnd(j.period);
  if (closedPeriodFor(date, closed)) return { ok: false, reason: `${j.period} is closed` };
  return { ok: true, entry: { title: `Depreciation · ${a.name} · ${j.period}`, category: "Depreciation", date, amount: j.amount, accountId: a.accountId, description: `Book depreciation ${j.period} (non-cash). Asset ${a.tag || a.id}.` } };
}

/** Completed months since put-to-use that have no journal yet — prepared automatically on opening the page [§34]. */
export function dueMonths(a: Asset, journals: Journal[], today: string, limit = 24): string[] {
  if (a.kind === "property" || a.soldOn && a.soldOn < a.inUse) return [];
  const lastDone = (() => { const d = new Date(today + "T00:00:00Z"); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
  const have = new Set(journals.filter((j) => j.assetId === a.id).map((j) => j.period));
  const rows = monthlyBook(a, lastDone).filter((r) => r.depreciation > 0 && !have.has(r.month));
  return rows.slice(-limit).map((r) => r.month);
}

/** Exceptions that stop depreciation running for an asset [§34]. */
export function depreciationExceptions(a: Asset): string[] {
  if (a.kind === "property") return [];
  const out: string[] = [];
  if (!(a.cost > 0)) out.push("no cost");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.inUse)) out.push("no put-to-use date");
  if (!a.usefulLifeYears && !a.bookRatePct) out.push("no useful life or rate");
  if (!a.accountId) out.push("no ledger asset account to post to");
  return out;
}

/** Apply a lifecycle event to the asset itself — events change the register, not just add a note [§28, §30]. */
export function applyEvent(a: Asset, e: AssetEvent): Asset {
  switch (e.kind) {
    case "location": return e.to ? { ...a, location: e.to } : a;
    case "custodian": return e.to ? { ...a, custodian: e.to } : a;
    case "transfer": return e.to ? { ...a, department: e.to } : a;
    case "verified": return { ...a, lastVerified: e.date, condition: a.condition === "missing" ? "ok" : a.condition ?? "ok" };
    case "missing": return { ...a, condition: "missing" };
    case "damaged": return { ...a, condition: "damaged" };
    case "impairment": return e.value && e.value > 0 ? { ...a, adjustments: [...(a.adjustments ?? []), { date: e.date, amount: -e.value, kind: "impairment", note: e.note }] } : a;
    case "revaluation": return e.value ? { ...a, adjustments: [...(a.adjustments ?? []), { date: e.date, amount: e.value, kind: "revaluation", note: e.note }] } : a;
    case "disposal": return { ...a, soldOn: e.date, ...(e.value != null ? { saleValue: e.value } : {}) };
    case "capitalised": return { ...a, capitalisedOn: e.date };
    default: return a;
  }
}

/** Gain or loss on disposal: proceeds minus net book value at the disposal date. */
export function disposalResult(a: Asset): { nbv: number; proceeds: number; gain: number } | null {
  if (!a.soldOn) return null;
  const rows = monthlyBook(a, a.soldOn.slice(0, 7));
  const nbv = rows.at(-1)?.nbv ?? a.cost;
  const proceeds = a.saleValue ?? 0;
  return { nbv, proceeds, gain: Math.round((proceeds - nbv) * 100) / 100 };
}

/** Likely payment for an asset invoice: amount within 1%, within 30 days, supplier named — one clear best only [§27]. */
export function suggestPayment(a: Asset, txns: { id: string; date: string; amount: number; text: string; txnType?: string | undefined }[]): string | null {
  const day = (d: string) => Date.parse(d) / 864e5;
  const base = a.purchaseDate ?? a.inUse;
  const sup = (a.supplier ?? "").toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
  const cands = txns.filter((t) => (t.txnType ?? "expense") !== "income" && Math.abs(t.amount - a.cost) <= a.cost * 0.01 && Math.abs(day(t.date) - day(base)) <= 30)
    .map((t) => ({ t, s: (sup.some((w) => t.text.toLowerCase().includes(w)) ? 10 : 0) - Math.abs(day(t.date) - day(base)) / 10 }))
    .sort((x, y) => y.s - x.s);
  if (!cands.length) return null;
  if (cands.length > 1 && cands[0]!.s - cands[1]!.s < 1) return null;
  return cands[0]!.t.id;
}

/** Asset invoices below the approved capitalisation limit are expensed, not capitalised [§27]. */
export function capitalise(cost: number, min: number | undefined): "capitalise" | "expense" | "ask" {
  if (min == null) return "ask";
  return cost >= min ? "capitalise" : "expense";
}
export { nextMonth };

/**
 * Scheduled monthly run [§34] — the same preparation the Assets page does on opening, so it happens even if the
 * page is never opened. Journal ids are stable per asset-month, so a rerun (or a concurrent page open) never
 * duplicates; closed months are skipped; posting still needs the owner's approval.
 */
export async function scheduledRun(assets: Asset[], journals: Journal[], closed: ClosedPeriod[], today: string): Promise<{ journals: Journal[]; added: Journal[]; exceptions: { assetId: string; name: string; reasons: string[] }[] }> {
  const live = assets.filter((a) => a.kind !== "property" && !a.soldOn);
  const exceptions = live.map((a) => ({ assetId: a.id, name: a.name, reasons: depreciationExceptions(a) })).filter((x) => x.reasons.length);
  const runnable = live.filter((a) => !exceptions.some((x) => x.assetId === a.id && x.reasons.some((r) => r !== "no ledger asset account to post to")));
  let all = journals; const added: Journal[] = [];
  const months = [...new Set(runnable.flatMap((a) => dueMonths(a, all, today)))].sort();
  for (const m of months) {
    const r = prepareJournals(runnable, m, all, closed, () => crypto.randomUUID());
    // Stable id per asset-month so reruns and retries never create a second journal.
    const fixed = await Promise.all(r.journals.map(async (j) => ({ ...j, id: await stableUuid("journal", j.assetId, m) })));
    all = [...all, ...fixed]; added.push(...fixed);
  }
  return { journals: all, added, exceptions };
}

/** What the Inbox card shows: prepared journals waiting for approval, grouped by month. */
export function preparedSummary(journals: Journal[]): { month: string; count: number; total: number }[] {
  const by = new Map<string, { count: number; total: number }>();
  for (const j of journals) if (j.status === "prepared") { const v = by.get(j.period) ?? { count: 0, total: 0 }; v.count++; v.total = Math.round((v.total + j.amount) * 100) / 100; by.set(j.period, v); }
  return [...by.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([month, v]) => ({ month, ...v }));
}

/** Non-cash ledger postings for recorded impairments and disposals [§29–30]. Impairment lowers the asset
 * account by the write-down; disposal removes the remaining book value (sale proceeds are the separate bank
 * entry you already record). Each has a stable key so a retry never posts twice; closed periods are refused. */
export interface EventPosting { key: string[]; kind: "impairment" | "disposal"; title: string; date: string; amount: number; accountId: string; description: string }
export function eventPostings(a: Asset, closed: ClosedPeriod[]): { postings: EventPosting[]; problems: string[] } {
  const postings: EventPosting[] = []; const problems: string[] = [];
  const add = (p: Omit<EventPosting, "accountId">) => {
    if (!a.accountId) { problems.push(`${a.name}: link a ledger asset account first`); return; }
    if (closedPeriodFor(p.date, closed)) { problems.push(`${a.name}: ${p.date} is in a closed period`); return; }
    if (!(p.amount > 0)) return;
    postings.push({ ...p, accountId: a.accountId });
  };
  for (const adj of a.adjustments ?? []) if (adj.kind === "impairment" && adj.amount < 0) {
    const amt = Math.round(-adj.amount * 100) / 100;
    add({ key: ["impairment", a.id, adj.date, String(amt)], kind: "impairment", title: `Impairment · ${a.name}`, date: adj.date, amount: amt, description: `Write-down (non-cash)${adj.note ? `: ${adj.note}` : ""}. Asset ${a.tag || a.id}.` });
  }
  const d = disposalResult(a);
  if (a.soldOn && d) add({ key: ["disposal", a.id, a.soldOn], kind: "disposal", title: `Disposal · ${a.name}`, date: a.soldOn, amount: Math.round(d.nbv * 100) / 100, description: `Book value removed on disposal (non-cash); proceeds ${d.proceeds}, ${d.gain >= 0 ? "gain" : "loss"} ${Math.abs(d.gain)}. Asset ${a.tag || a.id}.` });
  return { postings, problems };
}
