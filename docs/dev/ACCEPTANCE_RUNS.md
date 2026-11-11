# Acceptance runs: how a candidate is verified (lead, Track D)

Introduced 11 Nov 2026 at KK's direction, after a background run died early and was briefly reported as running.

## Order of work
1. **Targeted first.** While a candidate is still changing, run only the targeted tests, plus typecheck, for the files that changed. Full suites are not run on commits that are about to be replaced.
2. **Freeze.** The workstream sends one commit marked FROZEN and pushes nothing further to that branch. New work goes to a `-next` branch.
3. **Full acceptance sequence** on exactly that commit: `scripts/verify/acceptance-run.sh` (typecheck, build, three full test runs), then the independent review, captures and the preview gate. If a new commit replaces the frozen one, the sequence starts again from step 1.

## The runner
`scripts/verify/acceptance-run.sh <worktree> <commit> <evidence-dir> [runs=3]`

**Refuses to start** unless:
- HEAD is exactly the expected commit;
- the working tree is clean;
- no other acceptance sequence holds the worktree lock (the lock lives in git's own directory, never the working tree).

**Per step** (`typecheck`, `build`, `run-1`…`run-N`), each in its own directory:
- `log`;
- `exit_code`;
- `started` and `ended` (UTC);
- `commit`;
- `tree_before` and `tree_after` (the git tree hash, or DIRTY);
- for test runs, `vitest.json` (vitest's machine-readable report);
- `COMPLETED`: written only after the command has returned. A step without it was interrupted, whatever its log says.

The runner records its own process ID in `meta.json`, and writes `FINISHED` only at the very end.

## Verdicts: `scripts/verify/acceptance-status.py <evidence-dir>`
It also writes `summary.json`.

| Step status | Meaning |
|---|---|
| PASSED | COMPLETED; exit 0; commit and tree hash before and after equal the frozen tree. For test runs, vitest.json also has success = true, 0 failed tests and files, and more than 0 tests. |
| FAILED | Non-zero exit, or vitest reported failures or 0 tests |
| NO_RESULT | Exit 0 but vitest.json missing or unreadable |
| TREE_CHANGED | The tree differed from the frozen tree before or after the step |
| RUNNING | No COMPLETED, and the runner process is alive |
| INTERRUPTED | No COMPLETED, and the runner process is gone |
| PENDING / NOT_RUN | Not started (runner alive / gone) |

The overall verdict:
- **ACCEPTED** only if typecheck, build and every required run PASSED on the same commit and tree;
- **NOT_ACCEPTED** if any step failed, has no result, or its tree changed;
- **INTERRUPTED** if the runner stopped early;
- otherwise **RUNNING**.

`consistent_test_counts` flags any difference in test totals between runs.

## Self-tests (11 Nov 2026)
- **Real interruption:** killed with SIGKILL mid-typecheck on a clean worktree → INTERRUPTED (no exit code, no end time).
- **Guards:** a wrong commit and a dirty tree are both refused (exit 2).
- **Synthetic evidence:**

  | Case | Overall | Step |
  |---|---|---|
  | All good | ACCEPTED | PASSED |
  | Failed tests | NOT_ACCEPTED | FAILED |
  | Missing report | NOT_ACCEPTED | NO_RESULT |
  | Tree changed | NOT_ACCEPTED | TREE_CHANGED |
  | Zero tests | NOT_ACCEPTED | FAILED |
  | Exit 1 | NOT_ACCEPTED | FAILED |
  | Killed run | INTERRUPTED | INTERRUPTED |

- **End to end:** see the evidence note added when the first real run completed.

Evidence directories are kept outside the working tree, so running the sequence never changes the tree it verifies.
