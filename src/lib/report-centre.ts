// V4.7 Reports Centre: pure report builders. Every figure comes from the existing ledger,
// workspace, travel, card, loan and planning rules — no separate report maths.
import { SCOPES, SCOPE_LABEL, categoryParts, memberShares, type Expense, type Scope } from "./expenses";
import { TXN_LABEL, accountBalance, accountValue, cashflow, isLiability, isMove, netWorth, type Account, type Valuation } from "./ledger";
import { workspaceParts } from "./workspaces";
import { advanceReconciliation, bookingOutstanding, bookingPaid, closeBlockers, tripBudgetDetail, tripFinance, type TravelTrip } from "./travel";
import { tripTag } from "./intelligence";
import { monthlyCost, occurrences, addDays, type Commitment } from "./planning";
import { outstandingOf, receivedOf, isTracked } from "./reimbursements";

export type ReportGroup = "Financial" | "Workspace" | "Travel" | "Operational";
export const REPORT_TYPES = [
  ["monthly", "Monthly Financial Summary", "Financial"], ["income", "Income Report", "Financial"], ["expense", "Expense Report", "Financial"],
  ["category", "Category-wise Expenditure", "Financial"], ["account", "Account-wise Transactions", "Financial"], ["card", "Credit Card Report", "Financial"],
  ["budget", "Budget Report", "Financial"], ["subscription", "Subscription Report", "Financial"], ["loan", "Loan and EMI Report", "Financial"],
  ["forecast", "Financial Forecast", "Financial"], ["wealth", "Wealth and Net Worth", "Financial"],
  ["ws-personal", "Personal Workspace", "Workspace"], ["ws-family", "Family Workspace", "Workspace"], ["ws-business", "Business Workspace", "Workspace"],
  ["ws-official", "Official Workspace", "Workspace"], ["consolidated", "Consolidated Report", "Workspace"], ["organisation", "Organisation-wise Report", "Workspace"],
  ["trip-summary", "Trip Financial Summary", "Travel"], ["trip-expenses", "Trip-wise Expenses", "Travel"], ["trip-budget", "Travel Budget versus Actual", "Travel"],
  ["trip-travellers", "Traveller-wise Expenses", "Travel"], ["trip-bookings", "Booking Commitments", "Travel"], ["trip-advances", "Travel Advances", "Travel"],
  ["trip-reimbursements", "Travel Reimbursements", "Travel"], ["trip-settlement", "Trip Settlement", "Travel"], ["trip-closure", "Final Trip Closure Report", "Travel"],
  ["pending-reimbursements", "Pending Reimbursements", "Operational"], ["unreconciled", "Unreconciled Transactions", "Operational"],
  ["commitments", "Pending Financial Commitments", "Operational"], ["drafts", "Expense Draft Summary", "Operational"], ["imports", "Statement Import Summary", "Operational"],
] as const satisfies readonly (readonly [string, string, ReportGroup])[];
export type ReportType = (typeof REPORT_TYPES)[number][0];
export const reportLabel = (k: ReportType) => REPORT_TYPES.find((r) => r[0] === k)?.[1] ?? k;
export const needsTrip = (k: ReportType) => k.startsWith("trip-");

export type Period = "today" | "week" | "month" | "last_month" | "quarter" | "year" | "custom";
export const PERIOD_LABEL: Record<Period, string> = { today: "Today", week: "This Week", month: "This Month", last_month: "Last Month", quarter: "This Quarter", year: "This Year", custom: "Custom range" };
export function periodRange(p: Period, today: string, custom?: { from: string; to: string }): { from: string; to: string } {
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const d = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm - 1, dd)).toISOString().slice(0, 10);
  if (p === "today") return { from: today, to: today };
  if (p === "week") { const wd = (new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7; return { from: addDays(today, -wd), to: today }; }
  if (p === "month") return { from: d(y, m, 1), to: today };
  if (p === "last_month") return { from: d(y, m - 1, 1), to: d(y, m, 0) };
  if (p === "quarter") return { from: d(y, Math.floor((m - 1) / 3) * 3 + 1, 1), to: today };
  if (p === "year") return { from: d(y, 1, 1), to: today };
  return custom && custom.from <= custom.to ? custom : { from: d(y, m, 1), to: today };
}

