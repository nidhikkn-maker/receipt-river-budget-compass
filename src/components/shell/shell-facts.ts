import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { inboxItems } from "@/lib/inbox";
import { centreReview, reviewCounts } from "@/lib/review-centre";
import { todayISO } from "@/lib/use-position";

/** Indian-grouped whole rupees for headline figures; the exact amount stays in the title attribute. */
export function wholeRupees(n: number): string {
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n); }
  catch { return `₹${Math.round(n)}`; }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-08" → "8 Nov 2026"; anything else is returned unchanged. */
export function shortDate(iso: string | null | undefined, withYear = true): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ""}${withYear ? ` ${m[1]}` : ""}`;
}
export const monthAbbr = (iso: string) => (MONTHS[Number(iso.slice(5, 7)) - 1] ?? "").toUpperCase();
export const dayOfMonth = (iso: string) => String(Number(iso.slice(8, 10)));

export function greeting(hour: number): string {
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/** "MONDAY, 10 NOVEMBER 2026" for the Home overline. */
export function longDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace(/^(\w+) /, "$1, ");
}

/**
 * What needs the owner, derived from the same pure rules Financial Inbox uses (inbox.ts, review-centre.ts).
 * Counts are computed from records loaded on this device; they clear on their own when records are fixed.
 */
export function useAttention() {
  const store = useStore();
  const today = todayISO();
  return useMemo(() => {
    const items = inboxItems({ transactions: store.transactions, accounts: store.accounts, commitments: store.commitments, prefs: store.preferences, today, pendingCount: store.pendingCount });
    const dismissed = new Set(store.preferences.inboxDismissed);
    const open = items.filter((i) => !dismissed.has(i.key));
    const categories = store.preferences.categories.filter((c) => !c.archived).map((c) => c.name);
    const counts = reviewCounts(centreReview(open, store.transactions, store.accounts, categories));
    const reminders = open.filter((i) => !i.transactionId && !i.accountId).length;
    const statements = open.filter((i) => !!i.accountId && !i.transactionId).length;
    return { review: counts.transactions, reminders, statements, total: counts.transactions + reminders + statements, counts };
  }, [store.transactions, store.accounts, store.commitments, store.preferences, store.pendingCount, today]);
}
