# Approvals Compliance Dashboard

**Date:** 11 Nov 2026, first version (lead, Track D). Register: [`APPROVAL_IMPLEMENTATION_REGISTER.csv`](APPROVAL_IMPLEMENTATION_REGISTER.csv). Check: `python3 scripts/verify/approval-coverage.py [--screens G07,I10] [--strict]`.

**Counts are as of these source commits:**

| Source | Commit |
|---|---|
| `integration/phase2-3-p0` (registers, screen register) | `2e7e7186` |
| `develop/sf-base` | `df7df832` |
| `candidate/integrated-2026-11-10` (Preview Centre `status.json`) | `9294f974` |
| `ws/e-records-next8` | `3b471351` |
| `ws/f1-travel-next5` | `50f0abcc` |
| `phase3/completion` (Track A) | `a9a45a79` |
| `security/session-lock` | `a4e115b2` |

The other sources are the lead transcript up to 2026-11-11T10:47Z, the GitLab Issue #1 notes up to 10:45Z (lead's saved copy), and the lead runner `summary.json` files.

New IDs (`KK-YYYYMMDD-NN`) use the UTC date of the message.

## Totals

| Status | Count |
|---|---|
| Verified | 7 |
| Implemented-unverified | 151 |
| Assigned | 56 |
| Blocked | 24 |
| Unassigned | 29 |
| Superseded | 5 |
| **Total** | **272** |

The register holds the 117 decisions from `decision_register.csv` and 155 new rows. The new rows are KK's 10–11 Nov decisions, split into one row per numbered item.

**Verified (isolated-development scope only):**
- KK-20261110-42 D8/P17
- KK-20261110-53 P0-036/P18
- KK-20261110-54 P14-a
- KK-20261110-57 P0-038/P19
- KK-20261111-12 payee guards
- KK-20261111-13 closed-period asset message
- KK-20261111-25 4f55dcf lease test

Each of these has:
- a lead-verified, mutation-checked merge into `develop/sf-base`;
- a lead runner ACCEPTED on `93a9444`, a descendant of the merge: 3 × 3,350.

None of the database changes is applied anywhere. Hosted installation stays Blocked under the APR-* gates.

**Not Verified, and why:**
- **WS-E and WS-F1:** no handoff has been accepted.
- **Document draft fix** (`a33473a`/`a9a45a79`): not merged, and no runner verdict.
- **R14:** its consumers F01–F03 and G07 still fail.
- **Policy-only rows** (Assigned to Lead): compliance is observed but has not been independently evidenced.

## P0/P1 conflicts and provenance gaps

| # | Conflict | Rows |
|---|---|---|
| 1 | **I08/I10 status.** KK's consolidation item 5 (10:42Z) says I08 and I10 "remain partial until fixed". The screen register shows both as lead-verified at `ed924a8`, pending KK. | KK-20261111-73, -74..-83, -90 |
| 2 | **₹0 valuation fallback.** The consolidation says to use a labelled *book-value* fallback. The code falls back to an *earlier valuation* (`status.json`), and WS-E L1 is still "awaiting KK's ruling". The "previously approved WS-E net-worth contract" it cites is not found. | KK-20261111-88 |
| 3 | **beb0a96 verdict.** WS-E commit `9927bc42` records "ACCEPTED 3 × 3,720". The lead runner says NOT_ACCEPTED: run-2 failed the lease test, and `beb0a96` lacks `4f55dcf`. | KK-20261111-84 |
| 4 | **Capacity.** Issue note 4201143051 (12:09Z) says "environments: NONE". Transcript messages at 12:39Z and 12:43Z approve two sessions within plan and cost limits. The "no spending" part still stands. | KK-20261110-58, -59, -22, -26 |
| 5 | **Stale registers.** `p0_defects.tsv` still reads "pending lead verification" for P0-034..038, which the lead has verified. RB-DEC-C11 reads "Not started", but the C11 review gate `986c4611` is merged. `status.json` still lists the cached-offline and trip-note questions as "KK decision pending", although both are now decided. | C11, KK-20261110-31/42/53/54/57, KK-20261111-86/87 |
| 6 | **P0-030 MPIN.** The P0 register says "awaiting KK decisions (MPIN mode …)". KK's 8284 requirement 8 already defines the MPIN fallback. | KK-20261110-28 |
| 7 | **Travel P1s are open.** D-A (receipt counted twice), D-B (reversed refund still counted) and the booking-only refund reversal (+₹5,000 shown vs +₹2,000) are unresolved. Receipt-allocation uniqueness is enforced in the app only, not at the accounting layer. G07 fails when offline. | KK-20261110-37, -45..-52; KK-20261111-17..-23 |
| 8 | **Duplicate policies.** V3-D20 and V3-D40 set the same recovery targets, but V3-D40 adds a cost condition. V3-D24 and V3-D42 overlap on capitalisation thresholds. | V3-D20/40, V3-D24/42 |
| 9 | **Provenance.** The Issue #1 owner notes were posted from the shared `nidhi.kkn` account, and the consolidation is a "ChatGPT relay". Several transcript "decisions" are advisor text addressed to KK (lines 5734, 5934, 7317, 11071–11148). The runner instruction (line 10822) starts mid-sentence. Seventeen `decision_register.csv` rows are dated 9 Nov although their source says 10 Nov; some of these differences are IST vs UTC. The `dpl_4gJbd…` inspection has no recorded result. | flagged in `open_defects` |

