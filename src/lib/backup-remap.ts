/**
 * Cross-account restore reference registry (Phase 2, R5).
 *
 * A cross-account restore gives every backed-up table row a new id. Anything that points at one of those rows —
 * a database column or a value inside JSON (owner preferences, entry/draft/holding JSON columns) — must follow it,
 * or it becomes an orphan. This file is the single list of those places. Each JSON id-like field in a backed-up
 * structure is either listed in a REFS registry (remapped), in a VERBATIM list (kept byte-for-byte on purpose), or
 * in NOT_REMAPPED_FIELDS (an owner-local JSON id, an external id or a user id that keeps its value). The
 * registry-completeness tests fail when a new id-like field is not classified.
 *
 * Rules for values that cannot be mapped (Phase 0: nothing silently deleted): the value is kept exactly as it was and
 * reported in the restore summary. Values found at paths no rule covers are also kept and reported as unclassified.
 */

/** Tables whose row ids are replaced on a cross-account restore. */
export const REMAP_TABLES = ["accounts", "expenses", "documents", "loans", "family_members", "commitments", "goals", "expense_drafts", "asset_valuations", "demat_accounts", "security_holdings"] as const;
export type RemapTable = (typeof REMAP_TABLES)[number];

/**
 * id: the value is a row id of `table`.
 * node-key: Money Map node key "<kind>:<id>" (account/card/member/loan/commitment/document; method ids are owner-local).
 * entries-activity: reimbursement mapping activity "entries:<id>,<id>" (sorted canonical list) or a plain activity name.
 * embedded: free-form key that may contain row ids (dismissal/audit keys); every known id inside is replaced.
 * id-or-label: either a row id of `table` or a free-text label (e.g. a trip traveller is a family member or a typed
 *   name). Labels are not references and are never reported; a uuid-shaped value that is not in the backup is.
 */
export type Encoding = "id" | "node-key" | "entries-activity" | "embedded" | "id-or-label";
export interface RefRule {
  /** Path from the JSON root: `a.b` object field, `[]` any array item, `{}` any map value, `{key}` the map keys themselves. */
  path: string;
  table?: RemapTable;
  encoding?: Encoding;
  /** Only applies when the containing object passes (e.g. person budgets, docLinks by kind). Sees the stored values. */
  when?: (parent: Record<string, unknown>) => boolean;
  /** Sentinel values that are not references (e.g. "me"). */
  ignore?: readonly string[];
  why: string;
}

const kindIs = (...kinds: string[]) => (p: Record<string, unknown>) => kinds.includes(String(p["kind"]));

