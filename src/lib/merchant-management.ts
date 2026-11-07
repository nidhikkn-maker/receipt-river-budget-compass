import { merchantKey, type MerchantAliases } from "./intelligence";
import type { Expense } from "./expenses";

export interface MerchantGroupingEvent {
  id: string;
  date: string;
  title: string;
  before: MerchantAliases;
  after: MerchantAliases;
  entryIds: string[];
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

export function reverseMerchantGrouping(aliases: MerchantAliases, event: MerchantGroupingEvent): MerchantAliases {
  const next = { ...aliases };
  const keys = new Set([...Object.keys(event.before), ...Object.keys(event.after)]);
  const changed = new Set([...keys].filter(key => event.before[key] !== event.after[key]));
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