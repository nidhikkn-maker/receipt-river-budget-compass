#!/usr/bin/env bash
# Thapal acceptance runner (lead, Track D).
#
# Runs the full verification sequence on ONE frozen commit and records each step so that a process that stops early
# can never be read as a pass:
#   - refuses to start unless HEAD is exactly the expected commit and the working tree is clean;
#   - records the commit and its tree hash before and after every step; any change marks the run TREE_CHANGED;
#   - each step (typecheck, build, run-1..run-N) has its own directory with log, exit code, start and end UTC
#     timestamps, the vitest JSON result, and a COMPLETED marker written only after the step finished and its result
#     was parsed. A step without COMPLETED is INTERRUPTED, whatever its log says;
#   - a test run PASSES only if: vitest exited 0, the JSON report exists and says success, failed = 0, total > 0,
#     and the tree hash is unchanged;
#   - summary.json is rewritten after every step; the overall verdict is ACCEPTED only if every step PASSED, the
#     required number of runs PASSED, and all on the same tree hash.
#   - a lock file prevents two acceptance sequences running in the same worktree at once.
#
# Usage: scripts/verify/acceptance-run.sh <worktree> <full-or-short-commit> <evidence-dir> [runs=3]
#   Verdicts:   scripts/verify/acceptance-status.py <evidence-dir>
set -uo pipefail
WT=${1:?worktree}; WANT=${2:?commit}; OUT=${3:?evidence dir}; RUNS=${4:-3}
SD="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT" && OUT="$(cd "$OUT" && pwd)"
cd "$WT" || { echo "no worktree $WT"; exit 2; }
COMMIT=$(git rev-parse "$WANT^{commit}" 2>/dev/null) || { echo "unknown commit $WANT"; exit 2; }
HEAD=$(git rev-parse HEAD)
[ "$HEAD" = "$COMMIT" ] || { echo "HEAD $HEAD is not the expected $COMMIT"; exit 2; }
[ -z "$(git status --porcelain)" ] || { echo "working tree not clean:"; git status --porcelain; exit 2; }
TREE=$(git rev-parse "HEAD^{tree}")
LOCK="$(cd "$(git rev-parse --git-dir)" && pwd)/acceptance.lock"   # inside git's own dir, never the working tree
exec 9>"$LOCK"; flock -n 9 || { echo "another acceptance sequence is running in $WT"; exit 3; }

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
tree_now() { if [ -n "$(git status --porcelain)" ]; then echo "DIRTY"; else git rev-parse "HEAD^{tree}"; fi; }
cat > "$OUT/meta.json" <<EOF
{"commit":"$COMMIT","tree":"$TREE","worktree":"$WT","runs_required":$RUNS,"started":"$(now)","host":"$(hostname)","runner_pid":$$}
EOF

step() { # name, then command...
  local name=$1; shift; local d="$OUT/$name"; rm -rf "$d"; mkdir -p "$d"
  echo "$COMMIT" > "$d/commit"; tree_now > "$d/tree_before"; now > "$d/started"
  echo "STARTED" > "$d/state"
  "$@" > "$d/log" 2>&1; local rc=$?
  echo "$rc" > "$d/exit_code"; now > "$d/ended"; tree_now > "$d/tree_after"
  touch "$d/COMPLETED"   # written only here, after the command returned
  python3 -I "$SD/acceptance-status.py" "$OUT" --write >/dev/null 2>&1 || true
}
trap 'python3 -I "$SD/acceptance-status.py" "$OUT" --write >/dev/null 2>&1' EXIT

step typecheck timeout 600 bun run typecheck
step build timeout 900 bun run build
[ -z "$(git status --porcelain)" ] || { echo "build changed the tree"; }
for i in $(seq 1 "$RUNS"); do
  step "run-$i" timeout 1800 bunx vitest run --reporter=default --reporter=json --outputFile.json="$OUT/run-$i/vitest.json"
done
now > "$OUT/FINISHED"
python3 -I "$SD/acceptance-status.py" "$OUT" --write
