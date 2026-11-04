// Document vault: receipts attached to entries plus stand-alone documents, searchable together (pure, tested).
export const DOC_TYPES = ["bill", "receipt", "invoice", "bank_statement", "card_statement", "insurance", "loan_agreement", "payment_confirmation", "warranty", "demat_statement", "transaction_statement", "capital_gains_statement",
  "mutual_fund_statement", "loan_statement", "incorporation", "pan_gst_registration", "audited_financials", "trial_balance", "tax_return", "gst_return",
  "contract", "property_deed", "lease_agreement", "asset_invoice", "depreciation_schedule", "utility_bill", "maintenance", "other"] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const DOC_LABEL: Record<DocType, string> = {
  bill: "Bill", receipt: "Receipt", invoice: "Invoice", bank_statement: "Bank statement", card_statement: "Credit card statement", insurance: "Insurance document",
  loan_agreement: "Loan agreement", payment_confirmation: "Payment confirmation", warranty: "Warranty",
  demat_statement: "Demat statement", transaction_statement: "Transaction statement", capital_gains_statement: "Capital gains statement",
  mutual_fund_statement: "Mutual fund statement", loan_statement: "Loan statement", incorporation: "Company incorporation document", pan_gst_registration: "PAN / GST registration",
  audited_financials: "Audited financial statements", trial_balance: "Trial balance", tax_return: "Tax return", gst_return: "GST return", contract: "Contract",
  property_deed: "Property deed", lease_agreement: "Lease agreement", asset_invoice: "Asset purchase invoice", depreciation_schedule: "Depreciation schedule",
  utility_bill: "Utility bill", maintenance: "Maintenance document", other: "Other financial or legal record",
};
/** One key detail read from a document, with where it came from so it can be checked. */
export interface DocField { label: string; value: string; page: number | null; quote: string; confidence: "high" | "medium" | "low"; status: "read" | "confirmed" | "corrected" }
export const MAX_DOC_BYTES = 10 * 1024 * 1024;

export interface VaultDoc {
  id: string; title: string; docType: DocType; filePath: string; fileName: string; mimeType: string; size: number;
  docDate: string | null; amount: number | null; currency: string; merchant: string | null; notes: string; text: string;
  transactionId: string | null; accountId: string | null; loanId: string | null; expiresOn: string | null; createdAt: string;
  fields?: DocField[]; replacesId?: string | null;
}
export interface VaultItem {
  key: string; source: "document" | "receipt"; docId: string | null; title: string; docType: DocType; path: string; fileName: string; mimeType: string;
  date: string | null; amount: number | null; currency: string; merchant: string | null; text: string;
  transactionId: string | null; accountId: string | null; loanId: string | null; expiresOn: string | null;
}
interface ReceiptTxn { id: string; title: string; merchant: string | null; date: string; originalAmount: number; currency: string; accountId?: string | null; description: string; receipts: { name: string; type: string; path: string }[]; receiptDetails?: { text?: string } }

