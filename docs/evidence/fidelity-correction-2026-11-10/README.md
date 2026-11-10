# Signature Flow fidelity correction (10 Nov 2026)

This pass corrects the visual fidelity of the proposed Signature Flow UI against the approved references. It does not redesign anything.

- **Branch and status:** worktree `/home/user/thapal-uixf`, branch `uix/fidelity`, based on 937cfaf. Nothing is committed or pushed.
- **Scope:** typeface, size, weight, tracking, spacing and control dimensions.
- **Unchanged:** structure, colours, navigation, financial logic and safeguards.
- **Visual authority:** `docs/evidence/signature-flow-reference/01…10.png`.
- **Measurements:** the read-only audit in `../fidelity-audit-2026-11-10/` (`deviations.csv`, 109 rows).
- **Priority:** the owner's binding instruction was to fix the 61 deviations that are visible at arm's length first, then the subtle ones.

## 1. Font verdict and loading proof

**Verdict:** the reference renders **Manrope** (audit glyph match: r = 0.975–0.985). The 937cfaf build never loaded Manrope. On this Linux box it rendered Inter, which happens to be installed locally. Users would get Segoe UI on Windows, SF Pro on Apple devices and Roboto on Android.

**What is now loaded.** Manrope is self-hosted from the npm package `@fontsource-variable/manrope@5.3.0`:
- It is a variable font with a weight axis from 200 to 800.
- Two subsets are declared: **latin** and **latin-ext**. The rupee sign (U+20B9) is in latin-ext.
- It uses `font-display: swap`.
- The licence is SIL OFL 1.1. A copy is in `public/fonts/LICENSE-Manrope-OFL.txt`, and the repository README has a "Fonts and licences" section.
- No third-party CDN is used for the new faces.

**Preload.** In Signature Flow only, the theme script in `<head>` adds `<link rel="preload" as="font" crossorigin>` for the latin file.
- It runs only when the theme is `signature-flow` or the `ll-uix` device override is set.
- It is guarded so the link is added once.
- The classic UI does not preload anything.
- Vite emits a single hashed asset that both the preload and the `@font-face` use. In the build, `.output/public/assets/manrope-latin-wght-normal-DHIcAJRg.woff2` is referenced by both `styles-*.css` and the SSR router bundle.

**Metric-adjusted fallback.** A `"Manrope Fallback"` face sits second in the stack:
- source: local Arial, ArialMT, Helvetica or Liberation Sans
- `size-adjust: 102%`, `ascent-override: 104.5%`, `descent-override: 29.4%`, `line-gap-override: 0%`

These values were measured with fontTools:
- Manrope uses 2000 units per em, with ascent 2132, descent 600 and no line gap.
- Manrope's average advance compared with Arial metrics is 1.014 at weight 400, 1.033 at 500, 1.005 at 700 and 1.023 at 800.

**Language fallbacks** (spec §3.3):
- **Noto Sans Tamil** keeps its existing loader in `__root.tsx`.
- **Noto Sans Devanagari** is added, self-hosted from `@fontsource-variable/noto-sans-devanagari@5.3.0` (OFL; licence in `public/fonts/LICENSE-NotoSansDevanagari-OFL.txt`).
  - Only the Devanagari subset is declared, with its `unicode-range`.
  - ₹ and ₨ are excluded from that range, so Manrope keeps them.
  - `document.fonts` shows the Devanagari face as `unloaded` on every captured page, which means it downloads only when Devanagari text appears.

**CDP proof (`CSS.getPlatformFontsForNode`, after):** every captured Signature Flow page reports this for the greeting:

```
{ familyName: "Manrope ExtraLight", postScriptName: "Manrope-ExtraLight", isCustomFont: true }
```

This holds for desktop 1283×794, iPhone 372×793, iPhone 15 393×852@3, iPad Pro 11 834×1194@2 and 1440×900. The "ExtraLight" name is the variable font's *default instance* name (wght 200). Text renders at the requested weight (800 here) from that same file. Before the change the same call reported `Inter-Bold`, `isCustomFont: false`.

