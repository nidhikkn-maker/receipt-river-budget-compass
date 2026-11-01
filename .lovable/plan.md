# Statement Desk — one upload that does the work

## What you asked for
The way I matched your statements this week — read every file, match it line by line against your records, tell you exactly what's missing or recorded as the wrong thing, ask you only the few questions that matter, then post with a safety net — should happen inside the app. You should be able to drop in many statements at once and have one flow do the matching, the categorising, the account linking and the posting, without it being a painful job.

Your four decisions, already folded in:
- Parse on your device first; send a file to your private backend only when the device can't manage it.
- Save exact matches automatically; ask about everything doubtful.
- If a statement belongs to an account not in the app, create the account with its opening balance and carry on.

## How I worked, turned into app steps
1. **Read** each file and find out whose statement it is (bank name, account number, currency, balance signature).
2. **Line up** every statement line against your records — amount and date close together, each record used once — with a confidence score and the reason for each result.
3. **Sort** every line and record into: already recorded / missing / wrong account / wrong kind (a card payment shown as income) / transfer between your own accounts / card payment / possible duplicate / unmatched.
4. **Check the money adds up** per account: opening + debits − credits = printed closing. No match is posted while its account's balance check fails.
5. **Suggest categories** from your own rules and your merchant history, and apply the confident ones in bulk.
6. **Ask only the few things only you know** ("which account paid this?", "what was this for?").
7. **Post once**, with a batch you can undo in one tap from any device.

## The build
### Phase 1 — one pipeline, one upload screen (the core)
- New `src/lib/statement-pipeline/` holding the shared, tested logic: `identify` (whose statement is this), `parse` (bank adapters: IDFC running balance, AMEX, HDFC, forex multi-currency, generic fallback), `match` (one-to-one line↔record with score + reasons), `classify` (the seven outcomes above), `plan` (one change plan with impact totals and per-account balance gates), `apply` (atomic post, stable ids, batch undo).
- The three separate parsers and matchers today (`statement-crosscheck`, `forex-statement`, `historical-import`) become adapters inside this one core, so every flow gives identical answers.
- New `/statements` screen: drop many PDFs (or a folder) at once, per-file status as it works, then **one review screen** in three groups — *Saved automatically*, *Needs your decision* (each with the question and why), *Left for later* — plus one **Apply everything** and one **Undo batch**.
- Existing screens (`Financial Inbox → Statements`, `/statement-crosscheck`, `/forex-reconcile`, `/historical-import`) point at this one flow instead of running their own copies.

### Phase 2 — auto-creation, auto-categorising, both-side transfer links
- Create a missing account from its statement (name, currency, opening balance) and continue.
- Apply confident categories in bulk; leave the rest for one tap each.
- Link both sides of a transfer between your own accounts as one movement when the evidence is strong (same currency and amount plus a reference or narration match), and show the pairing before it saves.
- Recognise card payments and statement credits as payments, never income.
- Save each uploaded statement to your private storage with an owner-only record, so a statement you uploaded on your phone is still checkable on your iPad.

### Phase 3 — coverage and confidence
- Coverage view: which account-months still have no statement, and which records sit outside any statement.
- Backend fallback parsing for files the device can't handle (private, AI-assisted extraction, then the same deterministic matcher; always shown for review).
- Balance verification straight from the statement's printed closing figure, so "current" stops meaning "I last looked a while ago".

## Guardrails that stay
- Nothing uncertain is ever posted automatically.
- One record can only be matched to one statement line, and vice versa.
- An account's balance check must pass before its postings go in.
- Every apply is one batch with a snapshot — undo puts back exactly what it changed, and never overwrites edits made after.
- Amount-only guesses are never treated as transfers or income.

## Technical notes
- **Files**: `src/lib/statement-pipeline/{identify,parse,match,classify,plan,apply}.ts` + tests; `src/routes/_authenticated/statements.tsx`; shared `StatementReview` components; `src/components/StatementInbox` rewired to the new flow.
- **Reuse**: `scoreMatch`/`matchRecords`/`missingLines`/`pairTransfers`/`balanceGate` from `statement-crosscheck.ts`, `parseForexStatement`/`reconcileWallet` from `forex-statement.ts`, `stageImport`/`postingBlockers`/`reconciliationReadiness`/rules from `historical-import.ts`, `finance_operation` RPC for atomic writes, `statementBatches` owner preferences for undo.
- **Storage**: new owner-RLS `statement_uploads` table (file path, account, currency, period, opening/closing, parsed lines as jsonb, status) with owner SELECT/INSERT/DELETE policies; receipts-style private bucket path `ownerId/uuid-name`.
- **Backend fallback**: a `requireSupabaseAuth` server function that reads the owner's own stored file and returns structured lines through the AI gateway; the deterministic matcher still runs in the app, and results are review-only until you confirm.
- **Tests**: pipeline unit tests (adapters, matcher one-to-one rule, gates, classification), route tests through real pages with isolated data and blocked external writes, plus a browser test for multi-file upload → review → apply → undo.
- **Not in scope now**: email intake, automatic linking of two matching transactions into one, changing any existing record without your confirmation.

## Order of work
Phase 1 first (it is the thing you feel), then Phase 2, then Phase 3. Each phase is verified on a phone screen and published only when you say so.
