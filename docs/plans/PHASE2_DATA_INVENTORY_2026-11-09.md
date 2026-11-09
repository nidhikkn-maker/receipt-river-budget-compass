# Phase 2 data inventory: legal entities, registers and relationships (2026-11-09)

**Status:** read-only research for Phase 2 (Gate C; FND-02, FND-03, FND-05, Decision 38/C15). No file other than this one was changed. No tests were run. No hosted service was contacted. Applied schema means `drizzle/migrations/0000–0088`; "proposed" means `.lovable/staged-sql/proposed/P1–P4` (not applied). Every claim is cited `file:line`. Section 8 is a **proposal**, not a decision.

Requirements in scope:
- FND-02 entity separation: `docs/specs/THAPAL_V4_MASTER_2026-11-09.md:5685-5697`
- FND-03 relationships and staged migration: `:5699-5715`
- FND-05 historical integrity: `:5731-5743`
- Permanent IDs: `:2612-2660`, and REQ-LED-045 at `docs/registers/master/requirements.csv:803`
- Phase 2 plan: `docs/V4_RECONCILIATION_AND_PLAN_2026-11-09.md:232-246`
- C2/C4/C8/C15: same file, `:149-162`
- DN-P3-5 B and DN-P3-8 B: `docs/registers/master/p3_decisions.csv:6,9`
- DN-P3-9 (restore must not remap journal owner by guesswork): `p3_decisions.csv:10`
- Architecture rows ARC-04/05/06/12/34/36/54: `docs/registers/master/architecture.csv:5-7,13,35,37,55`

---

## 0. Key findings (summary)

1. **There is no legal-entity table.** Companies and people are a JSON array `finance_preferences.data.entities`, written by `src/lib/preferences.ts:82` and cleaned by `src/lib/entities.ts:102-115`.
   - The identifier is the JSON `id` string. New records get `crypto.randomUUID()` (`src/routes/_authenticated/entities.tsx:30`, `src/lib/books/entity-accounts.ts:41`). Intake records reuse a run id (`src/components/DocumentIntake.tsx:41,132`).
   - Every database column that refers to an entity is **untyped `text` with no foreign key**: `expenses.entity_id` (`0065:1`), `documents.entity_id` (`0075:1`), `entity_members.entity_id` (`0075:6`) and `opening_postings.entity_id` (`0061:4`).
   - Personal ("Me") has **no record at all**: `null` means personal (`entity-accounts.ts:19,61-64`).
2. **An entry's company is mostly derived, not stored.** `saveExpense` writes `entity_id` only for `entity_source='manual'`; otherwise it writes NULL (`src/lib/fx.functions.ts:102`).
   - The company is then derived at read time from JSON `books.entityAccounts` through `effectiveEntity` (`entity-accounts.ts:61-64`).
   - Consequences:
     - Moving an account to another company silently re-attributes all of its history (`entity-accounts.ts:67-69`). This is an FND-05 risk.
     - Company-member RLS (`0076:1-11`) never sees account-derived rows, because those rows have a NULL `entity_id`.
3. **"Me, Family, Business" workspaces are a separate concept from entities.**
   - `expenses.scope` is limited to `personal|family|business|official` (`0024:6`, `src/lib/expenses.ts:17`).
   - Splits are stored in `expenses.workspace_allocations`, at most 4 shares (`0024:7-8`, `src/lib/workspaces.ts:35-44`).
   - Name-keyed "organisations" add a third, unstable company notion: `Organisation: <name>` tags (`preferences.ts:174`), reimbursement profiles (`reimbursement-profiles.ts:10`) and `trip.organisation` (`travel.ts:21`).
4. **Over 30 financial registers live in one JSON row** (`finance_preferences.data` and `data.books`; `src/lib/books/types.ts:154-190`). Several of them hold independently editable money totals that FND-03 forbids. See section 2.
5. **Cross-account backup restore breaks references held inside JSON.**
   - `prepareRestore` remaps table row ids, including accounts, expenses and documents (`src/lib/backup.ts:32,44`).
   - Inside `finance_preferences.data` it remaps only `budgets[kind=person]` and `reimbursementSettings` (`backup.ts:55-60`).
   - All other JSON references to account, expense or document ids become orphans after a cross-account restore: `entityAccounts`, `assets.accountId/transactionId/docId`, `journals.transactionId` and the rest.
   - `demat_accounts` and `security_holdings` are not backed up at all (`backup.ts:3`).
6. **Entity-aware period checks are inconsistent (C4 / DN-P3-8):**
   - `guard_closed_period` ignores `closedPeriods[].entityId`. Any company's close therefore blocks every entry, personal ones included (`0058:23-35`).
   - `guard_journals_rules` looks up `assets[].entityId` (`0083:22,28,37`), but assets store `ownerEntityId` (`src/lib/assets.ts:18`). The lookup is always NULL, so company-scoped closes never protect journals or asset events.
7. **Everything proposed (P1/P2/P3) keys entities by that same JSON text id.** P1 builds storage paths from the hex of the UTF-8 text id. P2's `access_grants.entity_id` is `text`. P3's `entity_exists` checks JSON membership and skips personal entries.
   - Phase 2 must therefore **keep the legacy text key as a permanent, unique alias** so that P1/P2/P3 are not invalidated.
8. **Permanent readable IDs (Decision 38) do not exist.**
   - The only readable references are `LL-DES-YYYYMMDD-<6 hex of uuid>` (`src/lib/expenditure-statement.ts:134`) and its `LL-CLM-` variant (`src/lib/expense-claim.ts:28`). Neither is a running number, unique or stored as an identity.
   - Asset `tag` is free text that may be duplicated (`src/lib/books/asset-verification.ts:10-12`).

