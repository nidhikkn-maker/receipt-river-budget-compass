import { receiptRoundOffFor } from "./receipt-reading";
// V4.8 Detailed Expenditure Statement: a documentation report for one trip, event, project or
// set of purchases. Pure and read-only — it reuses ledger, workspace and reimbursement rules
// and never edits records. Claims/approvals are out of scope by design.
import { PAYMENT_LABEL, SCOPE_LABEL, type Expense, type Scope } from "./expenses";
import { isMove, type Account } from "./ledger";
import { workspaceParts } from "./workspaces";
import { tripTag } from "./intelligence";
import { instrumentLabel, type PaymentInstrument } from "./payment-instruments";
import { outstandingOf, receivedOf, reimbursableOf, isTracked, stageOf } from "./reimbursements";
import type { TravelTrip } from "./travel";
import { maskedText } from './reimbursement-profiles';

export type Subject = { kind: "trip"; id: string } | { kind: "tag"; tag: string } | { kind: "entries"; ids: string[] };
export type PayerKind = "personal" | "organisation" | "other";
export const PAYER_LABEL: Record<PayerKind, string> = { personal: "Paid personally", organisation: "Paid by business / organisation", other: "Paid by another party" };
export const NOT_RECORDED = "Not Recorded";

const r2 = (n: number) => Math.round(n * 100) / 100;
const kindOf = (e: Expense) => e.txnType ?? "expense";
/** Event / project / purpose tags that can define an expenditure group. */
export const GROUP_TAG = /^(Event|Project|Purpose|Organisation|Client|Trip): /;

