# Roadmap (Functional Requirements v1.0)
- [x] Fix Delete Data: in-app typed confirmation, visible errors, complete review/history cleanup and checked owner-file/offline cleanup; signed-in failure/cancel/mobile verified without wiping user data; 241 tests pass. Preview changes need publication.
- [x] Face ID on sign-in page: signed-in virtual platform credential registered and verified, dashboard opens without second prompt, biometric failure offers password, signed-out state cannot bypass sign-in; 235 tests pass. Publication and real iPhone verification remain pending.
- [x] Receipt details review before saving, persistent retry/manual entry; authenticated real OCR retry and corrected merchant/date/amount verified on mobile
- [x] Secure same-account password fallback; isolated verification, wrong-password lock retention and account-switch rejection tested; 223 automated checks pass; real iPhone verification remains pending
- [x] Detect possible duplicates in the bulk bill queue with review and skip controls; original-currency matching tested and two-file skip progression verified
- [x] Bulk categorisation undo and persistent audit history with safe restoration; authenticated apply/undo/reload, split restoration, retries and later-edit conflicts tested; 218 unit tests pass
- [x] Add a short ChatGPT setup guide to Connected Assistants; signed-in guide and endpoint copying verified
- [x] Request publication for ledgerline.biz; OAuth newly activated, four read-only tools extracted, guide checked desktop/mobile, permission checks and 218 unit tests passed
- [ ] Confirm ChatGPT approve/revoke end to end from the user's ChatGPT account — deployment confirmed serving (home 200, /mcp 401 OAuth challenge); guide with verification steps live on Connected Assistants page
- [x] Answer remaining-document audit: distinguish unbuilt functionality, publication/device validation and excluded native/Yaba scope
- [x] Continue document: secure device push setup, private test/daily payment reminders, production notification handling and 14 new tests; 146 total tests pass; live delivery still needs publication and device consent
- [x] Mutual fund portfolio: dated value and cash-flow-adjusted gain charts, fund/date filters and dated history; 25 focused tests pass, saved ₹13,405.87 read back, desktop/mobile checked, build OK
- [x] Yaba excluded at the user's request; no further review
- [x] Earlier: receipts + review, multi-currency, payment methods, bank reconciliation, family, splits, budgets, reports
- [x] Accounts + ledger, transaction types, tags, merchant memory, 5-tab nav (Home, Activity, AI, Insights, Wealth)
- [x] Voice/typed entry ("Spent ₹2,500 on dinner using AMEX yesterday")
- [x] Recurring income/bills/subscriptions/EMIs, calendar, mark paid, subscription detection
- [x] Credit card limit/due day/utilisation; loans with schedule + prepayment simulator; goals & reserves
- [x] Forecast (7–90 days, shortfall dates) and safe-to-spend with breakdown
- [x] AI assistant using engine figures only
- [x] Backup / restore / delete all; privacy (hide amounts)
- [x] Editable categories (rename/merge/archive/reorder) + grouped tags
- [x] Receipt tax & line items; XLSX/text-PDF statement import, reviewed missing entries and duplicate warnings
- [x] Family/project/travel/annual budgets with carry-forward; category Insights drill-down; hide/reorder Home sections
- [x] Searchable receipt vault, owner-scoped offline queue, in-app upcoming-payment reminders, theme settings
- [x] Real email/Google/Lovable sign-in and verified passkey device lock; existing anonymous records can upgrade by email

