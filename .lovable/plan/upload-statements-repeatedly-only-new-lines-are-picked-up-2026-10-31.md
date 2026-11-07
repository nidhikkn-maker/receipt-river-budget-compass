# Upload statements repeatedly — only new lines are picked up

## What you'll get
- Upload the same bank's statement as often as you like (e.g. 21.01 and again 22.01). Lines already brought in last time are skipped automatically — even ones you skipped, ignored or edited afterwards.
- A clear banner after upload: "Bank X — 42 lines already imported up to 21 Jan 2026, 6 new lines". Only the 6 new ones go to the review/register step.
- The bank account is picked automatically from the last upload of a similar file (same bank/card), so no repeated selection.
- Each account shows "Statement imported up to: 21 Jan 2026" on Wealth and on the statement page.
- Two genuinely identical payments on the same day (e.g. two ₹20 tea UPIs) are still both counted — they are told apart by bank reference or by their position in the statement.
- Option "Show already-imported lines" for checking, and "Forget this import" to re-import a statement if something went wrong.

## How it decides "already imported"
1. Every statement line gets a fingerprint per account: date + amount + debit/credit + bank reference (UPI/cheque no.) when present, otherwise cleaned description + order within that day.
2. Fingerprints of every line seen are saved when you finish an upload (registered, reviewed, or skipped).
3. Next upload: matching fingerprints are hidden; the existing "already in your ledger" check still runs for the rest as a safety net (catches entries you typed by hand).
4. Lines dated before the account's "imported up to" date that don't match any fingerprint are shown separately as "older line not seen before" for a quick look, never silently dropped.

## Technical details
- New owner-scoped table `statement_line_imports` (owner_id, account_id, fingerprint, line_date, amount, direction, ref, import_batch_id, created_at), unique (owner_id, account_id, fingerprint); GRANTs + RLS by auth.uid(). Small `statement_imports` batch table (bank label, file name, period from/to, counts) to drive "imported up to" and "Forget this import".
- Pure module `src/lib/statement-fingerprint.ts`: `fingerprintLines(lines, accountId)` with same-day occurrence indexing; `splitNewLines(lines, known)` → { new, alreadyImported, olderUnseen }. Unit tests: repeated overlapping uploads (21.01 then 22.01) yield only new lines; identical same-day payments both kept; ref-based matching survives description changes.
- `planStatementRegistration` receives only new lines; reconcile page records fingerprints in the same save step (via store) and auto-selects account from the last batch with a matching bank header/file pattern.
- Store gets `statementImports` read/write; offline: fingerprints saved after sync.
