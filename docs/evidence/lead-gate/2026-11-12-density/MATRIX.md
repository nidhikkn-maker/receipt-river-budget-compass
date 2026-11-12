# THAPAL visual-density audit: 24 walkthrough screens

Captures: Travel at 3df2daa (`travel-3df2daa/`), Records at bfa5b9d (`records-bfa5b9d/`), on iPhone 15 (390px, DPR 3), iPad Pro 11 and desktop 1440. All data is sample data.
Source read only: Travel at `/home/user/thapal-f1v`, which is checked out at 7a8ee14 and not at 3df2daa. `git diff 3df2daa HEAD` touches only store.tsx, SQL, tests and demo cleanup, with no UI files, so the line numbers hold. Records at `/home/user/thapal-wsev` (83f3d27). Records line numbers are for bfa5b9d. In assets.tsx, HEAD lines are +1.
Design reference: `thapal-integration/docs/specs/THAPAL_SIGNATURE_FLOW_UIX_MASTER_2026-11-09.md` §3.3, which sets a 4-pt grid, iPhone inset 16–20, support text 12–14 and 44×44 targets, and §13, which asks for flat rows, one primary action and a plain Back on iPhone.

## Summary

- **Findings: 37.** High 6, Medium 14, Low 17. There are also 10 screen IDs I could not assess, and 4 screens that look fine.
- **Worst screens:**
  1. **I01 Asset register on iPhone.** It has a double gutter, about 1,100 px of chips, actions and filters before the only asset, and the book value is buried in the subtitle.
  2. **F04 Missing evidence on iPhone.** Each row takes 6 lines in a column about 200 px wide, and the same red reason repeats on 6 of the 7 rows.
  3. **F01 DocuRepo on iPhone.** It stacks 10 filters (about 1,000 px), including two unlabelled "Choose date" fields.
  4. **Trip detail G02–G11 on iPhone.** About 560 px of chrome sits above every tab. G04/G05 also has a 3-up button row that clips its labels.
- **Shared-shell issues (Track B):**
  - SH-1 chrome stack on phones.
  - SH-2 Records subnav clipped with 11.5px labels.
  - SH-3 tab-bar labels at 10px.
  - SH-4 header icons 38px wide.
  - SH-5 breadcrumb targets.
  - SH-6 three different left edges per page, from the `.sf-page` crumbs against per-route containers.
  - SH-7 SplitView ratio on iPad.
  - SH-8 key–value rows 1,240px wide on desktop.
  - SH-9 `Row` label and amount behaviour with crore-scale amounts.
- **Per-screen issues:** Travel goes to WS-F1, Records goes to WS-E. The double `p-4` gutter on the Assets, Property and Import routes is WS-E, but it should be fixed together with SH-6.
- **Fine:** G03 Itinerary, G06 Receipts and the F08 Projects index. F09 Contacts has only Low nits.
- **Not assessable:** these captures never opened the panel, so they are byte-identical to the parent screen.
  - F02/F03 equal F01 (0 documents).
  - F07 equals F06.
  - The F08 project detail equals the index.
  - I02/I04: the asset detail is not opened and depreciation is collapsed.
  - I07–I10 equal I06 (0 properties, so no valuations or cash flow).
  - The `I01-direct` capture shows a raw JavaScript bundle and is invalid. It is worth checking whether a direct `/assets/<id>` load collides with the build's `/assets/` static prefix.
- **Amount stress test:** the sample data never goes above ₹1,85,000.00, so long Indian-grouped values (₹12,34,56,789.00) were **not** exercised. SH-9, G02-c and F04-a are risks found by reading the source and should be confirmed with a long-amount fixture.
- **Capture artefact, not a bug:** full-page shots draw the fixed bottom bar and the "Preview" badge mid-page. `.sf-main` mobile bottom padding (tab bar + safe area + 28px, styles.css ~1678) clears the content on a real device.
- **Theme note:** `.uix-content .text-xs` / `.text-[11px]` render at 13px (styles.css:830), so most "text-xs" in the source is not actually tiny. The truly small text is the shell's 10px tab labels and 11.5px subnav labels.

## Matrix

Severity: **H** means the owner would clearly call it cramped or hard to read, **M** is Medium, **L** is Low. "—" means fine or not assessable.

### Shared shell (Track B)

