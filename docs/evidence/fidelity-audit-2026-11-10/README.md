# Signature Flow visual-fidelity audit: commit 937cfaf vs the approved references

Read-only audit. No file in any `/home/user/thapal-*` worktree was edited. The implementation was audited from a separate clone (`../fidelity-937cfaf`, detached at 937cfaf) through its local fixture preview on ports 8086/8087. That preview has since been stopped by PID.

## 1. Inputs and what they really are

| Input | Finding |
|---|---|
| `docs/evidence/signature-flow-reference/01…10.png` | All ten are **1348 × 926 px**, RGB, with no DPI metadata. They are byte-identical (md5) to the ten images embedded in the standalone `.docx`. |
| Standalone `.docx` | Text, styles, comments and 10 media files were extracted to `docx/`. It embeds no fonts. Its `fontTable.xml` lists only Word document fonts (Symbol, Times New Roman, Courier New, Wingdings, Cambria, Calibri, Arial). There is no HTML or CSS. The only typography statement is in §3.3: *"Prototype uses Manrope in places … Use tabular numerals for money"*. The text roles are given as ranges (hero 36–44 px desktop / 28–34 px phone, and so on). |
| Master `.md` spec | It has the same §3.2 palette and §3.3 rules. It names the design source as `ledgerline-signature-flow.alertcabin20.chatgpt.site`. |
| "Approved prototype" | **It exists here only as images.** The prototype URL is refused by the session egress proxy (`CONNECT 403`), so its CSS, its font files and its exact values could not be inspected. Every reference value below is **measured from pixels**. |

### Viewport and device scale factor of the references (high confidence)

- **The browser viewport is 1348 × 926 at DPR 1.**
  - The outer page scrollbar is a classic 15 px Chromium scrollbar with arrow buttons (x 1333–1347). At DPR 2 it would be about 30 px.
  - Hairlines are 1 px.
  - Text antialiasing is greyscale, with no subpixel colour fringes.
  - Glyphs the font lacks (→, ↗) render as tofu boxes, and the native file input reads "Choose Files / No file chosen". Both point to **headless Chromium on Linux** with a minimal font set.
  - The PNGs show light lossy-compression noise of ±2–3 levels.
- **Desktop captures (01, 03–10).** The prototype draws its app inside a rounded frame at (25, 91)–(1308, 885), which is **1283 × 794 CSS px**:
  - a 100 px rail
  - a 76 px header
  - an inner content scroller with a 10 px custom scrollbar
- **iPhone capture (02).** This is the prototype's *simulated* phone: a screen of **372 × 793 CSS px at DPR 1** inside a drawn bezel at (480, 97)–(852, 890), with a 10 px inner scrollbar. It is **not** a real device capture. It is not 390/393 px wide and not DPR 3.
- **How the implementation was captured.** Captures were taken at exactly these sizes: desktop at 1283 × 794 @1x, and iPhone at 372 × 793 @1x (mobile emulation with touch). The reference frame regions were then cropped to those sizes for pixel diffs.

## 2. Font verdict

### What the reference renders: **Manrope**

Specimens were rendered in the same Chromium at DPR 1 and correlated at native scale with the reference ink (`scripts/rolematch.py`). Fourteen families were searched across weight, size, tracking and numeral style: Manrope, Inter, Inter Display, Geist, DM Sans, Plus Jakarta Sans, IBM Plex Sans, Hanken Grotesk, Sora, Outfit, Urbanist, Figtree, Onest and Liberation Sans. SF Pro and Segoe UI are not installable here.

- **Display text identifies the font beyond doubt:**
  - greeting: Manrope 800 / 44 px / −0.04 em, r = 0.975 (next best family 0.82)
  - net worth: Manrope 800 / 56 px / −0.05 em, r = 0.985
  - page title: Manrope 800 / 38 px / −0.04 em, r = 0.961
  - stat "248": Manrope 800 / 29 px, r = 0.963
