# Track C — browser pop-up prompts replaced by in-app value dialogs (10 Nov 2026)

Owner KK (binding): replace the remaining `window.prompt` value edits with the Signature Flow pattern — a bottom sheet on
phone widths and a centred dialog on wider screens, a visible label, the current value prefilled, inline validation with
the same rules as before, Cancel plus one clearly named primary action, 44 px targets, focus management, and Escape/Cancel
change nothing.

Chromium device emulation (Playwright `devices['iPhone 15']`, `devices['iPad Pro 11']`, and a 1440×900 desktop viewport)
against a fixture dev server from the `modules/connections` worktree on port 8084 (stopped after capture). Every Supabase
call was answered locally by `scripts/browser/capture_prompt_replacement.cjs` (host `fixture.supabase.invalid`, same
fixture rows as `capture_module_connections.cjs`), so nothing reached a hosted service. Fixture data only. JPEG, at most
720 px wide. These are emulation captures, not real-device checks.

Re-run: `PHASE=before|after OUT=<dir> BASE=http://127.0.0.1:8084 NODE_PATH=$(npm root -g) node scripts/browser/capture_prompt_replacement.cjs`.
`before` was taken on f6b2580 before any change.

## What changed

| Where | Before (browser pop-up) | After (in-app `ValueDialog`) | Saved on confirm (unchanged) |
|---|---|---|---|
| Plan → Recurring → **Edit amount** | `New amount for <name> (₹)`, prefilled | "Edit amount for <name>", field **Amount (₹)** prefilled, decimal keypad, primary **Save amount** | `saveCommitment({...c, amount: Number(v)})` |
| Wealth → account → **Rename account** | `Account name`, prefilled | "Rename account", field **Account name** prefilled, primary **Save name** | `updateAccount(id, { name })`, toast "Saved" |
| Wealth → account → **Adjust to statement balance** | `Actual balance shown on your statement (₹)`, empty | same label, empty, decimal keypad, explanation of the adjustment entry, primary **Adjust balance** | `adjustBalance(account, Number(v), today)`, toast "Saved" |
| DocuRepo → **Rename** | `Document title`, prefilled | "Rename document", field **Document title** prefilled, primary **Save title** | `updateDocument(id, { title })`, toast "Document updated" |

Inline rules (`src/lib/value-edits.ts`) are the store's own save rules with the same messages: amount must be greater than
zero; name the account / another account already has that name; enter the balance you see at the bank (blank or not a
number); give the document a title. The store still checks on save; amounts are parsed exactly as before (`Number` of the
typed text) and currency/ledger rules are untouched. A failed save keeps the dialog open with the reason under the field.

Browser prompts recorded during the `before` run (they are drawn by the browser, so they never appear in a screenshot):
`New amount for Flat rent (₹)` [32000], `Account name` [Amex card ••1009], `Actual balance shown on your statement (₹)` [],
`Document title` [HDFC statement Oct 2026] — see `index-before.json`. The `after` run recorded no browser dialogs and no
table writes (`index-after.json`).

## Reproduction and regression (`repro/`)

- `prompts.repro.test.tsx.before.txt`: the reproduction as first written, asserting `window.prompt` is called on f6b2580.
- `repro-run-before-fix.txt`: its run (3/3 passing = every prompt reproduced).
- `acceptance-run-before-fix.txt`: `src/lib/no-browser-prompt.acceptance.test.ts` against the unfixed three files (2 failing).
- `regression-run-after-fix.txt`: `src/components/prompt-replacement/prompts.repro.test.tsx` (now the regression) and the acceptance test after the fix.

## Screens

| File | What it shows |
|---|---|
| `iphone-before-01-plan-edit-amount.jpg` | Plan: Edit amount opens a browser pop-up (window.prompt) with no label, rules or Cancel guidance |
| `iphone-before-02-account-rename-adjust.jpg` | Account settings: Rename account and Adjust to statement balance both open browser pop-ups |
| `iphone-before-03-vault-rename.jpg` | DocuRepo: Rename opens a browser pop-up |
| `ipad-before-01-plan-edit-amount.jpg` | Plan: Edit amount opens a browser pop-up (window.prompt) with no label, rules or Cancel guidance |
| `ipad-before-02-account-rename-adjust.jpg` | Account settings: Rename account and Adjust to statement balance both open browser pop-ups |
| `ipad-before-03-vault-rename.jpg` | DocuRepo: Rename opens a browser pop-up |
| `desktop-before-01-plan-edit-amount.jpg` | Plan: Edit amount opens a browser pop-up (window.prompt) with no label, rules or Cancel guidance |
| `desktop-before-02-account-rename-adjust.jpg` | Account settings: Rename account and Adjust to statement balance both open browser pop-ups |
| `desktop-before-03-vault-rename.jpg` | DocuRepo: Rename opens a browser pop-up |
| `iphone-after-01-plan-edit-amount.jpg` | Edit amount: labelled field prefilled with the current amount, Cancel and Save amount |
| `iphone-after-02-plan-amount-error.jpg` | Inline validation: the same rule the save enforces (amount must be greater than zero); nothing saved |
| `iphone-after-03-account-rename.jpg` | Rename account: current name prefilled; duplicate and empty names are explained inline |
| `iphone-after-04-account-rename-duplicate.jpg` | Inline validation: another account already has that name; nothing saved |
| `iphone-after-05-account-adjust.jpg` | Adjust to statement balance: explains that an adjustment entry is added for today; Cancel or Adjust balance |
| `iphone-after-06-vault-rename.jpg` | Rename document: current title prefilled, Cancel and Save title |
| `iphone-after-07-vault-rename-error.jpg` | Inline validation: a title is required; nothing saved |
| `ipad-after-01-plan-edit-amount.jpg` | Edit amount: labelled field prefilled with the current amount, Cancel and Save amount |
| `ipad-after-02-plan-amount-error.jpg` | Inline validation: the same rule the save enforces (amount must be greater than zero); nothing saved |
| `ipad-after-03-account-rename.jpg` | Rename account: current name prefilled; duplicate and empty names are explained inline |
| `ipad-after-04-account-rename-duplicate.jpg` | Inline validation: another account already has that name; nothing saved |
| `ipad-after-05-account-adjust.jpg` | Adjust to statement balance: explains that an adjustment entry is added for today; Cancel or Adjust balance |
| `ipad-after-06-vault-rename.jpg` | Rename document: current title prefilled, Cancel and Save title |
| `ipad-after-07-vault-rename-error.jpg` | Inline validation: a title is required; nothing saved |
| `desktop-after-01-plan-edit-amount.jpg` | Edit amount: labelled field prefilled with the current amount, Cancel and Save amount |
| `desktop-after-02-plan-amount-error.jpg` | Inline validation: the same rule the save enforces (amount must be greater than zero); nothing saved |
| `desktop-after-03-account-rename.jpg` | Rename account: current name prefilled; duplicate and empty names are explained inline |
| `desktop-after-04-account-rename-duplicate.jpg` | Inline validation: another account already has that name; nothing saved |
| `desktop-after-05-account-adjust.jpg` | Adjust to statement balance: explains that an adjustment entry is added for today; Cancel or Adjust balance |
| `desktop-after-06-vault-rename.jpg` | Rename document: current title prefilled, Cancel and Save title |
| `desktop-after-07-vault-rename-error.jpg` | Inline validation: a title is required; nothing saved |
