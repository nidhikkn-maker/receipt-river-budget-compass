# Lead acceptance-runner evidence (Track D)

Copied from the lead session's runner output (`scripts/verify/acceptance-run.sh`). For each run: `meta.json` (commit, tree, start time), `summary.json` (verdict per step, test counts, `consistent_test_counts`) and, where applicable, `STOPPED_BY_LEAD` with the reason the lead stopped a run. Per-step logs and vitest JSON files are not copied (size); the verdict is reproducible with `scripts/verify/acceptance-status.py` on the original evidence directory.

Verdicts: ACCEPTED only when typecheck, build and all three full runs passed on one unchanged tree. INTERRUPTED runs were stopped by the lead (reason recorded) and are not results. A runner verdict alone never makes a screen or decision verified; see docs/registers/decisions/APPROVAL_IMPLEMENTATION_REGISTER.csv.