- **The distinctive glyphs match:** single-storey `g`, flat-topped `1` with flag, the Manrope `₹` (taken from Manrope's latin-ext subset), and plain `0` without a slash.
- **Body text is consistent with Manrope** (medium confidence). Under 13 px, hinting plus JPEG noise limits correlation to 0.7–0.85, and no other family wins consistently.
- **Numerals are proportional, not tabular.** "₹3,42,180" has a narrow `1`. In every figure role, tabular-nums scores lower than the default figures.

See `images/glyph-comparison.jpg` for the sheet: reference pixels, then 937cfaf as rendered, then 11 candidate fonts at the matched settings.

### What 937cfaf renders: **not Manrope anywhere**

- `--sf-font` at `src/styles.css:1308` is `"Manrope", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, …`. The comment says Manrope is "used only if installed".
- **There is no `@font-face` for Manrope and no stylesheet or preload that loads it.**
  - `src/routes/__root.tsx:118` injects a Google Fonts link for **Space Grotesk 700 and Noto Sans Tamil** only, with `display=swap`. It also adds preconnects to fonts.googleapis.com and fonts.gstatic.com.
  - `document.fonts` contains Noto Sans Tamil, Space Grotesk and "Lovable Camera" faces, all `unloaded`. It contains no Manrope face.
  - `document.fonts.check("16px Manrope")` returns `true`. That only means no face needs loading, so it proves nothing.
- **CDP `CSS.getPlatformFontsForNode` on every text role** reports `Inter-Bold`, `Inter-SemiBold` or `Inter-Regular` with `isCustomFont:false`. That is a **locally installed Inter** on this Linux container (fc-list shows Inter and Inter Display), so it does not represent users.
- **What users will see, by platform:**

| Platform | Rendered font | Verified here? |
|---|---|---|
| Stock Windows 10/11 (Chrome or Edge) | **Segoe UI**. Manrope and Inter are not shipped, and `-apple-system` and `BlinkMacSystemFont` do not resolve on Windows. | No. Inferred from the stack. |
| iPhone and iPad Safari, macOS | **SF Pro**, through `-apple-system`. A Mac that has Inter installed shows Inter. | No. Inferred from the stack. |
| Android | Roboto | No. Inferred from the stack. |
| This Linux box | Inter, because it is installed here | Yes, proved by CDP. |

- **Width differences at the greeting's settings:** Inter is +3.5 % wider than Manrope (384 vs 371 px), Liberation/Arial metrics are +0.5 % and DejaVu is +18 %. Segoe UI and SF Pro could not be measured.
- **Rupee sign:** Segoe UI, SF Pro, Inter and Manrope's latin-ext all contain ₹, so no tofu is expected. When Manrope is self-hosted, the **latin-ext subset must be included**, or ₹ will fall back to a different font inside the same figure.
- **The fix** is FD-001: self-host the Manrope woff2 files (OFL; licensing decision 47 is still open in the spec) with `font-display: swap` and a preload, plus a size-adjusted fallback (FD-002).
- **Isolating geometry from the font:** every screen was also captured with Manrope injected (`captures/manrope/`). This separates font differences from size, weight and layout differences. Even with the correct font, almost every role is the wrong size or weight (section 3).

### Text roles: reference (measured) vs 937cfaf (computed)

| Role | Reference (Manrope) | 937cfaf desktop ≥1100 px | Δ |
|---|---|---|---|
| Greeting | 44 / 800 / −0.04 em | 52 / 700 / −0.04 em | +8 px, −100 |
| Page title | 38 / 800 / −0.04 em | 46 / 700 / −0.035 em | +8 px, −100 |
| Overline | 10 / 600–700 / 0.16–0.20 em | 11 / 600 / 0.14 em | +1 px |
| Lede | 12.5–13 / 400–500, line height ≈21 | 15 / 400 / 23.25 | +2 px |
| Net worth | 56 / 800 / −0.05 em, proportional | 64 / 700 / −0.035 em, tabular | +8 px |
| Metric figure | 19 / 700 / −0.04 em | 20 / 700 / −0.01 em, tabular | +1 px |
| Metric label / sub | 9.5–10 / 500 | 12 / 400 ; 11.5 / 400 | +2 px |
| Section title | 16 / 800 / −0.04 em | 19 / 600 / −0.02 em | +3 px, −200 |
| Row title / sub | 12 / 800 ; 10.5–11 / 500 | 14.5 / 600 ; 12.5 / 400 | +2.5 px, −200 |
| Buttons | 11–12 / 800 | 12.5–14 / 700 | +1.5–2 px |
| Rail labels | 10 / 600 (active 800) | 11.5 / 500 (active 700) | +1.5 px |
| Wordmark (desktop / phone) | 20 / 800 ; 17 / 800 | 24 / 700 ; 19 / 700 | +4 / +2 px |
| Canvas title | ≈26 / 700 / −0.05 em | 30 / 700 / −0.03 em | +4 px |
| iPhone greeting / net worth | 26 / 800 / −0.05 ; 36 / 800 / −0.05 | 26 / 700 / −0.035 ; 34 / 700 | weight, −2 px |

**The pattern behind most rows** is that the reference sets headings and figures at **800** with tighter tracking and runs the supporting text 1.5–3 px smaller, while the implementation sets headings at 600–700 and everything else larger. This is what reviewers saw as "heading weight and proportion".

Confidence in the measurements: display sizes are ±0.5 px. Text under 13 px is ±0.5 px and ±100 weight. See `work/roles.json` for the top-6 candidates per role.

## 3. Deviation register summary (`deviations.csv`, 109 rows)

Each row gives the reference value, the implemented value, the delta, the severity, the confidence, the source as file:line in the 937cfaf clone, the exact CSS correction and a classification.

**By severity:** 61 are visible at arm's length and 48 are subtle.

**By classification:**
- 80 are plain deviations.
- 26 are **ambiguous**, where the reference image conflicts with the written spec. Examples:
  - 44 px touch targets vs the 34–41 px controls drawn in the reference
  - tabular vs proportional figures
  - the palette's Deep #223B35 vs the captured #29493E / #26565A
  - the blue Add button on iPhone
  - the wide vs narrow review canvas
  - vector 20/24 px icons vs the Unicode placeholders
- 3 are **structural**: the screen was not built to the reference.

**By area:**

| Area | Rows |
|---|---|
| Smart Add canvas | 17 |
| Net-worth panel | 13 |
| Coming up | 9 |
| Rail | 9 |
| Header | 7 |
| iPhone panel | 7 |
| Home heading | 6 |
| Bottom nav | 5 |
| iPhone header | 4 |
| iPhone heading | 4 |
| Page header | 4 |
| Fonts | 3 |
| Next step band | 3 |
| iPhone lists | 3 |
| Palette | 2 |
| Money list | 2 |
| Toasts | 2 |
| Dates | 2 |
| One each: lower sections, iPhone gutter, Statement Desk, Travel, Reports, navigation, touch targets | 7 |

### Top deviations, most visible first

1. **The font is not Manrope on any user device** (FD-001).
2. **The greeting is 52 px / 700 against 44 px / 800**, and the page titles are 46 px / 700 against 38 px / 800. Delete the ≥1100 px step at `styles.css:1591-1592`.
3. **The net-worth figure is 64 / 700 tabular against 56 / 800 proportional.** The panel is 647 × 383 against 673 × 360, the radius is 28 against ≈22, and the fill is #223B35 against #29493E.
4. **Toasts cover controls.**
   - On the iPhone canvas, the Sonner "Bill read" toast completely covers **Continue to confirmation**.
   - On desktop it covers the footer note.
   - Source: `<Toaster />` in `__root.tsx:184` uses the default bottom position.
5. **The desktop review canvas is a different design.** It becomes a 1216 × 746 two-pane form, while reference 09 is the same 583 px modal. The canvas is also 640 px wide against 583, its title is 30 px against 26, its controls are 48 px against 41, and the scrim is light and blurred instead of a dark #626D65 with no blur.
6. **Section and row typography:** "Coming up" is 19 / 600 against 16 / 800, and row titles are 14.5 / 600 against 12 / 800. The rows also carry an amount column the reference does not have, which causes truncation on iPhone.
7. **Rail and header:**
   - The rail is 92 px against 100, its item pitch is 95 against 83, and the active tile is 46 × 46 against about 36 × 43.
   - The T mark is 30 px against 25, and the wordmark is 24 against 20.
   - The header has an extra sync status and search icon, and a 44 px avatar against 34.
8. **iPhone layout:**
   - The header is 56 px against 65, and the gutter is 16 against 20.
   - The lede runs full width instead of sitting in the left column.
   - The panel padding is 18 against about 21–27, and the panel buttons stack on two rows instead of one.
   - Rows are 62.5 px against 71.
   - The central Add is 46 × 46 with a shadow against 44 × 39.
9. **Statement Desk, Travel and Reports show legacy page bodies** inside the new shell (FD-structural). None of them has the Signature header, stat panel, pills or cards seen in references 04, 06 and 07.
10. **Dates:**
    - The Smart Add review shows "09 Nov 2026" with a leading zero, while the shell and references use "9 Nov" and "Due 7 Dec". Source: `src/lib/date-display.ts:15`.
    - The native date field displays "11/09/2026" in en-US Chromium.
    - Travel shows ISO dates ("2026-11-07 → 2026-11-09").

### Other checks

- **Touch targets under 44 px** (the reference itself draws 31–38 px pills):
  - Full calendar is 98 × 32, All activity 84 × 32 and All tasks 71 × 32.
  - The workspace pill is 106 × 40 on desktop and 86 × 40 on iPhone.
  - Smart Add on iPhone is 105 × 36, and the panel buttons are 157/143 × 40.
  - The breadcrumb "Home" is 35 × 20, Find anything is 40 px tall, and the canvas source chips are 40 px tall.
- **Overflow and truncation:** there is no horizontal overflow at either size. Long upcoming titles truncate on iPhone and desktop ("HDFC Regalia card next bill (s…").

## 4. Images

All JPEGs are 1600 px wide or less.

**Full-screen comparisons:** `images/compare-<screen>.jpg`, one per reference 01–10.
- Desktop screens use a 2 × 2 layout: reference / 937cfaf as rendered here (Inter) / 50 % onion skin with Manrope injected / difference heatmap (yellow→red is a larger difference).
- iPhone uses 5 columns.
- `images/diff-stats.json` gives the share of pixels that differ.

**Region crops:** `images/crop-*.jpg`, at 1:1 or 2:1 with the same three-way layout:
- desktop header, rail, heading, net-worth panel, Coming up, next step
- iPhone header, heading, panel, bottom nav
- page header (Money)
- canvas 08, 09 and 10

**Glyph sheet:** `images/glyph-comparison.jpg`.

**Raw captures and per-role computed styles:** `captures/{asis,manrope}/*.png|json`. These include CDP platform fonts, `document.fonts`, stylesheet links, the under-44 px list and truncation.

## 5. Method (reproducible)

`scripts/capture.cjs` runs Playwright Chromium against the fixture preview:
- It signs in as the fixture owner and sets `ll-uix=signature-flow`.
- It refreshes the fixture owner's activity key. Without this, the inactivity lock covers the page; the lock is not under audit.
- It stubs `receipt-extract.functions.ts` with the documented Blue Tokai extraction and blocks hosted Supabase.
- It records `getComputedStyle`, rectangles and `CSS.getPlatformFontsForNode` for about 70 selectors.

The other scripts:
- `scripts/rolematch.py` and `scripts/render-rows.cjs` search font, weight, size, tracking and numerals per role.
- `scripts/geom.py` measures reference geometry: ink boxes, colour regions, hairlines and corner radii.
- `scripts/compose.py` and `scripts/crops.py` build the images.
- `scripts/register.py` builds the CSV.

The preview was restarted (by its recorded PID) between variants, so drafts created by Smart Add runs did not add a "drafts waiting" banner to the page captures.

## 6. What could not be verified

- **Real Windows (Segoe UI), iPhone/iPad Safari (SF Pro, WebKit text rendering, DPR 3) and macOS.** There is no Windows, WebKit or iOS here, and installing other browsers was out of scope. The fallback behaviour is reasoned from the CSS stack, not observed.
- **The prototype's source CSS and font files**, because the host is blocked. Reference values are pixel measurements, with ±0.5 px / ±100-weight uncertainty under 13 px. Colours carry ±3 levels of compression noise.
- **States with no approved reference:** iPad, the iPhone Smart Add canvas, dark mode, hover and focus states, and motion.
- **Data-dependent differences.** The fixture data differs from the prototype's illustrative data (amounts, titles, trip, date Tue 10 vs Mon 9 Nov). Where data changes text length, the deltas are reported as size or weight values, not pixel positions.
- **The native date-input display**, which depends on browser and OS locale. It shows mm/dd/yyyy in en-US headless Chromium, and the iPhone en-IN display is not verified.
