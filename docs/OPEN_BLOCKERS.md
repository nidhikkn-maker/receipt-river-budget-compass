# Open blockers (cannot be completed from inside the project)

| Item | Blocked on |
|---|---|
| Live intraday NSE/BSE prices | Owner choice of a licensed provider and credentials (deferred by owner). End-of-day official closes already work. |
| Official ITR / GST return schemas | Owner deferred the final filing format; drafts are labelled as non-filing working papers. |
| Mercedes GLS original amount and start date | Sanction / disbursal letter not supplied. |
| iPhone / iPad push, camera, Face ID | Physical devices. |
| Hosted company file browser downloads | New isolated acceptance draft established; delegate reports nine actual API checks passed but browser downloads returned empty files. Must inspect/fix exact download failure and verify original bytes before completing workflow. No live fixtures/grants written. |
| Hosted multi-device import acceptance | Isolated test database now available in Hosted workflow acceptance draft. Full interrupted source/storage/account/extraction recovery across browser contexts has not passed yet; this is outstanding executable verification, no longer an isolation platform blocker. Main remains shared Live and must not receive fixtures. |
| Production publish | Explicit owner approval each time. |
| Direct preference-write approval trigger rollout | Compatible authorised publication: the current published client still writes preferences directly. Tested trigger/backup integration is staged, not enforced against that old client. Independent development continues. |

## 2026-11-07 — Download defect resolved; remaining parked workflow items
- 15:31: budget/merchant defects have independent staged corrections and disposable actual-RPC acceptance (8 cases). Fresh isolated hosted draft has reproduced both failures; corrected hosted results still pending. Activation remains an owner-approval hold, not an excuse to stop independent development. Source snapshot concurrency/backup compatibility and report accepted-input/version work remain executable.
- 14:40: isolated budget/merchant acceptance completed in separate draft, **24PASS/2FAIL**. Budget complete-allocation validation and immutable merchant history are implementation defects, **not external blockers**. Fix independently in compatible staged authority; no rollout or publication authorised. Hosted report-job evidence/restart remains pending, not certified from controlled adapter tests.
- RESOLVED: empty browser downloads. Cause: originals were only opened as cross-origin signed URLs in a new tab (browsers ignore `download` cross-origin, so no file is saved); some exports also revoked their blob URL synchronously. Fix: `fetchPrivateFile` + store `downloadFile` fetch stored bytes, refuse empty/size/checksum mismatch, save via `downloadBlob`. Hosted check with two throwaway accounts: PDF/CSV/XLSX/JPG API and browser downloads SHA-256 identical; unrelated account sign/download refused (400), no metadata rows; 1-second URL expired (400); cleanup left 0 rows. Company-member grant/revoke on hosted storage still depends on staged company-bound-uploads.sql (not installed — needs your approval).
- PARKED (D): hosted cross-device import completion; brokerage posting→report acceptance; approval-policy items (§56/57) wait on staged trigger activation, which stays disabled.