/** Entries belonging to the subject: spending and refunds only — transfers and card bill payments are never expenditure. */
export function subjectEntries(s: Subject, txns: Expense[], trips: TravelTrip[], from?: string, to?: string): Expense[] {
  const trip = s.kind === "trip" ? trips.find((t) => t.id === s.id) : null;
  const tag = trip ? tripTag(trip) : s.kind === "tag" ? s.tag : null;
  return txns.filter((e) => {
    const k = kindOf(e);
    if (k !== "expense" && k !== "refund") return false;
    if (isMove(e.txnType)) return false;
    if (from && e.date < from) return false;
    if (to && e.date > to) return false;
    if (s.kind === "entries") return s.ids.includes(e.id);
    return (trip && e.tripId === trip.id) || (!!tag && (e.tags ?? []).includes(tag));
  }).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export interface PaymentInfo { method: string; source: string; payer: string; payerKind: PayerKind }
/** Payment method, actual account/card (masked), and who actually paid — each kept distinct. */
export function paymentInfo(e: Expense, accounts: Account[], instruments: PaymentInstrument[], memberName: (id: string | null) => string): PaymentInfo {
  const inst = e.paymentInstrumentId ? instruments.find((p) => p.id === e.paymentInstrumentId) : undefined;
  const acct = accounts.find((a) => a.id === (inst?.accountId ?? e.accountId));
  const method = inst ? inst.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : e.paymentMethod ? PAYMENT_LABEL[e.paymentMethod] : NOT_RECORDED;
  const source = maskedText(inst ? `${instrumentLabel(inst).replace("··", "ending ")}${acct ? ` (${acct.name})` : ""}` : acct ? `${acct.name}${acct.lastFour ? ` ending ${acct.lastFour.replace(/\D/g, '').slice(-4)}` : ''}` : NOT_RECORDED);
  const otherTag = (e.tags ?? []).find((t) => t.startsWith("Paid by: "));
  if (otherTag) return { method, source, payer: otherTag.slice(9), payerKind: "other" };
  if (inst?.type === "company_card" || e.paymentMethod === "company_card") return { method, source, payer: e.reimbursement?.payer || e.department || "Organisation", payerKind: "organisation" };
  return { method, source, payer: memberName(inst?.memberId ?? e.memberId ?? null), payerKind: "personal" };
}

export interface Annexure { no: string; row: number; receiptIndex: number; path: string; name: string; type: string; merchant: string; date: string; amount: number; docType: string }
export interface RegisterRow {
  sno: number; id: string; date: string; particulars: string; category: string; merchant: string; method: string; source: string; payer: string; payerKind: PayerKind;
  currency: string; original: number; inr: number; allocated: number; businessShare: number; personalShare: number; workspaces: string;
  eligible: number; reimbursed: number; outstanding: number; rejected: number; status: string; billRef: string; refund: boolean;
  items: { name: string; quantity: number; amount: number }[]; itemsReconcile: boolean; roundOff: number;
}
export interface Statement {
  reference: string; title: string; subjectName: string; workspace: string; organisation: string; purpose: string; start: string; end: string; prepared: string; currency: "INR";
  rows: RegisterRow[]; annexures: Annexure[];
  summary: { total: number; personal: number; organisation: number; other: number; business: number; personalFamily: number; eligible: number; reimbursed: number; outstanding: number; rejected: number };
  sources: { source: string; total: number }[]; workspaces: { workspace: string; total: number }[]; disclosures: string[];
}

const docType = (t: string, name: string) => (t === "application/pdf" || /\.pdf$/i.test(name) ? "PDF bill" : /screenshot|upi|payment/i.test(name) ? "Payment proof" : "Bill image");

export function buildStatement(input: {
  subject: Subject; subjectName: string; purpose?: string; organisation?: string; entries: Expense[]; trips: TravelTrip[];
  accounts: Account[]; instruments: PaymentInstrument[]; memberName: (id: string | null) => string; today: string; reference: string;
}): Statement {
  const { entries } = input;
  const annexures: Annexure[] = [];
  const rows: RegisterRow[] = entries.map((e, i) => {
    const sign = kindOf(e) === "refund" ? -1 : 1;
    const p = paymentInfo(e, input.accounts, input.instruments, input.memberName);
    const parts = workspaceParts(e);
    const biz = r2(parts.filter((x) => x.workspace === "business" || x.workspace === "official").reduce((s, x) => s + x.amount, 0));
    const inr = r2(sign * e.amount);
    const tracked = sign > 0 && isTracked(e);
    const stage = tracked ? stageOf(e) : null;
    // Eligibility only from user-confirmed reimbursement records; company-paid entries are never personal receivables.
    const eligible = tracked && p.payerKind === "personal" ? reimbursableOf(e) : 0;
    const rejected = stage === "rejected" || stage === "written_off" ? eligible : 0;
    const reimbursed = eligible ? receivedOf(e) : 0;
    const outstanding = eligible ? outstandingOf(e) : 0;
    const refs: string[] = [];
    e.receipts.forEach((r, j) => { const no = `A-${String(annexures.length + 1).padStart(2, "0")}`; refs.push(no); annexures.push({ no, row: i + 1, receiptIndex: j, path: r.path, name: r.name, type: r.type, merchant: e.merchant || e.title, date: e.date, amount: e.originalAmount, docType: docType(r.type, r.name) }); });
    const items = e.receiptDetails?.items ?? [];
    const roundOff = receiptRoundOffFor(e).amount;
    const itemsTotal = r2(items.reduce((s, x) => s + x.amount, 0) + (e.receiptDetails?.tax ?? 0) + (e.receiptDetails?.tip ?? 0) + roundOff);
    return {
      sno: i + 1, id: e.id, date: e.date, particulars: e.title || e.description || NOT_RECORDED, category: e.category || NOT_RECORDED, merchant: e.merchant || NOT_RECORDED,
      method: p.method, source: p.source, payer: p.payer, payerKind: p.payerKind, currency: e.currency, original: r2(sign * e.originalAmount), inr,
      allocated: inr, businessShare: r2(sign * biz), personalShare: r2(inr - sign * biz), workspaces: parts.map((x) => `${SCOPE_LABEL[x.workspace as Scope]} ${x.amount.toFixed(2)}`).join(" + "),
      eligible, reimbursed, outstanding, rejected, status: stage ? stage.replace(/_/g, " ") : sign < 0 ? "Refund" : "Not claimed",
      billRef: refs.length ? refs.join(", ") : "Bill Not Attached", refund: sign < 0,
      items, roundOff, itemsReconcile: items.length > 0 && (Math.abs(itemsTotal - e.originalAmount) < 0.5 || Math.abs(r2(itemsTotal - (e.receiptDetails?.tax ?? 0)) - e.originalAmount) < 0.5),
    };
  });
  const sumBy = (f: (r: RegisterRow) => number) => r2(rows.reduce((s, r) => s + f(r), 0));
  const summary = {
    total: sumBy((r) => r.inr), personal: sumBy((r) => (r.payerKind === "personal" ? r.inr : 0)), organisation: sumBy((r) => (r.payerKind === "organisation" ? r.inr : 0)), other: sumBy((r) => (r.payerKind === "other" ? r.inr : 0)),
    business: sumBy((r) => r.businessShare), personalFamily: sumBy((r) => r.personalShare), eligible: sumBy((r) => r.eligible), reimbursed: sumBy((r) => r.reimbursed), outstanding: sumBy((r) => r.outstanding), rejected: sumBy((r) => r.rejected),
  };
  const src: Record<string, number> = {}; for (const r of rows) src[r.source] = r2((src[r.source] ?? 0) + r.inr);
  const ws: Record<string, number> = {}; for (const e of entries) for (const p of workspaceParts(e)) ws[SCOPE_LABEL[p.workspace as Scope]] = r2((ws[SCOPE_LABEL[p.workspace as Scope]] ?? 0) + (kindOf(e) === "refund" ? -p.amount : p.amount));
  const trip = input.subject.kind === "trip" ? input.trips.find((t) => t.id === (input.subject as { id: string }).id) : undefined;
  const dates = entries.map((e) => e.date).sort();
  const disclosures: string[] = [];
  const missingBills = rows.filter((r) => r.billRef === "Bill Not Attached").length;
  if (missingBills) disclosures.push(`${missingBills} transaction${missingBills > 1 ? "s have" : " has"} no supporting bill attached.`);
  const noSource = rows.filter((r) => r.source === NOT_RECORDED).length;
  if (noSource) disclosures.push(`${noSource} transaction${noSource > 1 ? "s have" : " has"} no payment account recorded (shown as Not Recorded).`);
  const fx = rows.filter((r) => r.currency !== "INR").length;
  if (fx) disclosures.push(`${fx} foreign-currency transaction${fx > 1 ? "s are" : " is"} converted at the rate recorded on each entry.`);
  if (rows.some((r) => r.refund)) disclosures.push("Refunds are shown as negative amounts and reduce total expenditure.");
  if (summary.organisation) disclosures.push("Amounts paid directly by the business or organisation are not treated as personal reimbursement receivables.");
  if (rows.some((r) => r.payerKind === "personal" && r.businessShare > 0 && r.eligible === 0)) disclosures.push("Some business expenses paid personally are not marked for reimbursement and are not counted as eligible.");
  disclosures.push("Transfers and credit card bill payments are excluded; card purchases are counted once when made.");
  const scopes = [...new Set(entries.flatMap((e) => workspaceParts(e).map((p) => p.workspace)))];
  return {
    reference: input.reference, title: "Detailed Expenditure Statement", subjectName: input.subjectName,
    workspace: scopes.length ? scopes.map((s) => SCOPE_LABEL[s as Scope]).join(", ") : NOT_RECORDED,
    organisation: input.organisation || [...new Set(entries.map((e) => e.department?.trim()).filter(Boolean))].join(", ") || NOT_RECORDED,
    purpose: input.purpose || [...new Set(entries.map((e) => e.reimbursement?.purpose).filter(Boolean))].join("; ") || NOT_RECORDED,
    start: trip?.start ?? dates[0] ?? input.today, end: trip?.end ?? dates.at(-1) ?? input.today, prepared: input.today, currency: "INR",
    rows, annexures, summary, sources: Object.entries(src).sort((a, b) => b[1] - a[1]).map(([source, total]) => ({ source, total })),
    workspaces: Object.entries(ws).map(([workspace, total]) => ({ workspace, total })), disclosures,
  };
}

export const statementReference = (today: string, id: string) => `LL-DES-${today.replace(/-/g, "")}-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
