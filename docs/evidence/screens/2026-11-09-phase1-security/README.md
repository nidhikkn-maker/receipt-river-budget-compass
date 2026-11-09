# Development screenshots: Phase 1 security flows, and comparison with the approved Signature Flow (9 Nov 2026)

## How these were taken (read first)
- **Emulated, not real devices.** Playwright device profiles ("iPhone 15", "iPad Pro 11") in **Chromium**, the only browser engine available in this environment. Safari/WebKit and real iPhone/iPad checks are still outstanding (release blocker RB-P1-05).
- **Isolated data.**
  - The app ran on the development server from branch `phase2/database-foundation`, with the Phase 1 code included.
  - Its Supabase address was pointed at a **non-existent host** (`fixture.supabase.invalid`), so neither the browser nor the server could reach hosted services.
  - Every sign-in and database call was answered by fixtures inside the browser. Nothing hosted was read or changed.
- **Face ID does not run in emulation.** The red "Face ID didn't complete" line on lock screens is expected here, because WebAuthn is not available.
- **Reproduce:** `node scripts/browser/capture_phase1_security_screens.cjs`, with the dev server started using the fixture environment variables described in the script header.

## Flows captured (iPhone = `iphone-*`, iPad = `ipad-*`)
| # | Screen | What it shows |
|---|---|---|
| 01 | Sign-in | Sign-in page |
| 02 | Guest session ended | Notice after a guest session ends on inactivity (`/auth?ended=guest-idle`) |
| 03 | Home after sign-in | Current Home (empty fixture account) |
| 04 | Settings → Security & device unlock | MPIN, Face ID / device lock, passkey list, sign out other devices, recovery |
| 05 | Remove passkey: confirmation | First confirmation |
| 06 | Re-confirmation (step-up) | "Confirm it's you": Face ID / passkey or the account password. The 4-digit MPIN is explicitly not accepted. |
| 07 | Fresh start after 6 h away (password account) | App opens **locked**: Face ID, account password, emailed code, sign out, recovery guidance |
| 08 | Fresh start, Google-only account | Locked: **emailed code, no password field** |
| 09 | Google-only: code requested | Code entry |

## Comparison with the approved Signature Flow (Concept 06, revision 10)
**Reference:** the ten approved captures, extracted unchanged from KK's uploaded handoff document. They are stored in `docs/evidence/signature-flow-reference/` (01 Home on a computer … 10 Smart Add confirm).

**Side-by-side images:** `compare-home-iphone.png` and `compare-home-large-screen.png`.

**Finding: the current app does not match the approved Signature Flow.** These differences predate Phase 1 and Phase 2; neither phase changed the visual design.

| Aspect | Approved Signature Flow | Current app | Requirement |
|---|---|---|---|
| Colour system | Canvas #FBFBF8, ink #222923, deep forest green #223B35 for primary actions and the net-worth panel | Warm cream and gold, gold "+" button, sunrise photo hero | V4 "Approved UIX: Colours"; "never swap in … another theme" |
| Logo and wordmark | Option 02 single-stroke **T**; the wordmark reads Thapal | Old Ledgerline **L** mark (lock screen, header, rail) | V4 "Name and logo"; final artwork still awaited (APR-LOGO) |
| Navigation | Home, Money, To-do, Records, Reports and Add (rail on computer; bottom bar on iPhone with a central Add) | Today, Spaces, Review, More (bottom bar); Today, Review, Activity, Wealth & Plan, Statements, Documents, Travel, Reports, More (rail) | V4 "four places (Home, Money, To-do, Records) plus one Add"; DN-03 |
| Home content | Greeting, net-worth panel, Coming up, suggested next step, recent activity | Greeting over a photo, "Today" checklist, "Your Money Story" | V4 Approved UIX: Home |
| Typography | Clean modern sans-serif | Serif display headings | V4 Approved UIX |
| Lock screen | Not in the ten captures | Bottom navigation stays visible behind the lock screen; content is hidden | To be designed in the Signature Flow system and shown to KK |

**Status:** V4's own score for UIX implementation is 4.0, with 0 of 111 screens visually verified. These captures confirm that. Implementing Signature Flow is planned UIX work after the foundation phases, built on the existing components and semantic theme tokens. It has **not** been started in Phase 2, and nothing here changes the approved design.