/** All vault items: every receipt attached to an entry, then every uploaded document. */
export function vaultItems(docs: VaultDoc[], txns: ReceiptTxn[]): VaultItem[] {
  const receipts: VaultItem[] = txns.flatMap((e) => e.receipts.map((r) => ({
    key: `r:${r.path}`, source: "receipt" as const, docId: null, title: e.title, docType: "receipt" as const, path: r.path, fileName: r.name, mimeType: r.type,
    date: e.date, amount: e.originalAmount, currency: e.currency, merchant: e.merchant, text: `${e.description} ${e.receiptDetails?.text ?? ""}`,
    transactionId: e.id, accountId: e.accountId ?? null, loanId: null, expiresOn: null,
  })));
  const documents: VaultItem[] = currentVersions(docs).map((d) => ({
    key: `d:${d.id}`, source: "document", docId: d.id, title: d.title, docType: d.docType, path: d.filePath, fileName: d.fileName, mimeType: d.mimeType,
    date: d.docDate, amount: d.amount, currency: d.currency, merchant: d.merchant, text: `${d.notes} ${d.text} ${(d.fields ?? []).map((f) => `${f.label} ${f.value}`).join(" ")}`,
    transactionId: d.transactionId, accountId: d.accountId, loanId: d.loanId, expiresOn: d.expiresOn,
  }));
  return [...documents, ...receipts].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

export interface VaultFilter { q?: string; type?: DocType | "all"; from?: string; to?: string; min?: number | null; max?: number | null; linked?: "all" | "transaction" | "account" | "loan" | "none" }

/** Search by merchant, title, file name, text and amount; filter by type, date range, amount range and link. */
export function searchVault(items: VaultItem[], f: VaultFilter): VaultItem[] {
  const words = (f.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((x) => {
    if (f.type && f.type !== "all" && x.docType !== f.type) return false;
    if (f.from && (!x.date || x.date < f.from)) return false;
    if (f.to && (!x.date || x.date > f.to)) return false;
    if (f.min != null && (x.amount == null || x.amount < f.min)) return false;
    if (f.max != null && (x.amount == null || x.amount > f.max)) return false;
    if (f.linked === "transaction" && !x.transactionId) return false;
    if (f.linked === "account" && !x.accountId) return false;
    if (f.linked === "loan" && !x.loanId) return false;
    if (f.linked === "none" && (x.transactionId || x.accountId || x.loanId)) return false;
    const hay = `${x.title} ${x.merchant ?? ""} ${x.fileName} ${x.text} ${x.date ?? ""} ${x.amount ?? ""} ${DOC_LABEL[x.docType]}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Documents (warranties, insurance) whose expiry falls within `days` — or already passed within the last week. */
export function expiringDocuments(docs: VaultDoc[], today: string, days = 30) {
  const until = new Date(Date.parse(today) + days * 864e5).toISOString().slice(0, 10);
  const since = new Date(Date.parse(today) - 7 * 864e5).toISOString().slice(0, 10);
  return docs.filter((d) => d.expiresOn && d.expiresOn >= since && d.expiresOn <= until).sort((a, b) => a.expiresOn!.localeCompare(b.expiresOn!));
}

export function validateDocument(f: { title: string; size: number; docType: string; amount?: number | null }) {
  if (!f.title.trim()) throw new Error("Give the document a title");
  if (f.size > MAX_DOC_BYTES) throw new Error("Documents must be 10 MB or smaller");
  if (!(DOC_TYPES as readonly string[]).includes(f.docType)) throw new Error("Choose a document type");
  if (f.amount != null && !(f.amount >= 0)) throw new Error("Amount can't be negative");
}

/** Latest version of each document: a document replaced by a newer upload is kept but hidden from the main list. */
export function currentVersions(docs: VaultDoc[]): VaultDoc[] {
  const replaced = new Set(docs.map((d) => d.replacesId).filter(Boolean));
  return docs.filter((d) => !replaced.has(d.id));
}
/** Earlier versions of a document, newest first, following the replacement chain (cycle-safe). */
export function earlierVersions(docs: VaultDoc[], id: string): VaultDoc[] {
  const byId = new Map(docs.map((d) => [d.id, d])); const out: VaultDoc[] = []; const seen = new Set([id]);
  let cur = byId.get(id)?.replacesId;
  while (cur && !seen.has(cur) && byId.has(cur)) { seen.add(cur); out.push(byId.get(cur)!); cur = byId.get(cur)!.replacesId; }
  return out;
}
/** Possible duplicates: same file name and size, or same type, date, amount and issuer. Report only — the owner decides. */
export function duplicateDocuments(docs: VaultDoc[], c: { fileName: string; size: number; docType: DocType; docDate: string | null; amount: number | null; merchant: string | null }, ignoreId?: string | null): VaultDoc[] {
  const norm = (v: string | null) => (v ?? "").trim().toLowerCase();
  return docs.filter((d) => d.id !== ignoreId && (
    (d.fileName === c.fileName && d.size === c.size) ||
    (d.docType === c.docType && !!c.docDate && d.docDate === c.docDate && c.amount != null && d.amount === c.amount && !!norm(c.merchant) && norm(d.merchant) === norm(c.merchant))));
}
