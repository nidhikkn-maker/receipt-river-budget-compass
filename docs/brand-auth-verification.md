# Brand/auth acceptance — preview only

## Changed files
- src/components/LedgerlineLogo.tsx, AuthFrame.tsx
- src/routes/auth.tsx, reset-password.tsx, [.]lovable.oauth.consent.tsx, __root.tsx
- src/styles.css, vite.config.ts (manifest colour only)
- public/brand/*.svg, app-icon.png, app-icon-large.png, apple-touch-icon.png, favicon.png, splash/*.png
- scripts/brand/build_icons.py; scripts/browser/test_brand_auth.py, test_auth_mock_flow.py
- docs/brand-usage.md, this evidence, roadmap.md, AGENTS.md
- src/assets/ledgerline-logo-concept-{flow,pages}.jpg (exploration only)

## Observed evidence
Actual routes with intercepted auth calls, no hosted accounts/data: 360/402 phones,1180 landscape tablet,1440 desktop × light/dark. Sign-in, invalid-login alert, signup fields and expired/no-recovery-link states render without horizontal overflow or page errors (32 states). Separate mock flow proves successful sign-in preserves /reset-password next destination; sign-out removes remembered user; Tab advances Email→Password. Device reauthentication5 + SmartAdd5 automated tests pass. Build log clean.

Screenshots: /tmp/browser/brand/auth-<width>-<theme>.png, error/signup/reset equivalents; baseline-auth.png and returning-fixture.png. 16/24/32 symbol check in legibility.png. These contain only synthetic credentials, never personal finance.

## Remaining
No hosted provider configuration changed. Google external completion, configured MFA, real biometric prompts, valid emailed recovery and consent decisions NOT verified. Consent guard/handlers retained, wrapper migrated. All-app detailed family migration remains open; brand completion is not full UIX acceptance. Original reference images unavailable; no exact match claim.
