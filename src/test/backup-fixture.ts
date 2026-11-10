// Test-only: a realistic multi-entity Thapal backup with every register populated and cross-references between them.
// Row ids are valid UUIDs and rows satisfy the applied schema, so the same fixture is used by the pure restore tests and
// the isolated PGlite restore tests. Owner-local JSON ids (entities, assets, payees, trips…) are UUIDs too, so the tests
// prove they are NOT mistaken for row ids. Never touches Cloud.
import { stableUuid } from "../lib/books/assets-ledger";
import type { Backup, BackupRow } from "../lib/backup";

export const OWNER_A = "00000000-0000-4000-8000-0000000000a1";
export const OWNER_B = "00000000-0000-4000-8000-0000000000b2";
const u = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const local = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const ID = {
  spouse: u(1), bank: u(2), card: u(3), assetAcct: u(4), coBank: u(5), usdWallet: u(6),
  groceries: u(10), laptop: u(11), hotel: u(12), claimBack: u(13), transferOut: u(14), loanIn: u(16), rent: u(17), gstTax: u(18),
  draftOpen: u(20), commitment: u(30), loan: u(40), goal: u(50), valuation: u(60),
  invoice: u(70), statement: u(71), loanDoc: u(72), invoiceRevised: u(73), dematStmt: u(74), lease: u(75), form16: u(76), handoff: u(77),
  demat: u(80), holding: u(81), evidence: u(90),
  // owner-local JSON ids (never remapped)
  company: local(1), person: local(2), laptopAsset: local(3), flatAsset: local(4), payee: local(5), trip: local(6), booking: local(7),
  instrument: local(8), addOn: local(9), property: local(10), unit: local(11), leaseRec: local(12), profile: local(13), route: local(14), mfHolding: local(15),
  journalApr: local(16), journalMay: local(17), invoiceGst: local(18), rule: local(19),
} as const;

/** Entry id the Assets page derived (legacy, key-only) when depreciation for April 2026 was posted. */
export const legacyDepreciationId = () => stableUuid("depreciation", ID.laptopAsset, "2026-04");

const expense = (id: string, o: BackupRow): BackupRow => ({ id, employee_id: OWNER_A, title: "Entry", merchant: null, category: "Groceries", amount: 0, currency: "INR", expense_date: "2026-04-10", description: "", status: "approved", scope: "personal", txn_type: "expense", receipts: [], splits: [], tags: [], allocations: [], workspace_allocations: [], ...o });

