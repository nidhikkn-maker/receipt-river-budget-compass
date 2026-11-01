// Expense Claim Submission Report: a formal reimbursement request to an organisation.
// Separate from the expenditure statements and from the existing Reimbursements export;
// it only reads records and never creates claims or changes claim status.
import type { Statement, Annexure, RegisterRow } from "./expenditure-statement";

export interface Claimant { name: string; employeeId: string; department: string; designation: string; approver: string; bankDetails: string; email: string; declaration?: string; reportingAuthority?: string; finance?: string; additionalApprover?: string; approvalDesignation?: string; organisationCode?: string; costCentre?: string; preferredCurrency?: string; legalEntity?:string;approvalReference?:string;signaturePreference?:string;reportHeader?:string }
export interface ClaimItem extends RegisterRow { claimNo: number; claimed: number }
export interface Claim {
  reference: string; organisation: string; purpose: string; subjectName: string; start: string; end: string; prepared: string; claimant: Claimant;
  items: ClaimItem[]; annexures: Annexure[]; totals: { eligible: number; received: number; claimed: number }; excluded: { row: RegisterRow; reason: string }[];
}
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Claims only personally-funded, eligible, not-rejected amounts still outstanding. Company-paid and unclaimed items are listed as excluded with a reason. */
export function buildClaim(s: Statement, claimant: Claimant): Claim {
  const items: ClaimItem[] = []; const excluded: Claim["excluded"] = [];
  for (const r of s.rows) {
    const reason = r.refund ? "Refund" : r.payerKind === "organisation" ? "Paid directly by the organisation" : r.payerKind === "other" ? `Paid by ${r.payer}` : r.status === 'Organisation requires review' || r.status === 'Other organisation' ? r.status : r.rejected > 0 ? "Rejected / not eligible" : r.eligible <= 0 ? "Not marked for reimbursement" : r.outstanding <= 0 ? "Already fully reimbursed" : null;
    if (reason) { excluded.push({ row: r, reason }); continue; }
    items.push({ ...r, claimNo: items.length + 1, claimed: r.outstanding });
  }
  const annexures: Annexure[] = [];
  for (const it of items) for (const a of s.annexures.filter((x) => x.row === it.sno)) annexures.push({ ...a, no: `C-${String(annexures.length + 1).padStart(2, "0")}`, row: it.claimNo });
  const billRef = (n: number) => annexures.filter((a) => a.row === n).map((a) => a.no).join(", ") || "Bill Not Attached";
  for (const it of items) it.billRef = billRef(it.claimNo);
  const sum = (f: (i: ClaimItem) => number) => r2(items.reduce((a, i) => a + f(i), 0));
  return {
    reference: s.reference.replace("LL-DES-", "LL-CLM-"), organisation: s.organisation, purpose: s.purpose, subjectName: s.subjectName, start: s.start, end: s.end, prepared: s.prepared, claimant: { ...claimant },
    items, annexures, excluded, totals: { eligible: sum((i) => i.eligible), received: sum((i) => i.reimbursed), claimed: sum((i) => i.claimed) },
  };
}
