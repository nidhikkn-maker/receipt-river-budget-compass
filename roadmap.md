## Company tax (all) filter and export (6 Nov 2026)
- [x] Tax-year filter on the finance-only Company tax (all) section.
- [x] CSV export of the filtered company tax figures; role screen check extended to cover both.

## Role access, tax tests, scheduled depreciation (6 Nov 2026)
- [x] Employee/manager/finance access enforced in the database; admin Team access switches, roles and history in Settings; Team expenses and finance-only Company tax views; 14 role tests.
- [x] Tax validation and fixed-figure regression tests (personal regimes, 87A, surcharge, company/firm, ownership shares, deemed dividend); tax profile form warnings.
- [x] Monthly depreciation prepared automatically on the 1st–3rd (scheduled job) with an Inbox card; posting still needs approval.
- [x] Phone reminder for prepared depreciation (once per month, switch in Settings, opens Inbox).
- [x] Manager and finance screen checks (scripts/browser/test_role_screens.py).

## Ledgerline v6.0 + v6.1 gap closure (4 Nov 2026)
- [x] Customer invoices vs receipts on Audit; bonus/split/merger quantities and opening quantities in holding checks (never guessed); printed opening book/tax WDV kept from asset documents. 115 books tests pass.
- [ ] Remaining checklist ranks 1–8, 12, 15 (company-level access, figure-level evidence, server approvals, typed intake writes, full tax/GST computations, official schemas, full opening trial balance, period-close evidence, acceptance suite) — continuing.
- [x] Fix receipt reading problem (strict round-off field) — 5 Nov.
- [x] Receipts read service charges, discounts, tax parts and item headings — 5 Nov.
- [x] Mutual fund statements now propose holdings (units, NAV, cost) matched by ISIN — 5 Nov.
- [x] Statement Desk takes every document type, with context from other pages and a visible step trail; failed saves keep nothing.
- [x] DocuRepo: fact sources and confidence, one file linked to many records, automatic names, folders, company/year/registration filters, retention list, ZIP export with manifest.
- [x] Companies from documents (matched by PAN/CIN/GSTIN), past-year audited accounts with opening balances, flagged missing schedules, losses carried forward.
- [x] Property directory, leases with escalation/notice/deposit, tenant ledger, costs, occupancy; asset lifecycle, QR labels, monthly book depreciation, tax blocks, book-vs-tax, journals posted only in open periods; closed periods enforced in the database.
- [x] Holdings beyond shares, prices with freshness labels, gold, alerts, valuation history, net worth on Home; dividends/corporate actions shown on trade statements; tax payments recognised.
- [x] Tax by head, tax profiles, GSTR-1/3B drafts, payments, filing evidence, rule register with approval, form versions; audit findings grouped and fed into the Inbox; 30 new tests pass (1,302 total).
- [x] NSE/BSE share prices — official end-of-day closing prices saved each weekday evening (live intraday still needs a licensed provider).
- [x] Weekly automatic check of official tax/GST/MCA pages; new notices wait for owner approval.
- [x] Tax per company/person (linked accounts only), taxes already paid (TDS/TCS/advance/self-assessment), filing calendar with scheme-aware GST due dates and approved extensions, ITC review, rule impact (affected entities/years, closed or filed years unchanged).
- [x] Audit: tax/GST overdue and unconfirmed tax-payment checks, fixed/accepted decisions with notes, approval history, group by evidence, readiness tiles from real data; price alert threshold, demat quantity totals, 4-business-day staleness, per-owner demat cache, one net worth on Home and Wealth with each account counted once; phone-width fixes. 1,342 tests pass.
- [x] Evidence pack (§72) delivered as Ledgerline_v6_Evidence_Pack.md.
- [ ] Physical iPhone/iPad checks — needs the owner's devices.
- [ ] Publish (starts price and rule jobs) — needs the owner's explicit approval.