/** finance_preferences.data — every place that holds an id of a remapped table. */
export const PREFERENCE_REFS: readonly RefRule[] = [
  { path: "budgets[].value", table: "family_members", when: kindIs("person"), ignore: ["me"], why: "Person budget → family member" },
  { path: "reimbursementSettings.profiles[].accountId", table: "accounts", why: "Claim receiving account" },
  { path: "reimbursementSettings.responsibilities[].entryId", table: "expenses", why: "Organisation responsibility for an entry" },
  { path: "reimbursementSettings.mappings[].activity", encoding: "entries-activity", why: "Claim profile mapped to a set of entries" },
  { path: "paymentInstruments[].accountId", table: "accounts", why: "Payment method's linked account" },
  { path: "paymentInstruments[].memberId", table: "family_members", why: "Family member who uses the method" },
  { path: "rules[].accountId", table: "accounts", why: "Monitoring rule scoped to an account" },
  { path: "shopRules{}.accountId", table: "accounts", why: "Per-shop default account" },
  { path: "freshness.perAccount{key}", table: "accounts", why: "Per-account freshness override" },
  { path: "statementBalances{key}", table: "accounts", why: "Statement balance entered per account" },
  { path: "statementBatches{key}", table: "accounts", why: "Legacy statement batch per account" },
  { path: "statementBatches{}[]", table: "expenses", why: "Legacy statement batch entry ids" },
  { path: "statementUploads[].posted[]", table: "expenses", why: "Entries posted by a statement upload (undo evidence)" },
  { path: "statementUploads[].reconciled[]", table: "expenses", why: "Entries reconciled by a statement upload" },
  { path: "statementUploads[].createdAccounts[].id", table: "accounts", why: "Accounts created by a statement upload" },
  { path: "statementUploads[].sources[].documentId", table: "documents", why: "Statement original" },
  { path: "statementUploads[].sources[].accountId", table: "accounts", why: "Statement account" },
  { path: "statementUploads[].linkedDrafts[].draftId", table: "expense_drafts", why: "Draft completed by the upload" },
  { path: "statementUploads[].linkedDrafts[].transactionId", table: "expenses", why: "Entry the draft became" },
  { path: "statementUploads[].evidence[].id", table: "expenses", why: "Entry carrying statement evidence" },
  { path: "statementUploads[].undoRows[].id", table: "expenses", why: "Revision-checked undo row" },
  { path: "assets[].accountId", table: "accounts", why: "Ledger asset account depreciation reduces" },
  { path: "assets[].transactionId", table: "expenses", why: "Purchase entry" },
  { path: "assets[].paymentId", table: "expenses", why: "Matched bank payment" },
  { path: "assets[].docId", table: "documents", why: "Invoice/deed" },
  { path: "assets[].docIds[]", table: "documents", why: "Supporting documents" },
  { path: "contractObligations[].docId", table: "documents", why: "Contract the obligation was read from" },
  { path: "trips[].bookings[].expenseId", table: "expenses", why: "Booking payment entry" },
  { path: "trips[].bookings[].expenseIds[]", table: "expenses", why: "Booking payment entries" },
  { path: "trips[].bookings[].documentIds[]", table: "documents", why: "Booking originals" },
  { path: "trips[].itinerary[].documentIds[]", table: "documents", why: "Itinerary originals" },
  { path: "trips[].travellerBudgets[].traveller", table: "family_members", encoding: "id-or-label", ignore: ["Me"], why: "Traveller budget: a family member id, \"Me\" or a typed traveller name" },
  { path: "savedViews[].filters.accountId", table: "accounts", ignore: ["all"], why: "Saved Transactions view filtered by account" },
  { path: "savedViews[].filters.memberId", table: "family_members", ignore: ["all", "me"], why: "Saved Transactions view filtered by family member" },
  { path: "merchantGroupingHistory[].entryIds[]", table: "expenses", why: "Entries bound to a grouping decision" },
  { path: "merchantGroupingHistory[].entrySnapshot[].id", table: "expenses", why: "Entry snapshot used for reversal" },
  // Archive status of table rows (records-archive.ts, P0-008/012/013/014): the row id and the "<table>:<id>" entry key follow the row.
  ...(["loans", "goals", "commitments", "asset_valuations", "documents"] as const).map((t): RefRule => ({ path: "recordArchive[].recordId", table: t, when: (x) => x["table"] === t, why: `Archive status of a ${t} row` })),
  { path: "recordArchive[].id", encoding: "embedded", why: "Archive entry key \"<table>:<row id>\"" },
  { path: "mapLinks[].from", encoding: "node-key", why: "Owner-drawn money-map link" },
  { path: "mapLinks[].to", encoding: "node-key", why: "Owner-drawn money-map link" },
  { path: "mapPositions{key}", encoding: "node-key", why: "Money-map card position" },
  { path: "favouriteEntries[]", table: "expenses", why: "Favourite entries" },
  { path: "emergency.accountIds[]", table: "accounts", why: "Accounts counted as the emergency fund" },
  { path: "briefs[].data.highlights.significant[].id", table: "expenses", why: "Entries highlighted in a saved weekly brief" },
  { path: "inboxDismissed[]", encoding: "embedded", why: "Dismissed reminder keys (e.g. stale:<account>, dup:<a>:<b>)" },
  { path: "checkedAudit[]", encoding: "embedded", why: "Records-check findings marked as checked" },
  { path: "autopilotActions{key}", encoding: "embedded", why: "Autopilot decisions keyed by recommendation" },
  { path: "books.findings[].key", encoding: "embedded", why: "Audit finding keys" },
  { path: "books.entityAccounts{}[]", table: "accounts", why: "Entity → ledger accounts" },
  { path: "books.loanBalances[].loanId", table: "loans", why: "Lender statement evidence" },
  { path: "books.loanBalances[].docId", table: "documents", why: "Lender statement" },
  { path: "books.docLinks[].docId", table: "documents", why: "Linked document" },
  { path: "books.docLinks[].targetId", table: "expenses", when: kindIs("transaction"), why: "Document linked to an entry" },
  { path: "books.docLinks[].targetId", table: "loans", when: kindIs("loan"), why: "Document linked to a loan" },
  { path: "books.fyRecords[].docIds[]", table: "documents", why: "Audited accounts" },
  { path: "books.fyRecords[].details[].docId", table: "documents", why: "Schedule source" },
  { path: "books.fyRecords[].accountMap{key}", table: "accounts", why: "Audited head per ledger account" },
  { path: "books.properties[].docIds[]", table: "documents", why: "Property documents" },
  { path: "books.properties[].links.loanId", table: "loans", why: "Property loan" },
  { path: "books.properties[].links.insuranceDocIds[]", table: "documents", why: "Insurance documents" },
  { path: "books.properties[].links.taxDocIds[]", table: "documents", why: "Property tax documents" },
  { path: "books.properties[].links.depositAccountId", table: "accounts", why: "Deposit account" },
  { path: "books.leases[].accountId", table: "accounts", why: "Rent receiving account" },
  { path: "books.leases[].docId", table: "documents", why: "Lease deed" },
  { path: "books.propertyCosts[].transactionId", table: "expenses", why: "Property cost entry" },
  { path: "books.propertyCosts[].docId", table: "documents", why: "Property cost bill" },
  { path: "books.assetEvents[].docId", table: "documents", why: "Asset event evidence" },
  { path: "books.journals[].transactionId", table: "expenses", why: "Posted depreciation entry" },
  { path: "books.holdings[].cashAccountId", table: "accounts", why: "Broker cash account" },
  { path: "books.holdings[].bond.docId", table: "documents", why: "Bond terms original (term sheet / statement)" },
  { path: "books.gstInvoices[].docId", table: "documents", why: "GST invoice original" },
  { path: "books.gstInvoices[].transactionId", table: "expenses", why: "GST invoice entry" },
  { path: "books.gstInvoices[].rcmPaymentId", table: "expenses", why: "Reverse-charge payment entry" },
  { path: "books.gstAdvances[].docId", table: "documents", why: "GST advance receipt" },
  { path: "books.gstFilings[].docId", table: "documents", why: "Filed return acknowledgement" },
  { path: "books.taxCredits[].docId", table: "documents", why: "Form 26AS/16/challan" },
  { path: "books.taxCredits[].transactionId", table: "expenses", why: "Tax payment entry" },
  { path: "books.salaryEvidence[].docId", table: "documents", why: "Form 16 / payslip" },
  { path: "books.itrHandoffs[].docId", table: "documents", why: "Frozen accountant handoff ZIP" },
];