## Production completion (PRD gap list, Oct 31)
- [x] Continue: dated mutual fund NAV valuations, legacy XLS imports and signed-in reimbursement/EMI/offline synchronization checks
- [x] Continue: all-or-nothing record restore with staged files; catalog-aware extraction; transfer direction/account matching; signed-in restore and extraction checks
- [x] Schema: card details (issuer, last four, statement day, interest), loan details (provider, type, original, start, prepayment terms, foreclosure %, linked account, payment log), reimbursement status, documents, valuations, transaction audit trail, push subscriptions
- [x] Credit card module: billing cycle, statement vs unbilled, payments since statement, paid/partly paid/pending, interest & charges, EMI conversions, utilisation alerts
- [x] Loans: full details, record EMI (principal vs interest split), foreclosure charges in simulator, full schedule, closure date
- [x] Ledger integrity: reimbursements + pending reimbursements, reconciled balance, balance adjustment to actual, investment buy/redeem via transfers
- [x] Income: sources, expected vs received, late income
- [x] Subscriptions module: statuses, monthly/annual totals, renewals, price rises, duplicates
- [x] Calendar month view, planned purchases (one-off), configurable advance reminders, custom forecast range
- [x] Core Insights: monthly income vs spend, weekly trend, month comparison, merchants, accounts and net worth trends; date/person/scope/account/payment/search filters and account-filtered expense exports
- [x] Wealth: investment valuations with date/source and personal borrowings
- [x] Mutual fund NAV feed — authenticated MFapi daily quotes, explicit fund identity and published date, reviewed units and dated valuation snapshots; real ₹13,405.87 save/readback verified
- [x] Home: quick actions, day/week/month view, alerts, pending reimbursements, budget use, AI briefing, selected cash accounts
- [x] Document vault uploads (statements, insurance, loan, warranty) linked to transactions/accounts/loans, expiry reminders
- [x] Audit history shown per transaction
- [x] Settings: profile name, default currency, AI language/privacy controls, reminder lead days
- [x] Shortcut quick-add draft parameters (title, merchant, amount, currency, date, payment, account, scope, shared text); never auto-save or auto-send to AI
- [ ] Native iOS share-sheet file intake — requires a native wrapper; text links can prefill web drafts
- [x] AI: anomalies, budget recommendations, comparisons and savings ideas in verified facts; server-enforced AI privacy
- [x] User category catalogs in receipt/voice extraction — active saved catalog used server-side; custom receipt and voice categories verified
- [x] Reconciliation: CSV/XLSX credits and debit matching across the unified ledger, review type/account/amount, duplicate warnings
- [x] Statement direction/account-specific matching for transfers; ambiguous near-ties left for review; regression tests
- [x] Backup ZIP with receipt/document files; same/cross-owner restore mapping tests
- [x] Scanned PDF/screenshot statement extraction with explicit AI consent, saved privacy enforcement and mandatory review; screenshot debit/credit flow verified
- [x] Legacy XLS — maintained BIFF reader shared with XLSX, real binary fixtures, cover-sheet/header handling, debit and credit rows verified in signed-in review
- [x] Atomic backup record restore with fresh staged file paths, failed-restore rollback verification and all 10 existing backup records read back; paginated exports
- [x] Encrypted on-device cache
- [x] Web push implementation (device subscription, test push, authenticated dispatch route, production worker); signed-in Settings and unauthorized 401 checked; real-device delivery unverified
- [x] Signed-in checks: account creation, loan payment (₹980 principal + ₹120 interest), scheduled bill ₹750, replay without duplicate, document upload/search, ZIP download and AI loan answer
- [x] AI privacy off/on checked; six screens tested at 402×725 with no overflow or page errors; 113 automated tests passed
- [x] Signed-in checks: ZIP restore, deliberate invalid restore rollback, shortcut drafts, screenshot statement OCR, custom-category receipt OCR, voice category; no page errors
- [x] Signed-in checks: ₹432.10 reimbursement received/read back, ₹6,000 card purchase converted to 6-month EMI and read back, encrypted ₹123.45 offline entry queued and synced once after reconnect/reload; no page errors
- [x] 123 automated tests passed; current build OK; XLS review checked at 402×725 with no horizontal overflow
- [ ] Real-device passkeys — requires a compatible phone on a stable HTTPS origin (see below)

## Waiting on something outside the app
- [ ] Installed-app offline cold-start — needs publication; app workers intentionally disabled in preview
- [ ] Real iPhone Face ID — needs a compatible device on a stable HTTPS origin; simulated platform passkey verified
- [x] Managed reminder schedule prepared every 30 minutes with per-device daily deduplication; callbacks become usable after publication
- [ ] Live push acceptance — publish, install on a supported device, grant permission and verify real test/daily delivery
- [ ] Native-only items (Siri voice commands, iOS widgets) — not available to web apps; Shortcut quick-add link offered instead

## Document audit: additional partial requirements (not blocked externally)
- [x] Complete Insights charts: subscription expenditure, card utilisation, loan progress and savings trends
- [x] Add explicit tag/person-organisation-project filters to reports and consistent drill-down from charts to the underlying entries
- [x] Add recognised-text extraction for standalone vault documents (attached receipt OCR text already searchable)
- [x] Expand AI debt what-if and full sample-question acceptance checks; label hypothetical calculations
- [x] Complete developer handover: architecture/data/security notes, integration feasibility, delivery/test plan and ongoing cost assumptions
- [ ] Automatic financial connections — provider availability, consent and bank support must be established before implementation; not a promised live connection

