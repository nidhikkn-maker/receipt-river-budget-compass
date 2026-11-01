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

### Outstanding (Not Implemented / Partial / Blocked)
- General atomic bulk organisation/workspace/payment-method/activity mapping, heterogeneous category suggestions, automatic verified missing-detail recovery and direct recurring-profile creation remain unimplemented in this centre. Existing individual detail editor and recurring Plan remain available, not claimed as equivalent bulk workflows.
- Paired transfer/card-settlement linking remains blocked by existing financial guards. Potential opposite-side records cannot be merged through account/type correction; a dedicated owner-atomic, source-preserving pairing design and isolated write acceptance are needed.
- Reimbursement/advance/other movements keep dedicated workflows; account/type correction currently supports expense, income, refund, transfer, card payment, loan repayment and investment only.
- Full saved correction draft covers selection/filter/category context only; account/type form choices do not persist. Actual cross-device context is not supported.
- Physical Safari, Stage Manager, external hardware keyboard/trackpad, safe copies of all actual Inbox records and hosted write/read-back/rollback acceptance are unverified. Isolation is required before actual Cloud correction tests.
- No complete before screenshot from the previous build was captured; before comparison is source-confirmed, after screenshots are observed.
- Resolved-since-history totals are not fabricated; completion summary covers this session's category correction only. Global durable resolved transaction history needs further design.

Preview: https://id-preview--2c178514-2b71-421c-bc9a-e7c5e85ce4db.lovable.app/inbox