/** Preference sections kept byte-for-byte: frozen evidence, archives, or replaced by the database on restore. */
export const PREFERENCE_VERBATIM: readonly { path: string; why: string }[] = [
  { path: "preservedRecords", why: "Stored originals archived exactly as they were saved (audit evidence)" },
  { path: "books.savedDrafts", why: "Frozen return drafts: the saved working must not change" },
  { path: "books.closedPeriods", why: "Database keeps the account's current closures; backup closures are archived as unverified history" },
  { path: "books.periodLog", why: "Same as closedPeriods" },
];

/**
 * Preference sections (top-level keys, and books.* keys) that hold no reference to a remapped row. Together with
 * PREFERENCE_REFS and PREFERENCE_VERBATIM this must cover every section (completeness test).
 */
export const PREFERENCE_NO_REFS: Readonly<Record<string, string>> = {
  smartDefaults: "Booleans", shopAliases: "Shop name → shop key", payees: "Owner-local payee directory (ids preserved)",
  homeShortcuts: "UI order", travelMessages: "Text with owner-local trip ids", savedViews: "Filter strings", entities: "Owner-local legal entities (ids preserved)",
  receivables: "Invoices; payment is matched by amount and name, not id", depreciationDismissed: "Months", homeMode: "UI", categories: "Category names",
  tags: "Tag names", homeHidden: "UI", homeOrder: "UI", theme: "UI", themeName: "UI", homeScope: "Workspace name", reminders: "Boolean",
  notifications: "Booleans", reminderDays: "Number", defaultCurrency: "Currency code", language: "Language code", aiEnabled: "Boolean",
  aiReadsDocuments: "Boolean", cardAlertPct: "Number", homePeriod: "UI", homeCustomStart: "Date", homeCustomEnd: "Date", splitTemplates: "Category percentages",
  irregularRejected: "Merchant/category keys", irregularConfirmed: "Merchant/category keys", milestones: "Targets (loan by name)", merchantAliases: "Merchant names",
  brief: "Schedule settings", allocationPlans: "Income plans (no record links)", ruleDismissed: "Owner-local rule id + message hash", coolingOff: "Proposed purchases",
  decisions: "Decision memory text", setupAssistant: "UI", tripBudgetWarnPct: "Number",
  "books.proposedFields": "Field labels", "books.retentionYears": "Years per document type", "books.quotes": "Prices keyed by instrument", "books.snapshots": "Net-worth figures",
  "books.alerts": "Thresholds", "books.goldRate": "Price", "books.fxRates": "Rates", "books.taxProfiles": "Owner-local entity ids", "books.rules": "Regulatory rule versions",
  "books.policy": "Approval switches (entity-keyed limits use owner-local ids)", "books.ruleDecisions": "Global regulatory change ids", "books.fieldMappings": "Label → field",
  "books.taxDeductions": "Evidence text", "books.entityTaxProfiles": "Owner-local entity ids", "books.allocationOrder": "Setting", "books.priceOverrides": "Instrument keys",
};

