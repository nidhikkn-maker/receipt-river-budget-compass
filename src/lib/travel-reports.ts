// Cross-trip travel reports (Version 4 spec §7.3). Every cut is built from the same
// ledger entries the trip pages show, so a report always reconciles with the unified
// ledger: an entry is counted once, and unpaid bookings stay a separate commitment
// column instead of being mixed into actual spending.
import { tripSummary, type Row as IntelRow } from "./intelligence";
import { categoryParts, SCOPE_LABEL, type Scope, type ReimbursementStatus } from "./expenses";
import { workspaceParts, type WorkspaceShare } from "./workspaces";
import type { Report } from "./reports";
import { bookingOutstanding, type TravelTrip } from "./travel";
import { isTracked, outstandingOf, receivedOf, reimbursableOf, stageOf, type ReimbursementInfo } from "./reimbursements";

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toFixed(2);
type Row = IntelRow & {
  id: string;
  scope?: Scope;
  splits?: { memberId: string | null; amount: number }[];
  memberId?: string | null;
  originalAmount?: number | null;
  department?: string | null;
  accountId?: string | null;
  reimbursementStatus?: ReimbursementStatus;
  reimbursement?: ReimbursementInfo;
  workspaceAllocations?: WorkspaceShare[];
};

export const TRAVEL_CUTS = ["trip", "workspace", "organisation", "traveller", "destination", "category", "account", "month", "planned", "reimbursement"] as const;
export type TravelCut = (typeof TRAVEL_CUTS)[number];
export const TRAVEL_CUT_LABEL: Record<TravelCut, string> = {
  trip: "By trip", workspace: "By workspace", organisation: "By organisation", traveller: "By traveller",
  destination: "By destination", category: "By category", account: "By payment account", month: "Monthly & annual",
  planned: "Planned vs actual", reimbursement: "Reimbursements",
};

export interface TravelReportOptions { memberName: (id: string | null) => string; accountName: (id: string | null) => string }

/** Entries belonging to any trip, each listed once so global totals match the ledger. */
export function travelEntries(trips: TravelTrip[], txns: Row[]) {
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const t of trips) for (const e of tripSummary(t, txns).entries as Row[]) if (!seen.has(e.id)) { seen.add(e.id); out.push(e); }
  return out;
}

/** INR share per person on one entry: split lines are in the bill currency, so the stored rate converts them. */
function personParts(e: Row): { person: string; amount: number }[] {
  const splits = e.splits ?? [];
  if (!splits.length) return [];
  const orig = e.originalAmount || e.amount;
  const out = splits.map((s) => ({ person: s.memberId ?? "Me", amount: r2((s.amount / orig) * e.amount) }));
  const head = out.slice(0, -1).reduce((s, x) => s + x.amount, 0);
  const last = out.at(-1);
  if (last) last.amount = r2(e.amount - head);
  return out;
}

const group = (rows: [string, number][]) => {
  const o: Record<string, number> = {};
  for (const [k, v] of rows) o[k] = r2((o[k] ?? 0) + v);
  return Object.entries(o).sort((a, b) => b[1] - a[1]);
};

const share = (v: number, total: number) => (total ? fmt((v / total) * 100) : "0.00");
const cutRows = (rows: [string, number][], label: string, total: number): (string | number)[][] => [
  ...rows.map(([k, v]) => [k, fmt(v), share(v, total)]),
  ["Total", fmt(total), "100.00"],
];

