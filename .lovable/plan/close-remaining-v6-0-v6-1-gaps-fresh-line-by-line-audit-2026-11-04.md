# Close remaining v6.0 / v6.1 gaps (fresh line-by-line audit)

Two new independent audits re-read every line of both documents against the current app. They found 28 partial points in v6.0 and 14 in v6.1. Everything below is buildable now. Items that need you are listed at the end.

## Batch 1 — Documents never half-save (v6.0 §3, §7, §58, §59, §62)
- One upload is saved as a single all-or-nothing step: original file, extracted records and evidence lock commit together. If any step fails, nothing is posted and the upload shows "Retry".
- Every saved fact must carry its page or section. Facts with no location stay in review.
- Invoices uploaded through Statement Desk create a GST invoice draft (number, date, party, GSTIN, taxable value, tax split) for review, so nothing is typed twice.
- Missing asset details are looked up in existing records, related documents and payments before being asked for, as is already done for leases.
- Account and loan links are suggested automatically from account numbers, loan numbers and PAN/GSTIN, and confirmed in review.

## Batch 2 — No guessed asset or depreciation figures (v6.0 §27, §32, §33, §34, §66)
- Supplier, warranty, insurance and a likely matching payment carry over from the invoice into the asset proposal.
- The date the asset was put to use, its useful life and its residual value start empty and must be confirmed. Category values appear only as labelled suggestions.
- Capitalisation limits are set per company or person, not one owner-wide setting.
- The tax block calculation is fixed: depreciation is worked out on the block after additions and sales, with the half-rate for assets used under 180 days.
- Depreciation is prepared for every month that has passed and not yet been prepared. Posting still needs approval and still refuses closed months.

## Batch 3 — Rent, opening balances, tax and GST accuracy (v6.0 §19, §39, §45–47, §63)
- A receipt is treated as a security deposit only when its narration or a document says so. An amount equal to the deposit alone is no longer enough.
- Opening balances are compared per company, head by head (bank, receivables, payables, loans, assets, capital), against the audited closing figures. Confirming posts mapped opening entries to that company's accounts.
- A tax profile must be confirmed before tax or GST working is shown. No default regime or GST scheme is assumed, and the return form depends on whether there is business income.
- Capital gains use the holding period for each asset type (listed shares and equity funds, property, other assets), and unknown purchase dates are flagged instead of treated as short-term.
- Losses carried forward respect expiry years and amounts already used, and are counted once per year.
- GST payment matching requires the same GSTIN or entity, the return period window, and a challan reference when one is present. Liability uses the same eligible-credit filter as the draft.
- The GSTR-9 annual draft is laid out in its official table structure, with checks against the monthly returns.

## Batch 4 — Rules, schemas and search (v6.0 §10, §15, §49–51, §67)
- Official-source monitoring adds the form schema/utility pages and a property-compliance source. When a page changes, it records which forms or validations changed.
- Rule tests run the actual calculation before and after the change on sample cases, and approved values feed the tax, GST and depreciation calculations (no hard-coded rates).
- Return drafts for supported forms (ITR-1 to ITR-4, GSTR-1, GSTR-3B) are built and checked against the officially published JSON format. Other forms stay as labelled working papers.
- New-field proposals record a migration plan and a compatibility test result before approval.
- DocuRepo gets plain-language search, for example "Krupa company invoices above 1 lakh last year". It is turned into visible filters you can edit and respects your AI privacy setting.

## Batch 5 — Share prices and net worth (v6.1 §1–13)
- Prices are matched by ISIN plus exchange and instrument type, and the exchange is kept on demat holdings. Listed bond series from the same official files are included, and currencies use the existing server-side exchange rates.
- Each holding row shows exchange, price, price date, actual download time, trading status and a stale badge. Demat holdings with no price show "Price needed", never zero or a silent statement value.
- A failed price download marks the affected holdings stale, and the screen reloads prices when a download finishes. Fund NAVs refresh automatically after publication time.
- An investment account's balance is split into cash and securities, so securities are not counted both there and in holdings.
- Ownership share and legal owner apply to demat holdings too. Net worth can be filtered by owner, and bank values show whether they are reconciled.
- Net worth shows one valuation time and a quality summary covering every part (banks, shares, funds, property, loans). Home shows the last update time.
- History saves allocation including demat and accounts, and performance after money added or withdrawn. Alerts use that adjusted change, include demat, add corporate-action prompts, and let you set the unusual-value threshold in Settings.

## Batch 6 — Proof and acceptance (v6.0 §69–72, v6.1 §14–15)
- Tests for every point above, plus combined net-worth tests (brokerage cash, duplicates across sources, owner-aware demat), cross-company access tests with two isolated users, and a test that a failed step leaves nothing behind.
- Signed-in phone, iPad and desktop screenshots of each changed page.
- Evidence pack v2 with calculation samples, a list of market-data sources with their published terms, test results and screenshots. The original pack is kept unchanged.