/** JSON columns of backed-up tables: rule paths start with the column name. */
export const COLUMN_JSON_REFS: Partial<Record<string, readonly RefRule[]>> = {
  expenses: [
    { path: "splits[].memberId", table: "family_members", why: "Family split share" },
    { path: "allocations[].memberId", table: "family_members", why: "Category split line for a family member" },
    { path: "reimbursement.receipts[].txnId", table: "expenses", why: "Claim money-back entry" },
    { path: "reimbursement.receipts[].id", table: "expenses", when: (p) => p["id"] === p["txnId"], why: "finance_operation stores the money-back entry id as the receipt id; it follows txnId so the two stay equal" },
    { path: "receipt_details.accounting.journal.documentIds[]", table: "documents", why: "Accounting evidence originals" },
    { path: "receipt_details.accounting.journal.legs[].accountId", table: "accounts", why: "Accounting leg account" },
    { path: "receipt_details.accounting.journal.legs[].source.docId", table: "documents", why: "Schedule source document" },
    { path: "receipt_details.accounting.journal.settlement.entryId", table: "expenses", why: "Entry that settled an accrual" },
    { path: "receipt_details.accounting.journal.settlement.snapshot.accountId", table: "accounts", why: "Settling entry's account at settlement" },
    { path: "receipt_details.accounting.journal.settlement.snapshot.allocations[].memberId", table: "family_members", why: "Settling entry's split member at settlement" },
  ],
  expense_drafts: [
    { path: "data.accountId", table: "accounts", why: "Draft account" },
    { path: "data.toAccountId", table: "accounts", why: "Draft receiving account" },
    { path: "data.memberId", table: "family_members", why: "Draft family member" },
    { path: "data.shares{key}", table: "family_members", ignore: ["me"], why: "Draft family split shares" },
  ],
  security_holdings: [
    { path: "sources[]", table: "documents", why: "Statement originals for the holding" },
    { path: "lots[].source", table: "documents", why: "Statement original for a purchase/sale lot" },
    { path: "gains[].source", table: "documents", why: "Statement original for a gain line" },
    { path: "events[].source", table: "documents", why: "Statement original for an investment event" },
  ],
};
/** JSON columns of backed-up tables with no reference to remapped rows (completeness test). */
export const JSON_COLUMNS_NO_REFS: Readonly<Record<string, string>> = {
  "expenses.receipts": "File paths (staged separately)", "expenses.workspace_allocations": "Workspace amounts",
  "expense_drafts.receipts": "File paths (staged separately)", "accounts.details": "Card/bank details; payeeId is an owner-local payee id",
  "documents.fields": "Extracted document fields", "loans.payments": "Repayment amounts and dates",
  "finance_preferences.data": "Covered by PREFERENCE_REFS", "period_close_evidence.request": "Archived verbatim", "period_close_evidence.evidence": "Archived verbatim",
  "imported_period_history.history": "Archived verbatim",
};