/** One report per cut. Amounts are INR; each cut's total equals total trip spending. */
export function travelReport(cut: TravelCut, trips: TravelTrip[], txns: Row[], opts: TravelReportOptions): Report {
  const entries = travelEntries(trips, txns);
  const total = r2(entries.reduce((s, e) => s + e.amount, 0));
  const unpaid = (t: TravelTrip) => r2((t.bookings ?? []).reduce((a, b) => a + bookingOutstanding(b, txns), 0));
  const committed = r2(trips.reduce((s, t) => s + unpaid(t), 0));
  const title = `Travel report — ${TRAVEL_CUT_LABEL[cut]}`;

  if (cut === "trip") {
    const rows = trips.map((t) => {
      const s = tripSummary(t, txns);
      const un = unpaid(t);
      return [t.name, t.destination || "—", t.start, t.end, fmt(s.total), fmt(un), t.budget ? fmt(t.budget) : "", fmt(s.total + un), s.variance ? fmt(s.variance) : ""];
    });
    return { title, headers: ["Trip", "Destination", "Start", "End", "Spent (INR)", "Booked unpaid (INR)", "Budget (INR)", "Spent + booked (INR)", "Budget variance (INR)"], rows: [...rows, ["Total (each entry once)", "", "", "", fmt(total), fmt(committed), "", fmt(total + committed), ""]] };
  }

  if (cut === "workspace") {
    const rows = group(entries.flatMap((e) => workspaceParts({ scope: e.scope ?? "personal", amount: e.amount, originalAmount: e.originalAmount ?? null, workspaceAllocations: e.workspaceAllocations ?? [] }).map((p) => [p.workspace, p.amount] as [string, number])));
    return { title, headers: ["Workspace", "Spent (INR)", "Share %"], rows: cutRows(rows.map(([k, v]) => [SCOPE_LABEL[k as Scope] ?? k, v] as [string, number]), "Workspace", total) };
  }

  if (cut === "organisation") {
    const rows = group(entries.map((e) => [(e.department ?? "").trim() || "No organisation", e.amount]));
    return { title, headers: ["Organisation / department", "Spent (INR)", "Share %"], rows: cutRows(rows, "Organisation", total) };
  }

  if (cut === "traveller") {
    const rows = group(entries.flatMap((e) => {
      const parts = personParts(e);
      return parts.length ? parts.map(p => [p.person, p.amount] as [string, number]) : [[e.memberId ?? "Me", e.amount] as [string, number]];
    }));
    return { title, headers: ["Traveller", "Spent (INR)", "Share %"], rows: cutRows(rows.map(([k, v]) => [opts.memberName(k === "Me" ? null : k), v] as [string, number]), "Traveller", total) };
  }

  if (cut === "destination") {
    const seen = new Set<string>();
    const rows = group(trips.flatMap((t) => (tripSummary(t, txns).entries as Row[]).flatMap((e) => {
      if (seen.has(e.id)) return [];
      seen.add(e.id);
      return [[t.destination.trim() || "No destination", e.amount] as [string, number]];
    })));
    return { title, headers: ["Destination", "Spent (INR)", "Share %"], rows: cutRows(rows, "Destination", total) };
  }

  if (cut === "category") {
    const rows = group(entries.flatMap((e) => categoryParts(e).map((p) => [p.category, p.amount] as [string, number])));
    return { title, headers: ["Category", "Spent (INR)", "Share %"], rows: cutRows(rows, "Category", total) };
  }

  if (cut === "account") {
    const rows = group(entries.map((e) => [opts.accountName(e.accountId ?? null), e.amount]));
    return { title, headers: ["Payment account", "Spent (INR)", "Share %"], rows: cutRows(rows, "Account", total) };
  }

  if (cut === "month") {
    const rows = group(entries.map((e) => [e.date.slice(0, 7), e.amount]));
    const years = group(rows.map(([m, v]) => [m.slice(0, 4), v] as [string, number]));
    return { title, headers: ["Period", "Spent (INR)", "Annual total (INR)"], rows: [...rows.map(([m, v]) => [m, fmt(v), ""]), ...years.map(([y, v]) => [`Year ${y}`, "", fmt(v)]), ["Total", fmt(total), ""]] };
  }

  if (cut === "planned") {
    const rows = trips.map((t) => {
      const s = tripSummary(t, txns);
      const un = unpaid(t);
      const planned = r2((t.budget ?? 0) + (t.contingency ?? 0));
      return [t.name, planned ? fmt(planned) : "", fmt(s.total), fmt(un), fmt(s.total + un), planned ? fmt(planned - s.total - un) : "", planned ? fmt(((s.total + un) / planned) * 100) : ""];
    });
    return { title, headers: ["Trip", "Planned budget (INR)", "Actual spent (INR)", "Committed unpaid (INR)", "Forecast (INR)", "Budget left (INR)", "Used %"], rows: [...rows, ["Total", fmt(trips.reduce((s, t) => s + (t.budget ?? 0) + (t.contingency ?? 0), 0)), fmt(total), fmt(committed), fmt(total + committed), "", ""]] };
  }

  const claims = entries.map(e => ({ ...e, title: e.title ?? "Trip expense" })).filter(isTracked);
  const rows = claims.map(e => [e.date, e.merchant ?? e.title, SCOPE_LABEL[e.scope ?? "personal"], stageOf(e), fmt(reimbursableOf(e)), fmt(receivedOf(e)), fmt(outstandingOf(e))]);
  const pending = r2(claims.reduce((s, e) => s + outstandingOf(e), 0));
  const got = r2(claims.reduce((s, e) => s + receivedOf(e), 0));
  return { title, headers: ["Date", "Item", "Workspace", "Status", "Claim (INR)", "Received (INR)", "Outstanding (INR)"], rows: [...rows, ["", "Total pending", "", "", "", "", fmt(pending)], ["", "Total reimbursed", "", "", "", fmt(got), ""]] };
}