export type StatusFilter = "all" | "reconciled" | "unreconciled" | "reimbursement_pending";
export interface ReportFilters {
  from: string; to: string;
  workspaces: Scope[]; accountIds: string[]; categories: string[]; tags: string[]; memberIds: string[];
  tripId: string | null; currency: string | null; status: StatusFilter; organisation: string | null;
}
export const emptyFilters = (from: string, to: string): ReportFilters => ({ from, to, workspaces: [], accountIds: [], categories: [], tags: [], memberIds: [], tripId: null, currency: null, status: "all", organisation: null });

export interface DraftLite { id: string; status: string; updatedAt: string; data: { amount?: string | number; merchant?: string; date?: string; category?: string; scope?: string } ; localOnly?: boolean }
export interface ReportData {
  transactions: Expense[]; accounts: Account[]; valuations: Valuation[]; commitments: Commitment[];
  loans: { id: string; name: string; principal: number; rate: number; emi: number; nextDue: string; provider: string; status: string; payments: { date: string; principal: number; interest: number; total: number }[] }[];
  budgets: Record<string, number>; trips: TravelTrip[]; drafts: DraftLite[];
  memberName: (id: string | null) => string; accountName: (id: string | null) => string; today: string;
}
export interface Section { title: string; headers: string[]; rows: string[][]; total?: string[]; align?: ("l" | "r")[]; wide?: boolean; chart?: { label: string; value: number }[] }
export interface ReportDoc { type: ReportType; title: string; period: string; filterLines: string[]; summary: [string, string][]; sections: Section[]; notes: string[]; landscape: boolean; rowCount: number }

const r2 = (n: number) => Math.round(n * 100) / 100;
const IN = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Indian digit grouping with an explicit currency code (PDF core fonts have no ₹ glyph). */
export const amt = (n: number, cur = "INR") => `${cur} ${IN.format(r2(n))}`;
const num = (n: number) => IN.format(r2(n));
const kind = (e: Expense) => e.txnType ?? "expense";

/** The INR share of an entry inside the selected workspaces (splits counted once, by share). */
export function shareIn(e: Expense, ws: Scope[]): number {
  if (!ws.length) return e.amount;
  return r2(workspaceParts(e).filter((p) => ws.includes(p.workspace)).reduce((s, p) => s + p.amount, 0));
}

/** Confirmed ledger entries matching every filter except the date window. */
export function matchFilters(list: Expense[], f: ReportFilters, trips: TravelTrip[]): Expense[] {
  const trip = f.tripId ? trips.find((t) => t.id === f.tripId) : null;
  const tag = trip ? tripTag(trip) : null;
  return list.filter((e) => {
    if (f.workspaces.length && shareIn(e, f.workspaces) === 0) return false;
    if (f.accountIds.length && !f.accountIds.includes(e.accountId ?? "") && !f.accountIds.includes(e.toAccountId ?? "")) return false;
    if (f.categories.length && !categoryParts(e).some((p) => f.categories.includes(p.category))) return false;
    if (f.tags.length && !(e.tags ?? []).some((t) => f.tags.includes(t))) return false;
    if (f.memberIds.length && !memberShares(e).some((s) => f.memberIds.includes(s.memberId ?? "me"))) return false;
    if (trip && !(e.tripId === trip.id || (e.tags ?? []).includes(tag!))) return false;
    if (f.currency && e.currency !== f.currency) return false;
    if (f.organisation && (e.department ?? "").trim() !== f.organisation && !(e.tags ?? []).includes(`Organisation: ${f.organisation}`)) return false;
    if (f.status === "reconciled" && !e.reconciledAt) return false;
    if (f.status === "unreconciled" && e.reconciledAt) return false;
    if (f.status === "reimbursement_pending" && e.reimbursementStatus !== "pending") return false;
    return true;
  });
}
const inWindow = (list: Expense[], f: ReportFilters) => list.filter((e) => e.date >= f.from && e.date <= f.to);

/** Organisation of an entry: its department, else an "Organisation: X" tag. */
export const orgOf = (e: Expense) => e.department?.trim() || (e.tags ?? []).find((t) => t.startsWith("Organisation: "))?.slice(14) || "Unassigned";

/** Income / spending / net, using the ledger's cashflow rule (transfers and card payments excluded), workspace-share aware. */
export function totalsFor(list: Expense[], ws: Scope[]) {
  return cashflow(list.map((e) => ({ ...e, amount: shareIn(e, ws) })));
}

