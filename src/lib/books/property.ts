/** Property operations: leases, escalation, tenant ledger, occupancy [§37–41]. Pure, read-only. */
import type { Lease, Property, PropertyCost } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;
const monthsBetween = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

/** Rent due in a month after compounding escalations from lease start. */
export function rentFor(l: Lease, month: string): number {
  if (month < l.start.slice(0, 7) || month > l.end.slice(0, 7)) return 0;
  const steps = l.escalationPct > 0 && l.escalationEveryMonths > 0 ? Math.floor(monthsBetween(l.start, `${month}-01`) / l.escalationEveryMonths) : 0;
  return r2(l.rent * (1 + l.escalationPct / 100) ** steps);
}

/** Next escalation date and new rent, if any. */
export function nextEscalation(l: Lease, today: string): { date: string; rent: number } | null {
  if (!(l.escalationPct > 0 && l.escalationEveryMonths > 0)) return null;
  const s = new Date(l.start + "T00:00:00Z");
  for (let i = 1; i < 100; i++) {
    const d = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + i * l.escalationEveryMonths, s.getUTCDate())).toISOString().slice(0, 10);
    if (d > l.end) return null;
    if (d > today) return { date: d, rent: rentFor(l, d.slice(0, 7)) };
  }
  return null;
}

export interface Receipt { id: string; date: string; amount: number; text: string }
export type LedgerRowKind = "rent" | "deposit" | "other";
export interface TenantRow { month: string; due: number; rent: number; deposit: number; other: number; balance: number; status: "paid" | "partial" | "unpaid" | "advance" | "none" }

/** Classify a bank receipt for a lease: deposits are never rent [§39, test 10]. */
export function receiptKind(text: string): LedgerRowKind {
  if (/\b(security\s*)?deposit\b|advance\s*security|refundable/i.test(text)) return "deposit";
  if (/maintenance|electricity|water|reimburse|penalty|late fee/i.test(text)) return "other";
  return "rent";
}

/** Receipts that name the tenant or the property. */
export function leaseReceipts(l: Lease, p: Property | undefined, income: Receipt[]): Receipt[] {
  const keys = [l.tenant, p?.name].map((k) => k?.trim().toLowerCase()).filter((k): k is string => !!k && k.length >= 3);
  return income.filter((i) => i.date >= l.start && keys.some((k) => i.text.toLowerCase().includes(k)));
}

/** Tenant ledger with running arrears/advance [§39–40, test 9]. */
export function tenantLedger(l: Lease, p: Property | undefined, income: Receipt[], months: string[]): TenantRow[] {
  const mine = leaseReceipts(l, p, income);
  let owed = 0;
  return months.map((month) => {
    const inM = mine.filter((r) => r.date.startsWith(month));
    const sum = (k: LedgerRowKind) => r2(inM.filter((r) => receiptKind(r.text) === k).reduce((s, r) => s + r.amount, 0));
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
  if (l.noticeDays > 0 && left >= 0) { const by = days(l.end) - l.noticeDays; if (by >= 0 && by <= 30) out.push(`notice due within ${by} days (${l.noticeDays}-day notice)`); }
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