---

## 1. Where an entity, company, workspace or "Me/Family/Business" concept exists today

### 1a. Legal entity / company

| Location | Shape | Identifier | Stable? | Evidence |
|---|---|---|---|---|
| `finance_preferences.data.entities[]` | `EntityProfile {id,name,kind,pan,gstins,regNo,booksFrom,address,people,shareholding,related,verified…}` | `id` text. A UUID when created in the UI. In intake, the record id is the intake run UUID | Mostly. Not unique-enforced. `cleanEntities` slices the id to 64 characters for display. Hard delete and merge remove the record from JSON; ids are never reused, but they become orphans | `src/lib/entities.ts:14-36,102-115`; `entities.tsx:30,57-63`; `entity-accounts.ts:40-42`; `books/intake.ts:81-83`; `DocumentIntake.tsx:41,132` |
| Kinds | `individual, huf, proprietorship, partnership, llp, company, trust` | – | Enum in code and validated in SQL intake | `entities.ts:3-11`; `0085:19` |
| `books.entityAccounts` | `Record<entityId, accountId[]>`; each account has at most one company | Entity id is the key; values are `accounts.id` | Edits re-attribute history | `books/types.ts:173`; `entity-accounts.ts:1-37`; `0080:9` |
| `expenses.entity_id text`, `entity_source text ('account'\|'manual')` | Set only when manual | Text, no FK | Manual rows: yes. Account rows: derived | `0065:1-3`; `fx.functions.ts:102`; `store.tsx:297` |
| `expenses.receipt_details.accounting` | `AccountingJournal {id, entityId, …}` stored inside the expense row | Text | – | `books/accounting-journal.ts:11,43` |
| `documents.entity_id text` | Explicit company tag on a document | Text, no FK | – | `0075:1-2`; `store.tsx:324,827,857` |
| `entity_members` | Company access grants `(owner_id, entity_id text, member_id, can_write, revoked_at)` | Text | Survives entity deletion; `can_access_entity` never checks that the entity exists | `0075:3-29` |
| `grant_entity_access` / `my_shared_companies` | Look up `e->>'id'` in JSON; fall back to the name "Company" | Text | – | `0075:37-38`; `0077:2-6` |
| `opening_postings.entity_id text NOT NULL` | Unique `(owner_id, entity_id, fy)` among active rows | Text | – | `0061:1-16` |
| `books.closedPeriods[].entityId?` | Optional company scope of a period close | Text | – | `books/types.ts:15`; `0083:1-3` |
| JSON `entityId` / `ownerEntityId` on registers | `assets.ownerEntityId`, `properties.ownerEntityId`, `holdings.ownerEntityId`, `taxProfiles/taxCredits/taxDeductions/salaryEvidence/entityTaxProfiles/itrHandoffs/fyRecords.entityId`, `policy.capitalisationMinByEntity` | Text | – | `assets.ts:18`; `books/types.ts:12,30-31,57,95,110,133,181,191`; `entity-tax-profile.ts:8`; `itr-handoff.ts:12` |
| GST identity | `gstInvoices.gstin`, `gstFilings.gstin`, `gstAdvances.gstin` (entity implied through `EntityProfile.gstins`) | GSTIN text | – | `books/types.ts:135,143` |
| Storage folders | `<owner>/companies/<hex(UTF-8 entity id)>/<uuid>-<file>` | Hex of the entity text id | Reversible; tied to the text id | `src/lib/books/company-upload.ts:2-6,21`; `CompanyAccess.tsx:90-99`; storage policy `0078:4-8`; P1 path check `P1_security_containment.sql:169,254` |
| Personal | No record. `null` entity means personal; salary evidence uses the `"self"` sentinel | – | – | `entity-accounts.ts:19`; `books/types.ts:180` |
| Account → company suggestion | Name match or a "looks like business" regex preselects a company (or a new stub) when a statement account is created; the owner confirms | – | Heuristic. Must not be reused by the backfill | `NewStatementAccount.tsx:16-17`; `statements.tsx:368-370`; `entity-accounts.ts:44-47` |

### 1b. Workspace and organisation labels (not legal entities)

| Concept | Storage | Evidence |
|---|---|---|
| Workspace (Me/Family/Business/Official) | `expenses.scope` CHECK `personal,family,business,official` (originally `personal,business`) | `0002:28`; `0024:1-6`; `expenses.ts:17-20` |
| Workspace split | `expenses.workspace_allocations` jsonb, at most 4 shares, amounts in original currency | `0024:7-8`; `workspaces.ts:15-50` |
| Trip workspace / organisation | `trips[].primaryWorkspace`, `organisation` (name), `workspaceBudgets`, `organisationBudgets` | `travel.ts:21` |
| Organisation directory | The tag group "Organisation". Seeded names: VEI, MOVAC, AK Meridian, KR Enterprises. Entries are tagged `Organisation: <name>` | `preferences.ts:174`; `master-data.ts:13-23`; `workspaces.ts:53-59` |
| Reimbursement profiles | `reimbursementSettings.profiles[] {id, organisation (name), workspace, accountId…}`; `responsibilities[].shares[].organisation` | `reimbursement-profiles.ts:7-17,31-32` |
| Department (team model) | `expenses.department`, `profiles.department`, `department_budgets` | `0000:51,64-68`; `0066:56-62` |
| Family members | `family_members`, `expenses.member_id` FK, `expenses.splits[].memberId` | `0002:1,29`; `0011:7-11` |
| Workspace in home filter | `preferences.homeScope` | `preferences.ts:102` |