function txnRows(list: Expense[], d: ReportData, ws: Scope[]): string[][] {
  return [...list].sort((a, b) => a.date.localeCompare(b.date)).map((e) => [
    e.date, (e.merchant || e.title || "").slice(0, 80), e.category, workspaceParts(e).map((p) => SCOPE_LABEL[p.workspace]).join(" + "),
    d.accountName(e.accountId ?? null), TXN_LABEL[kind(e)], e.currency, num(e.originalAmount), num(shareIn(e, ws)),
    e.reconciledAt ? "Matched" : "Not matched",
  ]);
}
const TXN_HEAD = ["Date", "Description", "Category", "Workspace", "Account", "Type", "Cur.", "Original", "Amount (INR)", "Status"];
const TXN_ALIGN: ("l" | "r")[] = ["l", "l", "l", "l", "l", "l", "l", "r", "r", "l"];
const txnSection = (title: string, list: Expense[], d: ReportData, ws: Scope[]): Section => ({ title, headers: TXN_HEAD, rows: txnRows(list, d, ws), align: TXN_ALIGN, wide: true, total: ["", "Total", "", "", "", "", "", "", num(list.reduce((s, e) => s + shareIn(e, ws), 0)), ""] });

function categorySection(list: Expense[], ws: Scope[], title = "Category breakdown"): Section {
  const c: Record<string, number> = {};
  for (const e of list) { const f = e.amount ? shareIn(e, ws) / e.amount : 0; for (const p of categoryParts(e)) c[p.category] = r2((c[p.category] ?? 0) + p.amount * f); }
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  const rows = Object.entries(c).sort((a, b) => b[1] - a[1]);
  return { title, headers: ["Category", "Amount (INR)", "Share"], align: ["l", "r", "r"], rows: rows.map(([k, v]) => [k, num(v), total ? `${(v / total * 100).toFixed(1)}%` : "—"]), total: ["Total", num(total), total ? "100%" : "—"], chart: rows.slice(0, 8).map(([label, value]) => ({ label, value })) };
}
function workspaceSection(list: Expense[]): Section {
  const t: Record<string, number> = {};
  for (const e of list) for (const p of workspaceParts(e)) t[p.workspace] = r2((t[p.workspace] ?? 0) + p.amount);
  const total = r2(list.reduce((s, e) => s + e.amount, 0));
  return { title: "Workspace allocation", headers: ["Workspace", "Spending (INR)"], align: ["l", "r"], rows: SCOPES.map((s) => [SCOPE_LABEL[s], num(t[s] ?? 0)]), total: ["Total (each entry counted once)", num(total)], chart: SCOPES.map((s) => ({ label: SCOPE_LABEL[s], value: t[s] ?? 0 })) };
}
function trendSection(d: ReportData, f: ReportFilters, ws: Scope[]): Section {
  const months: string[] = []; let m = f.to.slice(0, 7);
  for (let i = 0; i < 6; i++) { months.unshift(m); const y = Number(m.slice(0, 4)), mm = Number(m.slice(5, 7)); m = mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, "0")}`; }
  const base = matchFilters(d.transactions, f, d.trips);
  const rows = months.map((mo) => { const c = totalsFor(base.filter((e) => e.date.startsWith(mo)), ws); return [mo, num(c.income), num(c.spent), num(c.net)]; });
  return { title: "Six-month trend", headers: ["Month", "Income", "Spending", "Net"], align: ["l", "r", "r", "r"], rows };
}

const STD_NOTES = [
  "Amounts in INR use the exchange rate saved on each entry when it was recorded; today's rates never rewrite history.",
  "Transfers, credit card bill payments, loan repayments and investments move money between your own accounts and are not counted as income or spending.",
  "Refunds and reimbursements received reduce spending. Workspace splits are counted by share; consolidated totals count each entry once.",
  "Drafts, unpaid bookings and scheduled commitments are not confirmed transactions and are excluded from totals.",
];

function disclosures(list: Expense[]): string[] {
  const out: string[] = [];
  const unmatched = list.filter((e) => !e.reconciledAt).length;
  if (unmatched) out.push(`${unmatched} of ${list.length} entries are not yet matched to a bank statement and are unverified.`);
  const noCat = list.filter((e) => !e.category || e.category === "Uncategorised").length;
  if (noCat) out.push(`${noCat} entries have no category.`);
  const noAcct = list.filter((e) => !e.accountId).length;
  if (noAcct) out.push(`${noAcct} entries have no account recorded.`);
  const fx = list.filter((e) => e.currency !== "INR").length;
  if (fx) out.push(`${fx} foreign-currency entries are converted at their recorded rates.`);
  return out;
}

export function filterLines(f: ReportFilters, d: ReportData): string[] {
  const out: string[] = [];
  out.push(`Workspace: ${f.workspaces.length ? f.workspaces.map((w) => SCOPE_LABEL[w]).join(", ") : "All (consolidated)"}`);
  if (f.accountIds.length) out.push(`Accounts: ${f.accountIds.map((a) => d.accountName(a)).join(", ")}`);
  if (f.categories.length) out.push(`Categories: ${f.categories.join(", ")}`);
  if (f.tags.length) out.push(`Tags: ${f.tags.join(", ")}`);
  if (f.memberIds.length) out.push(`People: ${f.memberIds.map((m) => d.memberName(m === "me" ? null : m)).join(", ")}`);
  if (f.tripId) out.push(`Trip: ${d.trips.find((t) => t.id === f.tripId)?.name ?? "Unknown"}`);
  if (f.currency) out.push(`Currency: ${f.currency}`);
  if (f.organisation) out.push(`Organisation: ${f.organisation}`);
  if (f.status !== "all") out.push(`Status: ${{ reconciled: "Bank matched", unreconciled: "Not matched", reimbursement_pending: "Reimbursement pending" }[f.status]}`);
  return out;
}

export function buildReportDoc(type: ReportType, filters: ReportFilters, d: ReportData): ReportDoc {
  let f = filters;
  if (type.startsWith("ws-")) f = { ...f, workspaces: [type.slice(3) as Scope] };
  if (type === "consolidated") f = { ...f, workspaces: [] };
  const ws = f.workspaces;
  const all = matchFilters(d.transactions, f, d.trips);
  const win = inWindow(all, f);
  const spend = win.filter((e) => kind(e) === "expense");
  const cf = totalsFor(win, ws);
  const doc: ReportDoc = { type, title: reportLabel(type), period: `${f.from} to ${f.to}`, filterLines: filterLines(f, d), summary: [], sections: [], notes: [...STD_NOTES], landscape: false, rowCount: 0 };
  const exec = () => {
    const live = d.accounts.filter((a) => !a.archived && !isLiability(a.kind));
    const avail = live.reduce((s, a) => s + accountBalance(a, d.transactions), 0);
    const upcoming = occurrences(d.commitments.filter((c) => c.status === "active"), d.today, addDays(d.today, 30)).filter((o) => o.direction === "out").reduce((s, o) => s + o.amount, 0);
    const budget = Object.values(d.budgets).reduce((s, v) => s + (v ?? 0), 0);
    doc.summary.push(["Total income", amt(cf.income)], ["Total expenses", amt(cf.spent)], ["Net cash flow", amt(cf.net)], ["Available balances (today)", amt(avail)], ["Upcoming commitments (30 days)", amt(upcoming) + " (scheduled, not spent)"]);
    if (budget > 0) doc.summary.push(["Monthly budget utilisation", `${(cf.spent / budget * 100).toFixed(1)}% of ${amt(budget)}`]);
  };
  const tripsSel = f.tripId ? d.trips.filter((t) => t.id === f.tripId) : d.trips.filter((t) => t.end >= f.from && t.start <= f.to);

  switch (type) {
    case "monthly": case "consolidated": case "ws-personal": case "ws-family": case "ws-business": case "ws-official": {
      exec();
      const top = categorySection(spend, ws).rows[0];
      if (top) doc.notes.unshift(`Largest category: ${top[0]} at INR ${top[1]} (${top[2]} of spending).`);
      doc.sections.push(categorySection(spend, ws), workspaceSection(spend), trendSection(d, f, ws));
      const acc: Record<string, number> = {}; for (const e of spend) acc[d.accountName(e.accountId ?? null)] = r2((acc[d.accountName(e.accountId ?? null)] ?? 0) + shareIn(e, ws));
      doc.sections.push({ title: "Account-wise spending", headers: ["Account", "Spending (INR)"], align: ["l", "r"], rows: Object.entries(acc).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, num(v)]) });
      doc.sections.push(txnSection("Detailed transactions", win, d, ws));
      break;
    }
    case "income": {
      const inc = win.filter((e) => kind(e) === "income");
      doc.summary.push(["Total income", amt(cf.income)], ["Entries", String(inc.length)]);
      doc.sections.push(categorySection(inc, ws, "Income by source"), txnSection("Income entries", inc, d, ws));
      break;
    }
    case "expense": {
      doc.summary.push(["Total expenses (gross)", amt(spend.reduce((s, e) => s + shareIn(e, ws), 0))], ["Net of refunds and reimbursements", amt(cf.spent)], ["Entries", String(spend.length)]);
      doc.sections.push(categorySection(spend, ws), txnSection("Expense entries", spend, d, ws));
      break;
    }
    case "category": {
      doc.summary.push(["Total expenses", amt(spend.reduce((s, e) => s + shareIn(e, ws), 0))]);
      doc.sections.push(categorySection(spend, ws, "Category-wise expenditure"));
      break;
    }
    case "account": {
      const accts = d.accounts.filter((a) => !f.accountIds.length || f.accountIds.includes(a.id));
      doc.sections.push({ title: "Account balances", headers: ["Account", "Kind", "Balance (INR)"], align: ["l", "l", "r"], rows: accts.map((a) => [a.name, a.kind.replace(/_/g, " "), num(accountBalance(a, d.transactions))]) });
      for (const a of accts) { const l = win.filter((e) => e.accountId === a.id || e.toAccountId === a.id); if (l.length) doc.sections.push(txnSection(a.name, l, d, ws)); }
      break;
    }
    case "card": {
      const cards = d.accounts.filter((a) => a.kind === "credit_card" && (!f.accountIds.length || f.accountIds.includes(a.id)));
      const rows = cards.map((c) => {
        const buys = win.filter((e) => e.accountId === c.id && kind(e) === "expense").reduce((s, e) => s + e.amount, 0);
        const refunds = win.filter((e) => e.accountId === c.id && (kind(e) === "refund")).reduce((s, e) => s + e.amount, 0);
        const paid = win.filter((e) => e.toAccountId === c.id && isMove(e.txnType)).reduce((s, e) => s + e.amount, 0);
        return [c.name, num(buys), num(refunds), num(paid), num(accountBalance(c, d.transactions)), c.creditLimit ? num(c.creditLimit) : "—"];
      });
      doc.summary.push(["Cards", String(cards.length)], ["Outstanding today", amt(cards.reduce((s, c) => s + accountBalance(c, d.transactions), 0))]);
      doc.sections.push({ title: "Card summary", headers: ["Card", "Purchases", "Refunds", "Bill payments", "Outstanding", "Limit"], align: ["l", "r", "r", "r", "r", "r"], rows });
      for (const c of cards) { const l = win.filter((e) => e.accountId === c.id && kind(e) === "expense"); if (l.length) doc.sections.push(txnSection(`${c.name} purchases`, l, d, ws)); }
      doc.notes.unshift("Card purchases are counted once as expenses when made; bill payments only reduce what the card owes and are never counted again as spending.");
      break;
    }
    case "budget": {
      const cat = categorySection(spend, ws);
      const spentBy = Object.fromEntries(cat.rows.map((r) => [r[0], Number(r[1]!.replace(/,/g, ""))]));
      const names = [...new Set([...Object.keys(d.budgets), ...Object.keys(spentBy)])];
      const months = Math.max(1, (Number(f.to.slice(0, 4)) - Number(f.from.slice(0, 4))) * 12 + Number(f.to.slice(5, 7)) - Number(f.from.slice(5, 7)) + 1);
      doc.sections.push({ title: `Budget versus actual (${months} month${months > 1 ? "s" : ""})`, headers: ["Category", "Budget", "Actual", "Remaining", "Used"], align: ["l", "r", "r", "r", "r"], rows: names.map((n) => { const b = (d.budgets[n] ?? 0) * months, a = spentBy[n] ?? 0; return [n, b ? num(b) : "No budget", num(a), b ? num(b - a) : "—", b ? `${(a / b * 100).toFixed(0)}%` : "—"]; }) });
      break;
    }
    case "subscription": {
      const subs = d.commitments.filter((c) => c.kind === "subscription" && c.status !== "cancelled");
      doc.summary.push(["Active subscriptions", String(subs.filter((s) => s.status === "active").length)], ["Monthly cost", amt(subs.filter((s) => s.status === "active").reduce((s, c) => s + monthlyCost(c), 0))]);
      doc.sections.push({ title: "Subscriptions", headers: ["Name", "Frequency", "Amount", "Monthly cost", "Next due", "Status"], align: ["l", "l", "r", "r", "l", "l"], rows: subs.map((c) => [c.name, c.frequency, num(c.amount), num(monthlyCost(c)), c.nextDue, c.status]) });
      break;
    }
    case "loan": {
      const loans = d.loans;
      doc.summary.push(["Outstanding principal", amt(loans.filter((l) => l.status === "active").reduce((s, l) => s + l.principal, 0))], ["Monthly EMIs", amt(loans.filter((l) => l.status === "active").reduce((s, l) => s + l.emi, 0))]);
      doc.sections.push({ title: "Loans", headers: ["Loan", "Provider", "Rate", "EMI", "Outstanding", "Next due", "Status"], align: ["l", "l", "r", "r", "r", "l", "l"], rows: loans.map((l) => [l.name, l.provider, `${l.rate}%`, num(l.emi), num(l.principal), l.nextDue, l.status]) });
      const pays = loans.flatMap((l) => l.payments.filter((p) => p.date >= f.from && p.date <= f.to).map((p) => [p.date, l.name, num(p.principal), num(p.interest), num(p.total)]));
      doc.sections.push({ title: "Repayments in period", headers: ["Date", "Loan", "Principal", "Interest", "Total"], align: ["l", "l", "r", "r", "r"], rows: pays.sort((a, b) => a[0]!.localeCompare(b[0]!)) });
      break;
    }
    case "forecast": {
      const to = addDays(d.today, 90);
      const occ = occurrences(d.commitments.filter((c) => c.status === "active"), d.today, to);
      const inflow = occ.filter((o) => o.direction === "in").reduce((s, o) => s + o.amount, 0), outflow = occ.filter((o) => o.direction === "out").reduce((s, o) => s + o.amount, 0);
      const avail = d.accounts.filter((a) => !a.archived && !isLiability(a.kind) && ["savings", "current", "cash", "wallet"].includes(a.kind)).reduce((s, a) => s + accountBalance(a, d.transactions), 0);
      doc.summary.push(["Cash available today", amt(avail)], ["Scheduled inflows (90 days)", amt(inflow)], ["Scheduled outflows (90 days)", amt(outflow)], ["Projected cash in 90 days (estimate)", amt(avail + inflow - outflow)]);
      doc.sections.push({ title: "Scheduled items (next 90 days)", headers: ["Date", "Item", "Direction", "Amount", "Confirmed"], align: ["l", "l", "l", "r", "l"], rows: occ.map((o) => [o.date, o.name, o.direction === "in" ? "In" : "Out", num(o.amount), o.confirmed ? "Yes" : "Estimate"]) });
      doc.notes.unshift("This forecast is an estimate based on your scheduled commitments; it is not a record of actual transactions.");
      break;
    }
    case "wealth": {
      const nw = netWorth(d.accounts.filter((a) => !a.archived), d.transactions, d.valuations);
      doc.summary.push(["Assets", amt(nw.assets)], ["Liabilities", amt(nw.liabilities)], ["Net worth", amt(nw.net)]);
      doc.sections.push({ title: "Accounts and assets", headers: ["Account", "Kind", "Type", "Value (INR)", "Valued on"], align: ["l", "l", "l", "r", "l"], rows: d.accounts.filter((a) => !a.archived).map((a) => { const v = accountValue(a, d.transactions, d.valuations); return [a.name, a.kind.replace(/_/g, " "), isLiability(a.kind) ? "Liability" : "Asset", num(v.value), v.valuedOn ?? "Ledger balance"]; }) });
      doc.notes.unshift("Investment and asset values use your latest saved valuation; values without one use the ledger balance and may be out of date.");
      break;
    }
    case "organisation": {
      const by: Record<string, Expense[]> = {}; for (const e of spend) (by[orgOf(e)] ??= []).push(e);
      doc.sections.push({ title: "Spending by organisation", headers: ["Organisation", "Entries", "Spending (INR)"], align: ["l", "r", "r"], rows: Object.entries(by).sort().map(([k, l]) => [k, String(l.length), num(l.reduce((s, e) => s + shareIn(e, ws), 0))]), total: ["Total", String(spend.length), num(spend.reduce((s, e) => s + shareIn(e, ws), 0))] });
      for (const [k, l] of Object.entries(by).sort()) doc.sections.push(txnSection(k, l, d, ws));
      break;
    }
    case "trip-summary": case "trip-closure": case "trip-settlement": {
      for (const t of tripsSel) {
        const tf = tripFinance(t, d.transactions), rec = advanceReconciliation(t, d.transactions);
        const rows: string[][] = [["Dates", `${t.start} to ${t.end}`], ["Destination", t.destination || "—"], ["Budget", num(t.budget)], ["Spent (confirmed)", num(tf.total)], ["Unpaid bookings (commitments)", num(tf.committed)], ["Projected total", num(tf.projected)],
          ["Advances received", num(rec.advances)], ["Business/official spending against advances", num(rec.expenses)], ["Advances returned", num(rec.returns)], ["Advance outstanding", num(rec.outstanding)], ["Reimbursement pending", num(tf.reimbursablePending)], ["Reimbursed", num(tf.reimbursed)]];
        for (const [w, v] of Object.entries(tf.byWorkspace)) rows.push([`${SCOPE_LABEL[w as Scope]} share`, num(v)]);
        if (type === "trip-closure" || type === "trip-settlement") { const b = closeBlockers(t, d.transactions); rows.push(["Closure status", t.closedAt ? `Closed ${t.closedAt.slice(0, 10)}` : b.length ? "Open: " + b.join("; ") : "Ready to close"]); }
        doc.sections.push({ title: t.name, headers: ["Item", "INR"], align: ["l", "r"], rows });
        if (type === "trip-closure") doc.sections.push(txnSection(`${t.name} — all trip entries`, tf.entries as Expense[], d, []));
      }
      doc.notes.unshift("Unpaid bookings are commitments and are not included in confirmed trip spending.");
      break;
    }
    case "trip-expenses": {
      for (const t of tripsSel) { const s = tripFinance(t, d.transactions); doc.sections.push(txnSection(t.name, s.entries as Expense[], d, [])); }
      break;
    }
    case "trip-budget": {
      for (const t of tripsSel) { const b = tripBudgetDetail(t, d.transactions); doc.sections.push({ title: t.name, headers: ["Category", "Budget", "Actual", "Remaining"], align: ["l", "r", "r", "r"], rows: [...b.lines.map((l) => [l.category, num(l.budget), num(l.actual), num(l.left)]), ["Unbudgeted spending", "—", num(b.unbudgeted), "—"], ["Contingency", num(b.contingency), "—", "—"]], total: ["Total", num(b.planned), num(b.spent), num(b.remaining)] }); }
      break;
    }
    case "trip-travellers": {
      for (const t of tripsSel) { const by: Record<string, number> = {}; for (const e of tripFinance(t, d.transactions).entries as Expense[]) { const f2 = 1; /* memberShares already returns INR */ for (const s of memberShares(e)) by[d.memberName(s.memberId)] = r2((by[d.memberName(s.memberId)] ?? 0) + s.amount * f2); } doc.sections.push({ title: t.name, headers: ["Traveller", "Share (INR)"], align: ["l", "r"], rows: Object.entries(by).map(([k, v]) => [k, num(v)]) }); }
      break;
    }
    case "trip-bookings": {
      for (const t of tripsSel) doc.sections.push({ title: t.name, headers: ["Date", "Type", "Provider", "Reference", "Amount", "Paid", "Outstanding", "Status"], align: ["l", "l", "l", "l", "r", "r", "r", "l"], wide: true, rows: (t.bookings ?? []).map((b) => [b.date, b.kind, b.provider, b.ref, num(b.amount), num(bookingPaid(b, d.transactions)), num(bookingOutstanding(b, d.transactions)), b.status]) });
      doc.notes.unshift("Outstanding booking amounts are commitments, not spending.");
      break;
    }
    case "trip-advances": {
      for (const t of tripsSel) { const r = advanceReconciliation(t, d.transactions); doc.sections.push({ title: t.name, headers: ["Date", "Item", "Kind", "Amount (INR)"], align: ["l", "l", "l", "r"], rows: r.lines.map((l) => [l.date, l.label, l.kind, num(l.amount)]), total: ["", "Outstanding", "", num(r.outstanding)] }); }
      break;
    }
    case "trip-reimbursements": {
      for (const t of tripsSel) { const l = (tripFinance(t, d.transactions).entries as Expense[]).filter((e) => isTracked(e)); doc.sections.push({ title: t.name, headers: ["Date", "Expense", "Claimed", "Received", "Pending"], align: ["l", "l", "r", "r", "r"], rows: l.map((e) => [e.date, e.merchant || e.title, num(e.amount), num(receivedOf(e)), num(outstandingOf(e))]) }); }
      break;
    }
    case "pending-reimbursements": {
      const l = all.filter((e) => kind(e) === "expense" && isTracked(e) && outstandingOf(e) > 0);
      doc.summary.push(["Claims pending", String(l.length)], ["Amount pending", amt(l.reduce((s, e) => s + outstandingOf(e), 0))]);
      doc.sections.push({ title: "Pending reimbursements", headers: ["Date", "Expense", "Payer", "Claimed", "Received", "Pending", "Age (days)"], align: ["l", "l", "l", "r", "r", "r", "r"], wide: true, rows: l.map((e) => [e.date, e.merchant || e.title, e.reimbursement?.payer ?? "—", num(e.amount), num(receivedOf(e)), num(outstandingOf(e)), String(Math.max(0, Math.round((Date.parse(d.today) - Date.parse(e.date)) / 864e5)))]) });
      break;
    }
    case "unreconciled": {
      const l = win.filter((e) => !e.reconciledAt);
      doc.summary.push(["Unmatched entries", String(l.length)], ["Amount", amt(l.reduce((s, e) => s + e.amount, 0))]);
      doc.sections.push(txnSection("Not yet matched to a statement", l, d, ws));
      break;
    }
    case "commitments": {
      const occ = occurrences(d.commitments.filter((c) => c.status === "active"), f.from < d.today ? d.today : f.from, f.to > d.today ? f.to : addDays(d.today, 60)).filter((o) => o.direction === "out");
      const bookings = d.trips.flatMap((t) => (t.bookings ?? []).filter((b) => bookingOutstanding(b, d.transactions) > 0).map((b) => [b.date, `${t.name}: ${b.provider || b.kind}`, "Unpaid booking", num(bookingOutstanding(b, d.transactions))]));
      const rows = [...occ.map((o) => [o.date, o.name, o.overdue ? "Overdue" : "Scheduled", num(o.amount)]), ...bookings].sort((a, b) => a[0]!.localeCompare(b[0]!));
      doc.summary.push(["Pending commitments", String(rows.length)], ["Total", amt(rows.reduce((s, r) => s + Number(r[3]!.replace(/,/g, "")), 0))]);
      doc.sections.push({ title: "Pending commitments", headers: ["Due", "Item", "Status", "Amount (INR)"], align: ["l", "l", "l", "r"], rows });
      doc.notes.unshift("Commitments are future obligations, not confirmed spending.");
      break;
    }
    case "drafts": {
      const l = d.drafts.filter((x) => x.status !== "saved");
      doc.summary.push(["Drafts waiting", String(l.length)]);
      doc.sections.push({ title: "Expense drafts (not in the ledger)", headers: ["Last edited", "Merchant", "Date", "Workspace", "Amount", "Status", "Where"], align: ["l", "l", "l", "l", "r", "l", "l"], rows: l.map((x) => [x.updatedAt.slice(0, 10), x.data.merchant || "—", x.data.date || "—", x.data.scope ? SCOPE_LABEL[x.data.scope as Scope] ?? x.data.scope : "—", x.data.amount ? num(Number(x.data.amount)) : "—", x.status.replace(/_/g, " "), x.localOnly ? "This device" : "Account"]) });
      doc.notes.unshift("Drafts are unconfirmed and are never included in any financial totals.");
      break;
    }
    case "imports": {
      const l = win.filter((e) => e.statementRef);
      const by: Record<string, number[]> = {}; for (const e of l) { const k = d.accountName(e.accountId ?? null); (by[k] ??= [0, 0]); by[k]![0]! += 1; by[k]![1]! += e.amount; }
      doc.summary.push(["Statement-matched entries", String(l.length)], ["Entries without a statement match", String(win.length - l.length)]);
      doc.sections.push({ title: "Statement matches by account", headers: ["Account", "Matched entries", "Amount (INR)"], align: ["l", "r", "r"], rows: Object.entries(by).map(([k, v]) => [k, String(v[0]), num(v[1]!)]) });
      break;
    }
  }
  if (!doc.type.startsWith("trip-") && !["subscription", "loan", "forecast", "wealth", "drafts", "commitments"].includes(type)) doc.notes.push(...disclosures(win));
  if (needsTrip(type) && !tripsSel.length) doc.notes.unshift("No trips match the selected period or trip filter.");
  doc.landscape = doc.sections.some((s) => s.wide);
  doc.rowCount = doc.sections.reduce((s, x) => s + x.rows.length, 0);
  return doc;
}
