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
 * table does not exist and that optional step's error is ignored.
 */
export const DEMO_GUEST_STEPS = [
  { table: "expenses", column: "employee_id", required: true },
  { table: "accounts", column: "owner_id", required: true },
  { table: "claim_receipt_corrections", column: "owner_id", required: false },
  { table: "finance_preferences", column: "owner_id", required: false },
] as const;

type DeleteBuilder = { delete: () => { eq: (column: string, value: string) => PromiseLike<{ error: unknown }> } };
export async function removeDemoGuestRecords(from: (table: string) => DeleteBuilder, owner: string): Promise<boolean> {
  for (const step of DEMO_GUEST_STEPS) {
    const { error } = await from(step.table).delete().eq(step.column, owner);
    if (error && step.required) return false;
  }
  return true;
}