## Needs you (cannot be completed by building)
- A licensed live (intraday) price provider. End-of-day prices stay until then.
- Publishing approval, which starts the daily price download and weekly rules check.
- A sample of your real documents with known correct values, to measure reading accuracy.
- Checks on your physical iPhone and iPad.
- The GLS sanction letter or an earlier loan statement.

## Technical notes
- Atomic intake: one security-definer database function per document run, owner-checked, idempotent on the run id. Storage upload is staged first and removed on failure.
- Changes stay in the existing pages (Statement Desk, DocuRepo, Assets, Tax, Audit, Wealth, Settings). No new tabs.
- Pure rules stay in the existing books modules with tests next to them. Nothing is published without your approval.

## Full gap register (every partial or missing point found)

v6.0
- §3 partial saves -> B1. §6 automatic account/loan/entity links -> B1. §7 page/section required -> B1. §10 plain-language search -> B4. §15 controlled field extension with migration test -> B4.
- §19, §63 per-company opening balance comparison and posting -> B3. §27 supplier/warranty/insurance/payment carried over; per-company capitalisation policy -> B2. §32 verified put-to-use date, useful life and residual value -> B2. §33 block depreciation after sales -> B2. §34 automatic monthly preparation -> B2. §66 tested schedules -> B2/B6.
- §39 deposit identification -> B3. §45 confirmed tax profile, no assumed defaults -> B3. §46 capital-gains holding periods; carry-forward expiry and use -> B3. §47 GST payment matching by GSTIN/period/challan; GSTR-9 tables -> B3. §48 validated drafts -> B4.
- §49 schema, validation and property-compliance monitoring -> B4. §50 substantive rule tests; approved rules feed calculations -> B4. §51, §67 official JSON-format drafts -> B4.
- §58, §62 invoices create GST drafts; required evidence lock -> B1. §59 trusted-record lookup for all required fields -> B1.
- §60, §69, §71.19, §72 devices, isolated end-to-end and cross-company access tests, accuracy/security/screenshot reports -> B6 (physical devices and accuracy sample need you).

v6.1
- §1, §4 brokerage cash vs securities, verified quantities, bond valuation rules -> B5. §2 bonds and currencies; source terms recorded -> B5/B6. §3 exchange and instrument type matching -> B5.
- §5 per-row status, real download time -> B5. §6 failure marks stale, never zero, reload after download -> B5. §7 automatic NAV refresh; source named accurately -> B5.
- §9 ownership-aware demat, owner filter, reconciled bank values -> B5. §10, §11 valuation time and full quality summary on Wealth and Home -> B5. §12 allocation and flow-adjusted performance -> B5. §13 corporate actions, demat alerts, configurable threshold, flow-adjusted alerts -> B5.
- §14, §15 combined tests and v2 evidence bundle -> B6. Live intraday prices and production schedules -> Needs you.

## Batch 7 — Found in the extra passes (v6.0 §2, §4, §20, §24, §39, §41, §45, §46, §52–54)
- Receipt photos on the Add expense page go through the same intake as Statement Desk (same reading, duplicate check and evidence store), so there is one way in.
- Audited statements and past returns are read for carried-forward losses (year, type, amount), which go to review instead of being typed.
- Real reconciliations: loan (lender statement balance, principal, interest and charges vs. ledger), supplier (statement vs. invoices, credit notes and payments), investment (statement quantities and transactions vs. records), and inter-company (matching entries between two companies, including within the business workspace).
- Tenant balances carry forward from the lease start, so older arrears and advances are never lost.
- Property costs link to the actual payment and bill, and feed property income/expense and GST.
- Personal tax working excludes records belonging to companies. Each company's working includes its own investment gains.
- Salary comes from Form 16 or payslips. TDS/TCS is read from uploaded Form 16, 26AS or AIS and proposed for confirmation.
- House property: interest limited to the legal cap, and a loss is carried into total income or forward instead of being dropped.
- Audit uses the same rent matching as Property (one receipt to one lease, full history, deposits and transfers included).
- Audit findings keep their real company and financial year instead of defaulting to "Personal" and the current year.
- The "Draft reports" tile counts drafts actually prepared and saved.

## Pass record
- Pass 1–2: section-level audits of v6.0 §§1–72 and v6.1 §§1–15.
- Pass 3: requirement-by-requirement cross-check of v6.0 lines 1–560, 560–1128 and all of v6.1 against the code and this plan. v6.1 found nothing new. v6.0 found the items in Batch 7.
- After building, a further full pass runs before the evidence pack, and any new finding is fixed in the same round.
