// Contract & obligation intelligence: obligations read from a stored document, always reviewed
// before anything is saved. Pure, tested. An obligation only becomes a planned payment when the
// user explicitly adds it; each one stays linked to its source document.

import { addDays, type Commitment, type CommitmentKind } from "./planning";
import type { DocType } from "./documents";

export const OBLIGATION_FREQUENCIES = ["once", "monthly", "quarterly", "half_yearly", "yearly"] as const;
export type ObligationFrequency = (typeof OBLIGATION_FREQUENCIES)[number];

export interface ContractObligation {
  id: string;
  docId: string;
  label: string;
  amount: number | null;
  frequency: ObligationFrequency;
  dueDate: string | null;
  /** Days of notice needed to cancel / not renew. */
  noticeDays: number | null;
  /** Short quote from the document that supports this obligation. */
  evidence: string;
  status: "review" | "added" | "ignored";
  decidedAt: string | null;
}

const isDate = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Clean AI output into reviewable obligations; drops empty rows and caps the list. */
export function toObligations(docId: string, raw: { label: string; amount: number | null; frequency: string; dueDate: string | null; noticeDays: number | null; evidence: string }[], newId: () => string): ContractObligation[] {
  return raw
    .filter((r) => r.label?.trim())
    .slice(0, 12)
    .map((r) => ({
      id: newId(), docId, label: r.label.trim().slice(0, 120),
      amount: r.amount != null && r.amount > 0 && r.amount < 1e9 ? Math.round(r.amount * 100) / 100 : null,
      frequency: (OBLIGATION_FREQUENCIES as readonly string[]).includes(r.frequency) ? (r.frequency as ObligationFrequency) : "once",
      dueDate: isDate(r.dueDate) ? r.dueDate : null,
      noticeDays: r.noticeDays != null && r.noticeDays >= 0 && r.noticeDays <= 365 ? Math.round(r.noticeDays) : null,
      evidence: (r.evidence ?? "").slice(0, 300),
      status: "review", decidedAt: null,
    }));
}

/** Last day to give notice before the due/renewal date, if the contract needs notice. */
export function cancelBy(o: Pick<ContractObligation, "dueDate" | "noticeDays">): string | null {
  return o.dueDate && o.noticeDays ? addDays(o.dueDate, -o.noticeDays) : null;
}

const KIND: Partial<Record<DocType, CommitmentKind>> = { insurance: "insurance", loan_agreement: "emi", bill: "bill", invoice: "bill" };

/** Turn a reviewed obligation into a planned payment. Throws when details are missing. */
export function obligationToCommitment(o: ContractObligation, docTitle: string, docType: DocType, accountId: string | null): Omit<Commitment, "id"> {
  if (!(o.amount && o.amount > 0)) throw new Error("Enter the amount before adding it to your plan");
  if (!isDate(o.dueDate)) throw new Error("Enter the next due date before adding it to your plan");
  return {
    name: `${o.label} (${docTitle})`.slice(0, 120), kind: KIND[docType] ?? "bill", direction: "out", amount: o.amount,
    frequency: o.frequency, intervalDays: null, nextDue: o.dueDate, accountId, category: docType === "insurance" ? "Insurance" : "Bills & utilities",
    confirmed: true, essential: true, status: "active",
  };
}

/** Upcoming notice deadlines within `days`, soonest first. */
export function noticeDeadlines(list: ContractObligation[], today: string, days = 45) {
  const end = addDays(today, days);
  return list
    .filter((o) => o.status !== "ignored")
    .map((o) => ({ o, by: cancelBy(o) }))
    .filter((x): x is { o: ContractObligation; by: string } => !!x.by && x.by >= today && x.by <= end)
    .sort((a, b) => a.by.localeCompare(b.by));
}