**Requests and font state:**
- The only font requests are `manrope-latin-wght-normal.woff2` and `manrope-latin-ext-wght-normal.woff2`. The extra `…woff2?import&url` request is a dev-server artefact of the `?url` import and does not occur in the production build.
- `document.fonts` shows both Manrope faces as `loaded`.

**Inter against Manrope at identical viewports** (task 2). Every reference screen was captured three ways: 937cfaf as rendered here (Inter), 937cfaf with Manrope injected by the harness (old geometry), and the corrected build. See section 3 and `images/crop-*.jpg`, which show reference / before-Inter / before+Manrope / after.
- **Swapping the family alone barely moves the numbers:** about 0.1–0.4 percentage points on full screens. On the iPhone panel it is worse, because Manrope at the old 700 weight and old sizes overflows differently.
- **Almost all of the gain comes from calibrating size, weight, tracking and spacing,** which is exactly what the audit predicted.

## 2. What changed, file by file

**`package.json` and `bun.lock`** (through `bun add`):
- Added `@fontsource-variable/manrope@^5.3.0` and `@fontsource-variable/noto-sans-devanagari@^5.3.0`.
- `bun install --frozen-lockfile` reports "no changes".

**`src/styles.css`:** a new block, **"B1d: Signature Flow fidelity correction"**, is appended at the end (+216 lines). No existing rule is edited.
- The three `@font-face` rules (Manrope latin and latin-ext, Manrope Fallback, Noto Sans Devanagari) are inert unless a stack names them, and only `--sf-font` does.
- Every other selector starts with `html[data-theme="signature-flow"]`. A test enforces this.

The block covers these areas:

| Area | Changes |
|---|---|
| Stack | `--sf-font` becomes `"Manrope", "Manrope Fallback", -apple-system, …, "Noto Sans Tamil", "Noto Sans Devanagari"`. Inter is dropped. `font-synthesis-weight: none`. |
| Shell (desktop) | Rail 100 px on the canvas colour. Item pitch about 80 px. Active tile 38×42, radius 13, no ring. Labels 10 px, 600 (active 800). Icons 20 px. Settings icon 16 px. T mark 25/800/−0.06em. Header insets 43/42. Wordmark 20/800/−0.02em. Workspace pill painted at 38 px. Avatar painted as a 34 px circle. Main inset 36/50/64/49 at ≥1180 px. |
| Page anatomy | Overline 10/700/0.16em. Page title 38/800/−0.04em. Greeting 44/800/−0.04em; the ≥1100 px step to 52 px is overridden. Lede 13/21, max width 610. Back 11.5/800. Crumbs 11 px. Find painted at 32 px. Section titles 16/800/−0.04em. Links 11/800. Rows 71 px, title 12/800, sub 11/500. Date 21 px, month 10 px uppercase. Module rows 13.5/700 and 11 px. Note band 11 px. Default `.sf-btn` 44 px, 12/800. |
| Home panel (typography and spacing only, in CSS) | Grid 673fr/360fr with a 38 px gap. Radius 22. Figure 56/800/−0.05em, proportional. Overline 10/600. Note 11.5. Metrics 10/500, 19/700/−0.04em and 10/500. Divider spacing 20/24. Buttons painted at 38 px, 11/800, mint-tint light button. Next-step band 24 px gap, 16 px radius, 12/800 and 11/500, button painted at 36 px. Lower-section hairline. |
| iPhone | Header 64 px. Wordmark 17/800/−0.05em. Gutter 20. Lede in the left column. Greeting 26/800/−0.05em. Smart Add painted at 36 px. Panel 26/21/24 padding, radius 18, figure 36/800, metrics 9/13 px, buttons on one row painted at 36 px. Coming-up titles wrap to two lines instead of truncating. Tab bar 58 px, 10 px labels, 20 px icons. Add 44×44, radius 14, no shadow. Workspace box 44 px. |
| Intelligent Canvas | Modal 583 px wide on desktop, radius 25, card fill. Scrim at ink 68 % with no blur. Title 26/−0.05em. Close button painted as a 35 px circle. Steps 31 px, radius 8, 10 px, current 800. Lede 13. Chips painted at 38 px, 11/500, no icons on desktop. Drop zone 1 px border, 12/800 and 10 px. Footer buttons painted at 42 px, 11.5/800. Confirm card and facts 12.5/800, 10, 10/500, 11/800. |
| Toasts | While the canvas is open, Sonner toasts sit above its footer: bottom 116 px on desktop, 168 px plus the safe area on phones. They no longer cover **Continue to confirmation** (FD-104 and FD-105). |

