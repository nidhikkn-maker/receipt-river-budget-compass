# Lead note — WS-E f8883a5 (ws/e-records-next22) — ACCEPTED (development)
Runner: ACCEPTED 3 x 4,234/4,235 (1 skip from base); tree bba7d205 unchanged.
Review: no High; tax figures/rounding/CSV columns unchanged; notes scoped; savePreferences normalises state only (see REVIEW_NOTE.md).
Mutation (lead): tax draft shareReview → [] makes "the tax draft (/tax) shows it next to the depreciation" fail; restored.
Not gated on the preview: preview/ws-e stays at bfa5b9d (the build KK is reviewing); f8883a5 to be gated with the next Records round.
Open, routed to next23: M1 partnership/LLP notes leak into personal working (tax screens; over-flag only); L1–L5.
