# Smart Add refinement, batch B1c: iPhone 15 Review and Confirm (10 Nov 2026)

> **Proposed — awaiting KK visual approval.** The new flow sits behind the Signature Flow preview switch; the classic UI keeps today's Smart Add sheet.
> **Placeholders.** The T mark and the Inter typeface are still placeholders until the final assets arrive.

## How these were taken
- **Builds compared.** The **BEFORE** captures come from commit `29f609e` (B1b), taken before any change. The **AFTER** captures come from the B1c working tree.
- **Same setup for both.** Both sets used the same script (`scripts/browser/capture_signature_shell_b1c.cjs`) on a dev server at port 8085.
- **Device.** Playwright Chromium emulating an iPhone 15 (393 × 659 CSS px, DPR 3), with a 34 px bottom safe area emulated through CDP.
- **Fixture data only.**
  - Receipt reading was answered in the browser by a stand-in. Its receipt text says "Paid by credit card" with **no card digits**, which is deliberately insufficient evidence for picking an account.
  - The fixture ledger already contains a Blue Tokai entry for ₹460 on the same day, so the review's existing duplicate check fires.
  - Nothing was saved: the run stops before **Confirm and save**.
- **Images.**
  - `ba-*.jpg`: BEFORE and AFTER side by side at the identical viewport.
  - `after-*.jpg`: the AFTER captures.
  - `*-index.json`: measurements for each capture.

## Captures
| File | Shows |
|---|---|
| `after-01-add` / `ba-01-add` | Step 1 Add, compacted: four choices in one row of 52 px targets |
| `after-02-review-details` | Step 2, Details tab |
| `after-03-review-date` | The read date shown as **"09 Nov 2026"** under the native picker, which shows locale-dependent "11/09/2026" in en-US browsers. The stored value is unchanged ISO. |
| `after-04-review-account` | **"Account needs confirmation"**: the bill doesn't say which card paid, so "Paid with" stays on *Choose account*. B1b had filled in the habit account, *HDFC Regalia*. |
| `after-05-review-original` / `after-06-review-details-again` | Original and Details tabs. The review is not remounted, so edits and the selected document are kept. |
| `after-06b-review-duplicate-check` | The review's existing duplicate check, unchanged, holds Continue until it is answered |
| `after-06c-review-continue-ready` | The persistent, safe-area-aware **Continue to confirmation** in the sheet footer, now enabled |
| `after-07-confirm` | Step 3 **blocked**: "Account needs confirmation", the account shown as *Not chosen · needs confirmation*, Confirm and save disabled, and a **Choose the account** action |
| `after-08-review-account-chosen` | Back in Review, the owner chose *Amex Platinum Travel* |
| `after-09-confirm-enabled` | Step 3 with the account confirmed: Confirm and save enabled (not pressed). The date reads "09 Nov 2026". |

## Item 6: compactness on iPhone (measured, CSS px)
| Element | B1b | B1c |
|---|---|---|
| Sheet header (overline, title, steps) | 126 (Add) / 153 (Review; the title wrapped onto two lines) | **103** (the title fits on one line) |
| Choice chips | 88 (two rows of 40 px chips) | **52** (one row of 52 px targets) |
| Drop area | 182 | **150** |
| Footer, including the 34 px inset | 107 / 135 (with the old instruction) | **97**; 134 while it explains why Continue is unavailable |
| Smallest text | 10 px (overline) | 10 px (overline); body 12–14.5 px |
| Controls under 44 px, Add step | 4 (choice chips at 40 px) | **0** |
| Controls under 44 px, Review step | 8 (type chips 40 px, Details/Original 36 px, tax remove 40 px wide, links 16–20 px) | **0** buttons or links. The only small item is one 20 px checkbox, which has a larger label. |

## Not verified
- Real iPhone Safari.
- Dark mode.
- Desktop and iPad for this batch. Their layout is unchanged from B1b, apart from the new footer action and the date and account notes.
