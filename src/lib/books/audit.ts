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
import { brokerCashOverlap } from "./recon";
import { REQUIRED_SCHEDULES } from "./intake";
import { ledgerTaxPayments, obligations, type Obligation } from "./compliance";
import type { FindingState } from "./types";

export type IssueType = "Unreconciled bank" | "Classification" | "Missing invoice" | "Duplicate" | "Asset register" | "Depreciation" | "Property/rent" | "Tax" | "GST" | "Investment cost basis" | "Investment overlap" | "Intercompany" | "Missing document" | "Profile" | "Opening balance";
export interface AuditItem { key: string; type: IssueType; entity: string; account: string | null; fy: string | null; risk: "high" | "medium" | "low"; text: string; evidence: string; to: string }

const MAP: Record<string, IssueType> = { Profiles: "Profile", Invoices: "Missing invoice", Assets: "Asset register", Years: "Missing document" };

export function continuousAudit(p: { today: string; entities: EntityProfile[]; assets: Asset[]; entries: Expense[]; docs: VaultDoc[]; accounts: Account[]; books: BooksData; holdingsWithoutCost: { name: string; isin: string }[] }): AuditItem[] {
  const out: AuditItem[] = [];
  const ent = (id?: string) => p.entities.find((e) => e.id === id)?.name ?? "Personal";
  const acc = (id?: string | null) => p.accounts.find((a) => a.id === id)?.name ?? null;
  const fy = fyOf(p.today);
  for (const f of auditFindings(p.today, p.entities, p.assets, p.entries, p.docs))
    out.push({ key: `a:${f.key}`, type: MAP[f.area] ?? "Missing document", entity: f.text.split(":")[0] ?? "", account: null, fy: /FY (\d{4}-\d{2})/.exec(f.text)?.[1] ?? null, risk: f.severity, text: f.text, evidence: "Saved records", to: f.to });
  // Findings keep their real entity (via account mapping) and financial year [§53].
  const ownerOfAcc = new Map<string, string>(); for (const [eid, ids] of Object.entries(p.books.entityAccounts ?? {})) for (const id of ids) ownerOfAcc.set(id, eid);
  const entOfEntry = (e: { accountId?: string | null | undefined }) => ent(e.accountId ? ownerOfAcc.get(e.accountId) : undefined);
  const bucket = <T extends { accountId?: string | null | undefined; date: string }>(xs: T[], withAcc: boolean) => {
    const m = new Map<string, { entity: string; fy: string; accountId: string | null; n: number }>();
    for (const e of xs) { const k = `${withAcc ? e.accountId ?? "" : entOfEntry(e)}|${fyOf(e.date)}`; const cur = m.get(k) ?? { entity: entOfEntry(e), fy: fyOf(e.date), accountId: withAcc ? e.accountId ?? null : null, n: 0 }; cur.n++; m.set(k, cur); }
    return [...m.entries()];
  };
  for (const [k, b] of bucket(p.entries.filter((e) => e.statementRef && !e.reconciledAt), true)) out.push({ key: `unrec:${k}`, type: "Unreconciled bank", entity: b.entity, account: acc(b.accountId), fy: b.fy, risk: b.n > 20 ? "high" : "medium", text: `${b.n} statement lines not yet confirmed`, evidence: "Statement Desk imports", to: "/inbox" });
  for (const [k, b] of bucket(p.entries.filter((e) => (e.txnType ?? "expense") === "expense" && e.category === "Miscellaneous"), false)) out.push({ key: `class:misc:${k}`, type: "Classification", entity: b.entity, account: null, fy: b.fy, risk: b.n > 25 ? "high" : "low", text: `${b.n} entries still filed under Miscellaneous`, evidence: "Ledger categories", to: "/inbox" });
  for (const [k, b] of bucket(duplicatePairs(p.entries).map((d) => d[0]), false)) out.push({ key: `dup:${k}`, type: "Duplicate", entity: b.entity, account: null, fy: b.fy, risk: "high", text: `${b.n} possible duplicate pair${b.n > 1 ? "s" : ""}`, evidence: "Same amount, date and account", to: "/inbox" });
  const diffs = bookVsTax(p.assets, fy).filter((d) => Math.abs(d.difference) > 1);
  if (diffs.length) out.push({ key: `dep:${fy}`, type: "Depreciation", entity: "All", account: null, fy, risk: "low", text: `${diffs.length} asset${diffs.length > 1 ? "s" : ""} with book ≠ tax depreciation (deferred tax to review)`, evidence: "Depreciation engine", to: "/assets" });
  const unposted = p.books.journals.filter((j) => j.status === "prepared").length;
  if (unposted) out.push({ key: "dep:unposted", type: "Depreciation", entity: "All", account: null, fy, risk: "medium", text: `${unposted} depreciation journal${unposted > 1 ? "s" : ""} prepared but not posted`, evidence: "Prepared journals", to: "/assets" });
  const months = [0, 1, 2].map((i) => { const d = new Date(p.today + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() - i); return d.toISOString().slice(0, 7); }).reverse();
  // Same receipts and one-receipt-one-lease allocation as Property [§39, §52].
  const income = p.entries.filter((e) => e.txnType === "income" || (e.txnType === "transfer" && !!e.toAccountId)).map((e) => ({ id: e.id, date: e.date, amount: e.amount, accountId: e.txnType === "transfer" ? e.toAccountId : e.accountId, currency: e.currency, text: `${e.title} ${e.merchant ?? ""} ${e.description}` }));
  const allLeases = { leases: p.books.leases, properties: p.books.properties };
  for (const l of p.books.leases) {
    const prop = p.books.properties.find((x) => x.id === l.propertyId);
    for (const a of leaseAlerts(l, p.today)) out.push({ key: `lease:${l.id}:${a}`, type: "Property/rent", entity: ent(prop?.ownerEntityId), account: null, fy, risk: /ended/.test(a) ? "high" : "medium", text: `${l.tenant}: ${a}`, evidence: "Lease terms", to: "/assets" });
    const last = tenantLedger(l, prop, income, months, allLeases).pop();
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
  // Tax and GST [§52]: missing profiles, overdue filings and ledger tax payments not yet confirmed as credits.
  for (const e of p.entities) {
    const prof = p.books.taxProfiles.find((x) => x.entityId === e.id);
    if (!prof) { out.push({ key: `taxprof:${e.id}`, type: "Tax", entity: e.name, account: null, fy, risk: "medium", text: `${e.name}: no tax profile, so filing obligations can't be worked out`, evidence: "Tax profiles", to: "/tax" }); continue; }
    for (const o of entityObligations(p, e.id)) if (o.status === "overdue") out.push({ key: `oblig:${e.id}:${o.gstin ?? ""}:${o.form}:${o.period}`, type: o.form === "ITR" ? "Tax" : "GST", entity: e.name, account: null, fy: o.period.startsWith("FY ") ? o.period.slice(3) : fyOf(`${o.period}-01`), risk: "high", text: `${o.form} ${o.period}${o.gstin ? ` (${o.gstin})` : ""}: due ${o.due}, no filing evidence recorded`, evidence: o.basis, to: "/tax" });
  }
  const credited = new Set((p.books.taxCredits ?? []).map((c) => c.transactionId).filter(Boolean));
  const unconfirmed = ledgerTaxPayments(p.entries, fy).filter((t) => !credited.has(t.id));
  if (unconfirmed.length) out.push({ key: `taxpay:${fy}`, type: "Tax", entity: "All", account: null, fy, risk: "medium", text: `${unconfirmed.length} income-tax payment${unconfirmed.length > 1 ? "s" : ""} in the ledger not yet confirmed as tax credits`, evidence: "Bank debits naming a tax challan", to: "/tax" });
  const old = pastRetention(p.docs, p.today, p.books.retentionYears).length;
  if (old) out.push({ key: "retention", type: "Missing document", entity: "All", account: null, fy: null, risk: "low", text: `${old} document${old > 1 ? "s are" : " is"} past the retention period (review; nothing is deleted)`, evidence: "Retention policy", to: "/vault" });
  const order = { high: 0, medium: 1, low: 2 };
  return [...new Map(out.map((x) => [x.key, x])).values()].sort((a, b) => order[a.risk] - order[b.risk]);
}

type ObligationInput = { today: string; entities: EntityProfile[]; books: BooksData };
/** Obligations for this and the previous financial year for one entity. */
export function entityObligations(p: ObligationInput, entityId: string): Obligation[] {
  const e = p.entities.find((x) => x.id === entityId); if (!e) return [];
  const prof = p.books.taxProfiles.find((x) => x.entityId === entityId);
  const cur = fyOf(p.today); const prev = `${Number(cur.slice(0, 4)) - 1}-${cur.slice(2, 4)}`;
  return [prev, cur].flatMap((fy) => obligations({ entity: e, profile: prof, fy, today: p.today, gstFilings: p.books.gstFilings, fyRecords: p.books.fyRecords, rules: p.books.rules }));
}

/** Split derived findings by the owner's saved decision [§53]: open, or reviewed with its note. */
export function withStates(items: AuditItem[], states: FindingState[] | undefined) {
  const by = new Map((states ?? []).map((s) => [s.key, s]));
  const open: AuditItem[] = [], reviewed: (AuditItem & { state: FindingState })[] = [];
  for (const i of items) { const s = by.get(i.key); if (s && s.status !== "open") reviewed.push({ ...i, state: s }); else open.push(i); }
  return { open, reviewed };
}
/** Record a decision; reopening keeps the history line. */
export function setFindingState(states: FindingState[] | undefined, key: string, status: FindingState["status"], note: string, at: string): FindingState[] {
  if (status !== "open" && note.trim().length < 3) throw new Error("Add a short note saying why");
  return [...(states ?? []).filter((s) => s.key !== key), { key, status, note: note.trim(), at }];
}

export interface ApprovalEvent { at: string; what: string; detail: string }
/** Every recorded approval and restricted action, newest first [§55–57]. Read from saved records only. */
export function approvalHistory(b: BooksData): ApprovalEvent[] {
  const out: ApprovalEvent[] = [];
  for (const l of b.periodLog) out.push({ at: l.at, what: l.action === "closed" ? "Period closed" : "Period reopened", detail: l.reason });
  for (const r of b.rules) if (r.approvedOn) out.push({ at: r.approvedOn, what: "Rule approved", detail: `${r.title} (${r.key} = ${r.value}, from ${r.effectiveFrom})` });
  for (const j of b.journals) if (j.status === "posted" && j.postedOn) out.push({ at: j.postedOn, what: "Depreciation posted", detail: `${j.period} · ₹${j.amount.toLocaleString("en-IN")}` });
  for (const f of b.fyRecords) if (f.confirmedOpening && f.confirmedOn) out.push({ at: f.confirmedOn, what: "Opening balances confirmed", detail: `FY ${f.fy}` });
  for (const s of b.findings ?? []) out.push({ at: s.at.slice(0, 10), what: s.status === "open" ? "Finding reopened" : s.status === "resolved" ? "Finding resolved" : "Finding accepted", detail: `${s.key}${s.note ? ` — ${s.note}` : ""}` });
  for (const d of b.ruleDecisions ?? []) out.push({ at: d.at.slice(0, 10), what: d.status === "approved" ? "Official notice taken up" : "Official notice dismissed", detail: d.changeId });
  for (const c of b.taxCredits ?? []) out.push({ at: c.fy, what: "Tax credit recorded", detail: `${c.kind} ₹${c.amount.toLocaleString("en-IN")} · ${c.source}` });
  return out.sort((a, b2) => b2.at.localeCompare(a.at));
}

/** Transfers across workspaces (personal ↔ business) without a matching counter-entry [§24]. */
export function intercompanyGaps(entries: Expense[], accounts: Account[]) {
  const scopeOf = (id?: string | null) => (accounts.find((a) => a.id === id) as (Account & { scope?: string }) | undefined)?.scope;
  return entries.filter((e) => e.txnType === "transfer" && e.accountId && e.toAccountId && scopeOf(e.accountId) && scopeOf(e.toAccountId) && scopeOf(e.accountId) !== scopeOf(e.toAccountId) && !e.reconciledAt)
    .map((e) => ({ id: e.id, date: e.date, accountId: e.accountId, scope: scopeOf(e.accountId) ?? "", text: `${e.title}: transfer between workspaces not confirmed on both sides` }));
}

export function groupBy(items: AuditItem[], by: "entity" | "account" | "fy" | "type" | "risk" | "evidence"): { name: string; items: AuditItem[] }[] {
  const m = new Map<string, AuditItem[]>();
  for (const i of items) { const k = (by === "fy" ? i.fy && `FY ${i.fy}` : by === "account" ? i.account : by === "type" ? i.type : by === "risk" ? i.risk : by === "evidence" ? i.evidence : i.entity) || "—"; m.set(k, [...(m.get(k) ?? []), i]); }
  return [...m.entries()].map(([name, items]) => ({ name, items }));
}

/** Readiness tiles from real data only [§54]. */
export function readinessTiles(p: { accounts: Account[]; entries: Expense[]; items: AuditItem[]; books: BooksData; docsMissing: number; today: string; obligations: Obligation[]; entitiesWithoutProfile: number }) {
  const ended = p.obligations.filter((o) => o.status !== "filed" && o.status !== "upcoming");
  const live = p.accounts.filter((a) => !a.archived && ["savings", "current", "credit_card", "cash"].includes(a.kind));
  const reconciled = live.filter((a) => { const es = p.entries.filter((e) => e.accountId === a.id && e.statementRef); return es.length > 0 && es.every((e) => e.reconciledAt); }).length;
  return [
    { label: "Reconciled accounts", value: `${reconciled}/${live.length}` },
    { label: "Open exceptions", value: String(p.items.length) },
    { label: "Missing evidence", value: String(p.docsMissing) },
    { label: "Closed periods", value: String(p.books.closedPeriods.length) },
    // Drafts prepared from saved records for periods that have ended and have no filing evidence yet.
    { label: "Draft reports", value: `${(p.books.savedDrafts ?? []).length} saved · ${ended.length} needed` },
    { label: "Pending tax preparation", value: String(p.entitiesWithoutProfile + p.obligations.filter((o) => o.status === "overdue").length) },
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
