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
- [ ] Allocations never move money; readiness uses due dates + balances; rules fire only on conditions; search respects authorisation; imports never duplicate; simulations never alter records; autopilot needs approval; family access isolated; contract extraction keeps document refs; memory records outcomes; graph reflects real links; V1/V2 still work
- [ ] Edit links on money map (accounts, cards, loans, bills)
- [ ] Show reason + key details for each connection on selection
