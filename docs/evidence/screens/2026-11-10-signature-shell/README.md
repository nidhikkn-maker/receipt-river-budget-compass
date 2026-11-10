# Signature Flow shell, batch B1: development screenshots (10 Nov 2026)

> **Proposed — awaiting KK visual approval.** Nothing here is approved yet. The current UI is still the default.
> **Placeholder T mark — final artwork pending.** The rail symbol is a plain "T" set in the wordmark font. It is not the Option 02 artwork.

## How these were taken
- **Emulated devices, not real ones.** The captures use Playwright Chromium device profiles:
  - iPhone 15 (393 px wide);
  - iPad Pro 11, portrait (834 px) and landscape (1194 px);
  - a 1440 × 900 desktop.

  Real iPhone and iPad Safari checks are still outstanding.
- **Isolated data.**
  - The dev server ran from worktree `/home/user/thapal-uixb` (branch `uix/signature-shell`) on port 8083.
  - The Supabase address pointed at `fixture.supabase.invalid`, a host that does not exist.
  - Every read was answered by fixtures in the browser. Writes other than the preference RPC were refused.
  - The figures are illustrative, not anyone's real finances.
- **How the shell was switched on.** The device-only review flag (`localStorage["ll-uix"]="signature-flow"`, which `?uix=signature-flow` also sets) turned on the shell. No cloud write was involved.
- **Reproduce.** Start the fixture dev server, then run:
  ```
  BASE=http://127.0.0.1:8083 OUT=<dir> NODE_PATH=$(npm root -g) node scripts/browser/capture_signature_shell.cjs
  python3 -I scripts/browser/compose_signature_shell.py <dir> docs/evidence/screens/2026-11-10-signature-shell
  ```
- **Image format.** JPEG, at most 1400 px wide. Each image carries the "Proposed" and "Placeholder T mark" labels in its footer.
- **Horizontal overflow.** `index.json` records `scrollWidth − clientWidth` for every capture. The value was 0 for all 41 captures.

## Captures
Prefix `iphone-`, `ipad-portrait-`, `ipad-landscape-` or `desktop-` + the following:

| # | Screen | Route | Data source |
|---|---|---|---|
| 01 | Home (B01) | `/home` (also `/dashboard` when the shell is on) | Net worth comes from `useNetWorth`, the same engine as today's Home card. The other sources are:<br>- cash, card dues, Coming up and alerts: `position.ts`;<br>- Needs attention: Financial Inbox rules (`inbox.ts`, `review-centre.ts`);<br>- recent activity: ledger entries. |
| 02 | Money hub (capture 03 layout) | `/money` | Accounts, balances and valuations come from `position.ts`. Assets and trips come from preferences. |
| 03 | Money list/detail | `/money` | The selected account stays beside the list on iPad and desktop. On iPhone it opens full width with "Back to accounts". |
| 04 | Records hub (capture 05 layout) | `/records` | Counts of documents, trips, assets, properties, investment accounts, open claims and companies. Every row opens an existing page. |
| 05 | To-do | `/tasks` | Counts use the Financial Inbox rules. Rows open `/inbox?section=review`, `section=statements`, `/inbox`, `/calendar` and `/sync-queue`. |
| 06 | Calendar (B03) | `/calendar` | The existing `PlanCalendar`. |
| 07 | Notifications (B05), **Proposed** | `/notifications` | Real derived alerts from `position.ts`, grouped by severity. The page labels the full centre as Proposed; Track C builds it. |
| 08 | Smart Add | Add button, or `/add` | The existing `SmartAdd` sheet, restyled through tokens only. |
| 09 | Existing detail page inside the shell | `/cards/<id>` | Today's card page, unchanged. The shell adds the breadcrumb row "Back · Home › Money › Card". |
| 10 | Search palette (iPad and desktop) / Reports in two taps (iPhone) | ⌘K or "Find anything"; Records → Reports | The search palette uses the existing `searchAll` and module directory. On iPhone, the Records tab shows the Reports row. |
| 00 | Default, switch off | `/dashboard` (desktop only) | Today's UI, unchanged, on the same fixture data. |

Side-by-side composites (approved capture on the left, build on the right):
- `compare-01-home-desktop.jpg`
- `compare-02-home-iphone.jpg` (cropped to the phone area of capture 02)
- `compare-03-money-desktop.jpg`
- `compare-05-records-desktop.jpg`
- `compare-08-smart-add-desktop.jpg`

