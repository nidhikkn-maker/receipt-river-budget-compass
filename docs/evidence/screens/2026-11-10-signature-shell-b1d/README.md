# Smart Add batch B1d: card evidence, unambiguous dates, clear toasts, duplicate reasons (10 Nov 2026)

> **Builds on the accepted B1c layout.** KK accepted the Add, Review and Confirm layouts on 10 Nov 2026, so this batch keeps them. No typography, spacing, radius or colour was changed. The only additions are the new controls listed below.
> **Proposed, behind the Signature Flow preview switch.** The account rule (KK decision D1), the date field and the duplicate rules also apply to the classic review.

## How these were taken
- **Script.** `scripts/browser/capture_signature_shell_b1d.cjs`, run against a Vite dev server on port 8085. The server used the fixture Supabase host `fixture.supabase.invalid`, so nothing reached hosted services and every write was refused.
- **Device.** Playwright Chromium emulating an iPhone 15: 393 × 659 CSS px at DPR 3. Safe areas of 47 px (top) and 34 px (bottom) were emulated through CDP.
- **Receipt.** The sample Blue Tokai receipt image. It prints `Paid: Credit card ****1006` and does **not** print a card network.
- **Labelled stand-in for receipt reading.** `src/lib/receipt-extract.functions.ts` was answered in the browser by a stand-in. It returns what the real reader returns for this bill, including the new card fields: `card_network: null` (no network is printed) and `card_last_four: "1006"`. The real server function was not called.
- **Variant capture (13).** This capture alone uses a second labelled stand-in, whose bill text reads `Paid: AMEX ****1006` with `card_network: "amex"`. It shows the wording used when the network is printed.
- **Fixture accounts.** The fixture owner has *Amex Platinum Travel* (credit card, issuer American Express, last four 1006). No other account ends in 1006.
- **Fixture duplicate.** The fixture ledger already holds a "Blue Tokai" entry for ₹460 on the same day. The existing Statement Desk matching check therefore reports a strong match.
- **Nothing was saved.** The run stops with **Confirm and save** enabled and never presses it.
- **Measurements.** `index.json` has the bounding boxes for each capture: the footer, its actions, any toasts and the date field (shown text and stored value).

## Captures
| File | Shows |
|---|---|
| `01-add` | Step 1, Add. Unchanged from B1c. |
| `02-toast-clear-of-footer` | The "Bill read" toast while the sticky footer is on screen. The toast sits **just above the footer**: toast 463–517, footer starts at 525, a gap of 8 px. The footer includes the 34 px bottom safe area. The toast is clear of the 47 px top safe area and of the header and close button. |
| `03-review-details` | Step 2, Review, Details tab, from the top |
| `04-review-date-field` | The date field always reads **09 Nov 2026**. Its stored value is `2026-11-09` (`data-value`), and its accessible name is "Date: 09 Nov 2026. Change date". |
| `05-review-date-picker` | The field opens a calendar on the stored day, with month and year menus and 44 px day targets. The field first scrolls up so the calendar fits below it; if the calendar still doesn't fit, it scrolls instead of being cut off. |
| `06-review-account-suggested` | *Amex Platinum Travel* suggested, with the evidence "Card ending 1006 printed on the bill matches Amex Platinum Travel" and a **Confirm this account** button. The form reports `data-account-state="suggested"`. |
| `07-review-original` | The Original tab. The source is kept. |
| `08-duplicate-reason-required` | **It's separate** pressed without a reason: the review refuses and asks why |
| `09-duplicate-separate-with-reason` | Separate bill confirmed, with its reason. The reason is saved with the entry, along with when it was decided and who decided it (the server sets who). |
| `10-confirm-blocked` | Step 3 is blocked because the suggested account has not been confirmed. It shows the evidence line. |
| `11-review-account-confirmed` | Back in Review, the owner pressed **Confirm this account** (`data-account-state="confirmed"`) |
| `12-confirm-enabled` | Step 3 with **Confirm and save** enabled (not pressed) |
| `13-variant-amex-printed` | Variant stand-in. The evidence reads "**Amex ending 1006** printed on the bill matches Amex Platinum Travel". |
| `14-home-card-payment` | Home's net-worth card on iPhone 15 (same fixture server). The fixture card's 18 Oct statement (₹41,250, due 7 Nov) was paid on 4 Nov. The card used to read "₹46,139 · Due 7 Nov". It now reads **₹0 · Paid · ₹46,139 outstanding**. |

