# Show why each statement's reconciliation is or isn't ready

## What you'll see
Every saved statement on the Historical import page, and the top of its reconciliation summary, gets a status line with a plain reason:

- **Ready to reconcile**: account confirmed, balances entered, and lines add up.
- **Not started: account not confirmed**: "Confirm which account this statement belongs to."
- **Not started: balances missing**: "Enter the opening and/or closing balance."
- **Blocked: lines don't add up**: "Closing differs from opening plus lines by ₹X. Check for missing or extra lines."
- **Blocked: printed balance differs**: "Entered balance differs from the one printed on the statement by ₹X."
- **Waiting: lines still in review**: "N lines are not yet approved or imported."
- **Still reading**: "The statement is still being processed (page X of Y)."
- **Failed**: shows the saved error and the Retry option.
- **Reconciled**: the date of the saved check.

Only the first unmet step is shown as the reason. A "Show all checks" toggle lists every check with a pass or fail mark. Nothing is saved, adjusted or imported by this.

## Technical details
- New pure function `reconciliationReadiness(batch, rows, posted, liability)` in `src/lib/historical-import.ts`. It reuses `importReconciliationSummary` and returns `{ state, reason, checks[] }` in a fixed priority order.
- The saved-statements list in `historical-import.tsx` only has row data for the open statement. It shows reasons based on the statement status, account identity and balances; reasons that depend on individual lines appear once the statement is opened.
- `StatementReconciliationSummary` shows the reason heading and the checks toggle.
- Vitest cases cover each state and its priority order.
