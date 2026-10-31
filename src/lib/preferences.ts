import { CATEGORIES, memberShares, type Expense } from "./expenses";

export interface CategorySetting { name: string; archived: boolean }
export interface GroupedTag { group: string; name: string }
export interface ScopedBudget { id: string; name: string; amount: number; period: "monthly" | "annual"; kind: "overall" | "category" | "person" | "project" | "travel"; value: string; start: string; carry: boolean }
export interface FinancePreferences { categories: CategorySetting[]; tags: GroupedTag[]; budgets: ScopedBudget[]; homeHidden: string[]; homeOrder: string[]; theme: "light" | "dark" | "system"; reminders: boolean }
export function defaultPreferences(): FinancePreferences {
  return { categories: CATEGORIES.map(name => ({ name, archived: false })), tags: ["VEI", "MOVAC", "AK Meridian", "KR Enterprises"].map(name => ({ group: "Organisation", name })), budgets: [], homeHidden: [], homeOrder: ["safe", "accounts", "summary", "family", "recent"], theme: "system", reminders: true };
}
export const tagValue = (t: GroupedTag) => `${t.group}: ${t.name}`;
export function budgetSpend(e: Expense, b: ScopedBudget): number {
  if ((e.txnType ?? "expense") !== "expense") return 0;
  if (b.kind === "category") return e.category === b.value ? e.amount : 0;
  if (b.kind === "person") return memberShares(e).find(s => (s.memberId ?? "me") === b.value)?.amount ?? 0;
  if (b.kind === "project" || b.kind === "travel") return (e.tags ?? []).includes(b.value) ? e.amount : 0;
  return e.amount;
}
/** Carry forward only unused allowance, never overspending. Annual periods reset in January. */
export function scopedBudgetUsage(b: ScopedBudget, entries: Expense[], today: string) {
  const start = b.period === "annual" ? `${today.slice(0,4)}-01-01` : `${today.slice(0,7)}-01`;
  const end = b.period === "annual" ? `${today.slice(0,4)}-12-31` : new Date(Date.UTC(Number(today.slice(0,4)), Number(today.slice(5,7)), 0)).toISOString().slice(0,10);
  const currentStart = start > b.start ? start : b.start;
  let carry = 0;
  if (b.carry && b.start < start) {
    let cursor = b.period === "annual" ? `${b.start.slice(0,4)}-01-01` : `${b.start.slice(0,7)}-01`;
    for (let n=0; cursor < start && n<1200; n++) {
      const next = b.period === "annual" ? `${Number(cursor.slice(0,4))+1}-01-01` : new Date(Date.UTC(Number(cursor.slice(0,4)),Number(cursor.slice(5,7)),1)).toISOString().slice(0,10);
      const spent = entries.filter(e => e.date >= b.start && e.date >= cursor && e.date < next).reduce((s,e)=>s+budgetSpend(e,b),0);
      carry = Math.max(0,b.amount+carry-spent); cursor=next;
    }
  }
  const spent = entries.filter(e=>e.date>=currentStart && e.date<=today && e.date<=end).reduce((s,e)=>s+budgetSpend(e,b),0);
  const allowance=b.amount+carry;
  const elapsed=Math.max(1,(Date.parse(today)-Date.parse(currentStart))/864e5+1);
  const length=Math.max(1,(Date.parse(end)-Date.parse(currentStart))/864e5+1);
  return { spent, carry, allowance, remaining: allowance-spent, percent: allowance ? spent/allowance*100 : 0, estimate: spent/elapsed*length, end };
}