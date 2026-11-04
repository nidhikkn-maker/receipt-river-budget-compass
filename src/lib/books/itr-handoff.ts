/**
 * Accountant-ready income-tax handoff [v6 §46]: pure rules that turn the saved tax working into
 * schedules, a source list and a "still needed" checklist. Nothing here files a return or invents a figure.
 */
import type { VaultDoc } from "../documents";
import { csvCell } from "../csv-safe";
import type { TaxComputation } from "./taxcomp";
import type { FyRecord, RuleVersion, TaxCredit } from "./types";

export type HandoffStatus = "prepared" | "sent" | "questions" | "filed";
export const HANDOFF_STATUS_LABEL: Record<HandoffStatus, string> = { prepared: "Prepared", sent: "Sent to accountant", questions: "Accountant has questions", filed: "Filed" };
export interface HandoffRecord { id: string; entityId: string; fy: string; version: number; createdAt: string; docId: string; status: HandoffStatus; ack?: string | undefined; note?: string | undefined; totalIncome: number; open: number }

export interface HandoffGap { key: string; kind: "document" | "figure" | "decision"; need: string; why: string }

const inFy = (d: string | null | undefined, fy: string) => { if (!d) return false; const s = Number(fy.slice(0, 4)); return d >= `${s}-04-01` && d <= `${s + 1}-03-31`; };
const docText = (d: VaultDoc) => `${d.title} ${d.fileName} ${d.text ?? ""}`.toLowerCase();

/**
 * What the accountant still needs, each with the reason. Only things the records cannot supply are listed;
 * a matching document already in DocuRepo for the year removes the item.
 */
