# Signature Flow fidelity pass 2 and P0-029 lock screen (11 Nov 2026)

Worktree `/home/user/thapal-uixb`, branch `uix/signature-shell`, base 0aea59b. Nothing is committed or pushed.

## Contents

- **Raw PNGs:** kept outside the repository. Their JSON measurements are in `captures/`:
  - `before`: 0aea59b
  - `before-c`: 0aea59b again, with the final contrast scanner
  - `after`: the candidate
  - `lock`: the P0-029 lock runs
- **Scripts** (`scripts/`):
  - `capture.cjs` (Playwright; sets `ref`, `devices`, `classic`, `pill`, `lock`)
  - `pipeline.sh` and `restart-preview.sh` (fixture preview on ports 8088/8089, stopped by PID)
  - `compose.py` (sheets, crops, diff statistics)
  - `analyse.py` (classic identity, contrast, review and pill bounding boxes)
  - `register_pass2.py`
- **Images** (`images/`, all JPEG at most 1600 px wide):
  - `compare-01…10.jpg`: reference | 0aea59b | after on the top row; onion skin and the two diff heatmaps below
  - `crop-*.jpg`: region crops
  - `devices-{before,after}-{iphone15,ipadpro11,d1440}.jpg`: Home, Money, To-do, Records, Travel (under Records), and Smart Add Add / Review / Confirm
  - JSON results: `diff-stats.json`, `classic-diff.json`, `contrast-summary.json`, `review-boxes.json`, `pill-boxes.json`
- **Contrast tables:** `contrast-after.csv` and `contrast-before-c.csv`. Each row is a distinct text/background pair taken from the computed styles, including pills painted by `::before`.
- **Register:** `deviations-after-pass2.csv`. It keeps all 109 rows and adds `pass2_value`, `pass2_status` and `pass2_reason`.
- **Conflicts for KK:** `conflicts/C1…C7.jpg`, crops of the reference screenshots.
- **Lock screen:** `lock-p0-029/lock-*.jpg` shows four stages per device: before lock, locked, deep link while locked, and after unlock.

## Diff statistics at the reference viewport and DPR

Each cell gives two numbers: the share of pixels that differ, then the mean absolute difference.

| Screen or region | 0aea59b | After |
|---|---|---|
| 01-home | 11.2 % / 12.72 | 9.8 % / 9.95 |
| 02-home-iphone | 20.9 % / 22.17 | 18.1 % / 19.46 |
| 03-money | 14.9 % / 9.03 | 8.5 % / 7.61 |
| 04-statement-desk | 15.3 % / 9.84 | 15.1 % / 8.32 |
| 05-records | 7.6 % / 7.78 | 7.0 % / 6.20 |
| 06-travel | 7.9 % / 8.36 | 8.0 % / 7.08 |
| 07-reports | 9.0 % / 11.55 | 8.6 % / 9.99 |
| 08-smart-add-source | 14.3 % / 14.04 | 11.4 % / 11.63 |
| 09-smart-add-review | 67.4 % / 90.36 | 24.5 % / 24.70 |
| 10-smart-add-confirm | 24.9 % / 23.15 | 27.0 % / 30.07 |
| home-header | 6.3 % / 5.46 | 5.5 % / 3.67 |
| home-rail | 4.9 % / 4.47 | 5.0 % / 3.00 |
| home-heading | 9.7 % / 8.60 | 7.3 % / 6.58 |
| home-networth-panel | 17.9 % / 24.86 | 14.8 % / 18.28 |
| home-coming-up | 13.0 % / 14.21 | 13.1 % / 13.07 |
| home-next-step | 16.6 % / 12.95 | 15.2 % / 12.11 |
| iphone-header | 16.3 % / 18.40 | 15.0 % / 15.75 |
| iphone-heading | 22.8 % / 21.08 | 19.1 % / 18.89 |
| iphone-networth-panel | 26.2 % / 27.54 | 21.1 % / 22.89 |
| iphone-bottom-nav | 17.4 % / 17.80 | 16.4 % / 16.41 |
| page-header-money | 8.4 % / 9.84 | 8.3 % / 8.40 |
| canvas-08-source | 21.8 % / 19.40 | 15.6 % / 15.33 |
| canvas-09-review | 31.9 % / 26.21 | 32.2 % / 22.87 |
| canvas-10-confirm | 41.6 % / 23.03 | 28.1 % / 20.12 |
| iphone-coming-up | 12.8 % / 14.37 | 12.9 % / 13.84 |
| page-header-travel | 6.5 % / 8.00 | 7.6 % / 7.60 |

The 10-confirm full screen is slightly worse than before. Its canvas is now the narrow, centred one, while the reference is taller. Its region crop improved from 41.6 % to 28.1 %.

## Checks

- **Classic UI:** 10 screens (dashboard, expenses, reports, trips and records, at 1283×794 and 372×793) show 0 changed pixels.
- **Contrast:** 148 enabled text pairs, minimum 4.67:1, none failing. Disabled buttons are exempt.
- **iPhone review:** exactly one primary action, never covered by a toast or the preview pill. The footer dropped from 96.7 px to 81 px. See `review-boxes.json`.
