#!/bin/sh
# Full capture pipeline. Each run starts from a freshly restarted fixture preview.
set -u
cd "$(dirname "$0")"; L=../captures/pipeline.log; : > $L
run() { ./restart-preview.sh; LABEL=$1 VARIANT=$2 SET=$3 node capture.cjs >> $L 2>&1 || echo "FAILED $1 $2 $3" >> $L; }
rm -rf ../captures/after-asis
run after asis ref,classic
run after asis devices
if [ "${WITH_BEFORE_MANROPE:-0}" = 1 ]; then
  ROOT=$(cd ../../../.. && pwd)
  (cd "$ROOT" && git stash push -m b1d-fidelity-wip src/styles.css src/routes/__root.tsx) >> $L 2>&1
  rm -rf ../captures/before-manrope
  run before manrope ref
  (cd "$ROOT" && git stash pop) >> $L 2>&1 || echo "STASH POP FAILED" >> $L
fi
./restart-preview.sh
echo PIPELINE-DONE >> $L