**`src/routes/__root.tsx`:**
- imports the Manrope latin file URL (`?url`)
- adds the Signature-Flow-only, guarded font preload in the existing theme head script

**`src/components/shell/fidelity.test.ts`** (new, 9 tests) checks that:
- every B1d selector is theme-scoped
- only the three new faces are declared, and no classic stack names them
- Manrope is served from the package (no `http`) with swap and the latin-ext ₹ range
- the fallback has size-adjust and ascent-override
- the Devanagari range excludes ₹
- the stack order is right
- both OFL licence texts exist
- the preload is Signature Flow only
- 44 px boxes are kept, and no control rule sets `min-height` below 44 px

**Licences and README:**
- `public/fonts/LICENSE-Manrope-OFL.txt` and `public/fonts/LICENSE-NotoSansDevanagari-OFL.txt` are copied from the packages.
- `README.md` gains a "Fonts and licences" section.

**Evidence** (this folder):
- `scripts/`: `capture.cjs`, `compose.py`, `classic.py`, `register_after.py`, `restart-preview.sh`, `pipeline.sh`, `pipeline-before.sh`
- `captures/{before-asis,before-manrope,after-asis}/` with PNG and JSON per screen
- `images/`
- `deviations-after.csv`
- `sample-receipt.png`, a synthetic receipt used because the extraction is stubbed
- `NOTES.md`

### The 44 px technique (owner rule kept)

Some controls are drawn smaller in the reference (36–42 px pills, a 35 px close circle, a 34 px avatar). Their **element box stays at least 44 px**. The visible pill is painted by `::before` (z-index −1, with `isolation: isolate`) inside that box. Clicks, focus rings and accessibility hit-testing still use the full 44 px box. Text-only links (Full calendar, All activity, crumbs, Back) grew to 44 px tall with no visual change.

On the after captures, the only interactive elements under 44 px are:
- the 1 × 1 visually-hidden file inputs and the skip link
- the iPhone header's Calendar and Notifications icon buttons at 38 × 44, which are unchanged since B1b
- breadcrumb text links that are 44 px tall but narrower than 44 px

Before, the list included Full calendar 99 × 32, All activity 86 × 32, All tasks 72 × 32 and the 40 px workspace pill.

## 3. Before and after diff statistics

**How the captures were made:**
- Same harness, same fixture preview (ports 8088/8089), and each run started on a freshly restarted preview so no draft banner appears.
- The reference viewport and DPR were used exactly: desktop app frame 1283 × 794 @1, simulated iPhone 372 × 793 @1.
- On Home, the capture page replaces the fixture's text and figures with the reference's (₹31,84,920, "Account-linked view · balances and investments are dated", ₹3,42,180 / ₹3,50,800 Due 7 Dec / 6 items, "Explore your money" / "Download overview", Coming-up titles, next-step text). The product code is untouched, so these diffs isolate typography and spacing.

**How to read the numbers.** Each cell is the **share of pixels differing** (mean |Δ| > 12 levels) **/ mean absolute difference** in levels from 0 to 255. Lower is better. `images/diff-stats.json` has the raw values.

| Screen | Before, Inter (as rendered here) | Before + Manrope injected | After |
|---|---|---|---|
| 01-home | 17.5 % / 25.53 | 17.3 % / 25.1 | **11.2 % / 12.72** |
| 02-home-iphone | 35.6 % / 44.92 | 36.6 % / 48.87 | **20.9 % / 22.17** |
| 03-money | 17.4 % / 10.96 | 17.2 % / 10.67 | **14.9 % / 9.03** |
| 04-statement-desk | 15.6 % / 10.43 | 15.6 % / 10.25 | 15.3 % / 9.84 |
| 05-records | 9.3 % / 10.37 | 9.2 % / 10.06 | **7.6 % / 7.78** |
| 06-travel | 8.2 % / 9.01 | 8.1 % / 8.77 | 7.9 % / 8.36 |
| 07-reports | 9.6 % / 12.19 | 9.5 % / 11.96 | 9.0 % / 11.55 |
| 08-smart-add-source | 75.8 % / 62.67 | 75.7 % / 62.48 | **14.3 % / 14.04** |
| 09-smart-add-review | 77.9 % / 96.45 | 77.9 % / 96.36 | 67.5 % / 90.37 |
| 10-smart-add-confirm | 85.7 % / 70.47 | 85.6 % / 70.41 | **24.9 % / 23.06** |

