# V5.6 implementation and verification

## Built in preview
- Settings → Financial setup → Reimbursements opens dedicated profiles; setup status depends on actual profile completeness and is never essential for ordinary expense entry.
- Multiple organisation roles, one default per organisation, claimant/department/code/cost centre/contact, editable approval routes, existing receiving accounts, masked destinations, preferred currency, declarations, format and category/document rules.
- Existing owner-RLS `finance_preferences.data.reimbursementSettings` stores profiles, activity mappings and report-only organisation shares. No new schema or migration. Inspected active policy: authenticated owner-only ALL with owner check.
- Claim page selects activity, organisation and role; fills saved claimant/account/approver and actual trip purpose/dates; profile summary and optional per-claim edits replace permanent inputs. Old device-local claimant data is not silently adopted into an account.
- Automatic mapping: explicit profile, explicit activity assignment, unique applicable profile, organisation default, manual ambiguity handling. Unknown organisations and conflicting expense tags remain under review.
- Organisation responsibility allocation totals original stored INR without changing expenses or FX. Existing fully organisation-tagged category allocations are reused. Formal claims are organisation-specific; no guessed equal split or combined payable claim.
- Date/category/payment filters, all-eligible/matching/individual selection, missing bills/payment details and exclusions, confirmed outstanding total.
- Company-funded, rejected, settled and non-reimbursable expenses excluded. Partial receipts reduce outstanding exactly. Payment account/card last four retained and long numerical identifiers masked.
- PDF header, approval details, declaration, account, eligible/received/outstanding tables, exclusion reasons, ordered bill annexures. Saved snapshots retain claimant and rows; a repeat generates a new immutable file/history version. Generating never changes claim/approval or ledger status.
- Existing Detailed Expenditure Statement and older reimbursement exports remain distinct. Backup remaps added account/expense-linked settings across owners; organisation master rename references profiles/mappings/shares and prevents deletion while used.

## Observed verification
- Full suite: **717 passed, 83 files**. Latest preview build: **build OK**.
- Signed-in live read-only pages: settings, add-profile form opened/cancelled, actual trip claim screen; no mutation or publication.
- Isolated network-intercepted in-memory fixture: profile form save, reload/readback, saved default role/account/route, trip purpose/date prefilling, ₹12,000 eligible less ₹3,000 receipt = ₹9,000 claim; company-paid fixture excluded; original bill attached; regeneration v2; first snapshot retained. Every record/file mutation was intercepted and kept off Cloud.
- Rendered test PDF inspected: selected claimant/approver, payment account ending 4321, personal AMEX ending 1234, ₹9,000 outstanding, C-01 original bill. PDF 2 pages. Masked destination drawn as shaped image and not selectable text.
- 402px phone emulation: profile form and claim page no horizontal overflow or page errors. This is not a physical-iPhone test.

## Partial / blocked — not complete acceptance
- Cross-device real Cloud save/readback and unrelated-owner write denial: not exercised because there is no isolated Cloud environment; policy inspected, transport persistence checked only with isolated fixtures. Profiles are wired for Cloud sync, but cross-device acceptance is unverified.
- Advances: no saved attribution of advance funding to each expense/organisation exists. Trip advances are detected, shown explicitly, and block formal claims pending a funding-allocation model; no invented deduction and no double reimbursement. Implementing that model remains outstanding.
- Actual iPhone Safari checks require a real device.
- Existing V5.4 release gates/dependency issues and older roadmap blockers remain unchanged. This work is not a production-readiness clearance.

## Preservation and deployment
No live profile, expense, account, trip, receipt or report records changed by testing. Nothing published. Illustrative organisation role/approver/bank data was used only in isolated controlled fixtures, never added to the user's account.