/** Whole rows kept verbatim (archived by the database as unverified history, never inserted as live records). */
export const VERBATIM_TABLES = ["period_close_evidence", "imported_period_history"] as const;

/** Plain uuid columns that point at remapped rows. `id` itself is always remapped for REMAP_TABLES. */
export const COLUMN_REFS: Partial<Record<string, Readonly<Record<string, RemapTable>>>> = {
  expenses: { account_id: "accounts", to_account_id: "accounts", member_id: "family_members", transfer_counterpart_of: "expenses" },
  documents: { transaction_id: "expenses", account_id: "accounts", loan_id: "loans", replaces_id: "documents" },
  loans: { account_id: "accounts", source_transaction_id: "expenses" },
  commitments: { account_id: "accounts" },
  asset_valuations: { account_id: "accounts" },
  expense_drafts: { transaction_id: "expenses" },
  security_holdings: { demat_id: "demat_accounts" },
};
/** Id-like columns of backed-up tables that deliberately keep their value. */
export const COLUMN_NOT_REMAPPED: Readonly<Record<string, string>> = {
  owner_id: "Set to the restoring owner",
  employee_id: "Set to the restoring owner (expenses owner column)",
  payee_id: "Owner-local payee id from preferences; payees keep their ids",
  trip_id: "Owner-local trip id from preferences; trips keep their ids",
  payment_instrument_id: "Owner-local payment method id; methods keep their ids",
  entity_id: "Owner-local legal entity id; entities keep their ids",
  reconciled_by: "User who reconciled; historical actor, not a row reference",
  client_id: "Demat client id printed on statements (external)",
  dp_id: "Depository participant id (external)",
  period_id: "Archived closure evidence (verbatim)",
};

/**
 * Id-like JSON field names that are not references to remapped rows. Used by the completeness test: any id-like
 * field in a register type that is neither in a REFS path nor here fails the build of the test suite.
 */
