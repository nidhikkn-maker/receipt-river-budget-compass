# Workstream 1 — batch 2026-11-07c

All runs used disposable demo workspaces (w2flow@, w2flow2@, perf9@, perf10@example.com) or in-memory ledgers. No real records changed, nothing published, approval trigger untouched.

## 1. Completed save shown as interrupted (defect)
- **Defect:** if the final "complete" history write was lost (page closed, connection dropped), a fully saved upload stayed labelled "interrupted" and the toast said it had not finished.
- **Root cause:** completion was only ever recorded by that one write; nothing re-derived it from the saved ledger.
- **Fix:** the first checkpoint now records the planned counts (`expected`). `settledUpload` (history.ts) marks an interrupted upload complete only when every planned entry/mark is in confirmed history, every posted entry exists in the ledger and carries its statement link. Old uploads without planned counts are never guessed. Statement Desk settles these on open; a lost completion write is retried in the background and no longer shown as an error. A ref guard blocks a second Apply while one is running.
- **Acceptance (browser):** all three completion writes were deliberately blocked; Apply was double-clicked. Result: 2 entries posted once, page closed, reopened and reloaded → upload shown without "interrupted", Undo available. 6 rule tests in `save-status.test.ts`.

## 2. C-0734 / C-0735 — connected screens after import
- Before save: Inbox Matched 0; Statement accounts "No statement confirmed yet"; Reconciliation "Not Started — Upload a statement".
- After save + reload: Inbox Matched 2 with lines under "Recently matched"; Statement accounts "Statement-confirmed to 2026-11-04", Nov ✓; Expenses lists both entries.
- **Defect found:** Account Reconciliation still said "Not Started / Upload a statement" — it only read historical-import batches. Fixed with `withStatementDeskEvidence`: uses saved statement-matched entries, names missing months, links to Statement Desk, never marks the balance verified. After fix: "2026-11-04 · In Progress · Not Verified · Current — Upload statements for 2026-10 in Statement Desk". 5 rule tests.

## 3. C-1321 / C-0111 — card bill payment
`card-payment-flow.test.ts` drives the real `buildPlan` → `applyUpload` → `undoUpload` with an in-memory ledger:
- Card purchases ₹15,000 owed. Bank debit and card credit of ₹9,000 uploaded together: both held for confirmation, paired.
- After confirming: bank 50,000 → 41,000; card owed 15,000 → 6,000 (partial stays outstanding); spending 15,000, income 0.
- Re-uploading either statement matches the single payment; nothing new to save. Retrying the same save adds nothing. Undo restores 50,000 / 15,000.
- A card credit with no bank side is held for review, never income.

## 4. C-1765 — icon at phone sizes
Rendered at 16, 20, 29, 40, 48, 60, 76, 120, 152, 180 px at 2x and 3x, on white and black. All load; the mark is legible at 16 px; the dark tile edge stays visible on black.

## 5. Slow Inbox run investigation
10 opens on a phone-sized screen per run:
| | Title shown | Fully loaded (median) | Worst |
|---|---|---|---|
| Before | 0.9 s (first 2.9) | 3.3 s | 6.4 s |
| After index | 0.9 s | 2.4 s | 5.3 s |

- Database time per query is small (mean 2.5–70 ms, max ~1 s). The slowest request differed every run (entries, holdings, demat, imports, demo session — and once the local favicon at 2.4 s), so the spikes come from the preview dev server and network, not one reproducible query.
- Real finding: the entries table had no index for "my entries, newest first"; added one on owner + date.
- Conclusion: isolated, environment-driven delays; not a reproducible app defect. A published-site timing remains open.

## Tests
- Statement pipeline + reconciliation suites: 13 files, 96 tests passed.
