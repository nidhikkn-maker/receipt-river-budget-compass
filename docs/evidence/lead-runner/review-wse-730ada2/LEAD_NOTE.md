# Lead note — WS-E 730ada2 (ws/e-records-next16)
WS-E self-reported runner ACCEPTED 3 x 4,044 (not lead-run; skipped because rejected on review).
Lead verdict: NOT_ACCEPTED on independent review (2026-11-11 ~21:30Z). 58357e9 findings verified fixed.
- M1 (confirmed by lead): connections.tsx:136 "Reset layout" enabled offline, calls savePreferences.
- M2 (suspected): sweep never selects map nodes, so the F03 custom-link Remove/Reason controls are likely never exercised; fill() fires no blur.
- M3 (suspected): sweep's per-label cap and cycle allowlist can excuse real openers.
Shared-file edits PreferenceReview.tsx and CompanyTaxProfile.tsx OK'd by lead.
