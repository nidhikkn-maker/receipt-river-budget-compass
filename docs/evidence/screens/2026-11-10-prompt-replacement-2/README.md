# Track C — remaining browser pop-ups replaced by in-app dialogs (10 Nov 2026, second pass)

Owner KK (binding): "Replace remaining browser prompts with appropriate in-app dialogs, prioritising destructive financial
actions, approvals and period closing." Every `window.confirm` / `window.prompt` left in `src` after the first pass
(`../2026-11-10-prompt-replacement/`) is replaced. `src/lib/no-browser-prompt.acceptance.test.ts` is now strict: it
fails on any browser `prompt(` or `confirm(` call anywhere in `src` outside tests (parsed with TypeScript, so local
functions named `confirm`/`prompt`, e.g. in `ArchivedRecords.tsx` and `step-up.ts`, are not mistaken for the browser ones).

Chromium device emulation (Playwright `devices['iPhone 15']`, `devices['iPad Pro 11']`, and a 1440×900 desktop viewport)
against a fixture dev server from the `modules/connections` worktree on port 8084 (started with
`VITE_SUPABASE_URL=https://fixture.supabase.invalid`, stopped by PID after capture). Every Supabase call was answered
locally by `scripts/browser/capture_prompt_replacement_2.cjs` (same fixture rows as `capture_prompt_replacement.cjs`,
plus one card purchase "Team lunch" with one receipt, one trip "Goa offsite" and one closed period 2023-04-01 → 2024-03-31),
so nothing reached a hosted service. Fixture data only. JPEG, at most 720 px wide. Emulation captures, not real devices.

Re-run: `PHASE=before|after OUT=<dir> BASE=http://127.0.0.1:8084 NODE_PATH=$(npm root -g) node scripts/browser/capture_prompt_replacement_2.cjs`
(`ONLY=iphone,ipad` re-runs some viewports into `index-<phase>-iphone-ipad.json`). `before` was taken on 9bf2b6a before
any source change. Browser pop-ups are drawn by the browser, so they never appear in a screenshot; their text is recorded in
`index-before.json` (desktop) and `index-before-iphone-ipad.json`. The `after` run recorded no browser dialogs and no table
writes or preference saves (`index-after.json` for iPad/desktop; the iPhone pass was re-run into
`index-after-iphone.json` after the fix below): every dialog was cancelled.

Found while capturing (fixed, same file): on iPhone the trip Overview's "Add travel categories (…)" button did not wrap,
so the whole trip page was wider than the screen and a bottom sheet opened there was cut off on the right (visible in
`iphone-before-02-trip-cancel.jpg`). The button now wraps (`h-auto whitespace-normal break-words`); iPhone after-captures
were taken with the fix.

## Shared components

- `src/components/ConfirmDialog.tsx` (new): names the record, states what happens (description + consequence list),
  Cancel plus one clearly named primary action (destructive-styled for removals and period closing). Optional required
  reason field, optional typed confirmation (same pattern as Settings → Delete all data and trip delete; matches ignoring
  case and extra spaces), optional extra content (account choice, EMI fields). Bottom sheet on phone (`native-sheet`),
  centred `sm:max-w-lg` dialog wider. Focus starts in the first field, or on Cancel when there is nothing to type, so Enter
  never confirms by accident. Escape, close and Cancel do nothing; while running it cannot be dismissed; a failure keeps it
  open with the reason (`role="alert"`). All targets are the shared 44 px `Button`/`Input`; semantic tokens only.
- `src/components/ValueDialog.tsx`: gains `type="date"` and `maxLength`.
- `src/lib/value-edits.ts`: inline rules mirroring the existing save rules (`emiProblems` = the `convert_emi` database
  limits, `goalSavedProblem`, `journalReversalReasonProblem` = `reverseAccountingJournal`'s ≥5 characters,
  `findingNoteProblem` = `setFindingState`'s ≥3 characters, `categoryRenameProblem`, `organisationRenameProblem`,
  `leaseRenewProblem`, `requiredText`, `periodLabel`, `fyLabel`).

## What changed (operation unchanged in every case)

