# Thapal V4 progress dashboard (persistent; updated at every integration checkpoint)

**Last update:** 10 Nov 2026.
**Verified integration baseline:** `integration/phase2-3-p0` @ `a8a84b3`.

## Implementation status vs verification status
Implementation register: `docs/registers/implementation/requirements_status.csv`, 1,536 V4 requirements.

| Implementation status | All | P0 |
|---|---|---|
| Complete (local evidence) | 35 | 14 |
| Partial | 980 | 229 |
| Missing | 468 | 28 |
| Blocked | 46 | 10 |
| Unverified | 7 | 7 |

| Verification status | Count |
|---|---|
| Independently verified in production or hosted conditions | **0** (no hosted or device evidence yet) |
| Tested locally | 809 |
| Coded, without passing evidence | 215 |
| Not started | 476 |
| Blocked | 36 |

**Screens:** 111 total. 0 verified complete, 99 partial, 8 missing, 4 blocked, 0 visually aligned with Signature Flow (`docs/registers/uix/screen_audit_2026-11-09.tsv`).

## Test status at the baseline (`a8a84b3`)
- typecheck clean; build passes;
- **2,760 / 2,760** tests, 365 files, three identical runs;
- **failing tests: 0.**
- Whole-stack SQL check: `src/lib/integration-stack.test.ts` (P1, P2, P4, P5, P5b, P6, P7 together; end-to-end flow; balanced; sources unchanged; full reverse rollback).

## Open P0 issues (`docs/registers/implementation/p0_defects.tsv`)
**Fixed locally:** P0-001, P0-002, P0-004, P0-017, P0-018, P0-019.

**Open:**

| ID | Issue | Track |
|---|---|---|
| P0-005a | Transaction hard delete | A |
| P0-005b | Card-payment double post | A |
| P0-006 | Browser exports | D/security |
| P0-007..P0-016 | Deletes of financial records → archive. Covered by KK's P0-001 requirement 8. | C |
| P0-020, P0-021 | Transfer delete; undo history wipe | A |
| P0-022 | Delete actor and team delete | A (closed in P7 proposal) |
| P0-023 | Silent repeat restore | A |

## Blockers (`docs/registers/blockers/production_release_blockers.csv`)
All open: RB-P1-01..07 and RB-DEC-C11 (C11 enforced locally in P7, release evidence pending).

## External or approval-gated (not engineering-blocked)
- Hosted token check: needs a test account.
- Restored-copy rehearsal: needs approval.
- Real iPhone/iPad: RB-P1-05.
- Account Aggregator partner, official schemas, final T artwork.

## CI
- `.github/workflows/ci.yml` exists, but GitHub is suspended.
- **GitLab has no pipeline (`.gitlab-ci.yml` absent).** Proposal awaiting KK: add a GitLab pipeline mirroring the GitHub one (install with frozen lockfile, typecheck, build, tests). It would use GitLab runner minutes.

## Commits by branch (verified)
| Branch | Head | Verified |
|---|---|---|
| `integration/phase2-3-p0` | `a8a84b3` | 2,760/2,760 ×3, build, typecheck |
| `phase3/balanced-accounting` | `986c461` | 2,703/2,703 ×3 |
| `phase2/registers` | `27eccf0` | 2,678/2,678 ×3 |
| `p0/financial-integrity` | `babadb5` | 2,678/2,678 ×3 |
| `uix/screen-verification` | `4a19c38` | 2,672/2,672 ×3 |
| `phase1/security` | `b08c3a0` | 2,580/2,580 ×3 |

## Pending integration
- `phase3/completion` (Track A)
- `uix/signature-shell` (Track B)
- `modules/connections` (Track C)

Each merges into `integration/phase2-3-p0` only after its own verification, then the integration commit is re-verified (Track D).

## CI (enabled 10 Nov 2026, KK approval)
- **Pipeline:** `.gitlab-ci.yml` runs on merge requests and `integration/*` branches, and only when code paths change. It does frozen-lockfile install, typecheck, build and tests, and keeps JUnit and JSON reports for 30 days.
- **Restrictions:** no deploy stage; fixture Supabase variables only; never targets `main`.
- **Verified before enabling:**
  - YAML parsed;
  - the exact job run in a clean clone with Bun 1.4.4 on Node 22 and the fixture variables;
  - install, typecheck and build passed, with no production address in the build;
  - 2,761 / 2,761 tests, with JUnit and JSON reports produced.
  - GitLab's lint API was not reachable without an API token, so the first real pipeline is the final check.
- **Runner minutes:** reported per pipeline in this dashboard from the GitLab pipeline durations.
