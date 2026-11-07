# Fix "Confirm & process statements" doing nothing

## What I found
- No statements have ever been saved for import (zero saved uploads). So the click is stopping before anything is uploaded, and bulk categorisation has nothing to work on.
- For PDF statements, the button first opens a browser pop-up asking for AI consent. Browser pop-ups are blocked inside the preview window (and often in the installed iPhone app). A blocked pop-up counts as "No", so the upload quietly stops with no message. This matches "no response".
- PDF statements are then only queued for background reading. The background worker has never been switched on (it was waiting for your approval). So even after the pop-up is fixed, PDFs would sit at "queued".
- Other places use the same blocked pop-up too: deleting an import rule, Statement matching, the Vault, Settings, and account tools.

## Changes
1. Replace the PDF consent pop-up with an in-page confirmation panel: a clear "Read PDFs with AI" consent with Allow / Cancel buttons. Cancelling shows a visible message instead of silence.
2. Always show feedback after the button is pressed: a progress panel per file, and a clear error if anything fails (upload, duplicate check, queueing).
3. Process PDFs straight away while the page is open: the first chunk of pages is read immediately, and the review opens when it is ready. Background processing stays as the way to finish if you close the app.
4. Replace the other blocked pop-ups (import rule delete, Statement matching, Vault, Settings, account tools) with the same in-page confirmation, so their buttons don't silently fail either.
5. Bulk categorisation: once a test statement loads, check bulk select, category change, undo and final confirm all respond and show their outcome. Fix anything that doesn't.

## Needs your decision (not done without approval)
- Turning on the background worker schedule, so PDFs finish after you close the app. This changes the shared live backend, so I'll only do it if you say yes.

## Verification
- Automated tests for the consent flow (cancel = no upload, allow = queued and processed) and the existing import tests.
- Signed-in browser run in the preview with a synthetic CSV and a synthetic PDF: press Confirm & process, see progress, open review, bulk categorise, confirm. Then delete the test data. No real records touched, nothing published.

## Technical notes
- `window.confirm` in `historical-import.tsx` (upload) returns false in sandboxed iframes; swap it for an AlertDialog-based promise helper shared by all 7 call sites.
- After queueing a PDF, call `processHistoricalImport` for the first chunk in the foreground (it's already used for CSV and Retry), then keep polling.
