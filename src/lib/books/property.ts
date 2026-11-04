/** Property operations: leases, escalation, tenant ledger, occupancy [§37–41]. Pure, read-only. */
import { LEASE_TERMS, type Lease, type Property, type PropertyCost } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;
const monthsBetween = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

/** Rent due in a month after compounding escalations from lease start. */
export function rentFor(l: Lease, month: string): number {
  if (month < l.start.slice(0, 7) || month > l.end.slice(0, 7)) return 0;
  const pct = l.escalationPct ?? 0, every = l.escalationEveryMonths ?? 0;
  const steps = pct > 0 && every > 0 ? Math.floor(monthsBetween(l.start, `${month}-01`) / every) : 0;
  return r2(l.rent * (1 + pct / 100) ** steps);
}

/** Next escalation date and new rent, if any. */
export function nextEscalation(l: Lease, today: string): { date: string; rent: number } | null {
  const every = l.escalationEveryMonths ?? 0;
  if (!((l.escalationPct ?? 0) > 0 && every > 0)) return null;
  const s = new Date(l.start + "T00:00:00Z");
  for (let i = 1; i < 100; i++) {
    const d = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + i * every, s.getUTCDate())).toISOString().slice(0, 10);
    if (d > l.end) return null;
    if (d > today) return { date: d, rent: rentFor(l, d.slice(0, 7)) };
  }
  return null;
}

export interface Receipt { id: string; date: string; amount: number; text: string; accountId?: string | null | undefined; currency?: string | undefined }
export type LedgerRowKind = "rent" | "deposit" | "other";
export interface TenantRow { month: string; due: number; rent: number; deposit: number; other: number; balance: number; status: "paid" | "partial" | "unpaid" | "advance" | "none" }

/** Classify a bank receipt for a lease: deposits are never rent [§39, test 10]. */
export function receiptKind(text: string, amount?: number, lease?: Lease): LedgerRowKind {
  // An amount equal to the deposit is not evidence on its own; only wording or a document says "deposit".
  void amount; void lease;
  if (/\b(security\s*)?deposit\b|advance\s*security|refundable/i.test(text)) return "deposit";
  if (/maintenance|electricity|water|reimburse|penalty|late fee/i.test(text)) return "other";
  return "rent";
}

/** How well a receipt fits a lease: tenant named, right account, currency, amount near expected rent/deposit, date near due day [§23]. */
export function leaseScore(l: Lease, p: Property | undefined, r: Receipt): number {
  if (r.date < l.start) return 0;
  const text = r.text.toLowerCase();
  const tenant = l.tenant.trim().toLowerCase();
  const named = tenant.length >= 3 && text.includes(tenant);
  const prop = !!p && p.name.trim().length >= 3 && text.includes(p.name.trim().toLowerCase());
  if (!named && !prop) return 0;
  if (l.currency && r.currency && l.currency !== r.currency) return 0;
  if (l.accountId && r.accountId && l.accountId !== r.accountId) return 0;
  let s = named ? 50 : 20;
  if (l.accountId && r.accountId === l.accountId) s += 15;
  const due = rentFor(l, r.date.slice(0, 7));
  if (due > 0 && Math.abs(r.amount - due) <= Math.max(1, due * 0.01)) s += 25;
  else if (l.deposit && Math.abs(r.amount - l.deposit) <= 1) s += 20;
  if (l.dueDay) { const d = Math.abs(Number(r.date.slice(8, 10)) - l.dueDay); if (d <= 5) s += 10; }
  return s;
}