None of the labels in table 1b links to an `EntityProfile`. Mapping them to legal entities would be guesswork, which FND-02 forbids (`THAPAL_V4_MASTER:5693`).

---

## 2. Financial registers held as JSON in `finance_preferences.data`

There is one row per owner (`0007`). The top-level keys are listed in `preferences.ts:63-169`. The `books.*` keys are in `books/types.ts:154-190` and are cleaned by `cleanBooks` (`books/types.ts:207-248`).

Saves go through these paths:
- `save_reviewed_preferences`, a revision-checked save that stores a full before/after copy in `preference_approvals` (`0080:1-28`; client `store.tsx:431-458`).
- Document intake through `commit_document_intake_reviewed` (`0071:10`; `store.tsx:475-492`).
- Statement uploads (`store.tsx:459-472`).
- Some SQL functions: `irregularConfirmed` (`0015:52`) and trip actions, which read `trips` (`0034:9`).
- A service-role cron that appends prepared depreciation journals (`src/routes/api/public/jobs/monthly-depreciation.ts:22-36`).

**"Sensitive" sections** need approval (`0080:6-10`): `assets, entities, paymentInstruments, reimbursementProfiles`, and `books.{policy, rules, fieldMappings, entityAccounts, fyRecords, properties, leases, propertyCosts, assetEvents, holdings, priceOverrides, goldRate, taxProfiles, entityTaxProfiles, taxCredits, taxDeductions, salaryEvidence, gstInvoices, gstFilings, loanBalances}`. `trips`, `receivables`, `payees`, `books.journals` and `gstAdvances` are **not** in that list.

Unreadable records are kept in storage and listed for review (`preserve-records.ts:111,150`). Retention marks every financial list as uncapped (`retention.ts:16-63`).

Column "Indep. total" marks records that hold an independently editable money total (FND-03 says this must not happen; REQ-LED-002 at `requirements.csv:184`).