export const NOT_REMAPPED_FIELDS: Readonly<Record<string, string>> = {
  id: "A record's own id (owner-local JSON id, or a row id handled by the table remap)",
  entityId: "Owner-local legal entity id (preferences.entities) — preserved",
  ownerEntityId: "Owner-local legal entity id — preserved",
  assetId: "Owner-local asset id (preferences.assets) — preserved",
  propertyId: "Owner-local property id — preserved",
  unitId: "Owner-local property unit id — preserved",
  payeeId: "Owner-local payee id — preserved",
  tripId: "Owner-local trip id — preserved",
  instrumentId: "Owner-local payment method id — preserved",
  paymentInstrumentId: "Owner-local payment method id — preserved",
  parentId: "Owner-local payment method id (add-on card parent) — preserved",
  bookingId: "Owner-local trip booking id — preserved",
  profileId: "Owner-local reimbursement profile id — preserved",
  routeId: "Owner-local approval route id — preserved",
  defaultRouteId: "Owner-local approval route id — preserved",
  employeeId: "Employee number printed on claim profiles (text, not a user id)",
  invoiceId: "Owner-local GST invoice id — preserved",
  amendsId: "Owner-local GST invoice id — preserved",
  reversesId: "Owner-local accounting journal id — preserved",
  requestId: "Server operation request id — preserved",
  changeId: "Global regulatory_changes id (not owner data)",
  periodId: "Closed period id (verbatim closure history)",
  templateId: "Owner-local recurring template id",
  rcmPaidOn: "Date, not an id",
  key: "Quote/override/finding key (instrument or finding key)",
  clientId: "Demat client id printed on statements (external)",
  dpId: "Depository participant id (external)",
  verified: "Identifier labels checked against certificates (PAN/GSTIN), not row ids",
  newId: "Function parameter (id generator), not stored",
  explicitId: "Function parameter (chosen reimbursement profile id)",
  groupId: "Function parameter (journal balancing group)",
  ruleId: "Rule alert output (owner-local rule id)",
  txnIds: "Computed observation list, not stored",
  editId: "Computed autopilot recommendation link, not stored (only the decision is stored, keyed by recommendation key)",
  journalId: "Owner-local accounting journal id (journals live in entry JSON) — preserved",
};

/**
 * Exact stored paths (registry syntax, prefixed by table and column) that look like references or are untyped but
 * are not links to remapped rows. Used with NOT_REMAPPED_FIELDS by the type-path completeness test.
 */
export const PATHS_NOT_REMAPPED: Readonly<Record<string, string>> = {
  "finance_preferences.data.books.entityAccounts{key}": "Owner-local legal entity ids (preserved)",
  "finance_preferences.data.books.policy.capitalisationMinByEntity{key}": "Owner-local legal entity ids (preserved)",
  "finance_preferences.data.books.fieldMappings{key}": "Document labels",
  "finance_preferences.data.books.snapshots[].allocation{key}": "Asset-class names",
  "finance_preferences.data.merchantAliases{key}": "Merchant names",
  "finance_preferences.data.merchantGroupingHistory[].after{key}": "Merchant names",
  "finance_preferences.data.merchantGroupingHistory[].before{key}": "Merchant names",
  "finance_preferences.data.savedViews[].filters{key}": "Filter names (accountId/memberId values are registered)",
  "finance_preferences.data.shopAliases{key}": "Shop names",
  "finance_preferences.data.shopRules{key}": "Shop names",
  "expense_drafts.data.wsSplit": "Workspace split form state (workspace names and amounts)",
  "expense_drafts.data.receiptDetails": "Receipt reading output before saving (amounts, items, fingerprint); accounting evidence is attached only on save",
};

// ---------------------------------------------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------------------------------------------

export const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
export interface UnmappedRef { path: string; value: string; expected: RemapTable | Encoding }
export interface RemapReport {
  /** References rewritten to the new ids. */
  remapped: number;
  /** Registered references whose target row is not in the backup: kept exactly, listed for review. */
  unmapped: UnmappedRef[];
  /** Ids of backed-up rows found at a path no rule covers: kept exactly, listed for review. */
  unclassified: { path: string; value: string }[];
  /** Verbatim sections that mention backed-up ids (kept on purpose). */
  verbatim: { path: string; ids: number }[];
}
export const emptyReport = (): RemapReport => ({ remapped: 0, unmapped: [], unclassified: [], verbatim: [] });

export interface RemapContext { ids: ReadonlyMap<string, string>; tables: ReadonlyMap<RemapTable, ReadonlySet<string>>; report: RemapReport }

