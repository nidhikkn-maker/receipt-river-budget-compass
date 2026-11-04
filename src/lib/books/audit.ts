/**
 * Continuous audit [§24, §52–54]: one set of findings from existing rules, grouped by entity, account, year,
 * issue type and risk; fed into the Financial Inbox (no second queue). Pure and read-only.
 */
import type { Expense } from "../expenses";
import type { VaultDoc } from "../documents";
import type { Account } from "../ledger";
import { fyOf, type EntityProfile } from "../entities";
import { auditFindings } from "../audit-dashboard";
import type { Asset } from "../assets";
import { duplicatePairs } from "../inbox";
import type { BooksData } from "./types";
import { bookVsTax } from "./depreciation";
import { invoiceProblems, duplicateInvoices } from "./gst";
import { leaseAlerts, tenantLedger } from "./property";
import { pastRetention } from "./docrepo";
import { openingProposal } from "./fy";
import { REQUIRED_SCHEDULES } from "./intake";

export type IssueType = "Unreconciled bank" | "Classification" | "Missing invoice" | "Duplicate" | "Asset register" | "Depreciation" | "Property/rent" | "Tax" | "GST" | "Investment cost basis" | "Intercompany" | "Missing document" | "Profile" | "Opening balance";
export interface AuditItem { key: string; type: IssueType; entity: string; account: string | null; fy: string | null; risk: "high" | "medium" | "low"; text: string; evidence: string; to: string }

const MAP: Record<string, IssueType> = { Profiles: "Profile", Invoices: "Missing invoice", Assets: "Asset register", Years: "Missing document" };