| Key path | Record shape (main fields) | id field / format | References | Cleaner | Writers | Main readers | Indep. total |
|---|---|---|---|---|---|---|---|
| `entities` | §1a | `id` UUID or run UUID | – | `entities.ts:102` | `entities.tsx:57-63`, `BelongsTo.tsx:33`, `statements.tsx:370`, intake `books/commit.ts:27` | corporate statements, tax, P1/P2/P3 SQL | – |
| `assets` | `Asset {id,name,kind,cost,inUse,ownerEntityId,sharePct,bookMethod,docId,docIds,transactionId,accountId,paymentId,openingWdv,adjustments,saleValue,tag,location…}` | `id` UUID, or `<runId[0:30]>-asset` from utility/deed intake (`DocumentIntake.tsx:205`) | entity (`ownerEntityId`), ledger account (`accountId`), purchase entry (`transactionId`), documents | `assets.ts:157-162` | `assets.tsx`, `AssetBooks.tsx`, `AssetCheck.tsx`, `DocumentIntake.tsx`, `ReceiptAssetHandoff.tsx` | depreciation, `corporate-statements`, tax, wealth | **Yes**: `cost`, `openingWdv`, `adjustments`, `saleValue` (`assets.ts:15,44,53-56`) |
| `receivables` | `{id,customer,invoiceNo,date,dueDate,amount,gst}` | `id` | **None**. "Paid" is found by fuzzy-matching income entries (±₹1 plus name) | `receivables.ts:9-12,15-26` | `receivables.tsx`, `OpeningBalances.tsx` | receivables, GST months | **Yes**: `amount`, `gst` |
| `payees` | `{id,name,type,identifiers,accountDetails,…}` | `id` | `expenses.payee_id` (text, `0046:1`); `accounts.details.payeeId` | `payees.ts:25-36` (drops invalid records) | `PayeeDirectory.tsx`, `PayeePicker.tsx` | review, recipient balances | – |
| `trips` | `TravelTrip {id,name,destination,start,end,budget,currencies,type,travellers,bookings[],itinerary[],advances[],budgetLines,organisation,primaryWorkspace,…}` | `id` UUID. **Entries link by the tag `Trip: <name>`** and by `expenses.trip_id` only for advances/settlements | entries by name tag (`intelligence.ts:209-213`, `trip-actions.ts:6`); `bookings[].expenseId` | inline array check `preferences.ts:243`; `validateCompleteAllocations` `store.tsx:433-436` | `trip/*.tsx`, `new.tsx`, SQL trip actions `0034` | travel, claims, calendar | Budget is a plan (allowed). **Yes**: `advances[].amount` and `bookings[].amount` (`travel.ts:16,18`) |
| `paymentInstruments` | `{id,type,nickname,handle,…,accountId}` | `id` | account | inline | `PaymentMethodsManager.tsx`, `connections.tsx` | entry form | – |
| `reimbursementSettings` | profiles, mappings, responsibilities (`entryId`, organisation shares) | profile `id` UUID | account, entry, organisation **name** | `reimbursement-profiles.ts` | settings screens | claims | – |
| `budgets`, `allocationPlans`, `milestones`, `coolingOff`, `contractObligations` | plans | `id` | category/person/tag | inline | various | planning | Plans only |
| `statementUploads`, `statementBatches`, `statementBalances` | upload undo evidence; balances by account id | `id` ≤64 characters; account-keyed maps | entries, accounts, documents | `preferences.ts:203-204,304-322` | Statement Desk | Statement Desk, reconciliation | `statementBalances` is evidence |
| `books.closedPeriods` / `periodLog` | `{id,from,to,entityId?,closedOn,note}` | `id` | entity | `types.ts:213-214` | `change_accounting_period` (`0070:16`, `0084`) | guards `0058`, `0083`, `0069` | – |
| `books.docLinks` | `{docId,kind,targetId,label}` (kinds: entity, asset, property, lease, loan, transaction, supplier, investment, insurance, fy, gst) | **No id** | generic polymorphic link | `types.ts:215` | intake `commit.ts` | DocuRepo | – |
| `books.fyRecords` | audited prior-year figures, schedules, versions | `id` (intake reuses the previous id) | entity, documents | `types.ts:218` | `TaxCentre.tsx`, `commit.ts` | opening balances, compliance | **Yes**: `audited`, `confirmedOpening` (evidence-backed, but editable) |
| `books.properties` | `{id,name,ownerEntityId,address,assetId,buildings[floors[units]],valuation,docIds,links{loanId,depositAccountId,…}}` | `id`; nested unit/floor/building ids | entity, asset, loan, account, documents | `types.ts:219` | `PropertyPanel.tsx`, `commit.ts` | property, tax | **Yes**: `valuation.value` |
| `books.leases` | `{id,propertyId,unitId,tenant,start,end,rent,deposit,accountId,…}` | `id` | property, unit, account, document | `types.ts:220` | `PropertyPanel.tsx`, `commit.ts` | rent matching, tax | **Yes**: `rent`, `deposit` (terms; rent receivable not posted, `requirements.csv:208`) |
| `books.propertyCosts` | `{id,propertyId,date,kind,vendor,amount,transactionId?,docId?}` | `id` | property, entry (optional) | `types.ts:221` | `PropertyPanel.tsx` | property P&L | **Yes**: `amount` when not linked |
| `books.assetEvents` | `{id,assetId,date,kind,value?,docId?,to?,applied?}` | `id` | asset, document | `types.ts:222` | `AssetBooks.tsx`, `AssetCheck.tsx`, `commit.ts` | assets ledger | **Yes**: `value` (impairment, revaluation, disposal) |
| `books.journals` | depreciation `{id,assetId,period,amount,status,postedOn,transactionId}` | `id` = `stableUuid("journal", assetId, month)` (SHA-1, v5-style) | asset, entry | `types.ts:223` | cron `monthly-depreciation.ts:29-36`; `AssetBooks.tsx:141-148` | statements, period figures | Derived from asset; immutable once posted (`0083:21`) |
| `books.holdings` | `{id,kind,name,isin,quantity,ownerEntityId,sharePct,costBasis,cashAccountId,currency,bond…}` | `id` | entity, account | `types.ts:224` | `MarketPanel.tsx`, `InvestmentReview.tsx`, `DocumentIntake.tsx` | portfolio, net worth | **Yes**: `quantity`, `costBasis` (`requirements.csv:184`) |
| `books.quotes`, `snapshots`, `fxRates`, `goldRate`, `priceOverrides` | prices and net-worth snapshots | `key` / date | – | `types.ts:211,225-229` | market panel | wealth | `snapshots.netWorth` is a stored derived figure |
| `books.taxProfiles`, `entityTaxProfiles`, `taxCredits`, `taxDeductions`, `salaryEvidence`, `itrHandoffs`, `savedDrafts` | tax workpapers | `entityId` for profiles; `id` for the rest; `entityId+fy` for salary | entity, entry, document | `types.ts:230,240-245` | `TaxCentre.tsx`, `commit.ts` | tax | **Yes**: credit, deduction and salary amounts (evidence) |
| `books.gstInvoices`, `gstFilings`, `gstAdvances` | invoice register | `id` | GSTIN, entry, document, `amendsId` | `types.ts:231-233` | `TaxCentre.tsx`, `commit.ts` | GST returns | **Yes**: taxable/tax amounts (not posted, `requirements.csv:199`) |
| `books.loanBalances` | lender-statement evidence `{id,loanId,amount,asOf,docId,sourceQuote}` | `id` | `loans.id`, document | `types.ts:212` | `LoanBalanceReview.tsx` | loans | Evidence, but a second balance source (`architecture.csv:32`) |
| `books.rules`, `policy`, `findings`, `ruleDecisions`, `fieldMappings`, `proposedFields`, `retentionYears`, `allocationOrder` | settings and audit | `id`/`key` | – | `types.ts:216-246` | audit/tax | – | – |

Readers that combine entity and register data: `corporateStatements` (`src/lib/books/corporate-statements.ts:40-41`, called from `report-centre.ts:182`), `company-summary.ts`, `company-report.ts`, `recon.ts` (intercompany), `audit-dashboard.ts:10`, `from-entities.ts`, and `assistant.functions.ts:39,81`. Every `effectiveEntity`/`ownerOf` caller derives entity by account; full list from grep: `BelongsTo.tsx`, `company-summary.ts`, `corporate-statements.ts`, `reconciliation-exceptions.ts`, `gst-reconciliation.ts`, `accounting-journal.ts`, `shared-company.ts`, `company-report.ts`, `expenses.tsx`, `reports.tsx`, `new.tsx`, `audit.tsx`.

---

## 3. Relational tables holding financial records