| Screen | Device | Issue | Sev | Source file:line | Fix |
|---|---|---|---|---|---|
| SH-1 every Records/Travel page | iPhone | Chrome stacks before the page head: the 56px header, then a Back/Find row with a rule (about 76px), then the Records subnav (about 64px). On trip pages (see T-1) the first ~560px of an 844px screen is chrome. | H (with T-1) | thapal-f1v & wsev `src/components/shell/SignatureShell.tsx:154` (`sf-page sf-legacy-crumbs` renders Breadcrumbs + RecordsSubnav); `PageHeader.tsx:23-41`; styles.css `.sf-crumbs` (~1488) and mobile override (~1719) | On phones, put Back and Find on one compact row with no rule; Find can be a 44×44 icon, or move it into the header. Show RecordsSubnav only on Records index routes, because on detail routes the labelled Back is enough (UIX §13.2). |
| SH-2 Records subnav | iPhone | The 5th tab is cut to "Reimb" with no fade or scroll cue, and the labels are 11.5px. | M | styles.css:2141-2143 (`.sf-subnav a { font-size: 11.5px }`); `PageHeader.tsx:41` | Use 13px labels, add a right-edge fade mask and scroll the active tab into view. Alternatively keep 4 tabs and put the rest under "More". |
| SH-3 bottom tab bar | iPhone | Tab labels are 10px, below the 12px support-text floor. | L | styles.css:2034 (`html[data-theme="signature-flow"] .sf-tab { font-size: 10px }`), :1681 | Use 11–12px labels and keep the 52px tabs. |
| SH-4 header | iPhone | The Calendar and Notifications buttons measure 38×44. | L | styles.css mobile `.sf-icon-btn { width: 38px }` (~1675) | Make them 44×44 and take the width from the workspace chip padding. |
| SH-5 breadcrumbs | iPad/desktop | Home is 30×44, Records 42×44 and Travel 31×44, all narrower than 44. | L | `PageHeader.tsx:23-30` (`.sf-crumbs li`) | Give crumb links `min-w-11` padding. This is Low because these screens are pointer-first. |
| SH-6 every page | iPad/desktop | Each page has up to three left edges. The crumbs and subnav are centred in `.sf-page` (1120px). Travel bodies start at the 48px main padding. Entities, Contacts and Projects are `max-w-4xl` centred, Assets and Property are `max-w-6xl p-4`, and upload-requests is `max-w-2xl`. The page looks unsettled and misaligned. | M | `SignatureShell.tsx:154` vs `entities.tsx:175`, `contacts.tsx:42`, `projects.tsx:62`, `assets.tsx:93`, `property.tsx:79`, `assets_.import.tsx:24`, `upload-requests.tsx:79` | Render every route body inside the shell's `.sf-page`: Track B owns the container and WS-E deletes the per-route `mx-auto max-w-* p-4` wrappers. |
| SH-7 SplitView list/detail (G01, F06, F08, F09, I01) | iPad | The empty "Choose an item…" pane takes ~52% of the width while list meta wraps to 2–3 lines next to amounts. On G01 this produces "07 Nov 2026 → 09 / Nov 2026 · Ready to close finances". | L | styles.css:1624 (`.sf-split` `1fr / 1.1fr` from 768px) | Below 1024px, keep a single-column list until a row is selected, or use a 1.5fr / 1fr ratio. |
| SH-8 key–value rows (G02, G04/05, G07–09) | desktop | Labels sit at x≈150 and amounts at x≈1390, about 1,240px apart. The eye has to travel across the page and it is easy to misread which amount belongs to which label. | M | thapal-f1v `src/components/Money.tsx:12-17` (`Row`: `flex justify-between`) | Cap key–value groups at about 720px (`max-w-3xl`), or use a 2-column `dl` at ≥1024px. |
| SH-9 `Row` with long amounts (all money rows) | iPhone | The amount is `font-mono` and therefore nowrap, so the label wraps beside it. At ₹12,34,56,789.00 (~140px), labels such as "Calculated settlement with the company" or "Card charges not matched to a statement" get about 190px and wrap to 2–3 lines. | M (risk) | `Money.tsx:13-16` | Make the row `flex-wrap`, the label `min-w-0 flex-1` and the amount `ml-auto shrink-0`, so the amount drops to its own right-aligned line when needed. Keep the amount on one line, and add a long-amount fixture to captures. |

### Travel (WS-F1), commit 3df2daa

