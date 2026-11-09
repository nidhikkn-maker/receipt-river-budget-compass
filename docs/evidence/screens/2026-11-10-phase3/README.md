# Phase 3 screenshots (2026-11-10): C11 row approval and reversal of posted entries

**Where these come from.**
- **Server:** a fixture dev server started from the worktree `/home/user/thapal-phase3` on port 8082, with `SUPABASE_URL=https://fixture.supabase.invalid`.
- **Browser:** Playwright Chromium, in the device emulations iPhone 15, iPad Pro 11 and Desktop Chrome.
- **Script:** `scripts/browser/capture_phase3_screens.cjs`.
- **Network:** every Supabase call was answered locally, so no hosted service was reached. The server was stopped after capture.
- **Format:** the PNG captures were converted to JPEG, at most 720 px on the long side.

**Fixture.**
- **Account and entry:** one HDFC savings account (opening 26,800) and one posted entry, "Dinner at Toit" (₹1,800, with a receipt).
- **Statement:** a five-line CSV statement, uploaded through the real Statement Desk file input. It produces 2 suggested rows and 3 "needs your decision" rows.
- **Posting state:** `POSTING=on` answers `posting_status()` with `{installed: true, active: true}`, which simulates P7 installed and active. `POSTING=off` answers PGRST202, the same as the production schema, where the function is missing.

| Prefix | Meaning |
|---|---|
| `before-*` | Branch base `a8a6a50` UI (captured before the Phase 3 UI edits) |
| `after-*` | Phase 3 UI with posting active |
| `after-noposting-*` | Phase 3 UI with the posting function missing (production schema): delete behaves as today |

| Shot | Before | After |
|---|---|---|
| `01-statement-plan` | Tile "Ready to save when you confirm" | Tile "Suggested · approve each row" |
| `02-statement-save-button` | **"Apply everything (2 to save)"** saved every automatic row in one tap, and **"Accept all 3 asking items"** bulk-ticked the rest | No bulk save. The button reads "Approve rows to save" (disabled) until rows are ticked. A note gives the count of approved rows out of the suggested rows |
| `03-statement-one-approved` (after only) | none | One row ticked, and the button reads "Save 1 approved row" |
| `04-entry-detail` | "Delete" (hard delete of the row and its receipts) | "Reverse entry" when posting is active. `after-noposting-*` still shows "Delete" (capability check, fail-closed to today's behaviour) |
| `05-reverse-dialog` (after only) | none | The reason is required (at least 5 characters), and "Reverse entry" is disabled until one is given. The text explains that the reversal is posted on the same date and that the original posting, the audit record and the receipts are kept. Re-confirmation (step-up) follows |

The screens use only the existing components and semantic tokens (Checkbox, Dialog, Textarea, Button variants), so every theme keeps working.
