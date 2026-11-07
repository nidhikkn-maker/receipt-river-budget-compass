# LEDGERLINE
## Version 5.9.1 — Financial Inbox Account Status & Reconciliation Correction

### Priority: Critical Bug Investigation and Workflow Correction

**Project:** Existing Ledgerline Application  
**Development:** Diagnose and correct account-status inconsistencies  
**Deployment:** Development/Preview Only

## 1. Current Issue

The Financial Inbox does not reliably reflect the latest statement import and reconciliation results.

Users may upload statements repeatedly, yet the corresponding accounts continue to show **Needs Review**.

In the supplied screenshot:

- Seven financial accounts are listed.
- One account is marked Current.
- Six accounts show Needs Review.
- Several accounts display no statement source or reconciliation date.
- The account marked Current has no confirmed statement balance displayed.

Investigate the cause before changing account statuses.

## 2. Separate Import, Reconciliation and Freshness

Maintain independent status fields for:

**A. Statement Import**

- Not Imported.
- Importing.
- Imported.
- Import Failed.
- Requires Account Matching.

**B. Transaction Reconciliation**

- Not Started.
- In Progress.
- Reconciled.
- Differences Found.
- Requires Review.

**C. Balance Verification**

- Not Verified.
- Verified.
- Difference Found.
- Verification Unavailable.

**D. Statement Freshness**

- Current.
- Becoming Outdated.
- Outdated.
- Unknown.

Freshness must be based on the statement's actual coverage period and the configured account-specific freshness policy.

Do not use the upload date or the date the user clicked Reconcile as the statement coverage date.

## 3. Investigate Account Matching

For every uploaded statement, verify:

- Detected bank.
- Account identifier.
- Matched Ledgerline account.
- Statement period.
- Import batch.
- Parsed transaction count.
- Imported transaction count.
- Duplicate transaction count.
- Rejected or unresolved rows.

A statement must be linked to the correct configured account using reliable identifiers.

Where identifiers are insufficient or ambiguous, request confirmation.

Do not infer account identity from the filename alone.

## 4. Correct Reconciliation Logic

After importing a statement:

1. Confirm the correct account.
2. Identify the statement period.
3. Parse transactions.
4. Detect duplicates.
5. Match transactions with existing ledger records.
6. Verify transaction completeness.
7. Compare balances where sufficient source data exists.
8. Record the verified coverage date.
9. Update the applicable statuses.
10. Refresh the Financial Inbox automatically.

For running-balance checks, use the statement's balance convention and correct transaction ordering.

A transaction match without a valid balance comparison must not be labelled full balance verification.

## 5. Correct Status Persistence

Investigate whether reconciliation results are being:

- Calculated but not saved.
- Saved against the wrong account.
- Overwritten by another process.
- Ignored by the Financial Inbox.
- Displayed from stale cached information.
- Incorrectly derived from the most recent transaction date.

Fix the underlying source of the inconsistency.

Do not merely change the displayed label.

## 6. Updated Account Status Interface

Replace the current ambiguous single-status presentation with a compact table showing:

| Account | Statement Through | Reconciliation | Balance | Freshness |
|---|---|---|---|---|
| Account A | 28 Oct 2026 | Reconciled | Not Verified | Based on policy |
| Account B | Not Available | Not Started | Not Verified | Unknown |

The displayed values must come from actual records.

Provide a **View Details** action for each account.

The detail view should display:

- Last successful import.
- Statement period.
- Reconciliation date.
- Last verified balance.
- Outstanding differences.
- Missing information.
- Available actions.

## 7. Automatic Status Refresh

Whenever a relevant import, reconciliation or verification process completes:

- Update the account status.
- Refresh the Financial Inbox.
- Update the account verification count.
- Clear issues that have actually been resolved.
- Preserve unresolved issues.
- Display confirmation of the completed operation.

A manual page refresh must not be required for ordinary status updates.

## 8. Prevent Unnecessary Repeat Uploads

Before importing a statement again:

- Check whether the file or its transactions were previously imported.
- Identify overlapping statement periods.
- Preserve existing records.
- Avoid duplicate ledger entries.
- Explain what is already imported.
- Allow safe reprocessing of a failed or incomplete import.

Reprocessing must not create duplicate transactions.

## 9. Balance Verification

Where the statement provides a reliable closing balance:

Compare it with Ledgerline's calculated balance at the same statement cutoff.

If the values match:

**Balance Verified**

If they do not:

**Difference Found**

Display the amount of the difference and the transactions or data gaps requiring investigation.

If the source document does not contain a usable closing balance:

**Balance Not Verified**

Do not fabricate a successful balance check.

## 10. Financial Inbox Account Summary

Display:

- Total Accounts.
- Current Statements.
- Reconciled Accounts.
- Verified Balances.
- Accounts Requiring Attention.

These counts must be calculated independently.

Do not use the number of recent statement uploads as the number of verified accounts.

## 11. Testing

Test all seven existing account configurations using safe copies of their records.

Include:

1. First statement import.
2. Repeated statement import.
3. Overlapping statement dates.
4. Correct account matching.
5. Incorrect account mapping.
6. Missing account number.
7. Statement without balance.
8. Statement with verified closing balance.
9. Statement with a balance difference.
10. Successful reconciliation.
11. Failed reconciliation.
12. Status persistence after page reload.
13. Cross-device status consistency.
14. Financial Inbox count updates.
15. No duplicate transaction creation.

Do not assume all seven accounts are ready for verification simply because they exist in Settings.

## 12. Required Developer Report

Before declaring the issue resolved, provide:

1. Root cause of incorrect status updates.
2. Accounts and records affected.
3. Changes made.
4. Updated status calculation rules.
5. Before-and-after reconciliation results.
6. Confirmation of no duplicated transactions.
7. Confirmation of no modified historical balances.
8. Remaining accounts requiring actual statement data.
9. Preview demonstration.
10. Confirmation that production remains unchanged.

## Final Instruction

Correct the Financial Inbox status and reconciliation workflow in the existing Ledgerline application.

Ensure that statement imports, transaction reconciliation, balance verification and freshness are tracked separately.

Every status must accurately represent completed and persisted financial checks.

**Preserve all existing financial records. Do not deploy to production without approval.**