| Screen | Device | Issue | Sev | Source file:line | Fix |
|---|---|---|---|---|---|
| G01 Travel index | iPhone | The 6 status chips plus Filters wrap to 3 rows, and Create trip / Travel inbox / Prepare a claim wrap to 2 rows. | L | `src/routes/_authenticated/trips.index.tsx:108` (actions), `:141` (`mb-2 flex flex-wrap gap-2` chips) | Make the chips one horizontally scrollable row with a fade. Make Create trip a full-width primary button, with the secondary actions as a 2-up row. |
| G01 | all | The "Travel & payment calendar" body is blank in all captures. Its links measure 83×19 ("ACT Fibernet") and 42×19 ("Details"). | L | `src/components/PlanCalendar.tsx:66` (`text-xs` link, no min height); `trips.index.tsx:180` | Give the links `inline-flex min-h-11` and re-capture with the calendar loaded. |
| T-1 trip header (G02–G11) | iPhone | The stack is overline, title, meta, an "Add expense" row, two status chips each on its own line, then 7 section pills in 2 rows and a rule: about 560px of chrome. On every tab the selected content starts below the fold. | **H** | `src/routes/_authenticated/trips.$tripId.tsx:119-126` (PageHeader + `TripStatusChips` in `-mt-3 mb-4`), `:169` (`TripTabs` `mb-5 flex flex-wrap gap-2`) | Use a single-row scrollable tab strip, or a labelled section select, with the active tab scrolled into view. Put both statuses on one line ("Journey: Completed · Money: Ready to close"). Make Add expense the header action beside the title, or a sticky bottom action. All 7 tabs and both statuses are kept. |
| G02-a Overview | all | "Add travel categories (Flights, Hotels, … Visa & insurance)" is a centred button label 5 lines tall on iPhone and 2 on desktop. | M | `src/components/trip/TripSections.tsx:74` (`h-auto whitespace-normal break-words`) | Label the button "Add 14 travel categories" and show the category list as muted helper text or in a `details` disclosure. |
| G02-b Overview, lower cluster | iPad/desktop (iPhone milder) | The Trip budget mini card, Trip readiness, the categories button and "Add an expense" are stacked at 12px (`mt-3`) in `p-3` cards with 13px text. They are visibly tighter than the airy "Money so far" list above. | M | `TripSections.tsx:72-75`; `src/components/trip/TripBudget.tsx:340` | Use `space-y-4`/`p-4`, and show budget and readiness as flat section rows in the same style as "Money so far". |
| G02-c Trip budget mini | iPhone | "₹0.00 of ₹60,000.00" and "₹60,000.00 left" share one `justify-between` baseline. With crore values the three figures collide or wrap in the middle of a group. | M (risk) | `TripBudget.tsx:346-348` | Put the spent figure alone on line 1, and "of ₹X · ₹Y left" on line 2 with `flex-wrap`. |
| G02-d | all | "Add expense" appears 3–4 times on the trip: in the header, the Overview CTA, the Money card and Trip expenses. | L | `trips.$tripId.tsx:124`; `TripSections.tsx:75`; `TripBudget.tsx:88`; `TripExpenseActions.tsx:31` | Keep the header primary and demote the others on the same view. |
| G03 Itinerary / Bookings | all | Fine. The empty state and the heading with Add booking / Add plan are well spaced. | — | — | — |
| G04/G05 Money (budget + expenses) | iPhone | The budget action row is `grid-cols-3` at 390px. The "Add expense" label runs into the button's right edge, and the pencil and sliders icons touch the left borders. It looks visibly cramped. G05 renders the same Money panel. | **H** | `TripBudget.tsx:85-89` (`mt-3 grid grid-cols-3 gap-2`, `size="sm"`) | Use `grid-cols-1 sm:grid-cols-3`, or 2+1: a full-width "Add expense", then Edit budget and Breakdown 2-up. Keep `min-h-11`. |
| G05 | iPhone | The expense toolbar shows "Select visible (0) / Select all matching (0) / Clear" as bare text buttons across 2 rows. | L | `src/components/trip/TripExpenseActions.tsx` | Group them in one "Select" menu or a single segmented row. |
| G04/G05 | desktop | The key–value rows span 1,240px. | M | see SH-8 | see SH-8 |
| G06 Receipts | all | Fine. Summary rows, two buttons and the empty states are well spaced. | — | — | — |
| G07–G09 Claims & refunds | iPhone/iPad | One tab scrolls about 3,250px: claims, approvers, payment, refunds and closing, finances. The G08/G09 captures are identical to G07. | M | `trips.$tripId.tsx:131` (`panelsOf(tab)` → `PanelFrame`) | Keep every panel, but add an in-tab jump row (Claims · Approval · Payment · Closing), or collapse empty or settled panels into summary rows that expand. |
| G07–G09 | all | The "No claims to pay" empty card sits flush (0px) against the Outstanding divider. The ProposedBadge notes ("Approved status", "In-app approval", "Bank matching", "Not available yet") sit 8–12px under buttons and read like cramped footnotes. | L | `src/components/screens/travel/TripApprovalSection.tsx:78, 116-119`; `TripSettlementSection.tsx:128` | Add `mt-4` before empty states. Gather each panel's limitation notes under one "Not available yet" group with consistent spacing, keeping every note. |
| G10 Reports | iPhone/iPad | Eight full-width controls are stacked with 8px gaps, mixing teal left-aligned link cards with centred outline buttons. It reads as a wall of buttons. | M | `TripSections.tsx:212-222` | Make two labelled groups: "Open in Reports" as link rows and "Download now" as buttons (2-up on iPad), with 12px gaps. |
| G11 People | all | Mostly fine. The "Only you can see this trip" note packs title, body, badge and note into `p-3` with ~4px gaps. An empty state and another badge+note follow, so three status messages are stacked. | L | `src/components/screens/travel/TripPeopleSection.tsx:44-62` | Merge them into one note (title, body and one limitation line) with `p-4`. |