| Table | Owner column / RLS predicate | Entity / account linkage columns | FKs | Unique constraints | Evidence |
|---|---|---|---|---|---|
| `expenses` | `employee_id = auth.uid()` (`0002:42-51`); RESTRICTIVE policy requiring linked accounts, members and receipt paths to belong to `employee_id` (`0011:7-11`, amended `0066:65-71`); team roles `can_access_expense` (`0066:56-79`); company members by `entity_id` (`0076:1-7`) | `account_id`, `to_account_id`, `entity_id` (text), `entity_source`, `scope`, `workspace_allocations`, `trip_id uuid` (no FK), `payee_id text`, `payment_instrument_id text`, `transfer_counterpart_of uuid` (no FK), `member_id`, `allocations`, `reimbursement`, `statement_ref`, `principal/interest` | `account_id`, `to_account_id` → accounts (SET NULL, `0005:16-17`); `member_id` → family_members (`0002:29`) | none beyond PK; index `0088` | `0000:64-77`; `0001:2-9`; `0024`; `0026:1-12`; `0046:1`; `0047:1`; `0065:1-3` |
| `accounts` | `owner_id = auth.uid()` (`0005:13`) | **No entity column**. Company comes from JSON `entityAccounts`; `details.payeeId` | – | none | `0005:1-13`; `0009:2-9` |
| `documents` | `owner_id` with linked-row ownership check (`0009:84-91`); entity members read/update/insert (`0075:58-64`, `0076:9-11`, `0078:1-3`); path CHECK on the first path segment (`0009:78`) | `entity_id` text, `transaction_id`, `account_id`, `loan_id`, `replaces_id` | → expenses, accounts, loans, documents (SET NULL) | none | `0009:58-91`; `0057:1-2`; `0075:1-2` |
| `loans` | `owner_id` (`0006:40`) | `account_id`, `source_transaction_id`; **no entity** | → accounts, expenses | none | `0006:27-40`; `0009:12-21` |
| `commitments` | `owner_id` | `account_id` | → accounts | none | `0006:5-26` |
| `asset_valuations` | `owner_id` with account ownership check | `account_id NOT NULL` | → accounts CASCADE | none | `0009:39-56` |
| `demat_accounts` / `security_holdings` | `owner_id` (`0056:14-15,35-36`) | **No entity, no account link** | holdings → demat CASCADE | `(owner_id,dp_id,client_id)`, `(owner_id,demat_id,isin)` | `0056:1-36`; `events` jsonb `0064:1` |
| `transfer_links` | `owner_id` | `debit_id`, `credit_id`, `source_account`, `dest_account` | none declared | – | `0047:4-12` |
| `opening_postings` | `owner_id` | `entity_id text NOT NULL`, `txn_ids uuid[]`, `source_doc_id` | none | active `(owner_id,entity_id,fy)` | `0061:1-16` |
| `expense_drafts` | `owner_id` | inside `data` jsonb (`accountId`, …), `transaction_id` | none | – | `0027:1-12` |
| `claim_preparations` | `owner_id` → finance_preferences | `data` jsonb | owner FK | – | `0040:1-5` |
| `entity_members` | read by owner or member (`0075:20-22`) | `entity_id text` | none | active `(owner_id,entity_id,member_id)` | `0075:3-16` |
| Others with owner FK to `finance_preferences(owner_id)` | `financial_corrections`, `statement_checkpoints`, `period_close_evidence`, `document_intake_commits`, `imported_period_history` (text id) | – | – | – | `0041:4`; `0042:3`; `0070:2`; `0071:5`; `0072:1` |

All FKs reference `id` only, never a composite `(owner_id,id)`. Cross-owner protection relies on RLS `WITH CHECK` subqueries (`0011:7-11`, `0009:84-91`). JSON-held ids (entity, trip, payee, instrument, asset) have no database integrity at all.

---

## 4. ID formats, readable IDs, and where ids are regenerated, reused or remapped

| Record | Current id | Readable ID today | Notes / evidence |
|---|---|---|---|
| Table rows (expenses, accounts, documents, loans, …) | `uuid DEFAULT gen_random_uuid()`; some are client-supplied (drafts share the transaction id, `0027:2`; `src/lib/AGENTS.md`) | none | REQ-LED-045 "no readable ID" (`requirements.csv:803`) |
| Depreciation entry | `stableUuid("depreciation", assetId, month)` (**not owner-scoped**) | none | `assets-ledger.ts:12-18`; `AssetBooks.tsx:144` |
| Depreciation journal | `stableUuid("journal", assetId, month)` | none | `assets-ledger.ts:112` |
| Intake-proposed entity/asset/property/lease/FY | intake `runId` (UUID) or `<runId[0:30]>-asset` | none | `DocumentIntake.tsx:41,132,205` |
| Entities and other JSON records | `crypto.randomUUID()` text | none | `entities.tsx:30`; `reimbursement-profiles.ts:23` |
| Expenditure statement / claim | – | `LL-DES-YYYYMMDD-XXXXXX` / `LL-CLM-…` (date plus 6 hex of a uuid; not sequential, not unique-enforced) | `expenditure-statement.ts:134`; `expense-claim.ts:28`; `ExpenditureReportBuilder.tsx:169` |
| Asset label | `tag` free text; duplicates detected only at scan time | – | `asset-verification.ts:10-12`; REQ-AST-018 (`requirements.csv:704`) |
| Trip | UUID; entries linked by **name** tag | – | REQ-TRV-023/024 (`requirements.csv:461-462`) |
| Derived UI ids | `loan-<id>`, `booking:<trip>:<id>`, … (not persisted) | – | `position.ts:69`; `travel-calendar.ts:21-47` |

