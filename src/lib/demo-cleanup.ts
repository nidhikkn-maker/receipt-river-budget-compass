// Decides what the hourly demo cleanup may do for one expired demo owner. Fails closed: records are removed only
// when the identity lookup positively confirms a still-anonymous guest (V4 FND-05: no silent deletion).
// "identity-missing" is only the auth API's explicit answer that the user does not exist (404 user_not_found), never
// a lookup error: the route then finishes a half-done cleanup (identity deleted, demo_sessions row left) only when
// demoGuestRecordsGone confirms every guest record is already gone, and never deletes records itself.
export type DemoCleanupDecision = "remove-guest-records" | "keep-upgraded-account" | "identity-missing" | "skip-unconfirmed";
export function isConfirmedMissingIdentity(error: unknown): boolean {
  const e = error as { status?: unknown; code?: unknown } | null | undefined;
  return e?.status === 404 && e?.code === "user_not_found";
}
export function demoCleanupDecision(lookup: { user?: { is_anonymous?: boolean | null } | null; error?: unknown } | null | undefined): DemoCleanupDecision {
  if (!lookup) return "skip-unconfirmed";
  if (lookup.error) return isConfirmedMissingIdentity(lookup.error) && !lookup.user ? "identity-missing" : "skip-unconfirmed";
  if (!lookup.user) return "skip-unconfirmed";
  if (lookup.user.is_anonymous === true) return "remove-guest-records";
  return "keep-upgraded-account";
}

/**
 * Owner-scoped record removal for one confirmed anonymous demo guest, in order. A required step that fails stops the
 * cleanup (the guest identity is then kept and retried next hour). claim_receipt_corrections (proposed P20) and
 * asset_disposal_requests (proposed P14) are audit history that deliberately survives the rows it describes, so the
 * guest's rows are removed explicitly here; the P20 / P14 guards allow this delete only for the service role and only
 * for an anonymous demo guest. Before P20 / P14 is installed the table does not exist: only that "relation does not
 * exist" answer (Postgres 42P01 / PostgREST PGRST205) is skipped. Any other error on such a step stops the cleanup
 * before the identity is deleted, so audit rows are never orphaned.
 */
export const DEMO_GUEST_STEPS = [
  { table: "expenses", column: "employee_id", required: true },
  { table: "accounts", column: "owner_id", required: true },
  { table: "claim_receipt_corrections", column: "owner_id", required: "unless-missing" },
  { table: "asset_disposal_requests", column: "owner_id", required: "unless-missing" },
  { table: "finance_preferences", column: "owner_id", required: false },
] as const;

/** True only for "this table does not exist" (Postgres 42P01, PostgREST PGRST205 schema-cache miss). */
export function isMissingRelation(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "42P01" || code === "PGRST205";
}
const describeError = (error: unknown) => {
  const e = error as { code?: unknown; message?: unknown } | null;
  return [typeof e?.code === "string" ? e.code : "", typeof e?.message === "string" ? e.message : String(error)].filter(Boolean).join(": ");
};

export type DemoGuestCleanup = { ok: true } | { ok: false; table: string; error: string };
type DeleteBuilder = { delete: () => { eq: (column: string, value: string) => PromiseLike<{ error: unknown }> } };
/** Removes the guest's records; `ok: false` names the step that stopped it (the caller must then keep the identity). */
export async function removeDemoGuestRecords(from: (table: string) => DeleteBuilder, owner: string): Promise<DemoGuestCleanup> {
  for (const step of DEMO_GUEST_STEPS) {
    const { error } = await from(step.table).delete().eq(step.column, owner);
    if (!error || step.required === false) continue;
    if (step.required === "unless-missing" && isMissingRelation(error)) continue;
    return { ok: false, table: step.table, error: describeError(error) };
  }
  return { ok: true };
}

type CountBuilder = { select: (column: string, opts: { count: "exact"; head: true }) => { eq: (column: string, value: string) => PromiseLike<{ count: number | null; error: unknown }> } };
/**
 * True only when an exact count of every DEMO_GUEST_STEPS table reads 0 rows for the owner (a missing audit table,
 * 42P01/PGRST205 before P20 / P14, counts as none). Any error, or a count that is not exactly 0, is doubt: false.
 */
export async function demoGuestRecordsGone(from: (table: string) => CountBuilder, owner: string): Promise<boolean> {
  for (const step of DEMO_GUEST_STEPS) {
    const { count, error } = await from(step.table).select(step.column, { count: "exact", head: true }).eq(step.column, owner);
    if (error) {
      if (step.required === "unless-missing" && isMissingRelation(error)) continue;
      return false;
    }
    if (count !== 0) return false;
  }
  return true;
}
