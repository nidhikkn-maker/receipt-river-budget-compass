// Decides what the hourly demo cleanup may do for one expired demo owner. Fails closed: records are removed only
// when the identity lookup positively confirms a still-anonymous guest (V4 FND-05: no silent deletion).
export type DemoCleanupDecision = "remove-guest-records" | "keep-upgraded-account" | "skip-unconfirmed";
export function demoCleanupDecision(lookup: { user?: { is_anonymous?: boolean | null } | null; error?: unknown } | null | undefined): DemoCleanupDecision {
  if (!lookup || lookup.error || !lookup.user) return "skip-unconfirmed";
  if (lookup.user.is_anonymous === true) return "remove-guest-records";
  return "keep-upgraded-account";
}

/**
 * Owner-scoped record removal for one confirmed anonymous demo guest, in order. A required step that fails stops the
 * cleanup (the guest identity is then kept and retried next hour). claim_receipt_corrections (proposed P20) is audit
 * history that deliberately survives its claim row, so the guest's corrections are removed explicitly here; the P20
 * guard allows this delete only for the service role and only for an anonymous demo guest. Before P20 is installed the
 * table does not exist: only that "relation does not exist" answer (Postgres 42P01 / PostgREST PGRST205) is skipped.
 * Any other error on that step stops the cleanup before the identity is deleted, so corrections are never orphaned.
 */
export const DEMO_GUEST_STEPS = [
  { table: "expenses", column: "employee_id", required: true },
  { table: "accounts", column: "owner_id", required: true },
  { table: "claim_receipt_corrections", column: "owner_id", required: "unless-missing" },
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
