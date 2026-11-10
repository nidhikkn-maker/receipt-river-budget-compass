#!/bin/sh
# Restart the fixture preview (ports 8088/8089) by its recorded PID (and that PID's children) so in-memory
# drafts from earlier runs are cleared. Never touches other previews.
PIDF=${PIDF:?set PIDF to the pid file}
ROOT=$(cd "$(dirname "$0")/../../../.." && pwd)
if [ -f "$PIDF" ]; then
  P=$(cat "$PIDF"); C1=$(ps -o pid= --ppid "$P" 2>/dev/null); C2=""; for c in $C1; do C2="$C2 $(ps -o pid= --ppid "$c" 2>/dev/null)"; done
  kill $P $C1 $C2 2>/dev/null
  for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:8089/ 2>/dev/null || break; sleep 1; done
fi
cd "$ROOT" && PREVIEW_PORT=8088 VITE_PORT=8089 nohup node scripts/dev/local-preview.cjs > "${LOG:-/dev/null}" 2>&1 &
echo $! > "$PIDF"
for i in $(seq 1 90); do curl -s -o /dev/null -w "%{http_code}" http://localhost:8088/auth 2>/dev/null | grep -q 200 && break; sleep 1; done
curl -s -o /dev/null http://localhost:8088/home; sleep 10
