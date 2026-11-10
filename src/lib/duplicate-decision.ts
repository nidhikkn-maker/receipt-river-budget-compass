// Duplicate decisions for a new entry (pure, tested).
// A possible duplicate the owner says is a separate bill is released only with a written reason, kept with the
// saved entry as audit evidence (reason, matched entries, when, and who — stamped by the server). A confirmed
// duplicate stays protected from posting: the same receipt file already on another entry, this draft's own id
// already saved, or a same-bill match the owner says IS the same bill.
import type { Expense } from "./expenses";

export const SEPARATE_REASON_MIN = 4;
export const SEPARATE_REASON_MAX = 300;

export type DuplicateCheck = "same_bill" | "matching_entry";
export interface DuplicateReview {
  decision: "separate";
  check: DuplicateCheck;
  reason: string;
  matchedIds: string[];
  decidedAt: string;
  /** The owner who decided; set by the server from the signed-in account, never trusted from the browser. */
  decidedBy?: string | undefined;
}

/** Why a "separate bill" reason can't be accepted yet, or null when it can. */
export function separateReasonError(reason: string): string | null {
  const r = reason.trim();
  if (r.length < SEPARATE_REASON_MIN) return "Say why this is a separate bill (for example “second round of coffee, new bill number”).";
  if (r.length > SEPARATE_REASON_MAX) return `Keep the reason under ${SEPARATE_REASON_MAX} characters.`;
  return null;
}

/** The audit record for a "separate bill" decision. Throws when there is no usable reason. */
export function separateDecision(check: DuplicateCheck, reason: string, matchedIds: string[], at: string): DuplicateReview {
  const error = separateReasonError(reason);
  if (error) throw new Error(error);
  return { decision: "separate", check, reason: reason.trim(), matchedIds: [...new Set(matchedIds)].slice(0, 20), decidedAt: at };
}

export type PostingBlock =
  | { kind: "draft_saved"; ids: string[]; message: string }
  | { kind: "same_receipt"; ids: string[]; message: string }
  | { kind: "same_bill"; ids: string[]; message: string };

/**
 * Confirmed duplicates that can never be posted as a new entry. Edits of an existing entry are never blocked here.
 * `sameBillIds` are matches the owner confirmed are the same bill.
 */
export function postingBlock(input: { draftId: string | null; editingId: string | null; fingerprint: string | null | undefined; sameBillIds: string[]; entries: Pick<Expense, "id" | "receiptDetails">[] }): PostingBlock | null {
  if (input.editingId) return null;
  if (input.draftId && input.entries.some((e) => e.id === input.draftId)) {
    return { kind: "draft_saved", ids: [input.draftId], message: "This entry is already saved. Open it from Activity instead of saving it again." };
  }
  const reuse = input.fingerprint ? input.entries.filter((e) => e.id !== input.draftId && e.receiptDetails?.fingerprint === input.fingerprint).map((e) => e.id) : [];
  if (reuse.length) return { kind: "same_receipt", ids: reuse, message: "This receipt file is already attached to another entry, so it can't be posted again. Open the existing entry, or remove this receipt." };
  if (input.sameBillIds.length) return { kind: "same_bill", ids: input.sameBillIds, message: "You said this is the same bill as one already saved, so it won't be posted again. Skip it or open the existing entry." };
  return null;
}

/** Server rule: the same receipt file (by content fingerprint) can't be attached to a second entry. */
export function receiptReuseError(fingerprint: string | null | undefined, existingIds: string[], selfIds: (string | null | undefined)[]): string | null {
  if (!fingerprint) return null;
  const others = existingIds.filter((id) => !selfIds.includes(id));
  return others.length ? "This receipt is already attached to another entry. Open that entry instead of saving it again." : null;
}

/** Server rule: who decided each duplicate resolution comes from the signed-in account, whatever the browser sent. */
export function stampDuplicateReview<T extends { duplicateReview?: DuplicateReview[] | undefined }>(details: T, userId: string): T {
  if (!details.duplicateReview?.length) return details;
  return { ...details, duplicateReview: details.duplicateReview.map((d) => ({ ...d, decidedBy: userId })) };
}