Regeneration, reuse and remap points:
- **Cross-account restore** (`backup.ts:28-65`):
  - Every table row id is remapped (`:32`), along with the FK-like columns `id, account_id, to_account_id, member_id, transaction_id, loan_id, source_transaction_id` (`:44`).
  - File paths move to `<owner>/restored/<uuid>-<name>` (`:36`), so `companies/<hex>` folders are lost.
  - Inside JSON, only `budgets[person]` and `reimbursementSettings` are remapped (`:57-59`).
  - Server upsert is `ON CONFLICT (id) DO UPDATE` (`0072:19,30`).
  - `closedPeriods` and `periodLog` are preserved from the current account, not the backup (`0072:26`).
- **Same-account restore** keeps ids; it upserts over existing rows (`0072:30`).
- **Stable depreciation ids are not owner-scoped.** After a cross-account restore, asset ids are carried over verbatim in JSON. The restored owner and the original owner then derive the **same expense UUID** for the same asset-month, which collides on the global primary key. Needs a test.
- **Entity delete or merge** removes the JSON record but leaves `expenses.entity_id`, `documents.entity_id`, `entity_members`, `opening_postings`, `closedPeriods.entityId` and register `ownerEntityId` pointing at it (`entities.tsx:57-63`; `entity-accounts.ts:26-37`).
- **Offline:** stable entry UUIDs make sync idempotent (`AGENTS.md`). Device snapshot ids are copies of server ids.

---

## 5. How accounts link to entities, and how ledger rows link to everything else

| From → To | Mechanism | Integrity | Evidence |
|---|---|---|---|
| account → entity | JSON `books.entityAccounts[entity] ∋ accountId` (one company per account) | none; edits re-attribute history | `entity-accounts.ts:1-37` |
| entry → entity | `entity_source='manual'` → `expenses.entity_id`; otherwise derived from the account at read time | none | `fx.functions.ts:102`; `entity-accounts.ts:61-64`; P3 copies the same rule `P3:346-347` |
| entry → account | `account_id`, `to_account_id` FK | FK + RLS | `0005:16-17`; `0066:67-68` |
| entry → trip | `trip_id` (advance types only) or tag `Trip: <name>` | none; renaming a trip breaks the tag link | `fx.functions.ts:103`; `intelligence.ts:209-213` |
| entry → asset | `assets[].transactionId`/`paymentId` (asset to entry); depreciation entry id derived from asset | JSON only | `assets.ts:39,61`; `AssetBooks.tsx:144-148` |
| entry → property | `propertyCosts[].transactionId`; leases matched to rent receipts by account | JSON only | `types.ts:73,82` |
| entry → investment | `txn_type='investment'` to an investment account; holdings are separate (JSON and demat tables) | none | `requirements.csv:626` |
| entry → loan | `loans.source_transaction_id`; repayments via `principal/interest`; `loans.payments` jsonb | partial FK | `0009:18-20`; `0026:1-10` |
| entry → document | `documents.transaction_id` FK; `expenses.receipts` paths; `books.docLinks` | FK / JSON | `0009:73`; `types.ts:19-20` |
| entry → payee | `expenses.payee_id` text → JSON payee | none | `0046:1` |
| entry → accounting journal | `receipt_details.accounting` (JSON in the row) | none | `accounting-journal.ts:43` |
| asset → account / entity | `accountId` (ledger asset account), `ownerEntityId` | JSON only | `assets.ts:18,59` |
| property → asset / loan / account | `assetId`, `links.loanId`, `links.depositAccountId` | JSON only | `types.ts:59,80` |
| holding → account / entity | `cashAccountId`, `ownerEntityId` | JSON only | `types.ts:110,118` |
| demat / security holdings → anything | none (owner only) | – | `0056` |

---

## 6. What proposed P1/P2/P3 expect from an "entity"

| Proposal | Expectation | Evidence | Phase 2 implication |
|---|---|---|---|
| P1 | Requires `can_access_entity(uuid,text,boolean)` and `entity_members` | `P1:24-25` | Keep both signatures |
| P1 | `can_access_expense(_employee,_action,_entity text)`; rows with NULL entity are never team-reachable | `P1:41-55,76-86` | Account-derived rows (NULL `entity_id`) stay invisible to teams until stored entity is backfilled |
| P1 | Company upload path: `split_part(path,'/',3) = encode(convert_to(entity_id,'UTF8'),'hex')`; entity must exist in JSON `entities` | `P1:164-173,246-254` | **Entity key must remain the same text string** (path encodes it) |
| P1 | Blocks changing `documents.entity_id` and ownership | `P1:229-232,272` | Backfill must write `entity_id` through an approved path, not ordinary updates |
| P1 | `team_company_tax()` reads JSON `entities` and `books.entityTaxProfiles` | `P1:117-136` | Dual-read period must keep JSON populated |
| P2 | `access_grants.entity_id text`; `has_permission(_owner,_entity text,…)`; `invite_access` checks JSON `entities`; backfill/trigger copies `entity_members` | `P2:77-103,143-183,241-286` | Same text key; an existence check can later switch to the table |
| P3 | `accounting_postings.entity_id text NOT NULL` (1–200 characters); balance per (posting, entity, currency) | `P3:40,66-68,252-253` | Personal scope (DN-P3-5 B / C2) needs a **personal legal-entity row whose key is a non-empty text id** |
| P3 | `entity_exists` = JSON membership; iterates JSON `entities` only, so personal entries are never posted | `P3:168-171,348` | Phase 2 must supply a personal entity record before P3 revision |
| P3 | Entity derived through JSON `entityAccounts` at posting time | `P3:332,346-347` | Stored, dated account-to-entity assignment is needed to stop retroactive re-attribution |
| P3 | Uses `ll_closed_on(periods,date,entity)` (`0083:1-3`); wraps `restore_finance_backup` (`P3:805-812`) | – | Fix the asset `entityId`/`ownerEntityId` mismatch and the entity-blind `guard_closed_period` together (C4) |