## User requests (Oct 31, later)
- [x] Add CSV/PDF expense, actual reimbursement-payment and department-limit exports; all six signed-in downloads verified, report rules tested; department totals include only owner-visible filtered spending
- [x] Verify all seven signed-in flows and reload persistence; fix atomic receipt/yearly confirmation, exact claim remainder, invalid splits, simulator false-expense saving, merchant alias chains and trip input validation; 202 automated tests plus live replay/concurrency/rollback checks pass; temporary financial records removed
- [x] Fix alignment issues (mobile 402px)
- [x] Receipt add: separate Camera / Gallery / Files options
- [x] Save receipts to add later (pending receipt inbox)
- [x] New fonts; deeper blue palette with gold accent
- [x] Vault scan (camera/gallery/files) with auto-filled details
- [x] 10-year inflation, category and savings prediction with suggestions
- [x] Bank statement upload that works out and registers expenses automatically (with review for transfers/cash)
- [x] Stronger gold touch across the theme
- [x] V2 Phase 1: financial inbox, missing-transaction detector, data freshness, advanced reimbursements, category splits, monthly review, health score
- [x] V2 Phase 2: decision simulator, behaviour analysis, emergency fund, irregular expenses, milestones
- [x] V2 Phase 3: trips, merchant intelligence (merge/unmerge), weekly brief (in-app schedule)
- [x] Insights export filters: date-range, department and status filters scoping all CSV/PDF exports; signed-in check exported exactly the 33 filtered rows
- [x] Department summaries + CSV/PDF exports: usage %, remaining balance and over/within-budget status column; on-screen summary with progress bars
- [x] Bulk categorisation/recategorisation: select mode on Expenses with all/none, category picker, split-clearing apply; fixed empty-split-list validation; signed-in apply verified and test data restored
- [x] Bulk bill upload: pick several bills, each OCR-read and reviewed one by one with Bill n of N progress; two-bill signed-in run verified, test entries removed

- [x] Fix receipt reading failure (large phone photos)
- [x] Duplicate-receipt detection: SHA-256 file fingerprint stored per entry; re-using the same receipt warns with the matching entry and needs explicit override; signed-in flow verified
- [x] Receipt audit trail: OCR-read values vs owner corrections stored on the entry and shown in its detail dialog; signed-in correction (321 → 322.50) read back; 232 tests pass
- [ ] Test Face ID unlock on live site — blocked: needs a real iPhone with Face ID
- [x] Check published app on mobile for loading errors

- [x] Saved payment methods (UPI IDs, cards, wallets, cash) linked to bank accounts

## Version 3.0 — Autonomous Financial Intelligence (uploaded doc, Oct 31)
### Priority 1 — Immediate
- [x] Money Allocation Engine: /allocation page, suggested buckets, editable lines, saved plans in preferences, planned-vs-actual comparison, carry-forward; total ≤ funds enforced; signed-in suggest+save verified
- [x] Payment Readiness Monitor: Home strip with per-payment status (ready/shortfall/unknown/overdue/paid), account-aware projection, tappable full calculation; signed-in verified with seeded data (cleaned up after)
- [x] Financial Rules Builder: /rules page, 8 templates + custom rules, enable/notify toggles, triggered-now list with dismiss; 10 rule tests
- [x] Universal Financial Search: /search page, plain-language parsing (amounts, periods, methods, tags, statuses, record kinds), grouped results with navigation; 12 search tests
- [x] AI Statement-to-Action: added possible-duplicates group (held back unless user confirms), uncertain-category flags, recurring-payment hints; idempotent repeat-import test; 6 new tests
### Priority 2 — Advanced intelligence
- [x] AI Financial Autopilot: Home suggestions with calculations, Done/Later/Dismiss saved per owner; tested
- [x] Financial Stress Testing: Strategy → Stress test tab, 8 scenarios, never touches records; tested
- [x] Purchase Cooling-Off Assistant: Strategy → Cooling-off tab, queue + decisions saved per owner; tested
- [x] Contract & Obligation Intelligence: vault reads obligations with quotes; review, notice deadlines, explicit Add to plan; tested
### Priority 3 — Extended
- [x] Family Financial Requests: own sign-in invites, requests with evidence, approve/decline; no automatic transactions
- [x] Visual map on Links page connecting accounts, cards, loans, bills
- [x] Financial Memory: Strategy → Decisions tab, expected vs actual, review dates; tested
- [x] Personal Finance Knowledge Graph: Links page, derived connections + unlinked records; tested
### Acceptance (verify before declaring done)
- [x] Continue acceptance: capped optional allocation targets at remaining funds; signed-in suggest/save/reload/delete verified, pure-function no-mutation regression passes.
- [x] Continue acceptance: same-day scheduled payments reserve funds once in stable order; ₹40,000 + ₹8,000 against ₹45,000 available gives ₹3,000 shortfall, independent of input ordering.
- [x] V3 calculation regression pass: allocations, readiness, rules, search, repeat imports, simulations, autopilot, contracts, memory and graph checks pass in the full suite; cross-account family/search authorization acceptance still requires separate-account runtime verification, not source assertions.
- [x] Edit links on money map (record links + own links with reasons)
- [x] Connection reasons + key details on selection
- [x] Money map filters
- [x] Drag and save positions on money map