## What matches the approved captures
- **Palette.**
  - Canvas, ink and hairlines match the approved tokens.
  - The net-worth panel, Smart Add and primary buttons use deep forest green (#223B35).
  - Mint is used for the active rail item, notes and the next-step band.
- **Rail.** Slim rail: T slot, Home, Money, To-do, Records, Reports, Add, and Settings at the bottom. The active item has a soft tile.
- **Header.** Wordmark, Personal ▾ chip, calendar, notifications and a round avatar.
- **Home.**
  - Overline with date and workspace, then a large sans greeting and a sub-line.
  - Calendar and Smart Add buttons.
  - A deep net-worth panel with faint arcs, an "Account-linked view" note and three separated metrics.
  - Two buttons on the panel, with Coming up beside it on desktop.
  - The next-step band, then Recent activity and Simply get things done.
- **Money and Records.**
  - Back, breadcrumbs and Find anything.
  - Uppercase overline, large title and description, then a hairline.
  - A mint note on Money; Add document and View related reports buttons on Records.
  - Two-column flat module rows with icon tiles and chevrons.
- **iPhone.** One column. The bottom bar holds Home, Money, a central deep-green Add, To-do and Records.

## Known differences (for KK's decision)
1. **Logo.**
   - The rail shows a placeholder "T" in the wordmark font; the prototype shows "T.".
   - The wordmark reads **Thapal** (capital T, no full stop), as V4 requires. The prototype's "thapal." is temporary.
2. **Typeface.**
   - The licensed family is pending (Decision 47). The stack starts with Manrope, which is used only if installed, then Inter, then system fonts.
   - These captures render in Inter, which is installed locally. The prototype uses Manrope, so letter shapes differ slightly.
3. **iPhone Add colour.** Capture 02 shows a blue Add button. The build uses deep green, per §17 ("central deep-green Add").
4. **Icons.** The build uses one outline family (lucide) instead of the prototype's placeholder glyphs (§3.3).
5. **Extra header items, not in the captures.**
   - A sync status pill (tablet and desktop only). It keeps the existing offline, error and stale feedback visible.
   - A search icon in the header, so search is available on every page, including Home on iPhone.
6. **Home wording and figures.**
   - The panel says "· all accounts" instead of "· DEMO".
   - The as-of note shows the real record date ("balances to 9 Nov 2026"), plus the price date when there is one.
   - "Download overview" became **"Reports & downloads"**, which opens `/report-centre`. No one-tap overview PDF exists, and the button must not pretend one does.
   - Headline figures are rounded to whole rupees. The exact amount, with paise, is in the tooltip. Lists show paise.
   - Coming up rows show the amount and a chevron, not the prototype's empty checkbox.
   - Coming up comes from scheduled payments (`position.ts`). Trips and insurance renewals appear only if they exist as commitments.
7. **Money and Records extras.**
   - Rows show live counts, such as "3 accounts · ₹… available", instead of static descriptions.
   - Money adds a "Your accounts" list and detail section below the modules.
   - Records adds "Also in Records" (Statement Desk, Expenses, Companies, Reports) and an "Every page" directory. On iPhone, this replaces today's More sheet.
8. **Smart Add (capture 08).** The build uses the **existing** Smart Add sheet, restyled by tokens. It is centred on the canvas instead of shown as a night photograph, but its content still differs:
   - it has no "1 Add · 2 Review · 3 Confirm" step tabs;
   - it has no Receipt / Statement / Travel / Asset register chips;
   - it shows the existing four rows (Scan or Photo, Upload File, Voice Entry, Quick Entry).

   Changing that content means editing `SmartAdd.tsx`, which is outside Track B's files (see the report).
9. **Existing pages inside the shell.** They keep today's layout and only take the new tokens. For example, the card page still has its own "← Accounts" link under the shell's breadcrumb row. Restyling them is later B work.
10. **Notifications.** This is a Proposed placeholder, plainly labelled.
11. **Workspace switcher.**
    - All spaces, Personal, Family and Business are real: they save the existing Home workspace filter.
    - Companies are listed and labelled Proposed, because a per-company view does not exist in the data layer.
12. **iPad.**
    - There is no approved iPad capture, so iPad screens are **proposed** compositions.
    - iPad uses the same slim rail. Home stacks the net-worth panel above Coming up in portrait, and puts them side by side in landscape.
13. **Dark mode.** A dark token block exists but was not captured or reviewed.

## Not yet verified
- Real iPhone and iPad Safari.
- The 320, 375 and 430 px widths, Split View, 200% zoom and dynamic type. These are covered only by layout rules, not captures.
- The production typeface.
- The final logo.