const TOKEN = /\[\]|\{key\}|\{\}|[^.[\]{}]+/g;
const tokens = (path: string) => path.match(TOKEN) ?? [];
interface Compiled { rule: RefRule; toks: string[]; keyRule: boolean }
const compileCache = new WeakMap<readonly RefRule[], Compiled[]>();
function compile(rules: readonly RefRule[]): Compiled[] {
  let c = compileCache.get(rules);
  if (!c) {
    c = rules.map((rule) => { const t = tokens(rule.path); const keyRule = t.at(-1) === "{key}"; return { rule, toks: keyRule ? t.slice(0, -1) : t, keyRule }; });
    compileCache.set(rules, c);
  }
  return c;
}
const tokMatch = (rule: string, actual: string) => rule === actual || (rule === "{}" && actual !== "[]");
const pathMatch = (rule: string[], actual: string[]) => rule.length === actual.length && rule.every((t, i) => tokMatch(t, actual[i]!));
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

const NODE_TABLE: Record<string, RemapTable | null> = { account: "accounts", card: "accounts", member: "family_members", loan: "loans", commitment: "commitments", document: "documents", method: null };

function knownIdsIn(s: string, ctx: RemapContext): string[] {
  const out: string[] = [];
  if (ctx.ids.has(s)) out.push(s);
  for (const m of s.match(UUID_RE) ?? []) if (m !== s && ctx.ids.has(m)) out.push(m);
  return out;
}

function mapId(value: string, table: RemapTable | Encoding, ignore: readonly string[] | undefined, path: string, ctx: RemapContext): string {
  if (value === "" || ignore?.includes(value)) return value;
  const next = ctx.ids.get(value);
  if (next !== undefined) { ctx.report.remapped++; return next; }
  ctx.report.unmapped.push({ path, value, expected: table });
  return value;
}

const isUuid = (s: string) => s.length === 36 && new RegExp(`^${UUID_RE.source}$`, "i").test(s);

function applyRule(value: string, rule: RefRule, path: string, ctx: RemapContext): string {
  const enc = rule.encoding ?? "id";
  if (enc === "id") return mapId(value, rule.table!, rule.ignore, path, ctx);
  if (enc === "id-or-label") return ctx.ids.has(value) || isUuid(value) ? mapId(value, rule.table!, rule.ignore, path, ctx) : value;
  if (enc === "node-key") {
    const m = /^([a-z]+):(.+)$/.exec(value);
    const table = m ? NODE_TABLE[m[1]!] : undefined;
    if (!m || table === undefined) { for (const id of knownIdsIn(value, ctx)) ctx.report.unclassified.push({ path, value: id }); return value; }
    if (table === null) return value;
    const next = mapId(m[2]!, table, undefined, path, ctx);
    return next === m[2] ? value : `${m[1]}:${next}`;
  }
  if (enc === "entries-activity") {
    if (!value.startsWith("entries:")) return value;
    const parts = value.slice(8).split(",");
    const mapped = parts.map((id) => mapId(id, "expenses", undefined, path, ctx));
    return mapped.every((x, i) => x === parts[i]) ? value : `entries:${[...mapped].sort().join(",")}`;
  }
  // embedded
  let changed = false;
  let next = value.replace(UUID_RE, (m) => { const n = ctx.ids.get(m); if (n === undefined) return m; changed = true; ctx.report.remapped++; return n; });
  if (!changed && ctx.ids.has(value)) { ctx.report.remapped++; return ctx.ids.get(value)!; }
  // Inbox duplicate keys are `dup:<entry>:<entry>` with the two ids sorted; keep that canonical order.
  const dup = /^dup:([^:]+):([^:]+)$/.exec(next);
  if (changed && dup && isUuid(dup[1]!) && isUuid(dup[2]!)) next = `dup:${[dup[1], dup[2]].sort().join(":")}`;
  return changed ? next : value;
}

/**
 * Remap one JSON value. Returns the SAME reference when nothing changed, so unchanged sections stay byte-identical
 * (including key order). `base` prefixes report paths.
 */