- **Recaptured 10 Nov 2026, 10:31 UTC.** Captures 01–13 were taken again after the last source edits to the review. The measurements were identical. Capture 14 was taken at 10:33.

## Home card payment (KK decision, 10 Nov 2026)
- **Separate figures.** Home's **Card payment** figure is now the statement amount still due (`remainingDue`). The line under it gives the payment status, then the **total outstanding**, which is labelled "outstanding" and never "due".
- **Payment status.** It is one of: Paid, Partly paid · Due *date*, Due *date*, Overdue since *date*, Statement not recorded, or Nothing due on the statement.
- **When a card counts as overdue.** Only when two things are true. The due date of the latest statement has passed, **and** `cardCycle` still shows an amount due on that statement after the payments recorded up to today. The rule is `src/lib/cards.ts` `cardPaymentStatus` / `cardPaymentSummary`, built on `cardCycle`. No accounting was reimplemented.
- **Minimum due.** The ledger doesn't record a minimum due, so none is shown. The field is ready for when one is recorded (`minimumDue: null`).
- **No statement day saved.** The card shows **Statement not recorded**, with "—" in place of an amount. Nothing is inferred.

## Toast measurement (item 4)
| Capture | Toast box (x, y, w, h) | Footer top | Gap | Intersects footer |
|---|---|---|---|---|
| 02 | 16, 463, 361, 54 | 525 | 8 px | no |
| 03 | 16, 463, 361, 54 | 525 | 8 px | no |

- **Rule.** `src/lib/toast-placement.ts`. While the Signature Flow sheet is open, the app's Toaster is raised above the footer, which is measured continuously.
- **Classic Smart Add sheet.** It has no single footer element, so toasts there move to the top, below the top safe area.
- **Everywhere else.** Toasts keep the bottom-right default.

## Focused tests (three runs, each 9 files / 122 tests passed; `bun run typecheck` clean)
- `src/lib/account-evidence.test.ts` covers:
  - card identifiers on the bill (item 1);
  - the D1 account rule for the sample bill: unique match, network mismatch, saved card, cash, company card or paid by someone else, reimbursement, and the audit record;
  - dates round-tripping through ISO.
- `src/components/DateField.test.tsx` checks the date field under en-US and en-IN: it shows 09 Nov 2026, keeps the ISO value, and changes only when the owner picks a day (item 3).
- `src/lib/toast-placement.test.tsx` checks that toasts sit clear of the footer (item 4).
- `src/lib/duplicate-decision.test.ts` checks that a false positive is released only with a reason that names who decided and when, and that confirmed duplicates stay protected (item 5).
- `src/components/smart-add/smart-add-flow.test.tsx` (10 tests) covers:
  - suggestion, Confirm blocked, confirm, then one save with the source;
  - changing the account, cancelling, hiding and reopening;
  - a retry with the same draft id;
  - duplicates: the reason, same bill, strong match and the same receipt file;
  - the classic review using the D1 rule;
  - resuming a draft (item 6).
- `src/lib/receipt-reading.test.ts` and `src/lib/cards.test.ts`.
- `src/lib/card-payment-summary.test.ts` holds the hand-calculated cards:
  - (a) overdue;
  - (b) paid;
  - (c) partly paid and overdue;
  - (d) due 20 Nov;
  - (e) statement not recorded;
  - a paid statement past its due date is not overdue;
  - several cards.
- `src/components/shell/SignatureShell.test.tsx` renders Home on 10 Nov and 5 Nov, and after a payment.
- **Neighbouring checks (one run, 9 files / 78 tests passed).**
  - `SmartAdd.test.tsx`, `IntelligentCanvas.test.tsx` and `ClaimExpenseDetails.test.tsx`.
  - `acceptance-v4.test.ts`, `phase2-independent.test.ts` and `phase3-c11.test.ts`.
  - `store-load-failure.test.tsx`, `DematHoldings.load-error.test.tsx` and `shell/switch.test.tsx`.

## Not verified
- Real iPhone Safari.
- Dark mode.
- iPad and desktop.
- The real AI reader's output for this image. The stand-in returns the fields the prompt and schema now ask for, but the real model was not run.
- `scripts/browser/test_smart_add.py` was updated for the new date field but not run, because its fixture server uses port 8080.