export function continuousAudit(p: { today: string; entities: EntityProfile[]; assets: Asset[]; entries: Expense[]; docs: VaultDoc[]; accounts: Account[]; books: BooksData; holdingsWithoutCost: { name: string; isin: string }[] }): AuditItem[] {
  const out: AuditItem[] = [];
  const ent = (id?: string) => p.entities.find((e) => e.id === id)?.name ?? "Personal";
  const acc = (id?: string | null) => p.accounts.find((a) => a.id === id)?.name ?? null;
  const fy = fyOf(p.today);
  for (const f of auditFindings(p.today, p.entities, p.assets, p.entries, p.docs))
    out.push({ key: `a:${f.key}`, type: MAP[f.area] ?? "Missing document", entity: f.text.split(":")[0] ?? "", account: null, fy: /FY (\d{4}-\d{2})/.exec(f.text)?.[1] ?? null, risk: f.severity, text: f.text, evidence: "Saved records", to: f.to });
  const unrec = p.entries.filter((e) => e.statementRef && !e.reconciledAt);
  const byAcc = new Map<string, number>(); for (const e of unrec) byAcc.set(e.accountId ?? "", (byAcc.get(e.accountId ?? "") ?? 0) + 1);
  for (const [id, n] of byAcc) out.push({ key: `unrec:${id}`, type: "Unreconciled bank", entity: "Personal", account: acc(id), fy, risk: n > 20 ? "high" : "medium", text: `${n} statement lines not yet confirmed`, evidence: "Statement Desk imports", to: "/inbox" });
  const misc = p.entries.filter((e) => (e.txnType ?? "expense") === "expense" && e.category === "Miscellaneous").length;
  if (misc) out.push({ key: "class:misc", type: "Classification", entity: "Personal", account: null, fy, risk: misc > 25 ? "high" : "low", text: `${misc} entries still filed under Miscellaneous`, evidence: "Ledger categories", to: "/inbox" });
  const dups = duplicatePairs(p.entries).length;
  if (dups) out.push({ key: "dup", type: "Duplicate", entity: "Personal", account: null, fy, risk: "high", text: `${dups} possible duplicate pair${dups > 1 ? "s" : ""}`, evidence: "Same amount, date and account", to: "/inbox" });
  const diffs = bookVsTax(p.assets, fy).filter((d) => Math.abs(d.difference) > 1);
  if (diffs.length) out.push({ key: `dep:${fy}`, type: "Depreciation", entity: "All", account: null, fy, risk: "low", text: `${diffs.length} asset${diffs.length > 1 ? "s" : ""} with book ≠ tax depreciation (deferred tax to review)`, evidence: "Depreciation engine", to: "/assets" });
  const unposted = p.books.journals.filter((j) => j.status === "prepared").length;
  if (unposted) out.push({ key: "dep:unposted", type: "Depreciation", entity: "All", account: null, fy, risk: "medium", text: `${unposted} depreciation journal${unposted > 1 ? "s" : ""} prepared but not posted`, evidence: "Prepared journals", to: "/assets" });
  const months = [0, 1, 2].map((i) => { const d = new Date(p.today + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() - i); return d.toISOString().slice(0, 7); }).reverse();
  const income = p.entries.filter((e) => e.txnType === "income").map((e) => ({ id: e.id, date: e.date, amount: e.amount, text: `${e.title} ${e.merchant ?? ""} ${e.description}` }));
  for (const l of p.books.leases) {
    const prop = p.books.properties.find((x) => x.id === l.propertyId);
    for (const a of leaseAlerts(l, p.today)) out.push({ key: `lease:${l.id}:${a}`, type: "Property/rent", entity: ent(prop?.ownerEntityId), account: null, fy, risk: /ended/.test(a) ? "high" : "medium", text: `${l.tenant}: ${a}`, evidence: "Lease terms", to: "/assets" });
    const last = tenantLedger(l, prop, income, months).pop();
    if (last && last.balance > 0) out.push({ key: `rent:${l.id}:${last.month}`, type: "Property/rent", entity: ent(prop?.ownerEntityId), account: null, fy, risk: "high", text: `${l.tenant}: ₹${last.balance.toLocaleString("en-IN")} rent outstanding`, evidence: "Bank receipts vs lease", to: "/assets" });
  }
  for (const i of p.books.gstInvoices) for (const prob of invoiceProblems(i)) out.push({ key: `gst:${i.id}:${prob}`, type: "GST", entity: i.gstin, account: null, fy: fyOf(i.date), risk: "medium", text: `${i.number}: ${prob}`, evidence: "Invoice register", to: "/tax" });
  for (const n of duplicateInvoices(p.books.gstInvoices)) out.push({ key: `gstdup:${n}`, type: "GST", entity: "", account: null, fy, risk: "high", text: `Invoice ${n} entered more than once`, evidence: "Invoice register", to: "/tax" });
  for (const h of p.holdingsWithoutCost) out.push({ key: `cost:${h.isin}`, type: "Investment cost basis", entity: "Personal", account: null, fy, risk: "medium", text: `${h.name}: purchase history missing`, evidence: "Demat holdings", to: "/wealth" });
  const inter = intercompanyGaps(p.entries, p.accounts);
  for (const g of inter) out.push({ key: `ic:${g.id}`, type: "Intercompany", entity: g.scope, account: acc(g.accountId), fy: fyOf(g.date), risk: "medium", text: g.text, evidence: "Transfers between workspaces", to: "/transfers" });
  for (const r of p.books.fyRecords) {
    const missing = REQUIRED_SCHEDULES.filter((s) => !r.schedules.includes(s));
    if (missing.length) out.push({ key: `fysched:${r.id}`, type: "Missing document", entity: ent(r.entityId), account: null, fy: r.fy, risk: "medium", text: `FY ${r.fy}: ${missing.length} audited schedule${missing.length > 1 ? "s" : ""} not uploaded`, evidence: "Financial year onboarding", to: "/tax" });
    const op = openingProposal(r, {});
    if (op.balanced === false) out.push({ key: `fybal:${r.id}`, type: "Opening balance", entity: ent(r.entityId), account: null, fy: r.fy, risk: "high", text: `FY ${r.fy}: audited balances differ by ${op.gap}`, evidence: "Audited statements", to: "/tax" });
    if (!r.confirmedOpening) out.push({ key: `fyopen:${r.id}`, type: "Opening balance", entity: ent(r.entityId), account: null, fy: r.fy, risk: "medium", text: `FY ${r.fy}: opening balances waiting for your confirmation`, evidence: "Audited statements", to: "/tax" });
  }
  const old = pastRetention(p.docs, p.today, p.books.retentionYears).length;
  if (old) out.push({ key: "retention", type: "Missing document", entity: "All", account: null, fy: null, risk: "low", text: `${old} document${old > 1 ? "s are" : " is"} past the retention period (review; nothing is deleted)`, evidence: "Retention policy", to: "/vault" });
  const order = { high: 0, medium: 1, low: 2 };
  return [...new Map(out.map((x) => [x.key, x])).values()].sort((a, b) => order[a.risk] - order[b.risk]);
}