/** Each receipt goes to at most one lease — the best-scoring one; ties stay unallocated for review [§39]. */
export function allocateReceipts(leases: Lease[], properties: Property[], income: Receipt[]): { byLease: Record<string, Receipt[]>; ambiguous: Receipt[] } {
  const byLease: Record<string, Receipt[]> = Object.fromEntries(leases.map((l) => [l.id, []]));
  const ambiguous: Receipt[] = [];
  for (const r of income) {
    const scored = leases.map((l) => ({ l, s: leaseScore(l, properties.find((p) => p.id === l.propertyId), r) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    if (!scored.length) continue;
    if (scored.length > 1 && scored[0]!.s === scored[1]!.s) { ambiguous.push(r); continue; }
    byLease[scored[0]!.l.id]!.push(r);
  }
  return { byLease, ambiguous };
}

/** Receipts allocated to this lease (exclusive across all leases when the full list is given). */
export function leaseReceipts(l: Lease, p: Property | undefined, income: Receipt[], all?: { leases: Lease[]; properties: Property[] }): Receipt[] {
  if (all) return allocateReceipts(all.leases, all.properties, income).byLease[l.id] ?? [];
  return income.filter((r) => leaseScore(l, p, r) > 0);
}

/** Tenant ledger with running arrears/advance [§39–40, test 9]. */
export function tenantLedger(l: Lease, p: Property | undefined, income: Receipt[], months: string[], all?: { leases: Lease[]; properties: Property[] }): TenantRow[] {
  const mine = leaseReceipts(l, p, income, all);
  let owed = 0;
  // Carry arrears/advance from the lease start so earlier months are never lost.
  const first = months[0];
  if (first) {
    let m = l.start.slice(0, 7);
    while (m < first) {
      const due = rentFor(l, m);
      const paid = mine.filter((r) => r.date.startsWith(m) && receiptKind(r.text, r.amount, l) === "rent").reduce((s, r) => s + r.amount, 0);
      owed = r2(owed + due - paid);
      const [y, mo] = m.split("-").map(Number) as [number, number];
      m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
    }
  }
  return months.map((month) => {
    const inM = mine.filter((r) => r.date.startsWith(month));
    const sum = (k: LedgerRowKind) => r2(inM.filter((r) => receiptKind(r.text, r.amount, l) === k).reduce((s, r) => s + r.amount, 0));
    const due = rentFor(l, month), rent = sum("rent");
    owed = r2(owed + due - rent);
    const status: TenantRow["status"] = due === 0 && rent === 0 ? "none" : owed < 0 ? "advance" : owed === 0 ? "paid" : rent > 0 ? "partial" : "unpaid";
    return { month, due, rent, deposit: sum("deposit"), other: sum("other"), balance: owed, status };
  });
}

/** Lease alerts: renewal, notice deadline, escalation. */
export function leaseAlerts(l: Lease, today: string): string[] {
  const out: string[] = [];
  const days = (d: string) => Math.round((Date.parse(d) - Date.parse(today)) / 864e5);
  const left = days(l.end);
  if (left < 0) out.push(`lease ended ${l.end}`);
  else if (left <= 90) out.push(`lease ends in ${left} days`);
  const notice = l.noticeDays ?? 0;
  if (notice > 0 && left >= 0) { const by = days(l.end) - notice; if (by >= 0 && by <= 30) out.push(`notice due within ${by} days (${notice}-day notice)`); }
  const esc = nextEscalation(l, today); if (esc && days(esc.date) <= 45) out.push(`rent rises to ${esc.rent} on ${esc.date}`);
  return out;
}

export function allUnits(p: Property) { return p.buildings.flatMap((b) => b.floors.flatMap((f) => f.units.map((u) => ({ ...u, building: b.name, floor: f.name })))); }

/** Occupied units at a date; a property without units counts as one [§40]. */
export function occupancy(properties: Property[], leases: Lease[], date: string) {
  return properties.map((p) => {
    const units = allUnits(p);
    const active = leases.filter((l) => l.propertyId === p.id && l.start <= date && l.end >= date);
    const total = Math.max(1, units.length);
    const occupied = units.length ? units.filter((u) => active.some((l) => l.unitId === u.id)).length : active.length ? 1 : 0;
    return { propertyId: p.id, name: p.name, total, occupied, pct: Math.round((occupied / total) * 100) };
  });
}

/** Yearly property costs by kind; capital improvements are kept apart from running costs. */
export function costSummary(costs: PropertyCost[], propertyId: string, from: string, to: string) {
  const inRange = costs.filter((c) => c.propertyId === propertyId && c.date >= from && c.date <= to);
  const by: Record<string, number> = {};
  for (const c of inRange) by[c.kind] = r2((by[c.kind] ?? 0) + c.amount);
  return { byKind: by, running: r2(inRange.filter((c) => c.kind !== "improvement").reduce((s, c) => s + c.amount, 0)), capital: r2(inRange.filter((c) => c.kind === "improvement").reduce((s, c) => s + c.amount, 0)) };
}

/** Property value comes from its linked asset or the latest dated valuation — counted once [§41]. */
export function propertyValue(p: Property, assetValue: number | null): { value: number | null; source: string } {
  if (p.valuation) return { value: p.valuation.value, source: `${p.valuation.source}, ${p.valuation.date}` };
  if (assetValue != null) return { value: assetValue, source: "asset register (book value)" };
  return { value: null, source: "no valuation yet" };
}

/** Operational follow-ups for a property [§40]: renewals, overdue rent, unpaid vendor bills, improvements without evidence. */
export function propertyFollowUps(p: Property, leases: Lease[], costs: PropertyCost[], ledgers: Record<string, TenantRow[]>, today: string): string[] {
  const out: string[] = [];
  for (const l of leases.filter((x) => x.propertyId === p.id)) {
    for (const a of leaseAlerts(l, today)) out.push(`${l.tenant}: ${a}`);
    const last = ledgers[l.id]?.at(-1);
    if (last && last.balance > 0) out.push(`${l.tenant}: ₹${last.balance.toLocaleString("en-IN")} rent outstanding`);
    const unknown = LEASE_TERMS.filter((k) => l[k] === undefined);
    if (unknown.length) out.push(`${l.tenant}: lease terms need answer (${unknown.length})`);
  }
  for (const c of costs.filter((x) => x.propertyId === p.id)) {
    if (c.kind === "improvement" && !c.docId) out.push(`Improvement ${c.date} (${c.vendor}) has no invoice attached`);
    if (c.kind === "vendor" && !c.transactionId) out.push(`Vendor bill ${c.vendor} ${c.date} not matched to a payment`);
  }
  if (!p.links?.insuranceDocIds?.length) out.push("No insurance document linked");
  return out;
}