---

## 7. Migration risks

| # | Risk | Evidence | Mitigation (proposal) |
|---|---|---|---|
| R1 | Legacy personal ownership is ambiguous. Personal = NULL; workspace `business`/`official` ≠ company; `Organisation:` tags are names; depreciation entries are hard-coded `scope:"business"` | `entity-accounts.ts:19`; `0024:6`; `preferences.ts:174`; `AssetBooks.tsx:145` | Backfill only explicit facts (manual `entity_id`, current `entityAccounts` snapshot, `ownerEntityId`). Everything else goes to the owner's personal entity **as an "unassigned" exception**, never to a company |
| R2 | Account-derived entity changes when accounts move | `entity-accounts.ts:61-69` | Dated `account_entity_assignments`; backfill freezes current links with `valid_from` = earliest entry, plus an exception list for accounts whose link changed (from `preference_approvals.previous_data`, `0080:1`) |
| R3 | Orphan entity ids after delete or merge | `entities.tsx:57-63`; `0075:23-29` | Pre-backfill orphan report; create "archived/unknown legacy entity" rows only with owner confirmation |
| R4 | Duplicate entities (same PAN/GSTIN/name); intake matching is name/PAN/GSTIN based | `books/intake.ts:75-83` | Unique `(owner_id, pan)` where present; duplicates surface in preview, never merged automatically |
| R5 | JSON references broken by cross-account restore | `backup.ts:44,55-60` | Phase 2 orphan scan; extend restore remap to the new tables; keep `legacy_id` |
| R6 | Records only in JSON; unreadable records preserved | `preferences.ts:205-208`; `preserve-records.ts:150` | Backfill reads **raw stored JSON** (not the cleaned view) and reports unreadable items |
| R7 | Name-keyed links (trip tag, organisation, reimbursement organisation) | `intelligence.ts:209`; `reimbursement-profiles.ts:10` | Store resolved FK beside the name; ambiguous names (duplicates) become exceptions |
| R8 | Two investment sources (demat tables vs JSON holdings), neither backed by ledger; demat not in backup | `0056`; `types.ts:224`; `backup.ts:3` | Separate tables with provenance; add to backup format (version 3) |
| R9 | Offline device snapshot is an unversioned JSON copy of preferences and entries | `store.tsx:61,233-237,429`; `offline.ts:14-15` | Keep JSON written during dual-read; add a snapshot schema version before read switch |
| R10 | Backup ZIP `version ∈ {1,2}` contains only 13 tables | `backup.ts:3,22`; `settings.tsx:87` | v3 adds new tables; v1/v2 restore keeps working through the legacy JSON path plus backfill |
| R11 | Entity-blind and broken entity checks in period guards | `0058:23-35`; `0083:22,28,37` vs `assets.ts:18` | Fix in the Phase 2/3 boundary migration with tests (C4) |
| R12 | Stable depreciation UUID not owner-scoped | `assets-ledger.ts:12-18` | Include owner (or the new asset UUID) in new derivations; keep old ids |
| R13 | Monthly cron writes preferences with service role, bypassing reviewed saves | `monthly-depreciation.ts:36` | During dual-write, the cron must also write the journal table or be paused |
| R14 | Historical totals must not change (FND-05) | `THAPAL_V4_MASTER:5737-5743` | Compare reports per entity/account/currency/period before and after; hashes of source JSON from `preference_approvals` |

---

## 8. Additive design sketch (**PROPOSAL, not approved, not applied**)

### 8.1 Tables

All tables get `owner_id uuid NOT NULL`, `uuid` primary key, `readable_id text`, `legacy_id text`, `source jsonb` (provenance: `{from:'finance_preferences', path, revision, sha256}`), `created_at`, `archived_at`. Every foreign key is composite `(owner_id, x_id) → (owner_id, id)` so cross-owner references are impossible without relying on RLS.

