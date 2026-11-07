#!/usr/bin/env bash
set -euo pipefail
# No Cloud credentials, migrations, network database, or production writes.
bunx vitest run \
  src/lib/statement-review-sql.test.ts \
  src/lib/v591-acceptance.test.ts \
  src/lib/account-statement-status.test.ts \
  src/lib/statement-evidence.test.ts \
  src/components/StatementEvidenceReview.test.tsx \
  --maxWorkers=2