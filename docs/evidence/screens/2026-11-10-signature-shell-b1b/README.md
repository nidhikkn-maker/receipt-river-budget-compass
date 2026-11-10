# Signature Flow shell, batch B1b: iPhone correction and Intelligent Canvas (10 Nov 2026)

> **Proposed — awaiting KK visual approval.** The shell still sits behind the preview switch, and today's UI remains the default.
> **Placeholders.**
> - **T mark:** `ThapalTMark` in `src/components/ThapalLogo.tsx`. Swapping in the final artwork is a one-component change.
> - **Typeface:** Inter, set through the `--sf-font` token in `src/styles.css`. Swapping in the licensed typeface is a one-token change.

## How these were taken
- **Same app, two builds.** All captures come from the running app in the worktree `/home/user/thapal-uixb`, on dev server port 8085.
  - The **BEFORE** set was captured from the unchanged B1 build first. The **AFTER** set was captured after the B1b changes.
  - Both sets use the same script and the same viewports: `scripts/browser/capture_signature_shell_b1b.cjs` with `PHASE=before|after`.
- **Fixture data only.**
  - Supabase points at `fixture.supabase.invalid`, a host that does not exist.
  - Receipt reading is answered in the browser by a stand-in for the extraction server function. It returns one fixed Blue Tokai receipt reading; no AI or hosted service is called.
  - Nothing is saved: the captures stop at step 3, before **Confirm and save**.
- **Viewports and devices.** Playwright Chromium emulation:
  - iPhone 15 (393 × 659 CSS px, DPR 3);
  - iPad Pro 11 portrait (834) and landscape (1194);
  - iPad Split View at 507 and 694 px;
  - desktop at 1440 × 900.

  This is emulation; real Safari and real devices have not been checked.
- **Safe area.** The iPhone runs had a **34 px bottom inset** (`env(safe-area-inset-bottom)`), emulated through Chromium's `Emulation.setSafeAreaInsetsOverride`. While it is showing, the new shell sets `viewport-fit=cover`, so the insets apply on a real iPhone too.
- **Measurements.** `before-index.json` and `after-index.json` record, for each capture:
  - header height;
  - bottom-bar top and height;
  - the position of the "Coming up" heading;
  - the last content's bottom edge at the end of scroll;
  - horizontal overflow.
- **Composites.** The composer is `scripts/browser/compose_signature_shell_b1b.py`.
  - `ba-*.jpg` pairs BEFORE and AFTER at the identical viewport.
  - `compare-0N-*.jpg` pairs AFTER with an approved capture at matched scale:
    - desktop app frame scaled to 1440 CSS px, then both sides halved;
    - iPhone screen scaled to 393 CSS px.
  - `after-*.jpg` are the individual AFTER captures.

## iPhone: what changed (KK priorities 1–8)
| Priority | BEFORE (B1) | AFTER (B1b) |
|---|---|---|
| 1. Proportions and density of capture 02 | The greeting wrapped onto two lines, the card was tall, and Coming up was below the fold | The layout follows capture 02: the overline and Smart Add share the top row, then a one-line greeting, a compact card and Coming up |
| 2. Header and wordmark | Header 64 px; wordmark 22 px; four 44 px icon tiles; filled 44 px avatar | Header 56 px; wordmark 19 px; search moved out of the iPhone header; 19 px icons; 32 px avatar inside a 44 px touch target |
| 3. Greeting typography | 30 px greeting that wrapped beside the button | 26 px greeting that fits on one line. A grid puts the overline and Smart Add on one row, then title and sub-line. |
| 4. Net-worth card | Padding 24 px; figure 40 px; buttons 44 px | Padding 18 px; figure 34 px; tighter metrics; buttons 40 px. |
| 5. Coming up | Heading at **718 px**, below the 659 px viewport | Heading at **476 px**, visible above the bar (bar top 565 px) with its first row |
| 6. Vertical spacing | 20–28 px gaps | 16–22 px gaps; smaller overline and section spacing |
| 7. Bottom bar | 99 px including the inset; translucent; 52 px items and a 48 px Add | 60 px + safe area = 94 px; solid surface; 52 px items, a centred 46 px deep-green Add, 10.5 px labels |
| 8. Nothing hidden under the bar | Already passing (last content at 519 < bar top 560) | Last content at **536** < bar top **565** at the end of scroll. The padding is calculated from the bar height plus the safe area. |

## Desktop and iPad (priorities 9–10)
- **Desktop.** The structure is unchanged. Changes:
  - content width is 1120 px with 56 px insets;
  - the "Coming up" heading is aligned with the top of the net-worth panel;
  - next-step and lower-section spacing evened out.
- **iPad portrait and landscape.** The rail and split view are unchanged. Selecting an account keeps the list beside the detail; see `ba-ipad-*-money-account`.
- **iPad Split View at 507 and 694 px.** Below 768 px the shell uses the compact pattern:
  - bottom bar;
  - one column;
  - account detail opening in place with "Back to accounts".

  There is no horizontal overflow at either width. **Decision for KK:** should 694 px keep a two-pane list and detail?

## Smart Add: Intelligent Canvas (captures 08, 09, 10)
New in `src/components/smart-add/` and used only in the proposed shell. Classic UI keeps today's Smart Add sheet.

- **1 · Add.**
  - Receipt, Statement, Travel and Asset register choices.
  - A dashed drop area with **Choose files**, plus **Take a photo** on touch devices.
  - The chosen files are listed.
  - **Describe it by voice** and **Type it in** open the existing voice and quick entry.
  - **Continue to review** stays disabled until a source is chosen.
- **2 · Review.**
  - The *existing* automatic reading and classification (`NewExpense` / `extractReceipt`) runs, with the original **beside** the fields on iPad and desktop.
  - On iPhone there is a **Details / Original** toggle instead (§17).
  - Statements, spreadsheets and asset registers go to the *existing* **Statement Desk** intake. It stays authoritative, and posting there is still confirmed inside Statement Desk.
- **3 · Confirm.**
  - The review's own Save is **held**: "Nothing is entered into the books without confirmation".
  - A summary shows the original, account, "Books: Not posted yet", amount, date and category.
  - **Change** goes back to step 2. Only **Confirm and save** releases the original save path, with all of its existing checks.
  - Tests prove that nothing saves before Confirm, that Enter is held the same way, and that Confirm saves exactly once.
- **Travel.** A travel receipt is tagged to the current trip. **Import a booking confirmation** opens the existing Travel inbox.

### Known differences from captures 08–10
1. **Step 2 is today's full review form**, not the prototype's short card with "Suggested payment account" chips. All of its checks are kept: confidence, duplicates, tax and charges, and account.
2. **The review's button still reads "Save expense".** In this shell it leads to step 3, and a footer note says so. Renaming it would mean editing `src/routes/_authenticated/new.tsx`, which belongs to another track.
3. **Step 3 summary wording.** The summary is read from the review form. When the transaction-type control has not been opened, the headline says "Entry · …" rather than "Receipt · …".
4. **Window size and position.** The desktop step 2 window is wider (up to 76 rem), so the original and the fields fit side by side. Steps 1 and 3 use the 40 rem modal of the captures.
5. **The phone Add button is deep green.** The prototype's phone Add was blue; deep green follows §17.

## Not verified
- Real iPhone and iPad Safari, dynamic type, 200% zoom, and the 320 and 430 px widths.
- Dark mode.
- Statement Desk posting inside the canvas. Only the hand-off was captured; Statement Desk's own flow is unchanged.
