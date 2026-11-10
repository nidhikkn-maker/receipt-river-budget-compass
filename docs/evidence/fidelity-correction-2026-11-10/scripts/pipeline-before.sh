#!/bin/sh
# Re-capture the classic screens (after, then before) and the BEFORE reference set, each on a freshly restarted
# fixture preview, so no draft banner from an earlier Smart Add run appears. BEFORE = 937cfaf styles via git stash.
set -u
cd "$(dirname "$0")"; L=../captures/pipeline-before.log; : > $L
ROOT=$(cd ../../../.. && pwd)
run() { ./restart-preview.sh; LABEL=$1 VARIANT=$2 SET=$3 node capture.cjs >> $L 2>&1 || echo "FAILED $1 $2 $3" >> $L; }
run after asis classic
(cd "$ROOT" && git stash push -m b1d-fidelity-wip src/styles.css src/routes/__root.tsx) >> $L 2>&1
rm -rf ../captures/before-asis
run before asis classic
run before asis ref
(cd "$ROOT" && git stash pop) >> $L 2>&1 || echo "STASH POP FAILED" >> $L
./restart-preview.sh
echo PIPELINE-DONE >> $L
