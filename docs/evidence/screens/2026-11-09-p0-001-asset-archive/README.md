# P0-001 asset archive: before and after screenshots (9 Nov 2026)

## How these were taken (read first)
- **Emulated, not real devices.** Playwright device profiles "iPhone 15" and "iPad Pro 11" in **Chromium**. Safari/WebKit and real iPhone/iPad checks are still outstanding.
- **Isolated fixture data.** The dev server ran on branch `uix/screen-verification` with its Supabase address pointed at a non-existent host (`fixture.supabase.invalid`). Every sign-in and database call was answered inside the browser by the capture script, and saves were kept in the script's memory. Nothing hosted was read or changed.
- **Seeded records:** one computer asset "MacBook Pro (office)" (cost ₹1,85,000, WDV 40%, linked invoice, tag, location, custodian), the "Anna Nagar flat" property asset (50% share, ₹85,00,000) linked to a property record, and one manual holding (40 g gold coins at an entered rate).
- **"Before"** was captured before any code change; **"after"** was captured after the fix, with the same fixture.
- The "Approve financial changes" dialog is the existing approval step for every asset save; it still appears after Archive and Restore (not shown separately in the after set).
- Dates in "Archived by you on …" use India time, so a capture taken late in the UTC evening reads the next day.
- Images are JPEG, resized to 720 px wide.
- **Reproduce:** start the dev server with the fixture environment variables, then run `PHASE=before|after OUT=<dir> NODE_PATH=$(npm root -g) node scripts/browser/capture_p0_001_asset_archive.cjs`.

## Before the fix (`*-before-*`)
| # | Screen | What it shows |
|---|---|---|
| 01 | Register | Property & assets, book value ₹43,21,587 |
| 02 | Asset edit | Red **Delete** next to Save: one tap, no reason asked |
| 03 | After Delete | Only the generic "Approve financial changes · Assets" dialog, with no reason or warning |
| 04 | Register after Delete | The laptop record is gone (book value now ₹42,50,000); its invoice link and depreciation history are lost from the register |
| 05 | Financial position | Net worth fell from ₹46,25,587 to ₹45,54,000 with no accounting entry |

## After the fix (`*-after-*`)
| # | Screen | What it shows |
|---|---|---|
| 01 | Register | Same register and the same figures |
| 02 | Asset edit | No Delete. **Archive** in its place |
| 03 | Archive confirmation | Explains what is kept and that archiving is not a sale. Archive stays disabled until a reason is given |
| 04 | Archive confirmation with reason | Reason entered |
| 05 | Archived assets view | Archived badge, the same figures, "Archived by you on … · Reason: …", archive history, depreciation and **Restore** |
| 06 | Financial position after archive | ₹46,25,587, unchanged |
| 07 | Restore confirmation | Reason required |
| 08 | Register after restore | Laptop back in the active list |
| 09 | Financial position after restore | ₹46,25,587, unchanged |

The script read the figures as follows. iPhone and iPad gave the same results:
- Before the fix: start ₹46,25,587.00; after Delete ₹45,54,000.00.
- After the fix: start ₹46,25,587.00; after archive ₹46,25,587.00; after restore ₹46,25,587.00.

The restored stored record matched the seeded one field for field and carried an `archiveHistory` with two entries: archived, then restored, each with the owner id, time and reason.