export async function buildBackupFixture(): Promise<Backup> {
  const dep = await legacyDepreciationId();
  const prefs = {
    entities: [{ id: ID.company, name: "KR Enterprises Pvt Ltd", kind: "company", pan: "AAACK1234F", gstins: ["29AAACK1234F1Z5"], booksFrom: "2024-25" }, { id: ID.person, name: "Self", kind: "individual", pan: "ABCPK1234Q", gstins: [], booksFrom: "2024-25" }],
    assets: [
      { id: ID.laptopAsset, name: "Laptop", kind: "computer", cost: 120000, inUse: "2026-04-01", ownerEntityId: ID.company, sharePct: 100, bookMethod: "slm", bookRatePct: 33.33, usefulLifeYears: 3, docId: ID.invoice, docIds: [ID.invoiceRevised], transactionId: ID.laptop, paymentId: ID.laptop, accountId: ID.assetAcct, adjustments: [{ date: "2026-06-30", amount: -5000, kind: "impairment", note: "screen" }] },
      { id: ID.flatAsset, name: "Flat", kind: "property", cost: 5000000, inUse: "2024-04-01", ownerEntityId: ID.person, sharePct: 50, bookMethod: "slm", bookRatePct: 0, accountId: ID.assetAcct },
    ],
    receivables: [{ id: local(30), customer: "Acme", invoiceNo: "INV-7", date: "2026-04-02", amount: 59000, gst: 9000 }],
    payees: [{ id: ID.payee, name: "Taj Hotel", type: "business", identifiers: [], accountDetails: "", accountVerified: false, organisation: "", preferredCategory: "Travel", archived: false }],
    reimbursementSettings: { profiles: [{ id: ID.profile, organisation: "AET", workspace: "official", organisationCode: "AET", costCentre: "CC1", name: "K", designation: "Lead", employeeId: "E-77", department: "Ops", email: "k@x.in", contact: "", accountId: ID.bank, accountHolder: "K", currency: "INR", format: "detailed", declaration: "", documentRule: "warn", categories: [], routes: [{ id: ID.route, label: "Default", reportingAuthority: "", approver: "", finance: "", additionalApprover: "", designation: "" }], defaultRouteId: ID.route, isDefault: true }], responsibilities: [{ entryId: ID.hotel, shares: [{ organisation: "AET", amount: 16600 }] }], mappings: [{ activity: `entries:${[ID.hotel, ID.groceries].sort().join(",")}`, organisation: "AET", profileId: ID.profile }, { activity: "travel", organisation: "AET", profileId: ID.profile }], lastFormat: "detailed" },
    paymentInstruments: [{ id: ID.instrument, type: "card", nickname: "Visa", lastFour: "4242", accountId: ID.card, memberId: null }, { id: ID.addOn, type: "card", nickname: "Add-on", lastFour: "1111", accountId: ID.card, memberId: ID.spouse, parentId: ID.instrument }],
    budgets: [{ id: local(31), name: "Spouse", amount: 10000, period: "monthly", kind: "person", value: ID.spouse, start: "2026-04-01", carry: false }, { id: local(32), name: "Me", amount: 5000, period: "monthly", kind: "person", value: "me", start: "2026-04-01", carry: false }, { id: local(33), name: "Food", amount: 8000, period: "monthly", kind: "category", value: "Groceries", start: "2026-04-01", carry: true }],
    rules: [{ id: ID.rule, name: "Big card spend", trigger: "large_transaction", threshold: 25000, category: null, accountId: ID.card, frequency: "daily", priority: "high", notify: true, enabled: true }],
    shopRules: { "big bazaar": { category: "Groceries", accountId: ID.card } },
    freshness: { reviewDays: 14, outdatedDays: 45, perAccount: { [ID.bank]: { reviewDays: 7, outdatedDays: 30 } } },
    statementBalances: { [ID.bank]: { balance: 41234.5, date: "2026-04-30" } },
    statementBatches: { [ID.bank]: [ID.groceries] },
    statementUploads: [{ id: "upload-1", at: "2026-05-01T10:00:00Z", label: "HDFC April", posted: [ID.groceries], reconciled: [ID.transferOut], createdAccounts: [{ id: ID.usdWallet, name: "USD wallet" }], status: "complete", sources: [{ documentId: ID.statement, accountId: ID.bank, file: "hdfc-apr.pdf" }], linkedDrafts: [{ draftId: ID.groceries, transactionId: ID.groceries }], evidence: [{ id: ID.groceries, ref: "HDFC 0412" }], undoRows: [{ id: ID.groceries, ref: null, revision: 2 }], expected: { posted: 1, reconciled: 1, drafts: 1 } }],
    contractObligations: [{ id: local(34), docId: ID.lease, label: "Rent", amount: 25000, frequency: "monthly", dueDate: "2026-05-05", noticeDays: 30, evidence: "Rent ₹25,000", status: "added", decidedAt: "2026-04-03" }],
    trips: [{ id: ID.trip, name: "Mumbai", destination: "Mumbai", start: "2026-04-14", end: "2026-04-16", budget: 30000, currencies: ["INR", "USD"], travellers: ["Asha", "Ravi"], travellerBudgets: [{ traveller: ID.spouse, amount: 10000 }, { traveller: "Me", amount: 15000 }, { traveller: "Ravi", amount: 5000 }], bookings: [{ id: ID.booking, kind: "hotel", provider: "Taj", ref: "T1", date: "2026-04-14", amount: 16600, status: "paid", expenseId: ID.hotel, expenseIds: [ID.hotel], documentIds: [ID.invoice] }], itinerary: [{ id: local(35), date: "2026-04-14", title: "Check in", bookingId: ID.booking, travellers: ["Asha"], documentIds: [ID.invoice] }], advances: [{ id: local(36), date: "2026-04-10", amount: 5000, source: "AET" }] }],
    travelMessages: [{ id: local(37), title: "Booking", text: "Confirmed", tripId: ID.trip, source: "email", createdAt: "2026-04-10", reviewed: true }],
    merchantAliases: { "taj mahal hotel": "taj hotel" },
    merchantGroupingHistory: [{ id: local(38), date: "2026-04-20", title: "Group Taj", before: {}, after: { "taj mahal hotel": "taj hotel" }, entryIds: [ID.hotel], entrySnapshot: [{ id: ID.hotel, merchant: "Taj Mahal Hotel", amount: 16600, date: "2026-04-14", currency: "USD", originalAmount: 200, title: "Hotel" }] }],
    mapLinks: [{ id: local(39), from: `account:${ID.bank}`, to: `loan:${ID.loan}`, note: "EMI account" }, { id: local(40), from: `method:${ID.instrument}`, to: `card:${ID.card}`, note: "card" }],
    mapPositions: { [`account:${ID.bank}`]: { x: 10, y: 40 }, [`member:${ID.spouse}`]: { x: 200, y: 40 } },
    favouriteEntries: [ID.groceries],
    savedViews: [{ id: local(70), name: "Asha on Visa", filters: { memberId: ID.spouse, accountId: ID.card, category: "Groceries", paymentInstrumentId: ID.instrument } }, { id: local(71), name: "Mine", filters: { memberId: "me", accountId: "all" } }],
    inboxDismissed: [`stale:${ID.bank}:never:never`, `dup:${ID.groceries}:${ID.transferOut}`, `commit:${ID.commitment}:2026-05-01`, "sync:2"],
    checkedAudit: [`orphan-doc:${ID.statement}`],
    autopilotActions: { [`shortfall:${ID.commitment}:2026-05-01`]: { status: "dismissed", at: "2026-04-30" } },
    emergency: { accountIds: [ID.bank], excludeEarmarked: true, essentialCategories: ["Groceries"], includeEmis: true, targetMonths: 6, method: "conservative", customMonthly: 0, monthlyContribution: 0 },
    briefs: [{ id: local(41), generatedAt: "2026-04-20", data: { period: { start: "2026-04-13", end: "2026-04-19" }, highlights: { topCategory: null, significant: [{ id: ID.hotel, title: "Taj", amount: 16600, date: "2026-04-14" }], unusual: null } } }],
    preservedRecords: [{ path: "assets", reason: "replaced-after-display-adjustment", savedAt: "2026-04-05", record: { id: ID.laptopAsset, transactionId: ID.laptop } }],
    // Archive status of table rows (records-archive.ts): row ids and "<table>:<id>" keys follow the rows on restore.
    recordArchive: [{ id: `loans:${ID.loan}`, table: "loans", recordId: ID.loan, name: "loans", archivedAt: "2026-04-06T00:00:00Z", archivedBy: OWNER_A, archiveReason: "Kept for records", archiveHistory: [{ action: "archived", at: "2026-04-06T00:00:00Z", by: OWNER_A, reason: "Kept for records" }] }, { id: `goals:${ID.goal}`, table: "goals", recordId: ID.goal, name: "goals", archivedAt: "2026-04-06T00:00:00Z", archivedBy: OWNER_A, archiveReason: "Kept for records", archiveHistory: [{ action: "archived", at: "2026-04-06T00:00:00Z", by: OWNER_A, reason: "Kept for records" }] }, { id: `commitments:${ID.commitment}`, table: "commitments", recordId: ID.commitment, name: "commitments", archivedAt: "2026-04-06T00:00:00Z", archivedBy: OWNER_A, archiveReason: "Kept for records", archiveHistory: [{ action: "archived", at: "2026-04-06T00:00:00Z", by: OWNER_A, reason: "Kept for records" }] }, { id: `asset_valuations:${ID.valuation}`, table: "asset_valuations", recordId: ID.valuation, name: "asset_valuations", archivedAt: "2026-04-06T00:00:00Z", archivedBy: OWNER_A, archiveReason: "Kept for records", archiveHistory: [{ action: "archived", at: "2026-04-06T00:00:00Z", by: OWNER_A, reason: "Kept for records" }] }, { id: `documents:${ID.statement}`, table: "documents", recordId: ID.statement, name: "documents", archivedAt: "2026-04-06T00:00:00Z", archivedBy: OWNER_A, archiveReason: "Kept for records", archiveHistory: [{ action: "archived", at: "2026-04-06T00:00:00Z", by: OWNER_A, reason: "Kept for records" }] }],
    depreciationDismissed: ["2026-03"],
    books: {
      closedPeriods: [{ id: "fy2024-25", from: "2024-04-01", to: "2025-03-31", entityId: ID.company, closedOn: "2025-05-01", note: "Audited" }],
      periodLog: [{ at: "2025-05-01T00:00:00Z", action: "closed", periodId: "fy2024-25", reason: "Audited" }],
      entityAccounts: { [ID.company]: [ID.coBank, ID.assetAcct], [ID.person]: [ID.bank, ID.card, ID.usdWallet] },
      docLinks: [{ docId: ID.invoice, kind: "transaction", targetId: ID.laptop, label: "acquisition payment" }, { docId: ID.invoice, kind: "asset", targetId: ID.laptopAsset, label: "Laptop" }, { docId: ID.loanDoc, kind: "loan", targetId: ID.loan, label: "sanction" }, { docId: ID.invoice, kind: "entity", targetId: ID.company, label: "owner" }],
      proposedFields: [], retentionYears: { invoice: 8 },
      fyRecords: [{ id: local(42), entityId: ID.company, fy: "2024-25", audited: { bank: 100000 }, schedules: ["balanceSheet"], qualifications: [], filedReturns: [], lossesCarriedForward: [], docIds: [ID.form16], details: [{ schedule: "balanceSheet", lines: [{ label: "Bank", amount: 100000 }], docId: ID.form16 }], accountMap: { [ID.coBank]: "bank" } }],
      properties: [{ id: ID.property, name: "Flat 4B", ownerEntityId: ID.person, address: "Bengaluru", assetId: ID.flatAsset, buildings: [{ id: local(43), name: "A", floors: [{ id: local(44), name: "4", units: [{ id: ID.unit, name: "4B" }] }] }], docIds: [ID.lease], links: { loanId: ID.loan, insuranceDocIds: [ID.lease], taxDocIds: [ID.lease], depositAccountId: ID.bank } }],
      leases: [{ id: ID.leaseRec, propertyId: ID.property, unitId: ID.unit, tenant: "R", start: "2026-04-01", end: "2027-03-31", rent: 25000, paymentTerms: "monthly", docId: ID.lease, accountId: ID.bank, currency: "INR" }],
      propertyCosts: [{ id: local(45), propertyId: ID.property, date: "2026-04-20", kind: "maintenance", vendor: "Society", amount: 3000, transactionId: ID.rent, docId: ID.lease }],
      assetEvents: [{ id: local(46), assetId: ID.laptopAsset, date: "2026-06-30", kind: "impairment", note: "screen", value: 5000, docId: ID.invoiceRevised, applied: true }],
      journals: [{ id: ID.journalApr, assetId: ID.laptopAsset, period: "2026-04", amount: 3333.33, kind: "book", status: "posted", postedOn: "2026-05-01", transactionId: dep }, { id: ID.journalMay, assetId: ID.laptopAsset, period: "2026-05", amount: 3333.33, kind: "book", status: "prepared" }],
      holdings: [{ id: ID.mfHolding, kind: "broker_cash", name: "Zerodha cash", quantity: 1, ownerEntityId: ID.person, sharePct: 100, source: "entered by you", cashAccountId: ID.usdWallet, currency: "USD" }, { id: local(72), kind: "bond", name: "NHAI 7.35% 2031", quantity: 10, ownerEntityId: ID.company, sharePct: 100, source: "statement", bond: { faceValue: 1000, couponPct: 7.35, lastCoupon: "2026-01-01", nextCoupon: "2027-01-01", maturity: "2031-01-01", dayCount: "ACT/365", couponsPerYear: 1, priceBasis: "amount", priceIncludesInterest: false, currency: "INR", docId: ID.dematStmt, sourceQuote: "7.35% NHAI 2031" } }],
      quotes: [], snapshots: [{ date: "2026-04-30", netWorth: 1000000, portfolio: 0, liquid: 50000, liabilities: 0, allocation: {} }], alerts: { portfolioMovePct: 5, staleNavDays: 3, missingPrices: true, corporateActions: true, quantityMismatch: true, unusualValuationPct: 20 },
      taxProfiles: [{ entityId: ID.company, regime: "new", obligations: [], gstScheme: "regular", auditRequired: true }],
      gstInvoices: [{ id: ID.invoiceGst, gstin: "29AAACK1234F1Z5", kind: "purchase", number: "P-1", date: "2026-04-05", party: "Dell", partyGstin: "29AAACD1234F1Z5", taxable: 101694.92, igst: 18305.08, cgst: 0, sgst: 0, cess: 0, docId: ID.invoice, transactionId: ID.laptop, treatment: "reverse_charge", rcmPaymentId: ID.gstTax, rcmPaidOn: "2026-04-20" }],
      gstAdvances: [{ id: local(47), gstin: "29AAACK1234F1Z5", number: "ADV-1", date: "2026-04-03", party: "Acme", partyGstin: "", supply: "services", taxable: 1000, igst: 180, cgst: 0, sgst: 0, cess: 0, adjustments: [{ invoiceId: ID.invoiceGst, date: "2026-04-05", taxable: 1000, igst: 180, cgst: 0, sgst: 0, cess: 0 }], docId: ID.invoice }],
      gstFilings: [{ id: local(48), gstin: "29AAACK1234F1Z5", period: "2026-04", form: "GSTR-3B", filedOn: "2026-05-20", arn: "AA290526", docId: ID.handoff }],
      rules: [], policy: { require: { capitalise: true, postDepreciation: true, taxTreatment: true, historicalCorrection: true, finaliseAccounts: true, closePeriod: true, activateRule: true, createEntity: true }, capitalisationMinByEntity: { [ID.company]: 10000 } },
      findings: [{ key: `unposted:${ID.laptop}`, status: "open", note: "", at: "2026-05-01" }],
      ruleDecisions: [{ changeId: "30000000-0000-4000-8000-000000000001", status: "dismissed", at: "2026-04-01" }],
      fieldMappings: { "Invoice No": "number" },
      taxCredits: [{ id: local(49), entityId: ID.person, fy: "2026-27", kind: "tds", amount: 12000, source: "26AS", docId: ID.form16, transactionId: ID.gstTax }],
      savedDrafts: [{ id: local(50), form: "ITR-3", period: "2025-26", ref: "draft-1", createdAt: "2026-05-01", data: { sourceEntries: [ID.groceries] } }],
      salaryEvidence: [{ entityId: ID.person, fy: "2026-27", amount: 1800000, docId: ID.form16 }],
      itrHandoffs: [{ id: local(51), entityId: ID.person, fy: "2025-26", version: 1, createdAt: "2026-05-02", docId: ID.handoff, status: "sent", totalIncome: 1800000, open: 0 }],
      taxDeductions: [{ id: local(52), entityId: ID.person, fy: "2026-27", section: "80C", amount: 150000, evidence: "PPF passbook" }],
      entityTaxProfiles: [{ id: local(53), entityId: ID.company, fy: "2026-27", ownershipPct: 60 }],
      loanBalances: [{ id: local(54), loanId: ID.loan, amount: 950000, asOf: "2026-04-30", docId: ID.loanDoc, sourceQuote: "Outstanding 9,50,000", confirmedAt: "2026-05-01" }],
      priceOverrides: [],
    },
  };
  const evidenceSnapshot = { ledger: [{ id: ID.groceries, amount: 2500 }], registers: { journals: [{ transactionId: dep }] } };
  return {
    app: "ledgerline", version: 3, owner: OWNER_A, name: "K", exportedAt: "2026-11-09T00:00:00Z",
    data: {
      finance_preferences: [{ owner_id: OWNER_A, data: prefs }],
      family_members: [{ id: ID.spouse, owner_id: OWNER_A, name: "Asha", relation: "Spouse" }],
      accounts: [
        { id: ID.bank, owner_id: OWNER_A, name: "HDFC Savings", kind: "savings", opening_balance: 50000, details: {} },
        { id: ID.card, owner_id: OWNER_A, name: "HDFC Visa", kind: "credit_card", opening_balance: 0, credit_limit: 200000, details: {} },
        { id: ID.assetAcct, owner_id: OWNER_A, name: "Fixed assets", kind: "other_asset", opening_balance: 0, details: {} },
        { id: ID.coBank, owner_id: OWNER_A, name: "KR Current", kind: "current", opening_balance: 250000, details: {} },
        { id: ID.usdWallet, owner_id: OWNER_A, name: "USD wallet", kind: "wallet", opening_balance: 0, details: { payeeId: ID.payee } },
      ],
      category_budgets: [{ owner_id: OWNER_A, category: "Groceries", monthly_amount: 8000 }],
      expenses: [
        expense(ID.groceries, { title: "Groceries", merchant: "Big Bazaar", amount: 2500, account_id: ID.bank, member_id: ID.spouse, splits: [{ memberId: ID.spouse, amount: 1000 }, { memberId: null, amount: 1500 }], allocations: [{ category: "Groceries", amount: 1500, memberId: ID.spouse }, { category: "Household expenses", amount: 1000, memberId: null }], description: "Claimed on LL-DES-20260410-100000", receipts: [{ path: `${OWNER_A}/receipts/groceries.jpg`, name: "groceries.jpg", type: "image/jpeg" }], statement_ref: "HDFC 0412" }),
        expense(ID.laptop, { title: "Laptop", merchant: "Dell", category: "Equipment", amount: 120000, expense_date: "2026-04-05", account_id: ID.coBank, scope: "business", entity_id: ID.company, entity_source: "manual", receipt_details: { accounting: { primary: true, requestId: "req-1", journal: { id: local(60), entityId: ID.company, date: "2026-04-05", kind: "adjustment", description: "Capitalise laptop", documentIds: [ID.invoice], legs: [{ code: "FA", label: "Fixed assets", role: "asset", debit: 120000, credit: 0, accountId: ID.assetAcct, source: { docId: ID.invoice, page: 1, quote: "Total", head: "fixedAssets", detail: 0, line: 1, printedAmount: 120000 } }, { code: "BANK", label: "Bank", role: "asset", debit: 0, credit: 120000, accountId: ID.coBank }] } } } }),
        expense(ID.hotel, { title: "Hotel", merchant: "Taj Mahal Hotel", category: "Travel", amount: 16600, currency: "USD", original_amount: 200, fx_rate: 83, fx_date: "2026-04-14", expense_date: "2026-04-14", account_id: ID.card, scope: "official", payee_id: ID.payee, payment_instrument_id: ID.instrument, reimbursement_status: "received", reimbursement: { stage: "received", reimbursable: 16600, payer: "AET", receipts: [{ id: ID.claimBack, date: "2026-04-25", amount: 16600, txnId: ID.claimBack }] }, tags: ["Trip: Mumbai"] }),
        expense(ID.claimBack, { title: "AET reimbursement", category: "Reimbursement", amount: 16600, expense_date: "2026-04-25", account_id: ID.bank, txn_type: "reimbursement" }),
        expense(ID.transferOut, { title: "Card bill", category: "Transfer", amount: 5000, expense_date: "2026-04-28", account_id: ID.bank, to_account_id: ID.card, txn_type: "transfer", transfer_counterpart_of: ID.groceries }),
        expense(dep, { title: "Depreciation · Laptop · 2026-04", category: "Depreciation", amount: 3333.33, expense_date: "2026-04-30", account_id: ID.assetAcct, txn_type: "adjustment", adjustment_sign: -1, scope: "business", tags: ["depreciation"] }),
        expense(ID.loanIn, { title: "Home loan disbursal", category: "Loan", amount: 1000000, expense_date: "2024-04-01", account_id: ID.bank, txn_type: "income" }),
        expense(ID.rent, { title: "Society maintenance", category: "Housing", amount: 3000, expense_date: "2026-04-20", account_id: ID.bank }),
        expense(ID.gstTax, { title: "RCM GST", category: "Taxes and duties", amount: 18305.08, expense_date: "2026-04-20", account_id: ID.coBank, scope: "business", entity_id: ID.company, entity_source: "manual", receipt_details: { accounting: { primary: false, requestId: "req-2", journal: { id: local(62), entityId: ID.company, date: "2026-04-20", kind: "adjustment", description: "Settle RCM accrual", documentIds: [ID.invoice], legs: [], settlement: { entryId: ID.laptop, journalId: local(60), balanceCode: "AP", amount: 18305.08, snapshot: { date: "2026-04-20", amount: 18305.08, accountId: ID.coBank, txnType: "expense", category: "Taxes and duties", allocations: [{ category: "Taxes and duties", amount: 18305.08, memberId: ID.spouse }] } } } } } }),
      ],
      expense_drafts: [
        { id: ID.draftOpen, owner_id: OWNER_A, status: "ready", transaction_id: null, data: { amount: "450", accountId: ID.card, toAccountId: ID.bank, memberId: ID.spouse, instrumentId: ID.instrument, tripId: ID.trip, shares: { me: "200", [ID.spouse]: "250" } }, receipts: [{ path: `${OWNER_A}/drafts/${ID.draftOpen}/photo.jpg`, name: "photo.jpg", type: "image/jpeg" }] },
        { id: ID.groceries, owner_id: OWNER_A, status: "saved", transaction_id: ID.groceries, data: { amount: "2500", accountId: ID.bank }, receipts: [] },
      ],
      commitments: [{ id: ID.commitment, owner_id: OWNER_A, name: "Rent", kind: "bill", direction: "out", amount: 25000, frequency: "monthly", next_due: "2026-05-01", account_id: ID.bank }],
      loans: [{ id: ID.loan, owner_id: OWNER_A, name: "Home loan", principal_outstanding: 950000, annual_rate: 8.5, emi: 12000, next_due: "2026-05-05", account_id: ID.bank, source_transaction_id: ID.loanIn, payments: [{ date: "2026-04-05", principal: 5000, interest: 7000, total: 12000 }] }],
      goals: [{ id: ID.goal, owner_id: OWNER_A, name: "Emergency", target: 300000, saved: 50000, monthly: 10000 }],
      asset_valuations: [{ id: ID.valuation, owner_id: OWNER_A, account_id: ID.assetAcct, value: 112000, valued_on: "2026-06-30", source: "manual" }],
      documents: [
        { id: ID.invoice, owner_id: OWNER_A, title: "Dell invoice", file_path: `${OWNER_A}/docs/invoice.pdf`, file_name: "invoice.pdf", transaction_id: ID.laptop, entity_id: ID.company },
        { id: ID.statement, owner_id: OWNER_A, title: "HDFC April", file_path: `${OWNER_A}/docs/hdfc-apr.pdf`, file_name: "hdfc-apr.pdf", account_id: ID.bank },
        { id: ID.loanDoc, owner_id: OWNER_A, title: "Sanction", file_path: `${OWNER_A}/docs/sanction.pdf`, file_name: "sanction.pdf", loan_id: ID.loan },
        { id: ID.invoiceRevised, owner_id: OWNER_A, title: "Dell invoice (revised)", file_path: `${OWNER_A}/docs/invoice-v2.pdf`, file_name: "invoice-v2.pdf", replaces_id: ID.invoice, transaction_id: ID.laptop },
        { id: ID.dematStmt, owner_id: OWNER_A, title: "CDSL CAS", file_path: `${OWNER_A}/docs/cas.pdf`, file_name: "cas.pdf" },
        { id: ID.lease, owner_id: OWNER_A, title: "Lease deed", file_path: `${OWNER_A}/docs/lease.pdf`, file_name: "lease.pdf" },
        { id: ID.form16, owner_id: OWNER_A, title: "Form 16", file_path: `${OWNER_A}/docs/form16.pdf`, file_name: "form16.pdf" },
        { id: ID.handoff, owner_id: OWNER_A, title: "ITR handoff", file_path: `${OWNER_A}/docs/handoff.zip`, file_name: "handoff.zip" },
      ],
      period_close_evidence: [{ id: ID.evidence, owner_id: OWNER_A, period_id: "fy2024-25", action: "closed", request: { action: "closed" }, evidence: evidenceSnapshot }],
      imported_period_history: [{ id: "abc123", owner_id: OWNER_A, history: { preferenceHistory: [] } }],
      demat_accounts: [{ id: ID.demat, owner_id: OWNER_A, broker: "Zerodha", dp_id: "IN300000", client_id: "12345678", holder: "K" }],
      security_holdings: [{ id: ID.holding, owner_id: OWNER_A, demat_id: ID.demat, isin: "INE002A01018", name: "Reliance", quantity: 10, as_of: "2026-04-30", statement_value: 29000.5, lots: [{ date: "2025-01-01", side: "buy", quantity: 10, price: 2500, amount: 25000, source: ID.dematStmt }], gains: [{ isin: "INE002A01018", gain: 100, source: ID.dematStmt }], sources: [ID.dematStmt], events: [{ kind: "dividend", amount: 90, date: "2026-04-15", source: ID.dematStmt }] }],
    },
  };
}

/** Bytes for every file the fixture references. */
export function fixtureFiles(b: Backup): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  let n = 1;
  for (const e of [...(b.data.expenses ?? []), ...(b.data.expense_drafts ?? [])]) for (const r of (e["receipts"] ?? []) as { path: string }[]) out[r.path] = new Uint8Array([n++, 1, 2]);
  for (const d of b.data.documents ?? []) out[d["file_path"] as string] = new Uint8Array([n++, 9]);
  return out;
}
