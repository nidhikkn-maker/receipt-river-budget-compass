# Statement Desk — one upload that does the work

## What you asked for
The way I matched your statements this week — read every file, line them up against your records, tell you what's missing or recorded as the wrong thing, ask you only the few questions that matter, then post with a safety net — should happen inside the app. You should be able to drop in many statements at once and have one flow do the matching, the categorising, the account linking and the posting, without it being a painful job.

Your decisions, already folded in:
- Parse on your device first; send a file to your private backend only when the device can't manage it.
- Save exact matches automatically; ask about everything doubtful.
- If a statement belongs to an account not in the app, create the account with its opening balance and carry on.

## How I worked, turned into app steps
1. **Read** each file and find out whose statement it is (bank name, account number, currency, balance signature).
2. **Line up** every statement line against your records — amount and close date, each record used once — with a confidence score and the reason for each result.
3. **Sort** every line and record into: already recorded / missing / wrong account / wrong kind (a card payment shown as income) / transfer between your own accounts / card payment / possible duplicate / unmatched.
4. **Check the money adds up** per account: opening + debits − credits = printed closing. Nothing posts while its account's balance check fails.
5. **Suggest categories** from your own rules and merchant history, and apply the confident ones in bulk.
6. **Ask only the few things only you know** ("which account paid this?", "what was this for?").
7. **Post once**, as one operation you can undo in one tap from any device.

## What already exists, and what has to change
The app already has the hard parts, but in **three separate pipelines** that disagree with each other:

| Today | State |
|---|---|
| Historical import | Multi-file upload, private storage of originals, resumable extraction, safe posting in chunks — the strongest base |
| Financial Inbox → Statements | Single file only, its own matcher, its own category plan |
| Statement cross-check / Forex reconcile | Their own PDF readers, their own matchers, their own posting and undo |

The mismatches that make it feel painful:
- **Three line formats** (`BalanceLine`, `ForexLine`, `StatementLine`) and **four matching rules** with different confidence meanings.
- **Five identity schemes** — some paths use a stable id, the Inbox uses a fresh random id, so a retry can double-post.
- **Three kinds of "undo"** — deleting remembered ids, correction snapshots, and "forget this upload" — and no way to reverse a whole multi-file import.
- **Categories** come from your rules and history in two flows, but are hard-coded in the specialist ones.
- **Transfer linking** lives on its own page, so an upload never links both sides of your own movement.
- **Reconciliation** means three different things: an arithmetic check, a per-row tick, and an evidence-backed checkpoint.

So this is an architecture change, as you allowed: one pipeline that all screens use.

## The build
### Phase 1 — one upload, one review, one apply (the thing you feel)
- Build on the historical-import base (multi-file, originals stored privately, extraction that resumes) and give it the cross-check method: explained confidence and reasons, "already recorded / wrong account / wrong kind", and the balance check per account.
- One canonical statement-line model and one matcher used everywhere, so the same two files give the same answer on every screen.
- One identity per statement line (account + date + amount + description), used both to stop double-posting and to remember what you've already uploaded.
- New `/statements` screen: drop many PDFs (or a folder), watch each file's status, then **one review screen** in three groups — *Saved automatically*, *Needs your decision* (each with the question and why), *Left for later* — plus one **Apply everything** and one **Undo this upload**.
- Financial Inbox → Statements, `/statement-crosscheck`, `/forex-reconcile` and `/historical-import` all open this one flow instead of their own copies.

### Phase 2 — auto-creation, auto-categorising, both-side transfer links
- Create a missing account from its statement (name, currency, opening balance) and continue.
- Apply confident categories in bulk; leave the rest for one tap each.
- Link both sides of a transfer between your own accounts as one movement when evidence is strong (same currency and amount plus a reference or narration match), shown before it saves.
- Recognise card payments and statement credits as payments, never income.
- One upload session = one operation record covering every file, with a snapshot so undo puts back exactly what it changed, from any device.

### Phase 3 — coverage and confidence
- Coverage view: which account-months still have no statement, and which records sit outside any statement.
- Balance verification from each statement's printed closing figure, so "current" stops meaning "I last looked a while ago".
- Recurring/subscription detection and statement-derived corrections carried into the review screen.

## Guardrails that stay
- Nothing uncertain is ever posted automatically.
- One record matches one statement line, and the other way round.
- An account's balance check must pass before its postings go in.
- Every apply is one operation with a snapshot — undo never overwrites edits made after it.
- Amount-only guesses are never treated as transfers or income.
- Your AI privacy settings still decide whether a file may be sent for extraction; the deterministic matching always runs in the app.

## Technical notes
- **New core**: `src/lib/statement-pipeline/` — `source.ts` (file → rows: PDF.js on device, CSV/Excel, password-protected files, backend extraction fallback), `identify.ts` (account + currency + period), `parse.ts` (bank adapters: IDFC running balance, AMEX, HDFC, forex multi-currency, generic fallback), `match.ts` (one-to-one line↔record, score + reasons), `classify.ts` (the eight outcomes), `plan.ts` (one change plan, impact totals, per-account balance gates), `apply.ts` (atomic posting, stable ids, one undo).
- **Adopted, not rewritten**: `statement-auto.ts` classification and card-payment detection, `historical-import.ts` rules/staging/blockers/readiness, `statement-fingerprint.ts` memory, `transfer-match.ts` suggestions, `statement-checkpoint.ts` evidence, `statement-evidence.ts` identity, `extractStatement` / `scanned-import.server.ts` server extraction, `post_import_rows_secure` for safe writes, `correct_financial_entries` snapshot semantics for the new whole-upload undo.
- **Retired after the switch**: the duplicate PDF readers and matchers in `statement-crosscheck.tsx`, `forex-reconcile.tsx` and `StatementInbox.tsx`; random-id saves in the Inbox path; preference-stored id lists as the only undo trail.
- **Storage**: reuse `import_batches` / `import_rows` / `import_posts`; add owner-RLS `statement_operations` (session id, files, accounts touched, plan hash, posted ids, snapshot, status) so one upload spans many files and can be reversed as one; keep originals in the private owner prefix.
- **Migration check**: confirm the deployed database actually carries migrations 0031, 0032, 0037, 0041, 0043 and 0049 before relying on them.
- **Tests**: pipeline unit tests (adapters, one-to-one matcher, gates, classification, identity), route tests through real pages with isolated data and blocked external writes, and a browser test: multi-file upload → review → apply → undo.
- **Not in scope now**: email intake, automatic linking of two matching transactions into one, changing any existing record without your confirmation.

## Order of work
Phase 1 first, then Phase 2, then Phase 3. Each phase is verified on a phone screen and published only when you say so.