## Version 4.0 — Unified Expense & Travel (spec: .lovable/requirements-v4.md)
### Priority 1 — Unified financial foundation
- [x] Universal entry: one form opened from trips/bookings with context, including dedicated advances, card payments, loan repayments and investments.
- [x] Workspaces Personal/Family/Business/Official + organisation; suggestions with confidence, override, learning
- [x] Multi-workspace allocation (fixed/%/equal/custom, sums to total, charged once); payment ownership + auto claim
- [x] Automated categorisation incl. travel categories (one-tap catalog add, booking/merchant mapping)
### Priority 2 — Travel operations
- [x] Travel Manager: trips (types, mixed), travellers, bookings, itinerary, travel documents
### Priority 3 — Travel financial integration
- [x] Trip budgets (actual vs committed), booking-to-transaction linking, travel reports, multi-currency, reimbursements, advances/settlement
### Priority 4 — Intelligence and completion
- [x] Revisited all four Version 4 phases and completed the in-app gaps found in this pass: workspace/traveller/currency budget plans, primary workspace and organisation, richer booking details and existing payment/refund links, itinerary booking/document references, expanded travel catalog, closure balance checks and corrected reports. Full suite: 403 tests/48 files pass; latest build OK; 17 signed-in screens, saved plans, booking partial/full payments, reminders and calendars verified; six phone screens have no horizontal overflow. Temporary test records removed. Native capture, live-device acceptance and cross-account runtime verification remain outside this pass.
- [x] Report integrity: partial booking commitments use remaining balances in trip/planned/CSV views; mixed split/unsplit traveller rows and overlapping destinations reconcile; reimbursements use claim/receipt/outstanding amounts, not full expense amounts.
- [x] Add in-app reminders for upcoming booking payment due dates and overdue unpaid balances; respects saved lead days/toggle, subtracts partial payments, links to the correct trip; signed-in upcoming/overdue verified.
- [x] Add a calendar showing trip dates, booking due dates, itinerary and scheduled payment deadlines; available on Plan and Trips, month navigation and trip links checked signed-in.
- [x] Trip auto-association, trip insights, booking-payment match suggestions, trip closure, trip CSV
- [x] Dedicated advance/card-payment/loan/investment entry types in the shared form
- [x] Full 17-point acceptance pass
- [x] Trip picker on travel advances (trip_id column, no tag needed; tagged advances still count)
- [x] Principal/interest split on loan repayments (validated to sum to the payment; EMI split prefill from the linked loan)
- [x] Trip advance reconciliation (advances vs business/official spend vs returns, outstanding balance)
- [x] Loan repayment history (principal/interest totals, balance after each repayment)
- [x] Trip advance reconciliation CSV export (advances, trip expenses, returns, outstanding balance)
- [x] Loan repayment history chart (balance left after each repayment; EMIs recorded from the loan card count too)
- [x] Trip advance dashboard: outstanding advance balances across trips, linking to each trip's reconciliation (signed-in verified: ₹20,000 advance − ₹12,000 business spend → "return ₹8,000", Reconcile opens the trip)
- [x] Loan repayment history CSV export (payment dates, principal, interest, remaining balance; signed-in download verified)
- [x] Loan payoff projection (recent repayment average, EMI fallback)
- [x] Advance dashboard aging indicators and All/Unreconciled/Overdue filters (overdue = unsettled 30+ days after trip end)
- [x] Cross-trip travel reports (by trip, workspace, organisation/department, traveller, destination, category, payment account, planned vs actual, monthly & annual, reimbursements) with CSV and PDF; signed-in report totals matched the ledger (₹2,500 entry read back in every cut)
- [x] Trip plan: category budget lines plus a contingency allowance, showing each category's actual, remaining, over-budget flag and unbudgeted spending
- [x] Booking payment due dates, cancellation terms and part payments — a booking stays outstanding until its linked payments add up, then reads "Paid — linked to entry" (signed-in: ₹2,000 of ₹5,000 → "Part paid ₹2,000.00 · ₹3,000.00 still due" → fully paid)
- [x] Itinerary entries keep travellers and notes and show them in the plan
- [x] Full 17-point acceptance pass (Part G): one test per criterion in src/lib/acceptance-v4.test.ts, all 17 passing; 388 automated checks pass, typecheck clean

