// Decides what the hourly demo cleanup may do for one expired demo owner. Fails closed: records are removed only
// when the identity lookup positively confirms a still-anonymous guest (V4 FND-05: no silent deletion).
export type DemoCleanupDecision = "remove-guest-records" | "keep-upgraded-account" | "skip-unconfirmed";
export function demoCleanupDecision(lookup: { user?: { is_anonymous?: boolean | null } | null; error?: unknown } | null | undefined): DemoCleanupDecision {
  if (!lookup || lookup.error || !lookup.user) return "skip-unconfirmed";
  if (lookup.user.is_anonymous === true) return "remove-guest-records";
  return "keep-upgraded-account";
}