| Where | Before | After | Operation on confirm |
|---|---|---|---|
| Expense → **Delete** (posting not active) | `confirm("Delete this expense and its receipts?")` | "Delete “<title>”?" — "This expense is deleted, not reversed: posting to your books is not active for it, so it is removed from your records together with its receipt files. This can't be undone." Lists amount/date/account, receipt count, and that a posted entry is never deleted (reversal is offered instead). Destructive **Delete expense** / **Keep expense** | `remove(e)` as before. If the database refuses (posted), nothing is deleted and the existing reversal dialog (reason ≥5, correction date) opens. Where posting is active the button is still **Reverse entry** → existing reversal dialog, unchanged |
| Expense → **Record reimbursement** | prompt: type an account name | Choose the account (radio list of savings/current/cash/wallet accounts); says it is dated today, settles the claim, not income | `recordReimbursement([id], account, today)` |
| Expense → **Convert to EMI** | three prompts (months 6, rate 12, fee 0) | one dialog with the three fields prefilled; limits shown inline; says a fee > 0 becomes a separate "Financial charges" expense | `convertToEmi(e, {months, rate, fee})` |
| Trip → More → **Cancel trip** | `confirm("Cancel this trip? …")` | "Cancel “<trip>”?" — records stay, nothing removed, can be undone; destructive **Cancel trip** / **Keep trip** | `put({ cancelledAt })` |
| Company journal → **Prepare reversal** | prompt "Reason for reversing this journal" | names the journal; says nothing is posted until the balanced journal is confirmed; reason required (≥5) | `reverseAccountingJournal(row, id, today, reason)` → journal review opens |
| Shared company → **Edit** | prompt "Description" | ValueDialog "Edit entry description", prefilled, required | `expenses.update({ title })` (unchanged text = no write) |
| Rules → **Approve** (reaches closed/filed years) | `confirm("This rule reaches back into FY …")` | names the rule, the protected years and why; **Approve for open periods** | `activateRule(...)`; rules with no protected year still activate directly |
| Strategy → **Save as planned payment…** | `confirm("Save … as a planned payment?")` | says nothing is paid and no money moves; **Save to plan** | `saveCommitment(plannedScenario(s))` |
| Audit → **Close period** | `confirm("Close <from> to <to> and retain …?")` | names the period; lists what is locked, that figures are saved as evidence, that **only the Audit operation (Reopen here, with a permanent reason) can reopen it**, and the note kept; **type the period** (`2025-04-01 to 2026-03-31`) to enable destructive **Close period** | `change_accounting_period('closed', from, to, note, figures)` via step-up |
| Audit → **Freeze FY** | `confirm("Freeze FY …?")` | names the FY and its dates, same consequences; **type the year** (`FY 2025-26`) | same close for the full FY, note or "FY … frozen" |
| Audit → **Reopen** | prompt "Reopening a closed period needs a reason" | names the period; says what unlocks and that the reason is kept permanently; reason required | `change_accounting_period('reopened', …, reason)` |
| Audit → **Mark fixed / Accept with note** | prompt (a note under 3 characters failed with a toast) | names the finding; note required (≥3, the save rule) | `setFindingState(...)` |
| Property → **+ building / + floor / + unit** | prompts | ValueDialog naming where it is added; name required | same `upd(property)` |
| Property → lease **Renew** | prompt; an invalid/earlier date was silently ignored | date field prefilled with the current end; earlier/invalid date explained | same `save({ leases })` |
| Settings → **Rename category** | prompt | prefilled; existing name → "Use merge for an existing category" inline | `moveCategory` then catalog/budget rename |
| Organisations → **Rename** | prompt; duplicate was a toast | prefilled, 24-character limit; duplicate (any case) inline | same preference + tag rename |
| Split → **Save as template** | prompt | name required; same-name template replaced (said in the hint) | same `splitTemplates` save |
| Goals → **Update** | prompt; blank saved 0, text saved NaN | prefilled; blank/not a number and negative explained | `saveGoal({...g, saved})` |

Deliberate tightenings (all toward "Cancel/Escape = nothing happens" and visible validation): whitespace-only reasons,
names and notes are refused inline (the pop-ups accepted e.g. a single space); a blank goal amount is no longer saved
as 0; an invalid renewal date is explained instead of silently ignored; errors that used to be a toast now stay in the
dialog next to the field.

## Reproduction and regression (`repro/`)

- `*.repro.test.tsx.before.txt`: the four reproductions as first written (17 tests asserting the browser pop-up is called).
- `repro-run-before-fix.txt`: their run on 9bf2b6a — 17/17 passing = every pop-up reproduced.
- `no-browser-prompt.acceptance.test.ts.strict.txt` + `acceptance-run-before-fix.txt`: the strict acceptance test against
  the unfixed code — 2 failing, 12 files listed.
- `regression-run-after-fix.txt`: the same four files rewritten as regressions (they now fail on any pop-up) plus the first
  pass's `prompts.repro.test.tsx` and the strict acceptance test — 35/35 passing.

## Screens

| File | What it shows |
|---|---|
| `{iphone,ipad,desktop}-before-01-expense-delete.jpg` | Expense detail: Delete asks with a browser pop-up ("Delete this expense and its receipts?") that names nothing |
| `{iphone,ipad,desktop}-before-02-trip-cancel.jpg` | Trip → More: Cancel trip asks with a browser pop-up |
| `{iphone,ipad,desktop}-before-03-period-close-freeze.jpg` | Audit → Closed periods: Close period, Freeze FY and Reopen use browser pop-ups; nothing to type, no statement of who can reopen |
| `{iphone,ipad,desktop}-after-01-expense-delete.jpg` | Delete expense: names the entry, amount, date, account and receipt count; deleted not reversed; can't be undone; destructive Delete expense, Keep expense |
| `{iphone,ipad,desktop}-after-02-trip-cancel.jpg` | Cancel trip: records stay, can be undone; Keep trip or Cancel trip |
| `{iphone,ipad,desktop}-after-03-period-close.jpg` | Close period: names the period, what is locked, evidence kept, only the Audit operation can reopen; Close period off until the period is typed |
| `{iphone,ipad,desktop}-after-04-period-close-typed.jpg` | The typed period matches, so Close period is enabled (nothing sent until pressed) |
| `{iphone,ipad,desktop}-after-05-freeze-fy.jpg` | Freeze FY: names the year and its dates; type the FY label to enable Freeze |
| `{iphone,ipad,desktop}-after-06-period-reopen.jpg` | Reopen: names the period; reason required and kept permanently |
| `{iphone,ipad,desktop}-after-07-period-reopen-error.jpg` | Reopen: an empty reason is explained inline; nothing sent |
