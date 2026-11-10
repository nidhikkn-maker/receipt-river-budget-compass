// P0-026: a "saved to add later" receipt (documents row, notes "pending-receipt", not linked) is never deleted by a
// tap. The only removal is the post-save cleanup in New entry: once its bytes were uploaded again with the saved
// entry, the staging copy is cleared. With the proposed P9 SQL the database verifies that copy
// (discard_used_pending_document: same file name and size stored with one of the owner's entries) and refuses every
// other delete; before P9 the same narrow rule is checked here and the row is removed as before.
import { supabase } from "@/integrations/supabase/client";
import { errorMessage, isMissingFunction } from "./step-up";
import { rpcUntyped } from "./step-up-check";

export const PENDING_RECEIPT = "pending-receipt";

export interface StagingDoc { id: string; notes: string; transactionId: string | null; evidenceLocked?: boolean | undefined }

/** Clears the staging row of a pending receipt that was used for a saved entry. Throws (row kept) on any refusal. */
export async function discardUsedPendingDocument(d: StagingDoc): Promise<void> {
  if (d.notes !== PENDING_RECEIPT || d.transactionId || d.evidenceLocked) throw new Error("Only a receipt saved to add later is cleared after it is used. Archive other documents instead.");
  const r = await rpcUntyped("discard_used_pending_document", { p_document: d.id });
  if (!r.error) return;
  if (!isMissingFunction(r.error)) throw new Error(/P9_NOT_COPIED/.test(errorMessage(r.error)) ? "This receipt isn't saved with an entry yet, so it is kept." : "Couldn't clear the saved receipt. It is kept; nothing was lost.");
  const del = await supabase.from("documents").delete().eq("id", d.id).eq("notes", PENDING_RECEIPT).is("transaction_id", null).select("id");
  if (del.error) throw new Error(/audit evidence/i.test(del.error.message) ? "This original is kept as audit evidence. Unlock it first." : del.error.message);
  // Nothing removed (already linked, changed or gone): the caller must not remove the file.
  if (!del.data?.length) throw new Error("That saved receipt changed, so it is kept.");
}