## Version 4.3 — UI/UX redesign & multi-theme system (requirements-v4.3.md)
- [x] Phase 1: theme tokens — 5 families / 7 styles, light+dark+system, persisted preference
- [x] Phase 2: navigation — compact header, Home|Activity|+|AI|More bottom nav, floating + opens Universal Entry
- [x] Phase 3: homepage — overview, readiness, 4 metrics, insights, commitments, recent, AI briefing, travel widget
- [x] Phase 4: appearance settings UI with previews, responsive iPhone/desktop refinement
- [x] Phase 5: validation — theme switching, entry flow, routes, calculations, 22 acceptance checks

## Version 4.4 — Universal entry redesign
- [x] Quick entry by default (amount, category, account, workspace, date, note) with compact Camera/Gallery/Files/Voice
- [x] Compact type selector, searchable categories and tags, compact workspace with optional split, More details section
- [x] Focused entry screen without header/bottom bar; sticky Save

## V4.4 additions (requirements-v4.4-additional.md)
- [x] Repeat expense + favourites (new draft dated today, no reimbursement/old-trip copy)
- [x] Smart default account/workspace from last confirmed expense
- [x] Scan / Upload / Voice / Repeat capture row; voice recognises all four workspaces

## V4.5 Processing & feedback (requirements-v4.5.md)
- [x] Shared spinner/loading Button (async onClick auto single-flight), ProcessingPanel stages, latest-request guard
- [x] Entry: receipt/voice stages + cancel, stale-response guard, duplicate-safe retry (stable draft id), save error + Retry
- [x] Assistant: status, Stop, stale guard; statement import progress panel
- [ ] Background task records for long jobs (not supported by current architecture)

## V4.4 Drafts & keyboard (requirements-v4.4-drafts.md)
- [x] No auto keyboard; Done key dismisses amount
- [x] Autosaved drafts with receipts, Resume later, close saves, restore, retry reading
- [x] Drafts page (Activity/More), multi-select delete with confirmation, waiting-expenses reminder
- [x] Extra bills from a multi-file upload become separate drafts
- [x] Offline drafts: encrypted on-device copy, auto-sync when back online
- [ ] Drafts not yet included in ZIP backups

## V4.6 Background processing (requirements-v4.6.md)
- [ ] Not started — saved, awaiting the go-ahead

## V4.7 PDF Reporting & Download Centre (spec: .lovable/requirements-v4.7.md)
- [x] Reports Centre: 31 report types, filters, colour/printer PDF, preview, download, share, history with regenerate versions
- [x] Report jobs keep running while you use other screens and notify with an Open action (closing the app still stops them)
- [x] Tamil/non-Latin table text in PDFs drawn via browser-shaped images (src/lib/pdf-unicode.ts); titles and bill-page labels stay Latin

## V4.8 Detailed Expenditure Statement (spec: .lovable/requirements-v4.8.md)
- [x] Statement for trips, event/project tags and individual business purchases, with payer/source/reimbursement summaries, register, line items and bills as annexures in one PDF; saved to report history
- [x] Expense Claim Submission Report (separate page, shared selection screen, declaration + approval lines, C-xx bill annexures)
- [x] V4.8 Universal: Summary + Bills claim format with remembered choice (workspace entry points still open, below)
- [x] Generate Statement buttons in Business/Official home views and on a single entry

