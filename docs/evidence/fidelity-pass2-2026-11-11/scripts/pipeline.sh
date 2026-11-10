#!/bin/sh
# Pass-2 capture pipeline. LABEL=before|after. Each set runs on a freshly restarted fixture preview.
# Raw PNG/JSON -> $CAPS/$LABEL (outside the repo); JSON is copied to ../captures/$LABEL afterwards.
set -u
cd "$(dirname "$0")"
: "${CAPS:?set CAPS}"; : "${PIDF:?set PIDF}"; LABEL=${LABEL:?set LABEL}; export CAPS PIDF NODE_PATH=/opt/node22/lib/node_modules
L=$CAPS/pipeline-$LABEL.log; : > $L
run() { PILL=$2 ./restart-preview.sh; LABEL=$LABEL SET=$1 node capture.cjs >> $L 2>&1 || echo "FAILED $LABEL $1" >> $L; }
rm -rf "$CAPS/$LABEL"
for s in ${SETS:-ref devices classic pill}; do if [ "$s" = pill ]; then run pill 1; else run $s 0; fi; done
STOP=1 ./restart-preview.sh
mkdir -p ../captures/$LABEL && rm -f ../captures/$LABEL/*.json && cp "$CAPS/$LABEL"/*.json ../captures/$LABEL/
echo PIPELINE-DONE >> $L
