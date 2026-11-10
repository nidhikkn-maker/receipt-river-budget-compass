// Retention classification of every collection stored in owner settings (finance_preferences.data).
// KK decision (9 Nov 2026): size limits are allowed only for genuinely disposable interface data. Financial,
// security, statutory and audit evidence — including dismissed financial reminders, cooling-off records, travel
// approvals/messages, financial commitments, reimbursement evidence and audit marks — is never silently deleted.
//
// "cap" applies only to class "ui". Everything else has cap null: it is never truncated on load or write, unreadable
// entries stay in storage (preserve-records.ts) and are listed for owner review.

export type RetentionClass = "ui" | "financial" | "audit" | "statutory" | "security" | "evidence" | "settings";
export interface Retention { class: RetentionClass; cap: number | null; why: string }

const keep = (cls: Exclude<RetentionClass, "ui">, why: string): Retention => ({ class: cls, cap: null, why });
const ui = (cap: number, why: string): Retention => ({ class: "ui", cap, why });

/** Top-level collections (arrays or keyed maps) in owner settings. */
export const PREFERENCE_RETENTION: Record<string, Retention> = {
  // Financial records and evidence
  assets: keep("financial", "Asset register"),
  entities: keep("financial", "Legal entities (companies, trusts, HUFs, individuals)"),
  receivables: keep("financial", "Money owed to the owner"),
  payees: keep("financial", "Counterparties referenced by ledger entries (payee_id)"),
  trips: keep("financial", "Trips, budgets, advances and settlements"),
  statementUploads: keep("evidence", "Statement upload history: posted/reconciled ids and undo evidence"),
  statementBatches: keep("evidence", "Statement batch to entry links"),
  contractObligations: keep("financial", "Financial commitments extracted from contracts"),
  allocationPlans: keep("financial", "Allocation plans the owner saved"),
  coolingOff: keep("financial", "Cooling-off purchase decisions (KK: must not be silently deleted)"),
  decisions: keep("audit", "Decision memory: what was decided and why"),
  milestones: keep("financial", "Goals and their progress history"),
  irregularConfirmed: keep("financial", "Confirmed irregular bills"),
  irregularRejected: keep("audit", "Rejected irregular-bill suggestions (decision record)"),
  paymentInstruments: keep("financial", "Saved payment methods linked to accounts"),
  splitTemplates: keep("financial", "Saved split rules"),
  budgets: keep("financial", "Scoped budgets"),
  categories: keep("settings", "Category catalogue referenced by ledger entries"),
  tags: keep("settings", "Grouped tags referenced by ledger entries"),
  rules: keep("settings", "Automation rules"),
  shopRules: keep("settings", "Per-shop classification rules (affect financial treatment)"),
  shopAliases: keep("settings", "Shop name aliases (affect financial treatment)"),
  merchantAliases: keep("settings", "Merchant grouping aliases"),
  merchantGroupingHistory: keep("audit", "Reversible merchant grouping history"),
  reimbursementSettings: keep("evidence", "Reimbursement profiles, mappings and responsibilities (KK: reimbursement evidence)"),
  travelMessages: keep("evidence", "Forwarded travel messages and approvals (KK: travel approvals)"),
  briefs: keep("audit", "Saved weekly financial briefs (dated snapshots)"),
  autopilotActions: keep("audit", "Record of automatic actions taken"),
  checkedAudit: keep("audit", "Audit items the owner marked as checked"),
  inboxDismissed: keep("audit", "Dismissed financial reminders (KK: must not be silently deleted)"),
  ruleDismissed: keep("statutory", "Dismissed regulatory rule changes"),
  depreciationDismissed: keep("audit", "Dismissed depreciation months"),
  mapLinks: keep("financial", "Owner-made links between financial records"),
  preservedRecords: keep("audit", "Stored originals kept after display tidying"),
  recordArchive: keep("audit", "Archive status and history of table records (loans, goals, scheduled payments, valuations, documents)"),
  statementBalances: keep("evidence", "Statement balances entered by the owner"),
  // Genuinely disposable interface data (bounded)
  mapPositions: ui(800, "Money Map card positions on screen"),
  favouriteEntries: ui(30, "Quick-access favourites"),
  savedViews: ui(20, "Saved list filters"),
  homeOrder: ui(32, "Home section order"),
  homeHidden: ui(32, "Hidden Home sections"),
  homeShortcuts: ui(32, "Home shortcut order"),
};

/** Collections inside owner settings.books: all are financial/statutory/audit records; none is capped. */
export const BOOKS_RETENTION_CLASS: RetentionClass = "financial";

export const capFor = (key: string): number | null => PREFERENCE_RETENTION[key]?.cap ?? null;
/** Apply the retention rule for one top-level list: only UI data may be capped (keeps the most recent). */
export function retainList<T>(key: string, list: T[]): T[] {
  const cap = capFor(key);
  return cap === null ? list : list.slice(-cap);
}