| Table | Key columns | Constraints |
|---|---|---|
| `legal_entities` | `id`, `owner_id`, **`entity_key text`** (= today's JSON `id`; for personal: a new deterministic key such as `personal:<owner uuid>`), `kind` (`individual_personal`, the current 7 kinds, `organisation`), `legal_name`, `pan`, `regno`, `is_owner_personal bool` | `UNIQUE(owner_id, entity_key)`; `UNIQUE(owner_id) WHERE is_owner_personal`; partial `UNIQUE(owner_id, pan)` |
| `entity_relationships` | `from_entity`, `to_entity`, `relation` (shareholder, partner, trustee, member, custodian, group), `pct`, `valid_from/to`, `evidence_doc_id` | FKs to `legal_entities` |
| `account_entity_assignments` | `account_id`, `entity_id`, `valid_from`, `valid_to`, `reason`, `decided_by` | Exclusion constraint against overlapping ranges per account |
| `trips` | trip fields; `entity_id` nullable (multi-entity via allocations) | – |
| `trip_bookings` / `trip_advances` | child rows | `advance.entry_id` FK; amounts become ledger references |
| `assets` | `entity_id`, `ledger_account_id`, `purchase_entry_id`, `property_id` | – |
| `asset_events` | asset events | – |
| `properties` / `property_units` | properties | – |
| `leases` | leases | – |
| `holdings` (JSON) plus demat link | holdings | – |
| `receivables` | `entity_id`, `settled_by_entry_id` | – |
| `gst_invoices` | `entity_id`, `transaction_id` | – |
| `tax_records` | tax workpapers | – |
| `depreciation_journals` | depreciation journals | – |

Financial totals: register rows keep *descriptive* fields only. Amounts (asset cost, advance, rent received, holding cost) are references to ledger rows or posting lines (Phase 3). Legacy totals are copied into `legacy_amount` read-only columns for the compare stage only.

Ledger linkage, additive only:
- On `expenses`: `legal_entity_id uuid` beside the existing `entity_id text`, plus `trip_uuid` FK.
- On `documents`: `legal_entity_id`.
- On `accounts`: nothing; accounts use `account_entity_assignments`.
- The existing text columns stay, so P1/P2/P3 keep working.

### 8.2 Readable permanent IDs (Decision 38)

- Table `readable_id_counters(owner_scope, prefix, year, next)`.
- `readable_id` is assigned by a `BEFORE INSERT` function inside the same transaction, with `UNIQUE(prefix-scope, readable_id)`.
- Formats from `THAPAL_V4_MASTER:2618-2633`: `TRP-YYYY-NNNN`, `AST-NNNNNN`, `PRP-NNNN`, `EXP-YYYY-NNNNNN`, `CLM-YYYY-NNNN`, `DES-YYYY-NNNN` (+`vN`), `EVT-/REM-/NTF-`.
- Never reused: archive instead of delete (`:2644`).
- `display_code` is a separate mutable column.
- Open decision for the owner: counter scope per owner or global ("PRP… across all owners", `:2625`). Backup restore must **not** renumber.
- Legacy `LL-DES-…` references stay in `legacy_id`.

### 8.3 Stages (FND-03 order, `THAPAL_V4_MASTER:5711`)

1. **Additive schema.** No triggers that change existing writes.
2. **Dual-read.** Readers prefer the table and fall back to JSON. Parity check runs in tests.
3. **Previewed backfill.**
   - A function reads raw `finance_preferences.data` and returns proposed rows, exceptions and the source sha256.
   - The owner confirms.
   - Commit is idempotent per `(owner, path, legacy_id)`.
4. **Compare report.** Counts, hashes, balances by entity/account/currency/period, and orphans (target is zero).
5. **Gated read switch.**
6. **Write switch.** `save_reviewed_preferences`, intake commit, cron, trip SQL and restore write the tables.
7. **JSON cleanup** only after separate approval.

### 8.4 Code paths that must stay compatible

| Area | Path |
|---|---|
| Client store | `src/lib/store.tsx:229-330` (load), `:431-458` (savePreferences), `:459-492` (statement and intake commits), `:521` (opening postings) |
| Expense save | `src/lib/fx.functions.ts:96-106` (`entity_id`/`entity_source`/`trip_id` contract) |
| Cleaners | `preferences.ts:192-252`, `books/types.ts:207-248`, `entities.ts:102`, `assets.ts:157`, `receivables.ts:9`, `payees.ts:25`, `preserve-records.ts:111-150` |
| SQL | `save_reviewed_preferences` and `sensitive_preference_sections` (`0080`), `commit_document_intake_reviewed` and `validate_intake_records` (`0071`, `0074`, `0085`), `guard_books_registers` (`0069`), `guard_journals_rules` and `ll_closed_on` (`0083`), `guard_closed_period` (`0058`), `change_accounting_period` (`0070`, `0084`), `restore_finance_backup` and `archive_backup_period_history` (`0072`), `grant_entity_access`, `can_access_entity`, `my_shared_companies` (`0075`, `0077`), trip actions (`0034`, `0035`), `post_opening_balances` (`0061`), entity RLS (`0076`, `0078`) |
| Proposed | P1 path/hex and `team_company_tax`; P2 `access_grants`/`invite_access`; P3 `entity_exists`/`derive`/`owner_of` and restore wrapper |
| Backup / offline | `backup.ts` (format v1/v2, `prepareRestore`), `settings.tsx:61-117`, `offline.ts:14-15` (snapshot), offline pending `ExpenseInput` |
| Jobs and servers | `monthly-depreciation.ts`, `report-jobs.server.ts:22`, `import-jobs.server.ts:77`, `push-dispatch.server.ts:20,61,82`, `assistant.functions.ts:39,81`, `statement-checkpoint.functions.ts:70`, `document-extract.functions.ts:96`, `booking-extract.functions.ts:13`, MCP read tools (`src/lib/mcp/`) |
| Company sharing UI | `CompanyAccess.tsx:22-99`, `books/shared-company.ts`, `books/company-upload.ts` |

### 8.5 Acceptance (from FND-02/03/05)

- Zero orphans after backfill.
- Exact source counts and hashes.
- Balances unchanged per entity/account/currency/period.
- Negative cross-tenant tests for read, write, import, export and attachment URLs.
- Restore (same-account, cross-account, v1/v2 ZIP) parity.
- Rollback leaves the 0088 state byte-identical.
- Tests run on PGlite isolation first, then on a production-like restored copy only with KK approval (`V4_RECONCILIATION…:293-299`).

---

## 9. Not verified here (open)

- Whether trip names are unique; renaming a trip probably orphans tag links.
- Whether any hosted data already contains entity ids longer than 64 characters or non-UUID ids.
- Actual row counts and orphan counts, which need a restored copy.
- PostgreSQL version.
- Whether the depreciation UUID collision (R12) occurs in practice.
- Whether any client still writes `entities` outside `savePreferences`.