## V4.9 Centralised Settings (.lovable/requirements-v4.9.md)
- [x] Financial Setup Status from real records (src/lib/setup-status.ts) + grouped searchable Settings directory
- [x] Contextual "Configure account" note in entry form when no accounts
- [x] Contextual add-account sheet that returns and auto-selects the new account
- [x] Guided setup assistant (skippable, reopenable)
- [x] Organisation directory and archive/reactivate controls across master records
- [x] Duplicate-record prevention for accounts/methods; acceptance scenarios 1–25

- [x] Tamil text in PDF titles, page footers and attached bill pages
- [ ] Security review before wide sharing

- [x] V4.10 typography (incl. 18-screen light/dark check at 375/402px, PDF table text 9pt): system font stack, regular/medium/semibold weights, tabular non-wrapping amounts, sentence-case labels, logo wordmark kept

## V5.0 Intelligent Usability (.lovable/requirements-v5.0.md)
- [x] Daily / Executive / Minimal home modes, restore default layout (reorder/hide existed)
- [x] Inbox shows unfinished drafts and reports ready this week
- [x] Already in place: smart quick entry, remembered defaults, drafts + offline recovery, single-flight saves, setup assistant, search, privacy toggle, offline entry
- [x] Reports Centre jobs recorded before generation; a per-minute server worker finishes abandoned ones (Tamil shows "?" in server-made PDFs; statements/claims with bills stay in-app)
- [x] Saved filter views on Transactions (templates covered by Repeat favourites)

## V5.1 Smart historical import (.lovable/requirements-v5.1.md)
- [x] New requests: imported/source opening and closing differences, original-page evidence, dated ledger differences, saved source verification and audit; scanned PDF worker tested after closing the upload page, extracted ₹200 plus ₹1,000/₹800 source balances. Mobile and saved review verified; temporary records removed.
- [x] Consolidated V5.0 specification saved and current architecture audited; remaining programme gaps recorded below, not classified as complete.
- [x] Secure original statements (also in Vault), multi-upload CSV/XLS/XLSX/text PDF, persistent staging and retry; browser-verified two-row import.
- [x] Grouped review, bulk classifications, editable/disableable user-confirmed merchant rules, conflicts and duplicate-safe atomic posting; reviewed edits survive reload, two ledger entries read back, repeated file recognised.
- [x] Statement opening/closing arithmetic and ledger comparison, missing-month coverage, enrichment/provenance, Inbox/Settings, audit CSV; 560 total tests (full 559-test suite plus final transfer guard), no build errors or phone overflow.
- [x] Historical source-balance verification; source checks, arithmetic match and ledger reconciliation are distinct. Staging-only balances never add funds or alter accounts.
- [ ] Dated/status-aware account opening-balance assistant and conservative safe-to-spend integration; existing account balances remain unchanged pending explicit setup.
- [ ] Persistent worker activation — requires publication approval; callback is prepared but live site unchanged.
- [x] Persistent scanned-PDF extraction: four-page chunks, owner single-flight leases, durable chunk results, AI consent/privacy, stopped/paused failures, explicit retry and page counts; signed-in closed-page worker test succeeded. Full suite 571 tests passed; final targeted tests 27 passed; build OK.
- [ ] Complete verified contiguous historical coverage and representative bank/card month acceptance; represented months are not certified coverage.
- [ ] Consolidated programme: shared selection controller and material-change preview, atomic proposal-change audit, add-tag merge and explicit partial-post results.
- [ ] Consolidated programme: per-file account upload manifest, extended rule conditions/priority, grouped job Inbox, receipt/OCR background work, favourites and multi-select search/report filters.

## Sync visibility & mobile performance
- [x] Visible sync status in the header (updating / up to date / offline / could not update, with waiting offline entries; tap to refresh)
- [x] Mobile performance testing: scripts/mobile-perf.py measures phone-sized throttled load; verified 0.75s frame, 0.78s saved figures, 5.5s full sync on Fast 4G