## Decisions genuinely awaiting new owner clearance

These are limited to production, hosted SQL, spending, main merge, live data, destructive actions, or a real policy conflict.

1. **Hosted SQL and production** (APR-P1, P2, P3, MERGE, PUBLISH; DN-P1-DEPLOY):
   - P7–P19 (P17, P18, P19, P14, P16, P9 included);
   - P12 session lock;
   - any main merge or release.
2. **Live data:**
   - APR-PROD-READONLY;
   - APR-LIVE-ROLES;
   - DN-P0-BASE;
   - APR-GOLDEN-DOCS.
3. **Staging and spending:**
   - staging project, hosted test account and restore rehearsal (KK-20261110-60, DN-P1-HOSTED);
   - monthly cap for paid services (V3-D06, V3-D11);
   - point-in-time recovery cost (V3-D40).
4. **GitLab CI.** KK's GitLab identity verification is required before any CI job can run (KK-20261110-01, RB-CI-01). This is an account action.
5. **Real policy conflicts:**
   - ₹0 valuation fallback (conflict 2);
   - I08/I10 status (conflict 1).
6. **External or KK-supplied items, not approvals:**
   - Option 02 logo artwork (DN-01);
   - C13 legal and accounting validation;
   - physical iPhone/iPad runs (RB-P1-05).

## Linked findings (not owner decisions)

These are ChatGPT independent reviews, labelled "NOT owner approval". They are cited in `open_defects`.

| Finding | Subject |
|---|---|
| FIND-CGPT-4208916044 | G07 offline |
| FIND-CGPT-4209529438 | D-A and D-B |
| FIND-CGPT-4209635860 | 50f0abc NOT_ACCEPTED |

KK's real iPhone captures from 10 Nov are cited as device evidence. They are in notes 4201286853 and 4201353530 (P1-IPH-001..003; lock exposure).

## Evidence

- Screen register: `docs/registers/uix/screen_register_2026-11-10.csv`.
- Blockers: `docs/registers/blockers/production_release_blockers.csv` (12 open).
- Preview Centre: `git show 9294f974:docs/preview-centre/status.json`.
- Runner procedure: `docs/dev/ACCEPTANCE_RUNS.md`.
- WS-E decision record: `ws/e-records-next8:docs/workstreams/verification/ws-e-kk-decisions-2026-11-11.md`.
- WS-F1 mapping: `ws/f1-travel-next5:docs/workstreams/plans/ws-f1-settlement-acceptance-2026-11-11.md`.
- **Lead runner verdicts** live in `/tmp/claude-0/-home-user-receipt-river-budget-compass/382db65e-850d-5794-85c4-0e091a6faac5/scratchpad/acceptance-*/summary.json`. This is session storage, not version-controlled, so it should be copied into GitLab.

| Candidate | Verdict | Tests |
|---|---|---|
| sfbase-93a9444 | ACCEPTED | 3 × 3,350 |
| ta-97bea52 | ACCEPTED | 3 × 3,359 |
| wse-ed924a8 | ACCEPTED | 3 × 3,792 |
| wse-5a08558 | ACCEPTED | 3 × 3,808 |
| wse-7067076 | ACCEPTED | 3 × 3,695 |
| wse-beb0a96 | NOT_ACCEPTED | — |
| wse-8312fde | INTERRUPTED | — |
| wse-1248414 | INTERRUPTED | — |
| wse-3b47135 | RUNNING | — |
| wsf1-7e6a5ca | ACCEPTED | 3 × 3,639 |
| wsf1-b72ad05 | ACCEPTED | 3 × 3,662 |
| wsf1-50f0abc | ACCEPTED | 3 × 3,682 (NOT_ACCEPTED on review) |
| wsf1-26927bf | ACCEPTED | 3 × 3,630 |
| wsf1-502ef0c | ACCEPTED | 3 × 3,617 |

**Not yet done:**
- The coverage check is not yet wired into `acceptance-run.sh`.
- The register is not yet linked from Issue #1 (nothing pushed).
- No independent review of this register has taken place.
