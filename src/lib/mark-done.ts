// Which upcoming payments can be marked done right now (pure, tested).
// Only a commitment's current due date can be marked, once, so bulk marking can't skip or double-record a period.
export interface UpcomingLike { commitmentId?: string | null; date: string; overdue?: boolean; amount: number; direction: "in" | "out" }
export interface CommitmentLike { id: string; nextDue: string; status: string; amount: number }

export function markableKey(u: UpcomingLike) { return `${u.commitmentId}|${u.date}`; }

export function markableUpcoming<U extends UpcomingLike>(upcoming: U[], commitments: CommitmentLike[]): U[] {
  const seen = new Set<string>();
  return upcoming.filter((u) => {
    const c = commitments.find((x) => x.id === u.commitmentId);
    if (!c || c.status !== "active" || (!u.overdue && u.date !== c.nextDue) || seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

export function bulkTotals(items: UpcomingLike[]) {
  const out = items.filter((u) => u.direction === "out").reduce((s, u) => s + u.amount, 0);
  const inn = items.filter((u) => u.direction === "in").reduce((s, u) => s + u.amount, 0);
  return { count: items.length, out: Math.round(out * 100) / 100, in: Math.round(inn * 100) / 100 };
}