### Records (WS-E), commit bfa5b9d

| Screen | Device | Issue | Sev | Source file:line | Fix |
|---|---|---|---|---|---|
| F01 DocuRepo | iPhone | Ten filter controls are stacked (~1,000px) before "0 documents". There are two identical, unlabelled "Choose date" fields, the select chevrons mix custom and native styles, and the search placeholder is truncated. | **H** | `src/components/screens/records/documents/DocumentFilters.tsx:49-178` (`space-y-3`, `grid gap-3 sm:grid-cols-2 lg:grid-cols-4`) | Show search plus a "Filters (n)" button that opens a bottom sheet holding all 9 filters. Use a labelled From/To date range side by side, and show active filters as removable chips. |
| F01 | iPad/desktop | Ten unlabelled controls sit in a 2- or 4-column grid. Placeholders are truncated ("…supplier o", "…last ye"), and the dates have no labels. | M | `DocumentFilters.tsx:50` | Put search (wide), type and a labelled date range in the primary row. Move owner, expiry, company, year, ID and the natural-language query into a "More filters" disclosure. |
| F01 | all | There are two identical "Scan or upload in Statement Desk" CTAs, one in the empty state and one in Add document. | L | `DocumentIndex.tsx:286, 316` | Hide the Add document section while the empty state is showing. |
| F02 / F03 | — | **Not assessable.** The capture is byte-identical to F01: there are 0 sample documents, so the viewer and relationship panel never opened. | — | — | Seed a document and re-capture. |
| F04 Missing evidence | iPhone | Each row's text column is about 200px wide beside the amount, so a row is 6 lines: a 2-line red reason, the merchant and 3 lines of meta. The same red reason repeats on 6 of the 7 rows, and rows use `px-3 py-2`. A crore-scale amount would narrow the column further. | **H** | `src/components/screens/records/documents/MissingEvidence.tsx:76-99` (`flex items-center gap-3 px-3 py-2`; reason `text-xs text-destructive`) | Group rows under reason headers with a count, e.g. "Receipt missing for reimbursement claim (6)". In each row put merchant and amount on line 1 (`items-start`, amount `shrink-0`) and "date · note" on line 2, with `py-3 px-4`. No row or reason is dropped. |
| F04 | desktop | The body is a centred ~670px column (`max-w-2xl`) under left-aligned crumbs, and the `py-2` rows with 3 text lines feel dense. | M | `src/routes/_authenticated/upload-requests.tsx:79`; `MissingEvidence.tsx:83` | Use the shared container (SH-6) and `py-3` rows. |
| F04 | iPhone | The Upload / From accountant / Monthly requests strip runs into the screen edge with no cue. | L | `src/components/SectionTabs.tsx:35` | Add an end fade and trailing padding after the last tab. |
| F06 Companies & years | iPhone | Before the first company there are the title, lede, 3 actions in 2 rows, a 4-line help paragraph, search and the kind filter, so the list starts below the fold. | M | `src/routes/_authenticated/entities.tsx:175-190` | Move the help paragraph into a collapsed "What can I upload?" disclosure, and show one primary action with the others secondary. |
| F06 | desktop/iPad | The list sits in a narrow left column with 2-line meta at 12.5px and a "Details to fill" trailing label. The `max-w-4xl` body does not line up with the crumbs. | L | `entities.tsx:242`; SH-6/SH-7 | see SH-6 and SH-7 |
| F07 Company profile | — | **Not assessable.** Identical to F06; the profile was not opened. | — | — | Re-capture with a company selected. |
| F08 Projects index | all | Fine: rows are well spaced and the counts are clear. Project detail is not captured (identical to the index). The Records nav item is not highlighted on /projects, /contacts or /property, which is a nav-state issue rather than density. | L | `src/components/shell/navigation.ts` | Map these routes to Records. |
| F09 Contacts | all | Fine. Small nits: the meta reads "Organisation · organisation", the Show archived checkbox is 20×20 (its label is tappable), and the "Spending patterns" inline link is 18px tall. | L | `src/routes/_authenticated/contacts.tsx`, `ContactDirectory.tsx` | Remove the repeated word, and give the checkbox label and inline link `min-h-11`. |
| I01 Asset register | iPhone | A double gutter (16px shell + `p-4`) leaves 326px of content. Five link chips and three actions wrap into 4 rows, followed by 4 labelled selects: about 1,100px before the single asset. "Your share of book value now: ₹98,335.78 · FY / 2026-27" is buried in the subtitle and wraps. The collapsible headers indent to 48px. | **H** | `src/routes/_authenticated/assets.tsx:93` (`mx-auto max-w-6xl space-y-4 p-4`), `:98-106` (chip and action `flex-wrap`), `:111-120` (filter grid) | Remove `p-4`. Show the book value as a figure with an "FY 2026-27" label. Move Property manager, Disposals, Import, Depreciation working and Archived into a "Related" row list or an overflow menu. Put filters in a sheet, and put Sort as a compact control on the "1 of 1 asset" line. |
| I01 | iPad/desktop | The chip row, the action row and the "Asset register" heading are only 16px apart. Sort sits alone on its own row under a 4-up filter row. | M | `assets.tsx:93` (`space-y-4`), `:106`, `:111` (`grid gap-3 sm:grid-cols-2 lg:grid-cols-5`) | Use 24px between groups, or a section rule, and move Sort onto the count line. |
| I02 / I04 | — | **Not assessable.** The asset detail was not opened and the depreciation working is collapsed. The `I01-direct` capture is a raw JS bundle (invalid). | — | — | Re-capture with an asset selected and depreciation expanded. |
| I03 Import register | iPhone | Double gutter (`p-4`) and a native, unstyled "Choose File" control. Otherwise spacious. | L | `src/routes/_authenticated/assets_.import.tsx:24` | Remove `p-4` and use a styled file button with `min-h-11`. |
| I06 Property manager | desktop | One row mixes a primary button, a labelled input, a disabled Add and an underlined link. The input's label floats above it, so the row is misaligned, and the filter grid follows 28px below. | M | `src/routes/_authenticated/property.tsx:83-91` | Split it: primary action row, then the "Add by name" inline form on its own line, and move Asset register to a related link. |
| I06 | iPhone | Double gutter, 4 labelled filters stacked for 0 properties, and 2 "Add property from deed" CTAs. | L | `property.tsx:79, 91` | Remove `p-4`, hide the filters while there are 0 properties, and keep one CTA. |
| I07–I10 property detail (cash flow, calendar, relationships) | — | **Not assessable.** The capture is identical to I06 because there are 0 sample properties, so property valuations were not exercised. | — | — | Seed a property with a valuation and lease, then re-capture. |

## Repair principles applied

Every fix keeps all figures, warnings and limitation notes. Density is reduced through hierarchy, grouping, single-column phone stacks, disclosures and sheets, never by shrinking type or hiding amounts. No fix touches financial logic, brand tokens or the Classic theme. The `.sf-*` changes are scoped to `html[data-theme="signature-flow"]` where they already live.