/** Transfers across workspaces (personal ↔ business) without a matching counter-entry [§24]. */
export function intercompanyGaps(entries: Expense[], accounts: Account[]) {
  const scopeOf = (id?: string | null) => (accounts.find((a) => a.id === id) as (Account & { scope?: string }) | undefined)?.scope;
  return entries.filter((e) => e.txnType === "transfer" && e.accountId && e.toAccountId && scopeOf(e.accountId) && scopeOf(e.toAccountId) && scopeOf(e.accountId) !== scopeOf(e.toAccountId) && !e.reconciledAt)
    .map((e) => ({ id: e.id, date: e.date, accountId: e.accountId, scope: scopeOf(e.accountId) ?? "", text: `${e.title}: transfer between workspaces not confirmed on both sides` }));
}

export function groupBy(items: AuditItem[], by: "entity" | "account" | "fy" | "type" | "risk"): { name: string; items: AuditItem[] }[] {
  const m = new Map<string, AuditItem[]>();
  for (const i of items) { const k = (by === "fy" ? i.fy && `FY ${i.fy}` : by === "account" ? i.account : by === "type" ? i.type : by === "risk" ? i.risk : i.entity) || "—"; m.set(k, [...(m.get(k) ?? []), i]); }
  return [...m.entries()].map(([name, items]) => ({ name, items }));
}

/** Readiness tiles from real data only [§54]. */
export function readinessTiles(p: { accounts: Account[]; entries: Expense[]; items: AuditItem[]; books: BooksData; docsMissing: number; today: string }) {
  const live = p.accounts.filter((a) => !a.archived && ["savings", "current", "credit_card", "cash"].includes(a.kind));
  const reconciled = live.filter((a) => { const es = p.entries.filter((e) => e.accountId === a.id && e.statementRef); return es.length > 0 && es.every((e) => e.reconciledAt); }).length;
  return [
    { label: "Reconciled accounts", value: `${reconciled}/${live.length}` },
    { label: "Open exceptions", value: String(p.items.length) },
    { label: "Missing evidence", value: String(p.docsMissing) },
    { label: "Closed periods", value: String(p.books.closedPeriods.length) },
    { label: "Draft reports", value: String(p.books.gstInvoices.length ? 2 : 0) },
    { label: "Pending tax preparation", value: String(p.books.taxProfiles.length ? p.items.filter((i) => i.type === "Tax" || i.type === "GST").length : 1) },
    { label: "Unverified balances", value: String(p.books.fyRecords.filter((r) => !r.confirmedOpening).length + p.entries.filter((e) => e.statementRef && !e.reconciledAt).length) },
    { label: "Required approvals", value: String(p.books.journals.filter((j) => j.status === "prepared").length + p.books.rules.filter((r) => r.status === "proposed").length + p.books.proposedFields.filter((f) => f.status === "proposed").length) },
  ];
}

/** Reconciliation hub [§24]: one row per kind with its open count and the page that resolves it. */
export function reconHub(items: AuditItem[], extra: { cardUnrec: number; loanUnrec: number; suppliersMissing: number; customersOpen: number }) {
  const n = (t: IssueType) => items.filter((i) => i.type === t).length;
  return [
    { kind: "Bank", open: n("Unreconciled bank"), to: "/statements" },
    { kind: "Card", open: extra.cardUnrec, to: "/statements" },
    { kind: "Loan", open: extra.loanUnrec, to: "/wealth" },
    { kind: "Supplier", open: extra.suppliersMissing, to: "/gst-check" },
    { kind: "Customer", open: extra.customersOpen, to: "/receivables" },
    { kind: "Investment", open: n("Investment cost basis"), to: "/wealth" },
    { kind: "Intercompany", open: n("Intercompany"), to: "/transfers" },
    { kind: "GST", open: n("GST"), to: "/tax" },
  ];
}
