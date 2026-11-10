# Preview information panel (10 Nov 2026)

KK asked for the Vercel preview to show its GitLab commit, sample-data status and build version, so an older build on signature.thapal.app can't be mistaken for the current one.

## What it is
- **Where it lives.** `src/components/PreviewInfoPanel.tsx` holds the panel. The values come from `src/lib/preview-info.ts`, which is pure. The panel is mounted once in `src/routes/__root.tsx`, so it appears on every screen, including `/auth`, in both the classic interface and Signature Flow.
- **When it shows.** It renders **only** when the build sets `VITE_PREVIEW_ENV=preview`. Production builds and normal local development show nothing.
- **Where the values come from.** They are read at build time from `VITE_PREVIEW_COMMIT`, `VITE_PREVIEW_BRANCH` and `VITE_PREVIEW_BUILT_AT`. The host is `location.host`.
- **Sample-data status.** This is detected positively from `VITE_SUPABASE_URL`. A backend is sample data when either:
  - its path contains the segment `__fixture-supabase`, or
  - a word of its host name is `fixture` or `fixtures` (for example `thapal-fixture-backend.vercel.app` or `fixture.supabase.invalid`).

  It then reads "Sample data only — not connected to your real records". Every other address reads "Unknown data source". No production address is in the code.
- **Collapsed.** A 44 px pill shows "Preview", the short commit and, on wider screens, the data status. Its accessible name is, for example, "Preview build 69ab3e2 on uix/signature-shell, sample data".
- **Expanded.** Tap or click the pill to open a card with:
  - the data status;
  - the full commit and the branch;
  - the build version (`YYYYMMDD.HHmm-<short sha>`);
  - the build time in UTC;
  - the host.

  Escape closes the card and returns focus to the pill. Tapping elsewhere also closes it.
- **Placement.**
  - **iPhone:** lower left, 72 px plus the bottom safe area up from the bottom, which clears the 60 px tab bar.
  - **Wider screens:** lower right.
  - **Stacking:** it sits at z-index 40. That is below Smart Add, dialogs and sheets (50) and below toasts, so it never covers their actions. It is above the bars (30).
  - Only Tailwind utilities with semantic tokens are used. No global CSS was changed.

## How these were taken
- **Script.** `scripts/browser/capture_preview_info_panel.cjs`, run against a Vite dev server on port 8085. The server was started with:
  - the fixture backend `https://fixture.supabase.invalid`, with every request answered in the browser and writes refused, as in `capture_signature_shell.cjs`;
  - `VITE_PREVIEW_ENV=preview`, `VITE_PREVIEW_COMMIT=<HEAD>`, `VITE_PREVIEW_BRANCH=uix/signature-shell` and `VITE_PREVIEW_BUILT_AT=$(date -u +%FT%TZ)`.
- **Devices.** Playwright Chromium:
  - an iPhone 15 (393 × 659 CSS px, DPR 3), with 47/34 px safe areas emulated through CDP;
  - a 1440 × 900 desktop.
- **Measurements.** `index.json` has the bounding boxes for the pill, the card, the tab bar, the central Add, the Smart Add footer and any toasts. It also records the overlap results.

| File | Shows | Measured |
|---|---|---|
| `iphone15-01-collapsed` | iPhone 15, Signature Flow Home, collapsed | Pill 509–553, tab bar starts at 565. There is no overlap with the tab bar or the Add. |
| `iphone15-02-expanded` | iPhone 15, expanded card (sample data, full commit, branch, build, time, host) | The card does not overlap the tab bar. |
| `iphone15-03-smart-add-open` | Smart Add open. The panel is hidden beneath it, so "Continue to review" is uncovered. | The element at the pill's centre belongs to Smart Add (`pillBeneathOverlay: true`). |
| `iphone15-classic-01-collapsed` | iPhone 15, classic interface | Pill 509–553, classic bottom nav starts at 567. |
| `desktop-1440-01-collapsed` | 1440 × 900, collapsed (lower right) | — |
| `desktop-1440-02-expanded` | 1440 × 900, expanded | — |

The host reads `127.0.0.1:8085` because this was a local capture. On Vercel it shows the deployment host.
