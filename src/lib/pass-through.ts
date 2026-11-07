/** Money received from one party and sent on to another from the same account — a candidate to record as a transfer rather than income + spending. */
export type PassRecord = { id: string; date: string; amount: number; currency: string; accountId?: string | null; txnType?: string; title: string };
export type PassPair = { incoming: PassRecord; outgoing: PassRecord; dayGap: number };

const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

export function findPassThroughPairs(records: PassRecord[], minAmount = 100000, windowDays = 3): PassPair[] {
  const ins = records.filter((r) => r.txnType === "income" && r.amount >= minAmount);
  const outs = records.filter((r) => (r.txnType ?? "expense") === "expense" && r.amount >= minAmount);
  const used = new Set<string>();
  const pairs: PassPair[] = [];
  for (const i of ins.sort((a, b) => a.date.localeCompare(b.date))) {
    const c = outs.filter((o) => !used.has(o.id) && o.accountId === i.accountId && o.currency === i.currency && Math.abs(o.amount - i.amount) < 0.005 && days(o.date, i.date) <= windowDays && o.date >= i.date);
    if (c.length !== 1) continue; // ambiguous or none: never guess
    used.add(c[0]!.id);
    pairs.push({ incoming: i, outgoing: c[0]!, dayGap: days(c[0]!.date, i.date) });
  }
  return pairs;
}