| Region | Before, Inter | Before + Manrope | After |
|---|---|---|---|
| home-header | 7.1 % / 6.82 | 7.0 % / 6.6 | 6.3 % / 5.46 |
| home-rail | 7.2 % / 7.88 | 7.2 % / 7.74 | **4.9 % / 4.47** |
| home-heading | 16.9 % / 23.54 | 16.6 % / 23.0 | **9.7 % / 8.6** |
| home-networth-panel | 28.2 % / 45.43 | 27.8 % / 44.72 | **17.9 % / 24.86** |
| home-coming-up | 14.0 % / 15.65 | 13.5 % / 14.7 | 13.0 % / 14.21 |
| home-next-step | 32.9 % / 51.18 | 32.9 % / 51.06 | **16.6 % / 12.95** |
| iphone-header | 17.6 % / 20.81 | 17.6 % / 20.5 | 16.3 % / 18.4 |
| iphone-heading | 47.4 % / 69.37 | 46.5 % / 67.85 | **22.8 % / 21.08** |
| iphone-networth-panel | 49.8 % / 60.81 | 53.0 % / 73.01 | **26.2 % / 27.54** |
| iphone-bottom-nav | 21.6 % / 20.1 | 21.2 % / 18.58 | 17.4 % / 17.8 |
| page-header-money | 9.7 % / 12.72 | 9.3 % / 12.3 | 8.4 % / 9.84 |
| canvas-08-source | 28.5 % / 27.18 | 28.2 % / 26.56 | **21.8 % / 19.4** |
| canvas-09-review | 34.2 % / 27.6 | 34.1 % / 27.16 | 32.1 % / 26.39 |
| canvas-10-confirm | 49.9 % / 29.1 | 49.8 % / 28.58 | **41.6 % / 23.03** |

**Why some residuals remain:**
- **Data and content still differ** outside the Home override: the fixture's trip, accounts and dates; the "Thapal" wordmark, which the spec mandates over "thapal."; and the Coming-up amount column.
- **Colours were deliberately not changed:** the panel fill, the button teal and the canvas.
- **Screens 04, 06 and 07 are legacy bodies.** Their remaining residual is structural.
- **Screen 09 stays far off** because the desktop review is still the wide two-pane canvas the spec asks for. The reference shows the narrow modal; this is a decision for KK.
- **The confirm canvas (10) is taller** because it keeps the B1c account-confirmation safeguard and its six facts.

**Classic UI and other themes are unchanged.** Six classic screens were captured before and after on fresh previews: dashboard, expenses and reports, at desktop 1283 × 794 and iPhone 372 × 793. The result is **0 changed pixels on all six** (max channel delta 0; `images/classic-diff.json`). The scoping test enforces that every new selector requires `html[data-theme="signature-flow"]`.

## 4. Images

All files are in `images/`:
- **`compare-<01…10>.jpg`:** reference | before (937cfaf, Inter here) | after on the top row, and 50 % onion (reference + after) | diff heatmap reference vs before | diff heatmap reference vs after on the bottom row. The iPhone sheet is one row of six.
- **`crop-*.jpg`:** reference | before Inter | before + Manrope | after | onion | diff, at 1:1 or 2:1, for these regions:
  - header, rail, heading, net-worth panel, coming up, next step
  - iPhone header, heading, panel, bottom nav
  - Money page header
  - canvas 08, 09 and 10
- **`devices-after-{iphone15,ipadpro11,d1440}.jpg`:** Home, Money, To-do, Records and Smart Add after the correction. The raw PNGs are at native DPR in `captures/after-asis/` (`iphone15-*` 393 × 852 @3, `ipadpro11-*` 834 × 1194 @2, `d1440-*` 1440 × 900 @1). There is no horizontal overflow at any size.

