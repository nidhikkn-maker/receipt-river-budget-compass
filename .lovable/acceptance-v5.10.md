# V5.10 preview acceptance — 1 November 2026

## Result: Partial, not full document completion

### Before / after
- Before: Inbox embedded job lists, full transaction review, rules, account/type controls, account checks and reminder totals in one screen.
- After: `/inbox` is an overview; `/transaction-review` has selection, filters, merchant view and on-demand corrections; `/account-reconciliation` retains statement evidence, manual comparison and reimbursements. Settings links to `/classification-rules`.
- Private browser comparison evidence: overview.png, desktop.png, category-preview.png, iphone.png, ipad-portrait.png, ipad-landscape.png and accounts.png under `/tmp/browser/v510/`. No financial screenshots are public assets.

### Observed Pass
- Signed-in navigation across all three pages; all 178 matching review transactions selected while only 40 rows were visible. No financial records were written.
- Actual selection category preview opened: 178 selected, 143 eligible, 35 explicitly excluded, 178 remaining issues. Cancel preserved records. Groceries was a test preview choice, not a recommended classification for the selection.
- Controlled tests: 91 matching vs 40 visible; ID deduplication; organisation issue survives category correction; selection never resolves issues; selected value includes income; ownership does not infer responsibility; excluded missing accounts.
- Controlled component save/undo, interrupted save and same operation ID retry passed. Saved record text and original category fixtures remained unchanged.
- Merchant view reuses existing partitioned cohorts, confirmed rules and cadence hints. Classification rules remain explicitly previewed in the existing editor.
- Encrypted owner-bound device review context restored selection after reload; owner isolation and deletion cleanup tested. No approved preview restores or saves automatically.
- iPhone 402×874; iPad portrait 820×1180; landscape 1180×820; narrow multitasking emulation 600×1000; desktop 1280×1800: no horizontal page overflow; account/type dialog accessible. Screenshots viewed after transitions settled.
- Account reconciliation finished loading saved evidence; no false verified account result forced. No browser page errors.
- Full regression: 835 tests / 100 files passed; current automated preview build OK.

### Count semantics
- Transaction overview reports unique review transactions, unresolved issue keys and multi-issue transactions separately.
- Category/missing/type/conflict cards overlap; they must not be summed as unique transactions.
- Required organisation applies only to business/official entries without saved workspace allocations. Payment/source account gaps remain unknown, never inferred from legal ownership.
- Reports, statement jobs and other reminders remain separate; legacy account freshness reminders are omitted from the unrelated reminder count. Evidence load failures show unavailable rather than zero verified accounts.
- Full rule load failures remain a limitation: overview type suggestions may be incomplete until rules load; review displays rule-load feedback.

### Database / financial preservation
- No migrations, schema changes, financial-record updates, rule saves, statement posting, external activation or publication in this task.
- Existing owner-scoped atomic category and account/type operations are reused; no new financial calculation engine or ledger introduced.
- Preview and production share Cloud. Only read-only actual-record browser checks and isolated in-memory correction tests were performed.
- Live production application was not deployed; its version remains unchanged.

### Continuation — 1 November, 08:17 UTC
- Added reviewed configured activity/project links, open-trip links and organisation changes restricted to already-linked trip expenses. Existing atomic owner/snapshot APIs are reused; claimed/split organisation responsibilities are excluded before confirmation.
- Added direct recurring profile editor, preview, explicit save, active-profile duplicate blocking, same-ID retry and persisted insert read-back. It uses stored INR planning values and never creates expenses or resolves ledger issues. Mixed merchant/account/responsibility selections are refused.
- Added missing-field filter and evidence-only recovery from saved active payment instruments and a unique configured organisation tag. No narration-only/ownership inference; recovery is a suggestion, not an automatic correction.
- Overview rule failures are now visible with Retry, rather than silently implying complete suggested-type counts.
- Controlled pure/component acceptance for exclusions, stale configuration, preview/cancel/save, recurring retries, merchant scope and recovery passed. Existing isolated activity SQL test confirms owner checks and rollback/source preservation.
- Signed-in preview: activity/trip controls opened and cancelled; missing-field filtering visible; eligible saved expense recurring form opened and cancelled. Phone screenshots viewed, no horizontal overflow or page errors. No actual financial/rule/profile save performed.
- Complete regression: 849 tests / 105 files passed. Preview build OK. No schema changes or publication.

### Outstanding (Not Implemented / Partial / Blocked)
### Approved protected saving continuation — 1 November
- Shared additive migrations 0044–0045 added owner-atomic general organisation/workspace/category/activity/payment metadata patches, immutable before/after audit, revision/configuration guards, same-request retry and all-or-nothing undo. Schema support was applied to shared Cloud with explicit permission; no financial records were edited and no publication occurred.
- General organisation assignment no longer requires a trip. Payment mapping must preserve a compatible active source account; account changes remain in financial corrections. Claims, splits and linked monetary workflows remain individually reviewed.
- Bulk Mappings & History provides exact before/after review, exclusions, confirmation and durable undo history. Per-row verified category suggestions and available organisation/payment recovery use the same guarded patches; uncertain/missing-account changes remain financial corrections, not auto recovery.
- 864 controlled regression checks passed across 108 files, including deployed SQL in isolated PostgreSQL, owner/anonymous checks, rollback, stale undo, wrong undo-path refusal and same-ID retry. Shared function existence/grants verified read-only.
- Signed-in saved expense workspace preview/cancel was observed on desktop and 402px phone, no horizontal overflow or runtime errors. Cloud save/read-back/undo was NOT exercised on real records; component confirmation and isolated PostgreSQL acceptance are not hosted end-to-end acceptance.
- Preview compilation passed. Original balances, records and published application remained unchanged.

### Outstanding (Not Implemented / Partial / Blocked)
- Paired transfer/card-settlement linking remains blocked by existing financial guards. Potential opposite-side records cannot be merged through account/type correction; a dedicated owner-atomic, source-preserving pairing design and isolated write acceptance are needed.
- Reimbursement/advance/other movements keep dedicated workflows; account/type correction currently supports expense, income, refund, transfer, card payment, loan repayment and investment only.
- Full saved correction draft covers selection/filter/category context only; account/type form choices do not persist. Actual cross-device context is not supported.
- Physical Safari, Stage Manager, external hardware keyboard/trackpad, safe copies of all actual Inbox records and hosted write/read-back/rollback acceptance are unverified. Isolation is required before actual Cloud correction tests.
- No complete before screenshot from the previous build was captured; before comparison is source-confirmed, after screenshots are observed.
- Resolved-since-history totals are not fabricated; completion summary covers this session's category correction only. Global durable resolved transaction history needs further design.

Preview: https://id-preview--2c178514-2b71-421c-bc9a-e7c5e85ce4db.lovable.app/inbox