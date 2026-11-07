import { merchantKey, type MerchantAliases } from "./intelligence";
import type { Expense } from "./expenses";

export interface MerchantGroupingEvent {
  id: string;
  date: string;
  title: string;
  before: MerchantAliases;
  after: MerchantAliases;
  entryIds: string[];
  entrySnapshot?: ReturnType<typeof merchantEntrySnapshot>;
  reverses?: string;
}

/** Compare grouping for every original name, including indirect alias chains. */
export function merchantGroupingChanges(entries: Expense[], before: MerchantAliases, after: MerchantAliases) {
  return entries.flatMap(entry => {
    if (!entry.merchant) return [];
    const from = merchantKey(entry.merchant, before), to = merchantKey(entry.merchant, after);
    return from === to ? [] : [{ id: entry.id, from, to, entry }];
  });
}

/** All affected original fields are bound to the review; incoming records invalidate it too. */
export function merchantReviewSnapshot(entries: Expense[], before: MerchantAliases, after: MerchantAliases) {
  return JSON.stringify(merchantGroupingChanges(entries, before, after).sort((a, b) => a.id.localeCompare(b.id)));
}

/** Original financial fields bound to the authoritative review, in stable identifier order. */
export function merchantEntrySnapshot(entries: Expense[], before: MerchantAliases, after: MerchantAliases) {
  return merchantGroupingChanges(entries, before, after).map(({ entry }) => ({
    id: entry.id, merchant: entry.merchant, amount: entry.amount, date: entry.date,
    currency: entry.currency, originalAmount: entry.originalAmount ?? null, title: entry.title,
  })).sort((a, b) => a.id.localeCompare(b.id));
}

export function reverseMerchantGrouping(aliases: MerchantAliases, event: MerchantGroupingEvent, history: MerchantGroupingEvent[] = []): MerchantAliases {
  const next = { ...aliases };
  const keys = new Set([...Object.keys(event.before), ...Object.keys(event.after)]);
  const changed = new Set([...keys].filter(key => event.before[key] !== event.after[key]));
  const index = history.findIndex(item => item.id === event.id);
  if (index >= 0 && history.slice(index + 1).some(item => [...changed].some(key => item.before[key] !== item.after[key]))) {
    throw Error("Merchant group was edited after this merge. Reverse its latest change first.");
  }
  for (const key of keys) {
    if (event.before[key] === event.after[key]) continue;
    if (aliases[key] !== event.after[key]) throw Error("Merchant group changed later. Review its current names before separating.");
    const prior = event.before[key];
    if (prior === undefined) delete next[key]; else next[key] = prior;
  }
  // Unrelated new chains can now depend on an edited key; do not silently regroup them.
  for (const key of Object.keys(aliases)) {
    if (!changed.has(key) && merchantKey(key, aliases) !== merchantKey(key, next) && event.before[key] !== aliases[key]) {
      throw Error("A newer merchant group depends on this merge. Review it before reversing.");
    }
  }
  return next;
}