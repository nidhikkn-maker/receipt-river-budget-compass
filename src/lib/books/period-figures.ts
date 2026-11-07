/**
 * Closed-period derived figures [§34, §57]: the calculated totals frozen with the close evidence.
 * Figures are computed by these pure rules at close time and stored in the evidence snapshot, so a
 * closed year's numbers stay reproducible: the snapshot's own saved records must produce the same
 * figures, and current records are compared against them to detect any drift.
 * Balances are recorded at close and drift-checked against current records; entry, GST and
 * depreciation figures are fully reproducible from the snapshot alone.
 */
import type { GstInvoice, Journal } from "./types";
import { effectiveInvoices, taxOf } from "./gst";
import { isMove } from "../ledger";

export interface PeriodFigures {
  version: 1;
  entries: { count: number; income: number; expenses: number; moves: number; adjustments: number; reconciled: number };
  gst: { outputTaxable: number; outputTax: number; inputTaxable: number; inputTax: number; rcmCash: number };
  depreciation: { posted: number; journals: number };
  /** Account id → closing balance at period end (recorded at close; drift-checked, not reproducible). */
  balances: Record<string, number>;
}

export interface FigureCheck { key: string; label: string; stored: number; recomputed: number; match: boolean }

const r2 = (n: number) => Math.round(n * 100) / 100;
const inRange = (date: string, from: string, to: string) => date >= from && date <= to;

/** Minimal entry shape the figures need; both app Txn and saved evidence rows map onto it. */
export interface FigureEntry { date: string; amount: number; txnType: string; reconciled?: boolean }
export interface FigureAccount { id: string; balanceAt: (to: string) => number }

export function buildPeriodFigures(p: {
  from: string; to: string;
  entries: FigureEntry[];
  accounts: FigureAccount[];
  invoices: GstInvoice[];
  journals: Journal[];
}): PeriodFigures {
  const entries = p.entries.filter((e) => inRange(e.date, p.from, p.to));
  const sum = (list: FigureEntry[]) => r2(list.reduce((s, e) => s + e.amount, 0));
  const income = entries.filter((e) => e.txnType === "income" || e.txnType === "refund");
  const expenses = entries.filter((e) => e.txnType === "expense");
  const moves = entries.filter((e) => isMove(e.txnType as never));
  const adjustments = entries.filter((e) => e.txnType === "adjustment");
  const invoices = effectiveInvoices(p.invoices).filter((i) => inRange(i.date, p.from, p.to));
  const sales = invoices.filter((i) => i.kind === "sales");
  const purchases = invoices.filter((i) => i.kind === "purchase" && i.treatment !== "reverse_charge");
  const rcm = p.invoices.filter((i) => i.treatment === "reverse_charge" && i.rcmPaidOn && inRange(i.rcmPaidOn, p.from, p.to));
  const posted = p.journals.filter((j) => j.status === "posted" && j.postedOn && inRange(j.postedOn, p.from, p.to));
  return {
    version: 1,
    entries: {
      count: entries.length,
      income: sum(income),
      expenses: sum(expenses),
      moves: sum(moves),
      adjustments: sum(adjustments),
      reconciled: entries.filter((e) => e.reconciled).length,
    },
    gst: {
      outputTaxable: r2(sales.reduce((s, i) => s + i.taxable, 0)),
      outputTax: r2(sales.reduce((s, i) => s + taxOf(i), 0)),
      inputTaxable: r2(purchases.reduce((s, i) => s + i.taxable, 0)),
      inputTax: r2(purchases.reduce((s, i) => s + taxOf(i), 0)),
      rcmCash: r2(rcm.reduce((s, i) => s + taxOf(i), 0)),
    },
    depreciation: { posted: r2(posted.reduce((s, j) => s + j.amount, 0)), journals: posted.length },
    balances: Object.fromEntries(p.accounts.map((a) => [a.id, r2(a.balanceAt(p.to))])),
  };
}

/** Stored evidence rows are database rows (snake_case); map them onto the figure input. */
function evidenceEntries(ev: Record<string, unknown>): FigureEntry[] {
  const ledger = Array.isArray(ev["ledger"]) ? (ev["ledger"] as Record<string, unknown>[]) : [];
  return ledger.map((e) => ({
    date: String(e["expense_date"] ?? ""),
    amount: Number(e["amount"] ?? 0),
    txnType: String(e["txn_type"] ?? "expense"),
    reconciled: e["reconciled_at"] != null,
  }));
}

