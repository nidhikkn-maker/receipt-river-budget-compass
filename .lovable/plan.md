# Layout and spacing clean-up (phone first, then iPad/desktop)

## What I saw at iPhone size (402px)
- **Financial Inbox:** eight buttons in a 2-column grid with uneven heights and text wrapping ("Transfers & Card Payments", "Statement Desk — upload many at once"), plus two loose text links under them. The count cards are tall, with lots of empty space around each number.
- **Settings:** about 11,600px of scrolling (around 13 phone screens). Every section is open at once.
- **Activity:** about 78,000px. All 741 entries load in one long list.
- **Every page:** the "Back" row, the eyebrow label, the big title and the gold underline take about a third of the first screen before any content shows.
- **Cards and tiles:** padding is uneven (some 16px, some 24px+), corners are mixed sizes, and the gaps between sections don't match.

## What changes

### 1. One shared page frame
- A tighter page header: Back and the title on one line, a smaller title on phones, and the eyebrow label and gold underline only on main pages.
- The same side margins, section gaps and card padding on every page (phone 16px, iPad 24px, desktop centred at a readable width).
- The space at the bottom matches the floating + button, so the last item is never hidden.

### 2. Financial Inbox navigation
- The 8 buttons become one horizontally scrollable row of tabs with short labels (Overview, Review, Transfers, Reconcile, History, Statements, Match & Fix, Forex). Each tab stays one line and the same height.
- The loose "Upload / review statements" and "Travel Inbox" links move into that row or into the menu.
- The count cards become a compact 2-column tile grid (number plus label), roughly half the current height.

### 3. Shorter pages
- **Settings:** a short list of section headings, each opening to its contents (accordion), with the setup checklist summarised at the top. This should cut scrolling from about 13 screens to 2.
- **Activity:** shows the latest 50 entries grouped by month, with "Show more" (and filters still applied). This should cut scrolling from about 90 screens to 4–5.
- **Long review pages** (Inbox views, Statement Desk, Records check, Statement coverage): long groups start folded with a count, and you expand only what you need.

### 4. Tiles and numbers
- One tile style: the same padding, corner size and number size, with large amounts shrinking to fit instead of wrapping.
- Lists use consistent row heights, and amounts are right-aligned in a fixed column so they line up.

### 5. Check every page
- Screenshot every main page at iPhone (402px), iPad (820px) and desktop sizes, before and after. I'll fix any overflow, wrapping or misalignment, and report page heights before and after.

Nothing about your money or records changes. Only layout and spacing do.

## Technical details
- Add a shared `PageHeader` and `PageShell` (spacing tokens in `src/styles.css`). Migrate routes under `src/routes/_authenticated/` to them, replacing ad-hoc `p-3 sm:p-6` and `max-w-*` wrappers.
- Change `FinancialInboxNav` to a horizontal scroll tab strip (`overflow-x-auto`, `snap-x`, `shrink-0` tabs). Turn the Inbox count cards into a `grid-cols-2` compact `StatTile`.
- Settings: wrap its sections in shadcn `Accordion`, with the open section kept in the URL search param so Back returns to it.
- Activity: render in pages of 50 with "Show more", reusing the existing filters. No change to the data layer.
- `Card` gets size variants (`compact`/`default`) with semantic tokens only, so all 7 themes stay correct.
- Re-run the existing browser tests (records check, Inbox, expense receipts, Statement Desk) and the unit suite to confirm no controls broke.