## 5. Deviation register: `deviations-after.csv`

The file has the same 109 rows, ids and columns as the audit, plus `corrected_value`, `residual_delta`, `status` and `reason`. Corrected values are read back from the after captures' computed styles and rectangles.

| Status | All rows | Visible at arm's length (61) |
|---|---|---|
| corrected | 75 | 44 |
| within-tolerance | 12 | 5 |
| decision-needed | 17 | 7 |
| not-addressed | 5 | 5 |

**Not addressed:**
- **FD-084, FD-085, FD-086:** the Statement Desk, Travel and Reports bodies are structural rebuilds, out of scope for this pass.
- **FD-108:** Travel shows ISO dates, but the legacy body is shared with the classic UI.
- **FD-107:** the owner's instruction that Smart Add dates read "09 Nov 2026" takes precedence over the reference image.

## 6. Decisions needed from KK

1. **Numerals (FD-003).** I implemented **proportional figures for the hero and panel figures** (net worth, panel metrics) to match the reference. Lists and columns keep tabular figures. Spec §3.3 says "tabular for money". Please confirm.
2. **Palette (FD-028, FD-038, FD-052, FD-016, FD-053, FD-096, FD-077).** The reference renders a panel fill of #29493E, teal buttons (#26565A), an active tile of #E0EEEE, a canvas of #F9F9F7 and a blue iPhone Add button. The spec palette says Deep #223B35 and Canvas #FBFBF8. **No colours were changed.**
3. **Header utilities (FD-009, FD-010).** The reference has no sync status or search icon, and its icons are smaller. Spec §5.1 and §3.3 list Search and require 20/24 px vector icons, so these were kept.
4. **Coming-up amount column (FD-047, FD-072).** The reference has no amounts. I kept them and let titles wrap to two lines instead of truncating.
5. **Desktop review canvas (FD-089).** The spec asks for the wide original-vs-fields canvas; reference 09 shows the narrow 583 px modal. I kept the wide layout and only tightened its typography.
6. **Lede colour (FD-023).** It stays #646D65 for WCAG AA, against the reference's #778178.
7. **Other:**
   - The parent of Travel in the rail (FD-087).
   - The Smart Add helper line (FD-099).
   - The iPhone canvas footer, which has no approved reference (FD-106).
8. **Owner rules that override the image** (recorded, not open):
   - 44 px touch targets; smaller pills are painted inside 44 px boxes
   - "09 Nov 2026" dates in Smart Add
   - the persistent **Continue to confirmation** action
   - the account-confirmation gate, kept on the confirm canvas

## 7. What cannot be verified here

- **Real Windows, iOS/iPadOS Safari, macOS and Android rendering.** That includes WebKit text rasterisation, DPR 3 hinting, and how `size-adjust`/`ascent-override` on the fallback behave against Segoe UI and SF Pro. Only headless Chromium on Linux is available here. The fallback metrics were computed against Arial metrics, so tune them on real devices if a visible swap shift shows up.
- **Font-loading timing on slow networks**, beyond the presence of the preload and `font-display: swap`.
- **The prototype's own CSS and font files.** Its host is blocked, so reference values are pixel measurements (about ±0.5 px, ±100 weight under 13 px).
- **Dark mode, hover, focus and motion states, and the iPhone Smart Add canvas.** No approved reference exists for them.
- **Offline precache of the font files.** The production service worker's `/assets/` runtime CacheFirst rule covers the hashed woff2 files after first use. Precache contents were not exercised here.

## 8. Checks run

- `bun install --frozen-lockfile`: no changes.
- `bun run typecheck`: passes.
- `bun run build`: passes. The hashed Manrope latin and latin-ext files and the Devanagari woff2 are emitted; the preload URL matches the CSS URL.
- Targeted tests: `vitest run src/components/shell src/components/smart-add src/components/SmartAdd.test.tsx src/lib/acceptance-v4.test.ts src/lib/themes.test.ts` gives **10 files, 165 tests, all passed**. This includes the new `fidelity.test.ts` (9 tests).
- The full suite was not run here; the coordinator runs it.
- The preview ran only on ports 8088/8089 and was stopped by PID. Nothing was committed or pushed.
