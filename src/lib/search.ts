// Universal Financial Search: one natural-language box over every record the user can see.
// Pure, tested. The query is parsed into filters (amount, dates, payment method, tag, status,
// record type) and matched locally — results only ever include records already loaded for the
// signed-in owner, so authorisation is inherited from the data layer.

import type { Account, Txn } from "./ledger";
import type { Commitment } from "./planning";

export interface ParsedQuery {
  text: string;
  minAmount: number | null;
  maxAmount: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  paymentMethod: string | null;
  tag: string | null;
  /** Record kinds the query points at; empty means search everything. */
  kinds: string[];
  status: string | null;
}

const MONTH_WORDS: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const PAYMENT_WORDS: Record<string, string> = { amex: "credit_card", "credit card": "credit_card", card: "credit_card", upi: "upi", cash: "cash", "debit card": "debit_card", debit: "debit_card", "net banking": "bank_transfer", wallet: "wallet" };

function parseAmount(raw: string): number {
  const n = parseFloat(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Turn "show all hotel expenses from the last six months above ₹5,000 using AMEX" into filters. */
export function parseQuery(q: string, today: string): ParsedQuery {
  let text = ` ${q.toLowerCase().trim()} `;
  const out: ParsedQuery = { text: q.trim(), minAmount: null, maxAmount: null, dateFrom: null, dateTo: null, paymentMethod: null, tag: null, kinds: [], status: null };
  const addDays = (s: string, n: number) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  // Amounts: "above ₹25,000", "over 25k", "below 500"
  const amt = text.match(/(above|over|more than|greater than)\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(k|lakh|lac|l)?/);
  if (amt) { out.minAmount = parseAmount(amt[2]!) * (amt[3] === "k" ? 1000 : amt[3] === "lakh" || amt[3] === "lac" || amt[3] === "l" ? 100000 : 1); text = text.replace(amt[0], " "); }
  const below = text.match(/(below|under|less than)\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(k|lakh|lac|l)?/);
  if (below) { out.maxAmount = parseAmount(below[2]!) * (below[3] === "k" ? 1000 : below[3] ? 100000 : 1); text = text.replace(below[0], " "); }

  // Date ranges
  const lastN = text.match(/last\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(day|week|month|year)s?/);
  if (lastN) {
    const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
    const n = words[lastN[1]!] ?? parseInt(lastN[1]!, 10);
    const unit = lastN[2]!;
    out.dateFrom = addDays(today, unit === "day" ? -n : unit === "week" ? -7 * n : unit === "month" ? -30 * n : -365 * n);
    out.dateTo = today;
    text = text.replace(lastN[0], " ");
  }
  if (/\bthis month\b/.test(text)) { out.dateFrom = `${today.slice(0, 7)}-01`; out.dateTo = today; text = text.replace("this month", " "); }
  if (/\blast month\b/.test(text)) {
    const d = new Date(today + "T00:00:00Z"); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1);
    const m = d.toISOString().slice(0, 7);
    out.dateFrom = `${m}-01`; out.dateTo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    text = text.replace("last month", " ");
  }
  if (/\bnext month\b/.test(text)) {
    const d = new Date(today + "T00:00:00Z"); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
    const m = d.toISOString().slice(0, 7);
    out.dateFrom = `${m}-01`; out.dateTo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    text = text.replace("next month", " ");
  }
  if (/\bthis year\b/.test(text)) { out.dateFrom = `${today.slice(0, 4)}-01-01`; out.dateTo = today; text = text.replace("this year", " "); }
  for (const [word, num] of Object.entries(MONTH_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) {
      const y = Number(today.slice(0, 4));
      const m = `${y}-${String(num).padStart(2, "0")}`;
      const year = m <= today.slice(0, 7) ? y : y - 1;
      const mm = `${year}-${String(num).padStart(2, "0")}`;
      out.dateFrom = `${mm}-01`;
      out.dateTo = new Date(Date.UTC(year, num, 0)).toISOString().slice(0, 10);
      text = text.replace(new RegExp(`\\b${word}\\b`), " ");
      break;
    }
  }

  // Payment method
  for (const [word, method] of Object.entries(PAYMENT_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) { out.paymentMethod = method; text = text.replace(new RegExp(`\\b${word}\\b`), " "); break; }
  }

  // Tag: "tagged MOVAC"
  const tag = text.match(/tagged\s+([a-z0-9][\w-]*)/);
  if (tag) { out.tag = tag[1]!.toLowerCase(); text = text.replace(tag[0], " "); }

  // Record kinds and statuses
  const kindWords: [RegExp, string][] = [
    [/\b(reimbursement|reimbursements|claim|claims)\b/, "reimbursement"],
    [/\b(document|documents|receipt|receipts|invoice|invoices|policy|policies|statement|statements)\b/, "document"],
    [/\b(recurring|subscription|subscriptions|emi|emis|bill|bills|commitment|commitments|payments?\s+due)\b/, "commitment"],
    [/\b(loan|loans)\b/, "loan"],
    [/\b(account|accounts|card|cards)\b/, "account"],
    [/\b(goal|goals|savings target)\b/, "goal"],
    [/\b(income|salary|received)\b/, "income"],
    [/\b(expense|expenses|spending|spent|purchase|purchases)\b/, "expense"],
  ];
  for (const [re, kind] of kindWords) if (re.test(text)) { if (!out.kinds.includes(kind)) out.kinds.push(kind); text = text.replace(re, " "); }
  if (/\bpending\b/.test(text)) { out.status = "pending"; text = text.replace(/\bpending\b/, " "); }
  if (/\boverdue\b/.test(text)) { out.status = "overdue"; text = text.replace(/\boverdue\b/, " "); }

  out.text = text.replace(/\b(show|find|all|my|me|the|from|using|with|made|to|get|list|what|which|give|payment|payments|due)\b/g, " ").replace(/\s+/g, " ").trim();
  return out;
}

export interface SearchHit {
  kind: "transaction" | "account" | "commitment" | "loan" | "document" | "goal";
  id: string;
  title: string;
  detail: string;
  amount: number | null;
  date: string | null;
  /** Where the record lives in the app. */
  to: string;
}

export interface SearchData {
  transactions: (Txn & { title?: string; merchant?: string | null; category?: string; tags?: string[]; paymentMethod?: string; reimbursementStatus?: string; description?: string | null })[];
  accounts: Account[];
  commitments: Commitment[];
  loans: { id: string; name: string; provider: string; principal: number; emi: number; nextDue: string }[];
  documents: { id: string; title: string; docType: string; merchant: string | null; amount: number | null; docDate: string | null; text?: string | null; fileName?: string }[];
  goals: { id: string; name: string; target: number; saved: number }[];
}

const inRange = (date: string | null | undefined, p: ParsedQuery) => {
  if (!date) return !p.dateFrom && !p.dateTo;
  if (p.dateFrom && date < p.dateFrom) return false;
  if (p.dateTo && date > p.dateTo) return false;
  return true;
};
const matchesText = (p: ParsedQuery, ...fields: (string | null | undefined)[]) => {
  if (!p.text) return true;
  const hay = fields.filter(Boolean).join(" ").toLowerCase();
  return p.text.split(" ").every((w) => hay.includes(w));
};

/** Search every record kind the owner can see, applying the parsed filters. */
export function searchAll(query: string, d: SearchData, today: string): SearchHit[] {
  const p = parseQuery(query, today);
  if (!query.trim()) return [];
  const hits: SearchHit[] = [];
  const want = (kind: string) => {
    if (!p.kinds.length) return true;
    if (kind === "transaction") return p.kinds.some((k) => ["expense", "income", "reimbursement"].includes(k));
    return p.kinds.includes(kind);
  };

  if (want("transaction")) {
    for (const t of d.transactions) {
      const type = t.txnType ?? "expense";
      if (p.kinds.includes("reimbursement") && type !== "expense" && type !== "reimbursement") continue;
      if (p.kinds.includes("income") && type !== "income") continue;
      if (p.kinds.includes("expense") && !p.kinds.includes("income") && !p.kinds.includes("reimbursement") && type !== "expense") continue;
      if (p.minAmount != null && t.amount < p.minAmount) continue;
      if (p.maxAmount != null && t.amount > p.maxAmount) continue;
      if (!inRange(t.date, p)) continue;
      if (p.paymentMethod && (t.paymentMethod ?? "") !== p.paymentMethod) continue;
      if (p.tag && !(t.tags ?? []).some((x) => x.toLowerCase().includes(p.tag!))) continue;
      if (p.status === "pending" && t.reimbursementStatus !== "pending") continue;
      if (!matchesText(p, t.title, t.merchant, t.category, t.description, ...(t.tags ?? []))) continue;
      hits.push({ kind: "transaction", id: t.id, title: t.title || t.merchant || "Transaction", detail: `${t.category ?? type} · ${t.date}`, amount: t.amount, date: t.date, to: "/expenses" });
    }
  }
  if (want("account")) {
    for (const a of d.accounts) {
      if (a.archived) continue;
      if (!matchesText(p, a.name, a.kind, a.issuer)) continue;
      hits.push({ kind: "account", id: a.id, title: a.name, detail: a.kind.replace(/_/g, " "), amount: null, date: null, to: "/wealth" });
    }
  }
  if (want("commitment")) {
    for (const c of d.commitments) {
      if (c.status === "cancelled") continue;
      if (p.status === "overdue" && !(c.nextDue < today && c.status === "active")) continue;
      if (p.status === "pending" && c.direction !== "out") continue;
      if (!inRange(c.nextDue, p) && (p.dateFrom || p.dateTo)) continue;
      if (p.minAmount != null && c.amount < p.minAmount) continue;
      if (!matchesText(p, c.name, c.category, c.kind)) continue;
      hits.push({ kind: "commitment", id: c.id, title: c.name, detail: `${c.kind.replace(/_/g, " ")} · due ${c.nextDue}`, amount: c.amount, date: c.nextDue, to: "/plan" });
    }
  }
  if (want("loan")) {
    for (const l of d.loans) {
      if (!matchesText(p, l.name, l.provider)) continue;
      hits.push({ kind: "loan", id: l.id, title: l.name, detail: `${l.provider} · EMI ₹${Math.round(l.emi).toLocaleString("en-IN")}`, amount: l.principal, date: null, to: "/wealth" });
    }
  }
  if (want("document")) {
    for (const doc of d.documents) {
      if (p.minAmount != null && (doc.amount == null || doc.amount < p.minAmount)) continue;
      if (!inRange(doc.docDate, p)) continue;
      if (!matchesText(p, doc.title, doc.docType, doc.merchant, doc.fileName, doc.text?.slice(0, 4000))) continue;
      hits.push({ kind: "document", id: doc.id, title: doc.title, detail: `${doc.docType.replace(/_/g, " ")}${doc.docDate ? ` · ${doc.docDate}` : ""}`, amount: doc.amount, date: doc.docDate, to: "/vault" });
    }
  }
  if (want("goal")) {
    for (const g of d.goals) {
      if (!matchesText(p, g.name)) continue;
      hits.push({ kind: "goal", id: g.id, title: g.name, detail: `Saved ₹${Math.round(g.saved).toLocaleString("en-IN")} of ₹${Math.round(g.target).toLocaleString("en-IN")}`, amount: g.target, date: null, to: "/wealth" });
    }
  }
  return hits.slice(0, 100);
}