## V5.2 Smart Home & Travel Redesign (.lovable/requirements-v5.2.md)
- [x] Current batch: multi-select trip expense actions (visible/all matching, tags, organisation, reimbursable purpose, link/unlink, selected report), explicit preview and owner-checked atomic writes. Signed-in link/tag/reload, organisation/reimbursable/unlink, stale-snapshot rollback and signed-out denial verified; amounts and claims unchanged.
- [x] Current batch: travel inbox for private uploaded confirmations and manually pasted trip messages; pending/reviewed messages persist, confirmations reopen in Bookings after navigation. No email or messaging-service connection; temporary records/files cleaned up.
- [x] Current batch: ranked smart trip suggestions using dates, destinations, booking references, original-currency/provider matches and workspace/travel clues; ambiguity visible, closed/cancelled/linked/non-expenses excluded. Signed-in explicit confirmation verified, no automatic linking.
- [x] Current request: booking confirmation uploads saved privately in Vault, consent-gated automatic extraction into editable drafts; original attachment retained, no automatic expense. Signed-in image confirmation extracted and reviewed booking persisted with ₹0 spent / ₹2,500 committed; temporary trip/file removed.
- [x] Current request: home shortcut selection and ordering, including travel actions first; grouped checkbox selection, drag/drop and arrow alternatives, clear/defaults, six primary + View all, owner-saved ordering verified after reload. Full suite: 584 tests pass; phone flow has no horizontal overflow or runtime errors; no publication.
- [x] P1: Compact Travel Manager overview (trip cards, status + workspace filters, search, alerts; no inline forms)
- [x] P1: Dedicated individual trip view /trips/$tripId with section tabs (Overview/Itinerary/Bookings/Expenses/Budget & Settlements/Reports), quick actions, More→Close/Cancel/Delete
- [x] P1: Simplified Create Trip dialog (essentials first, optional details, localStorage draft, no auto-keyboard)
- [x] P1: Verified no horizontal overflow at 402px on overview + trip sections
- [ ] P2: Dedicated Itinerary (day timeline, copy/move, multi-select participants, booking links, maps, conflicts)
- [ ] P2: Dedicated Bookings (compact cards, type-relevant fields, document import to draft, booking↔itinerary↔expense linking)
- [ ] P2: Universal Entry integration from trip (editable preselects), multi-select trip expense actions
- [ ] P3: Budget & Settlements subsections (budget, allocations, advances, reimbursements, reconciliation); financial integrity checks
- [ ] P4: Home shortcut selection/reorder (max 6 default + View All), workspace multi-select sheet, homepage personalisation persistence
- [ ] P5: Smart trip linking suggestions, Travel Inbox integration, trip readiness indicator, reports consolidation, controlled trip closure validation
- [ ] Acceptance: 23 demonstrations incl. unchanged records, no duplicate spend, iPhone layout

## V5.3 Statement Import (.lovable/requirements-v5.3.md)
- [x] Current continuation: recurring-pattern grouping reuses cadence detection with account/currency/type/direction partitions, separate repeated payments and original totals. Signed-in five-row statement verified monthly hint, both same-day repeats, selection/drill-down, unchanged source and review status; phone/desktop no overflow or page errors; temporary files/records removed without posting; 622 tests pass, build OK.
- [x] Current continuation: correction scope choices (one / selected similar / eligible matching), explicit previewed future-rule confirmation, conservative similarity guards and persisted-rule acceptance. Signed-in three-row correction/reload and rule save/cancel/readback verified; rows remain under review, originals preserved; phone/desktop no overflow or page errors; temporary records/rules removed, no ledger posting; 615 tests pass, build OK.
- [ ] Uploaded specification saved; guided import stages, bulk exception review and historical reconciliation acceptance remain a separate implementation pass after current travel requests.
- [ ] Supplementary V5.3: safe approval eligibility, previewed bulk classification, compact grouped mobile review, and 16 acceptance demonstrations; preserve source statements and financial records; no publication without approval.
- [x] V5.3 current pass: overview/groups/compact transaction rows, detail sheet with source narration, selected-only typed financial-impact summary, explicit Miscellaneous acceptance, preview-bound atomic bulk updates/audit, tag merge and stale-change rejection. Signed-in two-row approval/summary, original details, mobile/desktop no overflow verified; 600 tests pass. Temporary staging records removed; no test ledger posting and no publication.
- [ ] V5.3 acceptance remainder: representative bank/card final posting and replay, full theme checks, richer rule conditions and complete 16-scenario demonstration.
- [x] V5.3 continuation: category/workspace/type/account/organisation/direction/review-status groups with original-currency in/out totals and group drill-down. Signed-in 52-row statement verified all eight choices, Show more, select visible and clear; phone/desktop no overflow or page errors. Light/dark rendering inspected; 608 tests pass, build OK. Temporary account, statement and files removed; no ledger posting or publication.

## Travel email intake
- [x] Email connection work set aside at the user's request; no mailbox access or automatic email intake implemented.