## Companies & financial years (4 Nov 2026)
- [x] Profiles with PAN/GSTIN/CIN checks and per-year on-record status at /entities; 4 rule tests pass. Not browser-checked or published.
- [x] Suppliers & missing invoices page (/gst-check), 2 rule tests pass; not browser-checked.
- [x] Property & assets with book/tax depreciation and rent check (/assets); income tax & GST working draft (/tax); rule tests pass.
- [x] GSTR-2B check on /gst-check and Audit dashboard (/audit); rule tests pass.
- [x] Customers owing (/receivables) and yearly tax rules with estimate on /tax; tests pass.
- [x] Asset tag/location/custodian/condition, "Checked today", tenant lease and deposit; overdue checks and expiring leases flag on /audit; tests pass.
- [x] End-of-day NSE/BSE prices in place; live intraday needs a licensed provider.
# Roadmap (Functional Requirements v1.0)
## Remove offline receipt photos you no longer need (4 Nov 2026)
- [x] Each photo on /offline-receipts has a Remove control and there's Remove all failed; both ask first, delete only from this phone, and never touch a photo that has already been read into a draft.
- [x] 5 focused checks pass (failed photo deleted, already-read photo and unknown photo refused, remove-all leaves waiting photos, other owners untouched, a photo removed mid-attempt isn't written back) plus the existing offline and draft tests; signed-in browser check removed 2 failed photos, kept the waiting one, then removed it and reached the empty state with no console errors. Preview only.
## City Union Bank EMI readiness (4 Nov 2026)
- [x] Add an explicit dated bank balance update and show coverage for upcoming loan EMIs without inventing a balance.
- [x] Remind when the scheduled primary-account transfer to City Union Bank is missing or short before the EMI due date; reuse existing reminders and private push.
- [x] 52 focused checks pass; signed-in CUB coverage, missing 3 November transfer and balance preview/cancel verified. No real balance changed; live save and physical notification delivery remain unverified. Preview only.
## Faster first open on a slow phone connection (2 Nov 2026)
- [x] Sign-in page no longer pulls in the accounts, expenses and claims code; Face ID code downloads only when Face ID is tapped; offline saved copy trimmed so it is ready sooner.
- [x] Published to ledgerline.biz after a scan showing no serious findings; site answered HTTP 200, deployment timing an estimate.
- [ ] Repeat-open timing on the owner's real iPhone still unmeasured — needs the owner to open, wait, close fully, reopen and report both times; blocked on device access.
- [ ] Fresh security scan on the latest commit recommended before broad sharing (the checked scan predates this change and still lists the two email warnings that the daily-limit fix already covers).
## New expense airy receipt follow-up (2 Nov 2026)
- [x] Workspace and Date print as the same side-by-side rows as Category, Paid with and Note; workspace choice opens as a picker on the right, date keeps its calendar field with Today/Yesterday under it.
- [x] 1,177 tests pass; five-row iPhone check on real data confirms every label left with its value right, workspace switching, date pills and the split panel all work inside the row; build OK.
- [x] Published the airy-receipt New expense (rows, aliases, smart-default settings, shop-name account fix) to ledgerline.biz after a fresh scan; publish scheduled, deployment timing an estimate.
## iPhone receipt viewer verification (2 Nov 2026)

- [ ] Verify double-tap zoom, gentle pinch and drag-pan for photo and PDF receipts on the owner's real iPhone; blocked — no physical device access from this sandbox, only touch-emulated browser checks are possible here.
## Receipt item confidence (2 Nov 2026)
- [x] Show and retain separate name/amount confidence for receipt items, with unknown fallback for older receipts; editing does not manufacture confidence.
- [x] 39 focused tests and two isolated expense browser checks pass, including saved item certainty; preview build OK. Real AI accuracy remains unverified; not published.
## Receipt arithmetic and optional items (2 Nov 2026)
- [x] Compare subtotal plus tax and tip with total, flag mismatches before confirmation and saving; unavailable subtotal stays unknown.
- [x] Offer optional receipt item extraction with editable names and line amounts before saving.
- [x] 36 focused tests and two isolated receipt/expense browser checks pass; preview build OK. Real AI accuracy and Cloud saves unverified; no real records changed, not published.
## Receipt scanning completion (2 Nov 2026)
- [x] Extract and review receipt tax and tip in New expense entry without adding them twice to the total; server validator retains both.
- [x] Suggest an owner-catalog category from the scanned merchant and require confirmation before saving.
- [x] Show merchant, date and total qualitative reading confidence so uncertain values can be checked.
- [x] 1,137 rule/regression tests and two isolated real-route expense/receipt browser tests pass; phone/desktop review checked. Real receipt AI accuracy and Cloud persistence remain unverified; real records unchanged, preview only.
## Monthly upload request view and accountant email regressions (2 Nov 2026)
- [x] Reminder and upload-confirmation email regressions render the registered templates and assert subject, personalisation, private button URL/limits and safe missing-data fallback; nine email tests pass.
- [x] New /upload-requests view lists every monthly accountant request — link status, email, opens, files waiting, reminder state and confirmation to you — newest first, folded beyond six, linked from Settings; six report-derivation tests and four isolated real-route browser tests pass.
## Email rendering and dependency advisory CI regressions
- [x] Real registered accountant email renderer regression checks personalised content/subject, private upload button URL/limits and safe missing-data fallback; all 1,082 tests pass and preview build is OK.
- [x] Separate non-blocking CI job runs bun audit, saves its report and warns on advisories/check failures; checksum confirms the lockfile is unchanged. Local audit reports deepmerge (low) and minimatch (moderate); no fixes applied. GitHub execution awaits the next push/PR.
## CI check and entities patch documentation
- [x] Added .github/workflows/ci.yml: bun install --frozen-lockfile, then typecheck (new `bun run typecheck` script), production build, and full test suite on push/PR.
- [x] Fixed the underlying entities conflict instead of patching it: removed the global entities@7 override, the two patches, and the vite.config.ts entities alias; each consumer now resolves its own entities version. Build OK, 1,079 tests pass, typecheck clean.
- [x] Documented the tsyringe patch and the removed entities workarounds (why they existed, safe update/removal steps) in patches/README.md; updated the AGENTS.md rule.
## v5.14 historical completion audit (read-only)
- [x] Original private PDFs independently verified: correct IDFC account headers/Apr–Nov coverage/balances; page extraction complete but identity evidence and all confirmations absent. Verified two SGST fingerprint collisions (256 raw/254 staged) and MOVAC printed debit-header ₹0.01 discrepancy; no assumptions about why a past click was not saved.
- [x] Corrected scope: 357/16 was whole-app; requesting owner has 345 records/seven accounts. Complete 256-source/345-ledger CSVs: 117 unique-reference lines, four ambiguous-reference/four money-only/131 unmatched; 124 historical filename/account conflicts, nine potential duplicate groups, 54 category hints. Automatic completion/bulk fully eligible now zero; genuine individual-decision count blocked by missing originals/purpose evidence.
- [x] Delivered five v5.14 reports and two detailed registers in the Historical Audit collection. Independently calculated seven balances and real owner report cashflow match production rules; 74 focused isolated tests pass. Whole-app counts/fingerprints unchanged from pre-audit (357/16), zero posts; no shared schema/record changes or publication.
- [ ] Test hosted posting/correction/reconciliation/report save/retry/recovery only in isolated hosted storage; blocked if unavailable. No shared schema, posting, historical correction or publication without separate approval.
## Current mobile Inbox and transfer approval verification
- [x] Eight financial-rule acceptance tests pass; two read-only Cloud inventories preserve all 357 records/16 accounts and identical fingerprints. Source totals/closing balances remain UNVERIFIED: both uploaded statements lack identity/closing confirmation and there are zero checkpoints.
- [x] Mobile/tablet controls have deliberate touch targets, narrow dialogs and reachable confirmation actions. Eight real-route Inbox browser tests pass, four-size overflow checks and phone confirmation screenshots inspected.
- [x] Installed transfer approval/Undo safeguards (0049) with owner/account/direction/money/date/FX/workflow checks, exact retries, late-attachment snapshots and atomic stale-safe restoration; 21 tests run against installed SQL in disposable PGlite. Read-only Cloud checks confirm guards/anon denial. No real entries linked or changed; no publication.
- [x] Browser buttons verified: select/filter/category preview/failure/retry/Undo, imported-row confirmation/cancel/failure, account correction/history Undo, organisation without trip/history Undo, transfer preview/cancel/failure/retry/Undo/refused restoration/read-back. 8 Inbox + 4 records-check + 2 expense/receipt pass; removed department approval remains explicitly skipped. Full suite 997 passes; build OK.
## Financial Inbox v5.12
- [x] Diagnose current review, selection, financial rules and coverage against the complete brief; identified status/scope and transfer integrity gaps.
- [x] Correct missing-info statuses, hidden selection, issue counts and truthful card-review labels; block unsafe client transfer pairs. Shared financial records unchanged.
- [x] Five Inbox destinations, guided existing correction previews/confirmation, prominent group mappings, complete main filters/context and correction-batch history implemented.
- [x] 977 tests / 123 files pass; 3 Inbox + 4 records-check + 2 expense/receipt browser tests pass (removed approvals explicitly skipped). Staged transfer correction passes 11 disposable-PGlite tests; 357/2,000-row timing and four controlled real-route screenshots inspected, no overflow/errors.
- [x] Two read-only inventories identical (16 accounts, 357 records, 2 statements, 9 documents, zero links; account/record fingerprints unchanged). Verification report and controlled screenshots saved in Files; no publication/shared changes.
- [x] Transfer approval validation/Undo installed on explicit safeguard request and checked read-only; no financial records changed.
- [ ] Cross-date/FX canonical movements and full hosted financial end-to-end scenarios remain blocked pending a source-preserving model and isolated hosted test storage (not release-ready).
- [ ] Complete all-time status/transfer history, reject/search and unfinished-panel draft recovery; current history is existing correction batches only.
- [ ] New production-like signed-in layout verification blocked by stale localhost bundle despite new-source fixture passing; do not count old-layout checks as v5.12 evidence. Physical-device/isolated hosted/security acceptance remains outstanding.
## Records-check browser button tests
- [x] Four real-route browser tests pass: individual/multiple selection, checked-list movement, Undo, prior checked preservation, select-visible deduplication/clear and save-failure retry. Four existing rule tests also pass; screenshots inspected, no runtime errors or external requests, fixture accounts/transactions/statements unchanged. Controlled browser preferences only; no Cloud writes or publication.
## Expense, approval and receipt browser tests
- [x] Expense form Save and expense-list read-back pass using isolated browser records (₹1,250.50, selected source account).
- [ ] Department-manager/finance approval browser test explicitly skipped: migration 0002 removed the workflow, and current pages have no approval buttons. Requires a separately requested approval feature; no mock approval UI added.
- [x] Receipt Upload → Files/PDF → Confirm details → Save → expense dialog → attachment popup → Edit/Save checks pass. Receipt stays on the same expense after edit/reload and absent from an unrelated expense. Real route controls, controlled OCR/data/files; Cloud persistence not certified. Two browser tests pass, prior four records-check tests pass, no runtime errors/external writes, no publication.
## Published to https://ledgerline.biz (2026-11-01, 13:22 UTC)
- [x] Pre-publish quick security scan: one info-level item only (guest sign-in shares signed-in access rules; intentional for guest upgrade continuity). No critical findings.
- [x] Publish requested and confirmed serving: site returns 200 and the newest pages ship — card balance (/cards/$accountId), records check, transfers and trip lifecycle pieces all load with expected content.
- [ ] Deep security scan is stale for this commit; run one on request before broad sharing.
- [ ] Physical iPhone/iPad acceptance still needs the user's own devices; sandbox 402px checks are not device evidence.
## Statement tiles and calendar review continuity
- [x] Card credits classify as card payments (refunds stay separate); unique existing source-account payments are recognised automatically without adding money twice. Unknown/ambiguous sources require confirmation. Protected historical posting rejects card-credit income and non-card destinations. Existing financial rows unchanged; no unattended posting added.
- [x] Statements upload/matching moved to Inbox's Statements view; /reconcile redirects there, and the separate Bank navigation item is removed.
- [x] Matched/unmatched tiles open searchable paginated lists and exact transactions; upload-summary tiles jump to corresponding full item lists.
- [x] Calendar month/date, trip/forecast/statement filters and expanded travel calendar survive same-tab review return using owner/history-keyed memory; router restores scroll position. No reload/cross-device persistence promised.
- [x] Pending/completed calendar counts derive from saved trip closure/blockers and booking payment/confirmation. Passing dates or Done reviewing do not complete reviews.
- [x] Signed-in preview verified tiles, exact item open/cancel, restored filters/date/month/scroll and phone overflow; controlled card CSV shows Card payment, fixed card destination, source confirmation and no income option. 931 tests pass; preview error-free. No financial test writes or publication. Automatic matching/outstanding arithmetic verified in isolated tests, not a live financial save.
## Calendar navigation and review return
- [x] Open calendar items directly, with a chooser when a date has multiple destinations.
- [x] Return after successful entry review, resolved financial review or explicit Done reviewing; failures and unresolved issues stay open.
- [x] Signed-in preview: November 3 opens Kovai Trip, Done reviewing returns to Plan; review returns to Inbox, phone layout has no overflow or page errors. Eight focused tests pass. No real financial writes or publication; successful real-entry saving not exercised.
## Published-site verification and security (done 2026-11-01)
- [x] Fresh security scan: deep scan clean (no code findings), supply chain clean; only known info-level guest sign-in item remains (intentional for guest upgrade continuity).
- [x] Found live site serving a stale deployment; re-published twice. Fixed real bug: dashboard dropped the anomaly transaction id (Autopilot.tsx), so "See transaction" fell back to /expenses. Verified live: opens /new?edit=<id> with the exact transaction.
- [x] Verified live: Financial Inbox shows "0 transactions needing attention" — corrected rows cleared.
- [x] Organisation-without-trip mapping verified in preview earlier; not re-driven on live (inbox empty, no test writes on real records).
## V5.10.1 transaction classification and external payees
- [x] Current continuation: compatible source-draft preservation/incompatible split clearing, mixed bulk exclusions, isolated two-record combined-save read-back/retry/undo and issue-specific closure verified; correction undo now notifies the parent to clear stale selection. 889 tests pass; signed-in open/cancel at four screen sizes without overflow/errors. Shared storage unchanged; hosted and physical-device acceptance remain blocked.
- [x] Root cause: correction form always displayed both internal account fields even though expense preview already ignores destination. Conditional fields, compatible card/loan targets, incoming account labels and mixed-type review guard added; existing protected confirmation retained.
- [x] External recipient directory in owner preferences, optional identifiers/verified details/organisation/category preference, explicit preview-confirm create/edit/archive, search and new-entry picker; existing entries never automatically relabelled.
- [x] Combined category/workspace/organisation/activity preview-confirm uses one existing atomic metadata operation; claims, incompatible types and split responsibility stay excluded.
- [x] Payee links, bulk recipient mapping and lent/borrowed tracking (user approved shared saving)
- [ ] Complete 18-case hosted financial/device acceptance; isolated hosted storage and physical device access still unavailable.
## Isolated reconciliation storage and physical-device acceptance
- [x] Disposable local PostgreSQL test storage verifies saved evidence/checkpoint survives closing/reopening, owner isolation and unchanged balances; 44 focused checks passed, no Cloud access.
- [ ] Separate hosted test storage: newly created reconciliation draft still shares live data; no hosted test writes permitted.
- [ ] Physical iPad/iPhone save/reload and cross-device checks: blocked on separate hosted test storage and real-device access; emulation is not physical-device evidence.
## V5.9.2 Financial Inbox redesign (.lovable/requirements-v5.9.2.md)
- [x] Audit against spec: three-view navigation, counts, selection scopes, bulk bar, guided preview/confirm, merchant groups, missing-field grouping, clutter-in-dialogs all already present from V5.10 work.
- [x] This turn: prominent Review & Apply in the category dialog, bulk summary in the detail panel instead of "No transaction selected", arrow-key navigation between row checkboxes, selected-row highlighting in list and table.
- [x] Verified: 864 tests / 108 files pass, build OK, signed-in desktop/iPad-landscape/iPad-portrait/iPhone screenshots with no overflow or page errors; report in .lovable/acceptance-v5.9.2.md. No financial writes, no publication.
- [ ] Physical iPad/iPhone, Split View, Stage Manager, hardware keyboard/trackpad acceptance — needs real devices.
## V5.10 guided Financial Inbox
- [x] Approved protected shared save support: general owner-atomic organisation/workspace/activity/category/payment metadata patches, revisions/config audit/idempotency and safe undo; shared additive 0044–0045, read-only grant verification, isolated SQL tests, 864 regressions and signed-in desktop/phone preview/cancel. No real financial edits or publication; hosted write acceptance remains unverified.
- [x] Current continuation: scoped atomic trip/organisation/project-tag mapping, direct reviewed recurring profile creation with duplicate-safe retry/read-back, missing-field grouping, conservative saved-record recovery suggestions and visible rule failure/retry; 849 tests, signed-in phone form/cancel verified, no financial writes/schema changes/publication.
- [x] Separate overview, transaction review and account reconciliation; independent unique/issue/overlap counts; statement/report/reminder sections kept separate.
- [x] Stable visible/page/all-matching/merchant selection; sticky summary, category exclusions and exact guarded correction confirmation; encrypted device review-context recovery.
- [x] Reuse existing confirmed merchant rules/cohorts and guarded financial APIs; dedicated Settings classification-rules page. No new backend or financial writes.
- [x] 835 tests passed; signed-in select 178 vs 40 visible, eligible/excluded category preview/cancel, device reload and five widths with no overflow/page errors; saved account evidence loaded. Acceptance report: .lovable/acceptance-v5.10.md. No publication.
- [ ] Pair linking requires a source-preserving canonical movement model across ledger/import/reconciliation/edit/delete; existing two independently imported entries would double-count if both were simply made transfers. No financial shortcut was implemented. Full missing-account recovery still requires individual account correction.
- [ ] Actual Cloud write/read-back/rollback and physical iPhone/iPad/hardware acceptance require isolated Cloud and device access; real financial records remain untouched.
## V5.9 Smart financial inbox
- [x] Current request: account/type corrections with exact before/after and ledger impact, explicit confirmation, dedicated owner-scoped atomic saving, all-edit revisions, idempotent audit batches and conflict-safe undo. Shared save support explicitly approved; no existing financial records changed; controlled PostgreSQL/UI tests and signed-in preview/cancel checked.
- [x] V5.9.1 first correction: root cause identified (Inbox ignored import/source evidence and used verification click dates); separate statement account table/details, independent counts, automatic polling/focus refresh and conservative period/source/read-back calculations. Seven signed-in accounts inspected read-only, none has confirmed source coverage/balance; report in .lovable/acceptance-v5.9.1.md.
- [x] V5.9.1 application requirements: labelled source identifier extraction for new CSV/Excel/PDF processing, explicit account identity + separate coverage confirmation, correct-account copy without ledger reassignment, protected server-derived immutable reconciliation checks/dates, atomic stale-snapshot validation and posting identity guard, saved-check history, event-driven refresh, conservative independent counts and fifteen controlled scenario tests.
- [x] Current continuation: controlled UI preview/cancel/confirm/check, exact applied PostgreSQL evidence/checkpoint/permission tests and signed-in preview/cancel at desktop + 402px; 827 checks passed before final test-only type fix. Shared additive support approved; no real financial records changed and nothing published.
- [ ] V5.9.1 external acceptance: real seven-account representative statements, actual cross-device Cloud save/reload and physical-device flows require source evidence and isolated test storage. Controlled copies simulate seven account kinds; they are not claimed to be copies of all actual records. New AI identity extraction is implemented but actual scanned-provider output not tested in this turn.
- [x] First preview slice: historical issues never age out; five transaction-deduplicated groups, evidence-based card/reciprocal-account transfer suggestions, filters/selection, snapshot-bound category preview and existing audited correction/undo. Unresolved transaction issues stay visible despite legacy dismissals. No live records changed.
- [ ] Priority 1 remaining: safe paired-movement linking and heterogeneous high-confidence suggestion acceptance. Account/type correction now has a dedicated atomic API; ambiguous opposite-side entries are blocked rather than merged.
- [x] Continuation: reuse confirmed import rules for review-only ledger suggestions, priority conflicts, strict responsibility guards and same-category bulk confirmation; contextual editable rule seeds reuse the existing explicit-preview editor. Merchant cohorts retain ownership/type/claim partitions, cadence and exact active-profile hints; no automatic expenses or eligibility.
- [x] Continuation verification: 766 checks passed, signed-in rule editor open/cancel, amount sort and phone/tablet no overflow/page errors; no Cloud/schema/rule/financial test writes, no publishing. Missing account corrections still require a validated atomic money-changing operation.
- [ ] Priority 2 remaining: advanced organisation/activity mapping, recurring profile creation workflow and full scoped rule-learning acceptance.
- [ ] Priority 3: expanded confidence/exception review and phone/tablet/desktop layouts.
- [ ] Priority 4: complete statement evidence extraction, independent reconciliation audit, controlled regression/performance acceptance and readiness report.
- [ ] Write/rollback acceptance on existing financial corrections requires isolated Cloud; never test on real records, never publish this brief without approval.
- [x] First-slice verification: 755 regression checks plus controlled component confirmation/undo passed; signed-in 166-record review, select 40/clear, tablet and phone no overflow/page errors. Real data had no account-complete category candidates, so live category preview/save deliberately not forced; full Cloud correction/undo remains unverified.
## V5.7 reimbursement discovery and responsive claims
- [x] Continuation: serialized device writes and retained edits during account save, reopened offline preparation sync, truthful failure feedback and same-mutation retry; five new controlled recovery tests, 739 total checks passed; isolated PDF flow rerun, no Cloud schema or real-record writes in this continuation.
- [x] Find & Link existing expenses with explained suggestions, rejection, search/filter/bulk review and audited links without duplicate entries.
- [x] Owner-protected claim preparation drafts, encrypted device recovery, revision-checked save, claimed-history warnings and richer profile fields. Additive migration 0040 changed the shared Cloud schema (two new tables/functions/trigger); no existing financial records changed. This exceeded the preview-only boundary and is disclosed; no further Cloud changes made.
- [x] Phone/tablet/desktop claim layouts, searchable selectors, summary/detail/bill preview and isolated report flow; 734 tests pass, build OK, seven emulated sizes without overflow, no browser errors or real Cloud test writes.
- [ ] Remaining V5.7 acceptance: real cross-device Cloud save/permissions requires isolated Cloud; physical iPhone/iPad requires devices; advance funding allocation needs confirmed model (generation blocked safely); no publication.
## V5.6 organisation reimbursement profiles
- [x] Multiple organisation/role profiles, organisation defaults, approval routes, existing receiving accounts, document/category preferences and activity mappings use existing owner-RLS cloud preferences; no migration or live test writes.
- [x] Compact claim prefilling, explicit ambiguity review, organisation allocation/selection, eligible outstanding-only totals, frozen snapshots and regeneration versions; existing statements remain separate.
- [x] 717 regression checks passed; authenticated pages and isolated in-memory save/reload → prefill → bill PDF → v2 flow verified; 402px page/form no overflow or errors; nothing published.
- [ ] Cross-device cloud persistence/permission write acceptance — requires isolated cloud testing, because current preview and production share data; owner policy inspected, real cloud writes deliberately not tested.
- [x] Advance applied per claim — user enters amount each time
- [ ] Real iPhone Safari verification — requires an actual device.
## V5.5 compact trip budget
- [x] Compact Trip Budget card (Total/Actual/Remaining/Reimbursable), Edit Budget sheet with single save, tabbed Budget Breakdown (workspace/traveller/category/currency/organisation), "Budget not set" and "Budget requires confirmation" states, utilisation warnings configurable in Settings; 697 tests pass, build OK, phone-width browser verified, no live records changed, nothing published.
- [ ] Real iPhone Safari pass of the budget workflow — requires device access.
## V5.4 audit — evidence before release
- [x] Fix both security warnings: active-invite read/insert/withdraw guards tested in isolated PostgreSQL; assistant server-owned facts and untrusted context tested and signed-in answer verified; live financial records untouched.
- [x] Fix D-FIN-001 remaining reimbursements, D-FIN-002 Business/category workspace shares, and D-FIN-003 repayment principal/interest including FX and legacy EMI compatibility; 675 tests passed, build OK.
- [ ] Remaining dependency advisories: deepmerge has no patched compatible release; minimatch legacy consumers need an upstream API-compatible fix or separately verified replacement. Compatible Vite/Vitest/transitive upgrades applied; esbuild/glob overridden to patched versions.
- [x] Save brief and rerun existing regression without cloud writes: 655 tests passed.
- [x] Inspect architecture/recovery/financial rules; run quick security/dependency scans and request deeper scan.
- [ ] Isolated workflow/restore/security audit — blocked: main and audit draft both share live data; no isolated cloud environment established.
- [ ] Remaining recovery/report release gates require an isolated cloud environment; three confirmed financial defects corrected, residual dependency blockers listed above.
- [ ] Real iPhone/provider/live-worker acceptance — requires appropriate device/provider access and isolated testing.

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
- [x] Re-upload is byte-identical to saved V5.2 brief. Added read-only multi-select traveller/organisation/destination/workspace and inclusive date filters. Signed-in phone/desktop selection, search, dates and clearing passed; 679 tests passed, build OK, no live writes or publication. Review: .lovable/acceptance-v5.2-current.md.
- [ ] Remaining V5.2 source-confirmed gaps: searchable itinerary participants, copy/move items, maps/possible same-time conflicts, trip draft recovery hardening and destination validation. Requires further implementation; live-record test prohibition remains.
- [x] Current batch: multi-select trip expense actions (visible/all matching, tags, organisation, reimbursable purpose, link/unlink, selected report), explicit preview and owner-checked atomic writes. Signed-in link/tag/reload, organisation/reimbursable/unlink, stale-snapshot rollback and signed-out denial verified; amounts and claims unchanged.
- [x] Current batch: travel inbox for private uploaded confirmations and manually pasted trip messages; pending/reviewed messages persist, confirmations reopen in Bookings after navigation. No email or messaging-service connection; temporary records/files cleaned up.
- [x] Current batch: ranked smart trip suggestions using dates, destinations, booking references, original-currency/provider matches and workspace/travel clues; ambiguity visible, closed/cancelled/linked/non-expenses excluded. Signed-in explicit confirmation verified, no automatic linking.
- [x] Current request: booking confirmation uploads saved privately in Vault, consent-gated automatic extraction into editable drafts; original attachment retained, no automatic expense. Signed-in image confirmation extracted and reviewed booking persisted with ₹0 spent / ₹2,500 committed; temporary trip/file removed.
- [x] Current request: home shortcut selection and ordering, including travel actions first; grouped checkbox selection, drag/drop and arrow alternatives, clear/defaults, six primary + View all, owner-saved ordering verified after reload. Full suite: 584 tests pass; phone flow has no horizontal overflow or runtime errors; no publication.
- [x] P1: Compact Travel Manager overview (trip cards, status + workspace filters, search, alerts; no inline forms)
- [x] P1: Dedicated individual trip view /trips/$tripId with section tabs (Overview/Itinerary/Bookings/Expenses/Budget & Settlements/Reports), quick actions, More→Close/Cancel/Delete
- [x] P1: Simplified Create Trip dialog (essentials first, optional details, localStorage draft, no auto-keyboard)
- [x] P1: Verified no horizontal overflow at 402px on overview + trip sections
- [x] P2: Dedicated Itinerary (day timeline, copy/move, multi-select participants, booking links, maps, conflicts)
- [x] P2: Dedicated Bookings (compact cards, type-relevant fields, document import to draft, booking↔itinerary↔expense linking)
- [x] P2: Universal Entry integration from trip (editable preselects), multi-select trip expense actions
- [x] P3: Budget & Settlements subsections (budget, allocations, advances, reimbursements, reconciliation); financial integrity checks
- [x] P4: Home shortcut selection/reorder (max 6 default + View All), workspace multi-select sheet, homepage personalisation persistence
- [x] P5: Smart trip linking suggestions, Travel Inbox integration, trip readiness indicator, reports consolidation, controlled trip closure validation
- [ ] Acceptance: 23 demonstrations incl. unchanged records, no duplicate spend, iPhone layout

## V5.3 Statement Import (.lovable/requirements-v5.3.md)
- [x] Current continuation: representative April bank/card acceptance and shared final-summary/source/direction guards. Signed-in six-entry posting/readback: bank ₹12,250, card owed ₹300, cash ₹1,000; income ₹5,000, net spending ₹2,050. Both real posting commands replayed without extra entries, card-side settlement excluded as already represented; temporary accounts, ledger entries, statements and files removed. All seven themes checked in light/dark at 402px for overflow; 636 tests pass, build OK. No publication.
- [x] Current continuation: recurring-pattern grouping reuses cadence detection with account/currency/type/direction partitions, separate repeated payments and original totals. Signed-in five-row statement verified monthly hint, both same-day repeats, selection/drill-down, unchanged source and review status; phone/desktop no overflow or page errors; temporary files/records removed without posting; 622 tests pass, build OK.
- [x] Current continuation: correction scope choices (one / selected similar / eligible matching), explicit previewed future-rule confirmation, conservative similarity guards and persisted-rule acceptance. Signed-in three-row correction/reload and rule save/cancel/readback verified; rows remain under review, originals preserved; phone/desktop no overflow or page errors; temporary records/rules removed, no ledger posting; 615 tests pass, build OK.
- [x] V5.3 guided upload/review/confirmation/reconciliation stages, per-file account/currency/period manifest, bulk exception review, overlap warnings and on-demand reconciliation history/CSV implemented and signed-in verified.
- [x] Supplementary V5.3 application acceptance: approval eligibility, previewed bulk classification, compact grouped mobile review, 16 scenarios mapped in .lovable/acceptance-v5.3.md; preserved source and records. Synthetic signed-in bank/card replay, network-failure recovery and all-theme phone checks passed; actual-device/user-statement validation remains separate.
- [x] V5.3 current pass: overview/groups/compact transaction rows, detail sheet with source narration, selected-only typed financial-impact summary, explicit Miscellaneous acceptance, preview-bound atomic bulk updates/audit, tag merge and stale-change rejection. Signed-in two-row approval/summary, original details, mobile/desktop no overflow verified; 600 tests pass. Temporary staging records removed; no test ledger posting and no publication.
- [x] V5.3 richer rules: literal description, account, currency, direction, inclusive amount bounds, priority, safe category/workspace/organisation/tags/type/reimbursable mappings and affected-row/conflict preview. Signed-in creation/reload verified; whitelist blocks source identity/money/approval changes. Network-failed posting then retry/replay kept exactly six entries with correct bank/card balances; 653 tests pass.
- [x] V5.3 continuation: category/workspace/type/account/organisation/direction/review-status groups with original-currency in/out totals and group drill-down. Signed-in 52-row statement verified all eight choices, Show more, select visible and clear; phone/desktop no overflow or page errors. Light/dark rendering inspected; 608 tests pass, build OK. Temporary account, statement and files removed; no ledger posting or publication.

## Travel email intake
- [x] Email connection work set aside at the user's request; no mailbox access or automatic email intake implemented.

- [x] Latest request: completed available V5.3 application gaps and requirements audit; acceptance evidence in .lovable/acceptance-v5.3.md. Email stays excluded; nothing published.
- [ ] V5.3 live background acceptance — blocked on publication approval; persisted chunk/lease recovery was previously tested locally after closing the page, but live schedule is not certified.
- [ ] V5.3 actual-statement and actual-iPhone acceptance — needs the user’s representative statement and compatible phone; synthetic month and emulated 402px checks passed.
- [ ] Foreign-currency ledger reconciliation — source arithmetic supported, direct original-currency comparison to INR-only ledger unavailable; never certifies or auto-adjusts balances.

- [x] Current continuation: grouped auto-refreshing import Inbox and direct validated batch links; active review refreshes with stale-response protection. Signed-in processing→review update, exact-batch reload, Inbox link, phone overflow and no approval/posting verified; 655 tests pass. Temporary fixture removed; no publication.

## V5.10.3 combined plan (approved)
- [x] Card balance view with unreconciled-payment flags (statement-only credits not yet listed)
- [x] Trip cancel / restore / delete (trip page + All trips list, Restored label)
- [x] V5.10.3 transaction-type question, recipients (existing), confirmed internal transfer linking (strong matches auto-found), audit
- [ ] V5.10.3 physical iPhone/iPad checks (needs your devices)
- [x] Read-only past-records check from April 2026, auto-reviewed against uploaded statements

## V5.11 Financial audit
- [x] Phase 1 read-only inventory, account status, exception register (report in Files)
- [ ] Phases 2–6 on an isolated test copy — awaiting user approval of corrections E1–E7
- [ ] Real iPhone/iPad checks — needs device

- [x] Fresh security scan of published app (deep scan running 1 Nov)
- [ ] Physical iPhone/iPad check (blocked: needs user device)

## V5.14 follow-ups (1 Nov)
- [x] Reconcile MOVAC SGST ₹90 ×2, ₹0.01 debit total, balance gap (read-only report in Files)
- [ ] Match five missing statements — blocked: statements not yet uploaded
- [x] Decision worksheet for 74 possible transfers / 9 duplicate groups (18 records) in Files; in-app queue not built yet
- [x] Statement cross-check: match confidence score and reasons per result (read-only)
- [x] Statement cross-check: side-by-side record vs statement entry (date, amount, description differences)
- [x] Statement cross-check: action workflow (move/kind corrections via preview, confirm, Undo)
- [x] Link statement match & fix from Financial Inbox

- [x] AMEX statement reading for Statement Match & Fix
- [x] Recognise transfers already posted from another account (no false missing / double post)
- [x] Undo an entire statement posting batch
- [x] Publish latest statement matching/posting to live
- [x] Post matched statement results to live records (MOVAC ₹21,419.15 gap remains)

## V5.15 (Nov 2026)
- [x] Post + reconcile HDFC Forex card statements (EUR 616.49 / USD 2,592.53)
- [x] Bulk categorisation for 41 uncategorised HDFC Krupa entries
- [x] Linked-transaction review: ₹1.25 cr Allwin Laboratories → AK Meridian (transfer vs income/spending)
- [x] Forex card statement import & reconciliation flow
- [x] Bulk-categorise 58 uncategorised ICICI Krupa savings entries
- [x] Home Card dues tile: card-by-card breakdown incl. card credits
- [x] Home card dues breakdown: statement date + last-updated time per card
- [x] Card dues/credit balance trend chart over time

## V5.16 — One-upload statement pipeline (Nov 2026)
- [x] Phase 1: Statement Desk (/statements) — many files at once read on device, one canonical line model, account identification (asks when unsure), confidence-scored matching, category suggestions, own-account transfer pairing, self-check + balance gates, apply with one-tap undo
- [x] Cross-device upload undo (Recent uploads on Statement Desk, synced in owner preferences)
- [x] Server reading for scanned PDFs and photos (lines always wait for confirmation)
- [x] Move entries to the correct account with preview/undo (/statement-accounts); Statement Desk also offers moves when another account holds the matching entry
- [x] Coverage & freshness (/statement-accounts)
- [x] Browser test for Statement Desk upload → review → apply → undo (scripts/browser/test_statement_desk.py)

## V5.17 — Layout clean-up & navigation (Nov 2026)
- [x] Verify cross-account match → move → undo with a sample statement (browser test)
- [x] Tighter shared page title, Inbox tab strip + compact tiles, Settings folded sections, Activity in pages of 50
- [x] Fold long groups on review pages (Statement Desk, Records check, Coverage); move remaining in-page confirmations to centre pop-ups
- [x] Back/forward buttons + edge-swipe back, centred pop-ups (shared dialog), weights capped at 600 on the chosen system font
- [x] Publish completed layout changes
- [x] Show E1–E7 corrections for review

## V5.18 (Nov 1 2026)
- [x] Fresh security check on live site + summarize issues before sharing widely (quick scan: guest note only; deep scan started; 1 moderate dev-only dependency advisory)
- [x] Verify live site displays correctly on desktop and mobile (updated layouts + navigation) — no overflow or console errors on 17 pages at 1280px and 402px
- [x] Fix live defects found: Reports category list unfolded (545 rows) → 50 at a time; Back after a refresh/shared link went home → now uses the browser's previous page
- [x] Publish the two V5.18 fixes (fresh scan at 01:02 UTC: guest note only, no critical findings)
- [x] Deep-scan of the published V5.18 build — running since 01:03 UTC, report on completion
- [ ] Match five missing statements — blocked: statements not yet uploaded
- [ ] Approve E1–E7 audit corrections — waiting on user

## V5.19
- [x] Faster startup from Home Screen
- [x] Sign-in page + bottom menu alignment at tablet/desktop
- [x] Face ID sign-in with MPIN/password fallback (verify existing)
- [ ] Test Face ID fallback on a real iPhone (needs user device)
- [x] Waiting to sync screen (/sync-queue) with per-entry status and retry
- [x] Action menu for offline entries (retry / discard)
- [x] Timed opening check: fresh-device home 2,131ms, repeat 408ms, Activity 207ms, sign-in screen 154ms; database is not the bottleneck (all-records read runs 2.5ms in 56 cached pages), so no index was added; added a preconnect to the record store so the secure link opens while the page loads
- [x] Face ID appears by itself as soon as the sign-in screen recognises this device (no tap); an email sign-in offers one Face ID scan so later openings need none; silent when the device can't offer Face ID; MPIN and password fallbacks kept. Needs a real iPhone to confirm the sheet appears unprompted
- [x] Make login time as low as possible: sign-in screen paints from the device's saved session with no network wait (154ms), Face ID asked for unprompted, record-store link opened early; home still waits on the records fetch on a device with nothing saved

- [x] Reduce cold home load: fonts no longer block first paint
- [x] Fresh security scan summary of published build
- [x] Visitor demo link on sign-in
- [x] Publish fonts + demo
- [x] Pages open at login-like speed with tap feedback
- [x] Demo dates stay in current month
- [x] Spinner on tapped item + page skeleton while loading
- [x] Measure live pages at iPhone speed (real device unavailable)
- [x] Fresh security scan of published site + summary
- [x] Optimize cold Home load on slow mobile (chart deferred)

## Home load timing on a slow mobile connection
- [x] Measured first Home load vs sign-in at three mobile speeds on the live site
- [x] Home card-dues chart mounts only when the breakdown is opened (first-load bytes unchanged: the chart library still arrives through background page warm-up)
- [ ] On a genuinely slow line (~400 kbit/s) the first Home screen is still about twice the sign-in screen: it needs your accounts, expenses and commitments data, roughly double what sign-in downloads.

- [x] Accountant link: safe end-to-end upload test
- [x] Accountant link activity history (sent, opened, expired, uploads)
- [x] Accountant link: domain email sending (sends once notify.ledgerline.biz finishes verifying)
- [x] Accountant link: one reminder email 4 days after the monthly link if nothing uploaded
- [x] Accountant link: email the owner when files are uploaded (one per 30-min batch)
## entities/decode build fix (done 2026-11-02)
- [x] Rolldown build failed loading entities/decode from htmlparser2@10. Fixed: entities overridden to 7.0.1, entities@7 patched to re-export legacy ./lib/decode.js and ./lib/encode.js, @react-email/render patched to import entities/decode. Build OK, 1078 tests pass, typecheck clean.
- [x] Help find the accountant upload link (Settings)

- [x] Closed two unused IDFC imports; payee/organisation optional; categorised 199 entries; Statement Desk is the only statement upload place

- [x] Bulk recategorise groups (Personal payments, AMEX, MOVAC) from Activity
- [x] Inbox "still needs review" summary

## Clean-up plan (approved 2026-11-02)
- [x] Side-by-side duplicate comparison
- [x] Inline fixes in review lists + live counts
- [x] Overlaps 1-3, 9 (statements, review, accountant)
- [x] Overlaps 4-8 (shared tab rows, menu tidy-up)
- [x] Trip reminders for upcoming itinerary plans and booking check-ins
- [x] Trip itinerary + bookings shareable PDF
- [x] Compact iPhone day-by-day itinerary view
- [x] Booking check-in times with timed reminders
- [x] Export itinerary + booking dates as calendar file
- [x] Calendar export: editable titles/notes in a pop-up before download; re-export reflects edits
- [x] Per-booking "Remind me" toggle (change time via check-in box, turn off via checkbox)
- [x] New entry uses Statement Desk rules: category, account, transfer/card-payment suggestions, matching saved entries, already-saved other side
- [x] Save calendar titles/notes on plans and check-ins for future .ics exports
- [x] Per-event configurable reminders inside the exported .ics file
- [x] Receipt items with low name/amount confidence highlighted and checked before saving
- [x] Receipt total check recalculates on every item, subtotal, tax or tip edit

## Receipt viewer & field confirmation
- [x] Side-by-side receipt image viewer with zoom during review
- [x] Require confirming low-confidence merchant/date/total before saving
- [x] Publish after receipt changes
- [x] Fresh security check on live site (deep scan clean)
- [x] Audit: all requests complete, no duplicate features

## iPhone receipt problem reporting (added 2026-11-02)
- [x] Simple in-app way to report receipt zoom/pan trouble from iPhone, with device + browser details captured automatically
- [x] New expense page redesigned in the chosen "Paper receipt" look
- [x] Smart defaults for category, account, payment method and workspace on New expense
- [x] Explain which past expenses led to each smart default
- [x] Smart defaults on/off settings
- [ ] Publish after smart-defaults work
- [x] Per-shop rules to correct or turn off learned category/account/payment/workspace
- [x] Airy receipt redesign of New expense
- [x] Shop aliases for per-shop rules
- [x] Fix false 'Saved the wrong way' for transfers into the statement account; publish
- [x] Discard option on receipt suggestions review
- [x] Security scan summary (3 warnings await user decision)
- [x] Test duplicate-transfer warning
- [x] Publish all
- [x] Find and fix biggest app/receipt slowness (offline app worker never installed: wrong file paths; fixed so pages open from the saved copy)
- [ ] Fresh security scan summary (deep scan running)
- [x] Profile Home startup and cut the ~1.2-2.5s server wait (installed app now opens from the saved copy and refreshes in the background)
- [x] Receipt reading progress + retry
- [ ] Fix 3 security warnings (spreadsheet done; 2 email warnings need user decision on daily limit)
- [x] Publish email sending limits
- [ ] Verify daily email limits (test account)
- [x] Investigate 5s+ app open time (smaller saved copy)
- [x] Reduce first-load work further
- [x] Measure first/repeat open (emulation; real iPhone needs user)

- [x] GLS EMI auto-matching for IDFC Krupa debits (amount gaps, linked-account payments)
- [x] GLS loan reconciliation view: scheduled EMI vs bank debit with amount/date differences
- [x] GLS loan term: 5 years (set start/end)
- [x] Reclassify seven IDFC Krupa Apr–Oct 2026 debits as GLS EMI
- [ ] Verify GLS original amount/start date (blocked: sanction letter needed)
- [x] Connect missing/short loan funding warnings to existing phone push, with independent delivery and private messages
- [x] Verify funding rules and dispatch with isolated tests; active 10-minute schedule confirmed; signed-in settings save/reload checked
- [x] Add notification configuration for loan funding, payments, document renewals, trips and check-ins in existing Settings
- [ ] Confirm actual phone delivery (requires enabling notifications in the installed published app)
- [x] Clear offline indicator and sync status in the app header
- [x] Capture receipt photos offline; upload and read them automatically after reconnecting
- [x] Camera permission check with fallback to the normal expense form when the camera can't open
- [x] Offline receipt retries never create duplicate drafts
- [x] Screen listing failed receipt photos with error and retry status
- [x] Match confirmed receipt drafts to imported bank lines (auto when certain, review when unsure)
- [x] Statement Desk pre-save reconciliation summary (unmatched lines, balance gaps)
- [x] Mark upcoming payments done, individually and in bulk

## Ledgerline v6 (v6.0 + v6.1, approved plan)
- [x] Demat Statement Review on Statement Desk (six checks, ISIN merge, no duplicate securities, undo)
- [x] Transaction / Capital Gains statements complete purchase history through the same desk
- [x] Originals stored in DocuRepo (vault renamed); new investment document types
- [x] Simpler bottom bar: Home · Money · + · Inbox · More (AI moved to More)
- [x] Demat holdings on Wealth with completeness status
- [ ] Live NSE/BSE prices + net worth freshness on Home (blocked: choose an approved price provider)
- [x] Phase 2 DocuRepo: all listed document types auto-detected, key details with page/quote evidence, versions (original kept), duplicate warnings, search by key details
- [ ] Phase 3 Entities from documents + Financial Year Onboarding + opening balances
- [ ] Phase 4 Supplier/customer/intercompany/GST reconciliations, missing-invoice flags
- [ ] Phase 5 Asset Management + Property Management (deeds, ownership share, leases, rent matching)
- [ ] Phase 6 Book and tax depreciation
- [ ] Phase 7 Income tax, GST drafts, regulatory rule versions
- [ ] Phase 8 Continuous audit dashboard and automation levels
- [ ] Phase 9–10 End-to-end checks, 22 tests, reports, acceptance

## v6 gap batch (Nov 2026)
- [x] Resumable Statement Desk runs, evidence lock, DocuRepo uploads via Statement Desk
- [x] Depreciation posted once per month to the asset's own ledger account; lifecycle events update the register
- [x] Closing prices + canonical demat net worth; weekly rule watch
- [ ] Scheduled jobs (closing prices, rule watch) start working only after the next publish — needs owner approval to publish
- [ ] GLS loan original amount/start date — needs sanction letter
- [ ] Physical iPhone checks — needs owner's device

## v6 gap plan (approved 5 Nov 2026) — remaining
- [x] B2/B3/B7 rules: deposit wording only, tenant balances from lease start, block depreciation after sales, confirmed asset life/residual/put-to-use, capital-gain holding periods, loss expiry/latest record, house-property cap/loss, personal tax excludes company records, GST payment GSTIN/period/account, GSTR-9 working, saved drafts tile, audit entity/FY attribution, shared rent matching.
- [ ] B1 atomic intake, page required, invoice→GST draft, trusted lookups, account/loan links
- [ ] B3 confirmed tax profile; per-company opening balances
- [ ] B4 rule monitoring sources, substantive rule tests, official JSON drafts, field-extension proposals, plain-language search
- [ ] B5 market/net worth (v6.1)
- [ ] B7 receipt intake via Statement Desk path, loss extraction, Form16/26AS ingestion, loan/supplier/investment/intercompany reconciliations, property cost links
- [ ] B6 tests, screenshots, evidence pack v2

## v6 Batch 7 (this round) — done
- Property costs link to their real payment and bill; Add Expense receipts share the DocuRepo duplicate check.
- Approved rule changes feed tax calculations (house-property cap, holding periods, loss carry years) with calculation checks.
- Rule watch tags forms/schema/validation/due-date changes; GSTR-1/3B JSON in GSTN offline-tool layout with format checks.
- Controlled new-field approval (plan + compatibility check); plain-words DocuRepo search; flow-adjusted portfolio alerts.
## Still open (blocked)
- Opening balances are compared, not posted to the ledger (ledger has no non-cash opening entry type) — needs owner decision.
- ITR JSON in official schema — schemas are thousands of fields; working papers only until scoped with accountant.
- Live NSE/BSE prices — needs licensed provider choice. GLS original amount — needs sanction letter. iPhone push/camera — needs device test. Publishing — needs approval.

## Approved plan 2026-11-04 (v6.0+v6.1 remaining gaps) — see .lovable/plan/ledgerline-v6-0-v6-1-complete-remaining-gap-plan-2026-11-04.md
- [x] A1 Opening-balance workflow posting dated opening entries
- [x] A2 Accountant-ready income tax handoff
- [ ] B–H batches per plan

## One-run finish (5 Nov 2026) — checklist in Files: Ledgerline_v6_Requirements_Checklist.md
- [x] Statements from any page → Statement Desk; originals kept in DocuRepo; incomplete asset/lease suggestions editable; demat no-zero prices; fund/exchange price-type check; ownership-aware cost alert; Home as-of dates; deposit-sized receipts wait for confirmation.
- [ ] Remaining large items (see checklist top-15 + v6.1 list): company-level access control, figure-level evidence on every register value, server-enforced approvals, typed intake writes, full tax/GST computations and official schemas, full opening trial balance, customer/supplier reconciliation, closed-period evidence, asset lifecycle journals, corporate actions, acceptance suite.

## Phase 1 (5 Nov 2026) — done
- [x] Full income tax (both regimes, deductions with proof, rebate/marginal relief, special-rate gains, surcharge, cess, company/firm options) + ITR computation JSON
- [x] GST cash payable by head with legal set-off order
- [x] Opening balance sheet from audited figures
- [x] Freeze whole years; database refuses GST invoice changes and silent un-closing in frozen years
- [x] Phase 1 acceptance tests (pure rules + isolated database)

## Final plan (5 Nov 2026) — .lovable/plan/finish-both-documents-...-2026-11-05.md
- [x] C14: QR/barcode physical asset checks with camera/photo/manual fallback, exact owner-register matching and explicit condition confirmation. 1,448 tests pass; signed-in controlled QR-photo decode, unknown refusal, confirmation and reload read-back verified at phone width with no page errors. Real records unchanged; phone camera/Cloud save remain unverified; not published.
- [x] E29: retained statement bonuses/splits/rights/mergers/dividends with document ids, duplicate-safe retries and undo snapshots; alerts now read saved events. 1,442 tests pass, including isolated PostgreSQL read-back; signed-in controlled Wealth alert visible with no errors. Real financial records unchanged; not published.
- [x] Dashboard provider recovery checked signed-in: dashboard loads, no provider exception or page errors.
- [x] E30 exchange-holiday-aware market open/staleness; D19 unlabelled receipts above rent wait for confirmation
- [x] iPhone/iPad (portrait+landscape) layout check of main pages — no overflow, no errors
- [x] Security rescan; shared price/rule tables limited to signed-in readers; published
- [x] E22 NSE/BSE prices kept separate per holding exchange; E27 each net-worth part shows its own as-of date; E25 price + fetch time per holding; E28 snapshots include demat value, count, money moved and price date
- [ ] Remaining plan items A1–A7, B8–B12, C13/C15–C16, D17–D18/D20–D21, E23–E24, E26, F31–F34, acceptance pack
- [ ] Real-device checks (Face ID, camera, offline, push) — needs owner's iPhone/iPad

## Companies ↔ accounts, trips, colours (6 Nov 2026)
- [x] Link bank accounts to companies both ways, auto-create company, nothing mandatory, many accounts per company
- [x] Edit / move / delete / merge on companies and account links (trips already had edit/delete)
- [x] Trips: "Mark completed" anytime and on create; open items are reminders only
- [x] Add expense page: blue → white (preview shared)
- [x] Create company inline from account settings; move personal accounts to a company
- [x] Company field on expenses (auto from account, manual override)
- [x] Company spending comparison view + filters
- [x] Per-company tax + personal tax "From your companies" (proprietorship/partnership/company rules)
- [x] Usage events: company created, account linked, expense company assigned
- [x] Editable per-year company tax profile
- [x] Accountant tax workpaper (calculation, sources, assumptions)
- [x] Add expense page white in dark mode too
- [x] Statement saved event with closing-balance match
- [x] Browser checks: edit company tax profile, download tax workpaper PDF
- [x] Statement-saved event uses balance after saving (declined lines count); Statement Desk browser check covers matched + not compared
- [x] Tax profiles survive reload; merged companies keep their tax years; workpaper shows the real total tax