export function remapJson(root: unknown, rules: readonly RefRule[], verbatim: readonly { path: string }[], base: string, ctx: RemapContext): unknown {
  const compiled = compile(rules);
  const verb = verbatim.map((v) => tokens(v.path));
  const walk = (node: unknown, toks: string[], shown: string, parent: Record<string, unknown> | null): unknown => {
    if (verb.some((v) => pathMatch(v, toks))) {
      if (node !== undefined) { const n = (JSON.stringify(node).match(UUID_RE) ?? []).filter((m) => ctx.ids.has(m)).length; if (n) ctx.report.verbatim.push({ path: shown, ids: n }); }
      return node;
    }
    if (typeof node === "string") {
      const hit = compiled.find((c) => !c.keyRule && pathMatch(c.toks, toks) && (!c.rule.when || (parent !== null && c.rule.when(parent))));
      if (hit) return applyRule(node, hit.rule, shown, ctx);
      for (const id of knownIdsIn(node, ctx)) ctx.report.unclassified.push({ path: shown, value: id });
      return node;
    }
    if (Array.isArray(node)) {
      let out: unknown[] | null = null;
      node.forEach((item, i) => { const next = walk(item, [...toks, "[]"], `${shown}[${i}]`, isObj(item) ? item : parent); if (next !== item) { out ??= [...node]; out[i] = next; } });
      return out ?? node;
    }
    if (isObj(node)) {
      const keyRule = compiled.find((c) => c.keyRule && pathMatch(c.toks, toks) && (!c.rule.when || (parent !== null && c.rule.when(parent))));
      let changed = false;
      const entries = Object.entries(node).map(([k, v]) => {
        let key = k;
        if (keyRule) key = applyRule(k, keyRule.rule, `${shown}{${k}}`, ctx);
        else for (const id of knownIdsIn(k, ctx)) ctx.report.unclassified.push({ path: `${shown}{${k}}`, value: id });
        const next = walk(v, [...toks, k], shown ? `${shown}.${k}` : k, node);
        if (key !== k || next !== v) changed = true;
        return [key, next] as const;
      });
      return changed ? Object.fromEntries(entries) : node;
    }
    return node;
  };
  return walk(root, [], base, null);
}

/** Every reference a registry says should resolve, with whether it does (used by tests and the orphan scan). */
export function collectRefs(root: unknown, rules: readonly RefRule[], base = ""): { path: string; value: string; table: RemapTable | Encoding }[] {
  const compiled = compile(rules);
  const out: { path: string; value: string; table: RemapTable | Encoding }[] = [];
  const push = (value: string, rule: RefRule, path: string) => {
    const enc = rule.encoding ?? "id";
    if (enc === "id") { if (value !== "" && !rule.ignore?.includes(value)) out.push({ path, value, table: rule.table! }); return; }
    if (enc === "id-or-label") { if (isUuid(value) && !rule.ignore?.includes(value)) out.push({ path, value, table: rule.table! }); return; }
    if (enc === "node-key") { const m = /^([a-z]+):(.+)$/.exec(value); const t = m ? NODE_TABLE[m[1]!] : null; if (m && t) out.push({ path, value: m[2]!, table: t }); return; }
    if (enc === "entries-activity") { if (value.startsWith("entries:")) for (const id of value.slice(8).split(",")) out.push({ path, value: id, table: "expenses" }); return; }
  };
  const walk = (node: unknown, toks: string[], shown: string, parent: Record<string, unknown> | null) => {
    if (typeof node === "string") { const hit = compiled.find((c) => !c.keyRule && pathMatch(c.toks, toks) && (!c.rule.when || (parent !== null && c.rule.when(parent)))); if (hit) push(node, hit.rule, shown); return; }
    if (Array.isArray(node)) { node.forEach((x, i) => walk(x, [...toks, "[]"], `${shown}[${i}]`, isObj(x) ? x : parent)); return; }
    if (isObj(node)) {
      const keyRule = compiled.find((c) => c.keyRule && pathMatch(c.toks, toks));
      for (const [k, v] of Object.entries(node)) { if (keyRule) push(k, keyRule.rule, `${shown}{${k}}`); walk(v, [...toks, k], shown ? `${shown}.${k}` : k, node); }
    }
  };
  walk(root, [], base, null);
  return out;
}

