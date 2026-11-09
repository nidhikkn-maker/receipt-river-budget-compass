# WS7: Thapal rebrand verification

**Date:** 9 Nov 2026 · **Branch:** `claude/git-up-thapal-audit-bbjy2k` (not merged, not published) · **Status:** verified, awaiting KK's merge decision

## Requirements addressed
Item 7 of the post-audit instructions: preserve the rebrand branch, and verify the approved capitalisation, logo identity and all existing offline storage before any merge is considered.

## Approved capitalisation: "Thapal"
- `git grep` of `src/`, `public/` and `vite.config.ts` finds 263 × "Thapal" and **0 × "THAPAL"**. Three PDF headers (`claim-pdf.ts`, `expenditure-pdf.ts`, `report-pdf.ts`) printed "THAPAL" as a design choice; they now print "Thapal".
- There are no other spellings ("thapal", "ThaPal" and so on) in user-visible text.

## Logo identity
- The wordmark reads "Thapal" in light and dark (`wordmark-light-dark.png`). The folded-pages mark is unchanged; whether it should change for Thapal is KK's decision.
- **Sign-in page in a real browser** (Chromium, iPhone 15 profile, light and dark), using the local dev server. Every request to Cloud and other external hosts was blocked, so nothing was sent to the live project. Results:
  - `<title>` "Sign in — Thapal"; Apple web-app title "Thapal";
  - logo `aria-label` "Thapal"; wordmark text "Thapal"; heading "Welcome to Thapal";
  - footer "Thapal · Your intelligent financial operating system"; "Ledgerline" appears **0 times** in the rendered page.
  - Screenshots: `auth-light.png`, `auth-dark.png`.
- The PNG icons and iPhone splash screens show only the mark (no text), so they did not need to change.

## Existing offline storage and saved data
| Check | Result |
|---|---|
| Lowercase internal ids (`ledgerline-offline`, storage keys, cache names, `ledgerline:*` events, backup id, theme id, `LEDGERLINE-ASSET:`, MCP id, brand file paths) | The set and counts are **identical** between `origin/main` and this branch (same hash of sorted counts). |
| Storage modules `offline.ts`, `claim-preparations.ts`, `store.tsx`, `preferences.ts` | **Byte-identical** to `main` |
| Rename diff lines touching `localStorage`, `sessionStorage`, `indexedDB` or cache code | Only display strings on the same line (Face ID prompt text, backup error message). Keys are unchanged. |
| New regression test `src/lib/brand-compat.test.ts` (3 tests, pass) | Encrypted offline data is written to and read back from `ledgerline-offline`. Backups with `app: "ledgerline"` restore. Theme id `apple-ledgerline` is kept (label "Apple × Thapal"). Event `ledgerline:smart-add` is kept. Printed `LEDGERLINE-ASSET:` labels still match. |

## Files changed in this workstream
`src/lib/claim-pdf.ts`, `src/lib/expenditure-pdf.ts`, `src/lib/report-pdf.ts` (header text only); `src/lib/brand-compat.test.ts` (new); evidence in `docs/evidence/ws7-rebrand-2026-11-09/`. No database objects changed.

## Tests
Full suite: **2,214 passed / 0 failed** (317 files). Typecheck and build pass.

## Financial integrity / security
These are display-text changes only. No calculations, permissions, policies or storage paths changed. Passkeys: only the display `rpName` changed; the relying-party ID is unchanged. The origin-validation weakness is covered in WS3 (M-3).

## Outstanding risks
- Home-screen apps already installed keep the old name until reinstalled. Passkeys already registered may still show "Ledgerline" until registered again.
- Domain `ledgerline.biz` is unchanged.
- Safari/iOS rendering was not tested on a device.

## Rollback
Revert the rebrand commits (`162dff6` plus this workstream's commit). No data migration is needed in either direction, because storage ids never changed.

## Items requiring KK's approval
1. Merge the branch into `main`, and publish.
2. Whether to keep the "L" folded-pages mark or commission a Thapal mark.
3. Whether to move from the `ledgerline.biz` domain. If so, passkeys must be registered again: the relying-party ID is the hostname.