export function handoffGaps(p: {
  fy: string; c: TaxComputation; personal: boolean; regime: "new" | "old" | undefined; profileConfirmed: boolean;
  salaryEvidence: boolean; credits: TaxCredit[]; unrecordedTaxDebits: number; docs: VaultDoc[]; records: FyRecord[];
  gainsMissingCost: number; rules: RuleVersion[]; entityName: string; companyKind: boolean;
}): HandoffGap[] {
  const out: HandoffGap[] = [];
  const year = p.docs.filter((d) => inFy(d.docDate ?? d.createdAt.slice(0, 10), p.fy) || inFy(d.docDate, `${Number(p.fy.slice(0, 4)) + 1}-${String((Number(p.fy.slice(0, 4)) + 2) % 100).padStart(2, "0")}`));
  const has = (re: RegExp, types?: string[]) => year.some((d) => (!types || types.includes(d.docType)) && re.test(docText(d)));
  if (!p.profileConfirmed) out.push({ key: "profile", kind: "decision", need: `Confirm ${p.entityName}'s tax profile`, why: "The regime / tax-rate option decides the slabs and the return form." });
  if (p.personal && (p.c.salary > 0 || !p.salaryEvidence) && !p.salaryEvidence && !has(/form\s?16|payslip|salary/i))
    out.push({ key: "form16", kind: "document", need: "Form 16 (and payslips if you changed jobs)", why: p.c.salary > 0 ? "Salary is only estimated from bank credits; Form 16 gives the taxable salary, exemptions and TDS." : "Confirms whether there was any salary income and TDS on it." });
  if (!has(/26as|annual information|\bais\b|\btis\b/i, ["tax_statement", "tax_return", "other"]))
    out.push({ key: "26as", kind: "document", need: "Form 26AS and AIS/TIS for the year", why: "Every TDS/TCS credit and reported income must agree with the department's statement before filing." });
  if (p.c.houseProperty.homeLoanInterest > 0 && !has(/interest certificate|provisional certificate/i))
    out.push({ key: "hl-cert", kind: "document", need: "Home-loan interest certificate from the lender", why: `Interest of ₹${Math.round(p.c.houseProperty.homeLoanInterest).toLocaleString("en-IN")} is taken from ledger entries; the certificate splits principal and interest officially.` });
  if (p.c.houseProperty.rent > 0) {
    if (!has(/rent|lease/i, ["lease_agreement", "contract", "receipt", "other"])) out.push({ key: "rent", kind: "document", need: "Rent agreement and rent receipts", why: "Rental income is read from bank credits; the agreement confirms tenant, period and any deposit." });
    if (!has(/property tax|municipal/i)) out.push({ key: "ptax", kind: "document", need: "Municipal / property-tax receipts paid in the year", why: "Property tax paid is deductible from rent and is not in the records yet." });
  }
  if (p.c.capitalGains.short !== 0 || p.c.capitalGains.long !== 0 || p.gainsMissingCost > 0) {
    if (!year.some((d) => d.docType === "capital_gains_statement")) out.push({ key: "cg", kind: "document", need: "Capital-gains statement from the broker / fund house", why: "Gives sale-wise cost, dates and grandfathered values needed for the capital-gains schedule." });
    if (p.gainsMissingCost > 0) out.push({ key: "cg-cost", kind: "figure", need: `Purchase cost and date for ${p.gainsMissingCost} sale${p.gainsMissingCost > 1 ? "s" : ""}`, why: "Without them the gain and short/long-term split cannot be worked out — they are left out, not guessed." });
  }
  if (p.c.otherSources > 0 && !has(/interest certificate|interest statement|dividend/i)) out.push({ key: "int", kind: "document", need: "Bank/FD interest certificates and dividend statements", why: "Interest in the ledger may miss accrued FD interest and TDS on it." });
  if (p.personal && p.regime !== "new") out.push({ key: "ded", kind: "document", need: "Deduction proofs (80C, 80D, 80G, 24(b), HRA etc.)", why: "Under the old regime these reduce taxable income; none are added automatically." });
  if (p.personal && !p.regime) out.push({ key: "regime", kind: "decision", need: "Old or new tax regime", why: "Decides whether deductions apply and which slabs are used." });
  if (p.unrecordedTaxDebits > 0) out.push({ key: "challan", kind: "figure", need: `${p.unrecordedTaxDebits} tax payment${p.unrecordedTaxDebits > 1 ? "s" : ""} seen in the bank not yet counted`, why: "Mark each as advance or self-assessment tax (with the challan) so it is credited." });
  const lossesUsed = p.c.lossesSetOff > 0 || p.records.some((r) => r.lossesCarriedForward.length);
  const prevFy = `${Number(p.fy.slice(0, 4)) - 1}-${p.fy.slice(2, 4)}`;
  if (lossesUsed && !p.records.some((r) => r.fy === prevFy && r.filedReturns.length)) out.push({ key: "prev-itr", kind: "document", need: `Last year's (FY ${prevFy}) filed return acknowledgement`, why: "Losses can be carried forward only if the earlier return was filed on time." });
  if (!p.personal && p.c.business.receipts > 0 && !p.records.some((r) => r.fy === p.fy)) out.push({ key: "audited", kind: "document", need: "Audited financial statements and tax audit report (if applicable)", why: "The business head here is a ledger working; the return uses audited figures." });
  if (p.c.business.depreciation > 0) out.push({ key: "dep", kind: "decision", need: "Confirm the tax depreciation schedule", why: "Block rates and put-to-use dates should be checked against the asset invoices." });
  if (p.companyKind) out.push({ key: "rate", kind: "decision", need: "Tax-rate option (e.g. section 115BAA / 115BAB / normal)", why: "No tax figure is calculated until the option is chosen." });
  const proposed = p.rules.filter((r) => r.status === "proposed").length;
  if (proposed) out.push({ key: "rules", kind: "decision", need: `${proposed} rule change${proposed > 1 ? "s" : ""} waiting for approval`, why: "Figures use only approved rules; pending changes may affect them." });
  return out;
}

/** Spreadsheet text (formula-safe) from rows. */
export const toCsv = (rows: (string | number | null | undefined)[][]) => rows.map((r) => r.map((v) => csvCell(v ?? "")).join(",")).join("\r\n");

/** Head-of-income schedule rows used in both the PDF and the spreadsheet. */
export function computationRows(c: TaxComputation): [string, number][] {
  return [
    ["Salary", c.salary],
    ["House property — rent received", c.houseProperty.rent], ["House property — standard deduction (30%)", -c.houseProperty.standardDeduction], ["House property — home-loan interest", -c.houseProperty.homeLoanInterest], ["House property — net", c.houseProperty.net],
    ["Business — receipts", c.business.receipts], ["Business — expenses", -c.business.expenses], ["Business — tax depreciation", -c.business.depreciation], ["Business — net", c.business.net],
    ["Short-term capital gains", c.capitalGains.short], ["Long-term capital gains", c.capitalGains.long], ["Other sources", c.otherSources],
    ["Gross total income", c.gross], ["Losses brought forward set off", -c.lossesSetOff], ["Total income", c.total],
  ];
}
