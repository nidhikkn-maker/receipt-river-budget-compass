# Post and match every line from all statements

Goal: every line on your 11 statements ends up as exactly one record on the right account, with the right kind, and each account's balance agrees with its statement's closing balance. Nothing is posted until you've seen the summary and confirmed it.

## Statements in scope
- IDFC MOVAC (full year; the October file is a copy of part of it)
- IDFC Krupa (full year; the October file is a copy of part of it)
- IDFC KR Enterprises (full year; the October file is a copy of part of it)
- IDFC KRNA (full year)
- AMEX (4 monthly statements, 21 Jun to 20 Oct)

## What you will see

1. **Upload once, all statements together.** Uploading in Statement Match & Fix reads each file, works out which account it belongs to from the account number on the statement, and drops the October copies that are already inside the full-year files.
2. **Every statement line is sorted into one of these groups:**
   - **Already recorded:** matched to an existing record on the same account.
   - **Recorded on the wrong account:** for example the 98 MOVAC records that belong to IDFC Krupa. These are moved, not posted again.
   - **Recorded as the wrong kind:** for example the 22 purchases saved as refunds. These are corrected.
   - **Missing:** no record anywhere. These become new entries, such as the ₹50,00,000 KRNA-to-MOVAC transfer and the 61 MOVAC receipts.
   - **Transfer between your own accounts:** money out on one statement and money in on another (MOVAC and KRNA, MOVAC and Krupa, Krupa to AMEX). Each pair is posted once as a transfer, never as both income and spending.
   - **Records not on any statement:** shown for your decision; nothing is deleted.
3. **One summary per account before posting:** opening balance, closing balance, number of lines, money in and out, what will be added, moved and corrected, and the resulting balance. Any account that would not end at its statement closing balance is blocked until it is resolved.
4. **Confirm per account (or all at once).** The whole batch for an account saves together or not at all. It can be undone as a batch as long as nothing was edited afterwards.
5. **Afterwards:** each statement is marked confirmed against its account, and the records check and Financial Inbox counts drop accordingly.

## Safety rules kept
- No posting without your confirmation; uncertain items (low confidence, possible duplicates, ambiguous transfers) stay in review and are never posted automatically.
- Retrying after a failed save never creates duplicates.
- Statement files are kept privately with the batch as evidence, the same way statement uploads already work.
- Nothing on the live site changes until you approve publishing.

## Technical section
- Add the running-balance parser (`statement-crosscheck.ts`) to `readStatement`, so IDFC PDFs feed the existing import pipeline: stage rows in import batches, matching, and guarded atomic posting with idempotent entry IDs. Add an AMEX PDF parser for its date/description/amount layout, with credits detected from the "CR" marker, checked against the printed "New Credits" and "New Debits" totals.
- Detect the account from the statement header (`extractStatementIdentity`, which uses the labelled account number) and require confirmation when it is uncertain.
- Merge overlapping files using bank reference and date/amount/balance fingerprints (`statement-fingerprint.ts`).
- Matching order: same account first (amount, date within 3 days, description score), then other accounts (move candidates), then own-account transfer pairs (same amount, within 2 days, opposite directions, reference/narration evidence), then missing.
- Moves and kind fixes reuse `correct_financial_entries`; missing lines post through the existing statement posting RPC; transfer pairs use the transfer link functions. Everything for one account runs in one transaction, with a revision snapshot check.
- Balance gate: the account's opening balance as stored, plus the ledger flows after the change, must equal the statement closing balance within ₹0.01. Otherwise posting is blocked and the difference is listed.
- Tests: parser totals for each layout, overlap removal, transfer pairing without double counting, and blocking when the balance doesn't reconcile. PGlite checks for an atomic save with Undo.