/** Recompute the reproducible figures from a close snapshot's own saved records. */
export function reproduceFromEvidence(ev: unknown): PeriodFigures | null {
  if (!ev || typeof ev !== "object" || Array.isArray(ev)) return null;
  const e = ev as Record<string, unknown>;
  const from = String(e["from"] ?? ""), to = String(e["to"] ?? "");
  if (!from || !to) return null;
  const registers = (e["registers"] && typeof e["registers"] === "object" ? e["registers"] : {}) as Record<string, unknown>;
  return buildPeriodFigures({
    from, to,
    entries: evidenceEntries(e),
    accounts: [],
    invoices: (Array.isArray(registers["gstInvoices"]) ? registers["gstInvoices"] : []) as GstInvoice[],
    journals: (Array.isArray(registers["journals"]) ? registers["journals"] : []) as Journal[],
  });
}

const CHECKS: { key: string; label: string; pick: (f: PeriodFigures) => number; reproducible: boolean }[] = [
  { key: "entries.count", label: "Entries", pick: (f) => f.entries.count, reproducible: true },
  { key: "entries.income", label: "Income total", pick: (f) => f.entries.income, reproducible: true },
  { key: "entries.expenses", label: "Expense total", pick: (f) => f.entries.expenses, reproducible: true },
  { key: "entries.moves", label: "Transfers between own accounts", pick: (f) => f.entries.moves, reproducible: true },
  { key: "entries.adjustments", label: "Adjustments", pick: (f) => f.entries.adjustments, reproducible: true },
  { key: "entries.reconciled", label: "Reconciled entries", pick: (f) => f.entries.reconciled, reproducible: true },
  { key: "gst.outputTaxable", label: "GST sales (taxable)", pick: (f) => f.gst.outputTaxable, reproducible: true },
  { key: "gst.outputTax", label: "GST collected", pick: (f) => f.gst.outputTax, reproducible: true },
  { key: "gst.inputTaxable", label: "GST purchases (taxable)", pick: (f) => f.gst.inputTaxable, reproducible: true },
  { key: "gst.inputTax", label: "GST paid on purchases", pick: (f) => f.gst.inputTax, reproducible: true },
  { key: "gst.rcmCash", label: "Reverse-charge tax paid in cash", pick: (f) => f.gst.rcmCash, reproducible: true },
  { key: "depreciation.posted", label: "Depreciation posted", pick: (f) => f.depreciation.posted, reproducible: true },
  { key: "depreciation.journals", label: "Depreciation entries", pick: (f) => f.depreciation.journals, reproducible: true },
];

/** Compare a stored figure set against a recomputed one; `reproducibleOnly` skips balance drift figures. */
export function figureChecks(stored: PeriodFigures, recomputed: PeriodFigures, reproducibleOnly = false): FigureCheck[] {
  const out: FigureCheck[] = CHECKS.filter(() => true).map((c) => ({
    key: c.key, label: c.label, stored: c.pick(stored), recomputed: c.pick(recomputed),
    match: Math.abs(c.pick(stored) - c.pick(recomputed)) < 0.005,
  }));
  if (!reproducibleOnly) {
    const ids = [...new Set([...Object.keys(stored.balances), ...Object.keys(recomputed.balances)])].sort();
    for (const id of ids) out.push({ key: `balances.${id}`, label: `Closing balance ${id.slice(0, 8)}…`, stored: stored.balances[id] ?? 0, recomputed: recomputed.balances[id] ?? 0, match: Math.abs((stored.balances[id] ?? 0) - (recomputed.balances[id] ?? 0)) < 0.005 });
  }
  return out;
}

/** Parse a stored derivedFigures value; returns null when absent or malformed. */
export function parsePeriodFigures(raw: unknown): PeriodFigures | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const f = raw as PeriodFigures;
  if (f.version !== 1 || !f.entries || !f.gst || !f.depreciation || typeof f.balances !== "object") return null;
  return f;
}
