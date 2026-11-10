# Thapal V4 progress dashboard (persistent; updated at every integration checkpoint)

**Last update:** 10 Nov 2026 (after Track A and Track C merges).
**Verified integration head:** `integration/phase2-3-p0`, 2,862 / 2,862 tests ×3, build and typecheck clean. Earlier baseline: `a8a84b3`.

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
**Fixed locally:** P0-001, P0-002, P0-004, P0-005b, P0-007..P0-016 (archive), P0-017, P0-018, P0-019, P0-024.

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
- GitLab pipeline: see the CI section below. The first pipeline could not start until the account owner completes GitLab identity verification (no runner minutes used).

## Commits by branch (verified)
| Branch | Head | Verified |
|---|---|---|
| `integration/phase2-3-p0` | this commit's parent `386cbf2` | 2,862/2,862 ×3, build, typecheck |
| `uix/signature-shell` | `937cfaf` | 2,877/2,877 ×3 |
| `modules/connections` | `978dd11` | 2,800/2,800 ×3 |
| `phase3/completion` | `cf09bb6` | 2,804/2,804 ×3 |
| `phase3/balanced-accounting` | `986c461` | 2,703/2,703 ×3 |
| `phase2/registers` | `27eccf0` | 2,678/2,678 ×3 |
| `p0/financial-integrity` | `babadb5` | 2,678/2,678 ×3 |
| `uix/screen-verification` | `4a19c38` | 2,672/2,672 ×3 |
| `phase1/security` | `b08c3a0` | 2,580/2,580 ×3 |

## Integration log (10 Nov 2026)
- Merged `phase3/completion` (Track A, `cf09bb6`, 2,804 ×3) and `modules/connections` (Track C, `978dd11`, 2,800 ×3).
- Wired Track C into shared files: loans and goals archive with a reason in WealthPanels; store hard-delete methods for loans, goals, commitments and valuations removed; links to About, calendar item detail, bank account detail and the notification centre; remaining P0-004 load-error items.
- **Cross-module consistency test** (`src/lib/cross-module-consistency.test.ts`, hand-calculated figures): reversals, loan principal/interest, card payments, part-paid claim (₹20,000 / ₹12,000 / ₹8,000), archived asset in net worth, bank detail and reconciliation, cash/accrual labels. It found **P0-024** (archived accounts dropped from net worth; no basis label), now fixed. Evidence: `docs/evidence/cross-module/README.md`.
- Still to integrate: `uix/signature-shell` (Track B, `937cfaf`, 2,877 ×3), only after KK's final Signature Flow approval. Its `/notifications` route overlaps Track C's notification centre and will be resolved at that merge.

## Follow-ups found during integration (not yet fixed)
- `new.tsx` "saved to add later" list: one-tap delete of a pending, unlinked vault document. Fix with the documents archive button after Track B merges.
- `StatementInbox` `loadKnown`: a failed read of imported lines lets already-imported lines be registered again. Needs error, Retry and a blocked Register.
- Draft open error in `new.tsx` shows a toast without Retry.
- `window.prompt` still used in `plan.tsx`, `AccountTools.tsx`, `vault.tsx`.
- Track A: database delete guard and archive columns for loans, goals, commitments, valuations and documents.

Each merges into `integration/phase2-3-p0` only after its own verification, then the integration commit is re-verified (Track D).

## Verified state (10 Nov 2026, evening)
| Branch | Head | Verification by the coordinator |
|---|---|---|
| `integration/phase2-3-p0` | `c3f9a7a` + registers commit | 2,953 / 2,953 tests ×3, typecheck, build |
| `uix/signature-shell` | `0aea59b` | 2,942 / 2,942 tests ×3, typecheck, build; preview gate passed |
| `uix/fidelity` | `9abf182` | Merged into `uix/signature-shell` |
| Preview `preview.thapal.app` and `signature.thapal.app` | `dpl_3GYpMeoMnAXPmdMLr8qe6WS91J9w` = `0aea59b` | Vercel sign-in (302 without); 0/277 JS files with the production reference; hosts reached: preview, fixture backend, fonts.googleapis.com, vercel.live (toolbar now disabled for new builds); Manrope rendered (CDP custom font); panel shows the commit |

**Scorecard:** `docs/workstreams/FINANCIAL_INTEGRITY_SCORECARD_2026-11-10.md`.

**Release blockers:** 12 open — RB-P1-01..07, RB-DEC-C11, RB-CI-01, RB-LED-01, RB-UIX-01, RB-STM-01.

## CI (enabled 10 Nov 2026, KK approval) — STATUS: UNVERIFIED
Pipelines marked success (8–49 s) carry no visible jobs or test reports and match Vercel's build timing. CI is treated as unverified until a `verify` job log and its artifacts are obtained (RB-CI-01).

- **Pipeline:** `.gitlab-ci.yml` runs on merge requests and `integration/*` branches, and only when code paths change. It does frozen-lockfile install, typecheck, build and tests, and keeps JUnit and JSON reports for 30 days.
- **Restrictions:** no deploy stage; fixture Supabase variables only; never targets `main`.
- **Verified before enabling:**
  - YAML parsed;
  - the exact job run in a clean clone with Bun 1.4.4 on Node 22 and the fixture variables;
  - install, typecheck and build passed, with no production address in the build;
  - 2,761 / 2,761 tests, with JUnit and JSON reports produced.
  - GitLab's lint API was not reachable without an API token, so the first real pipeline is the final check.
- **Runner minutes:** reported per pipeline in this dashboard from the GitLab pipeline durations.
