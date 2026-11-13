# Lead note — WS-F1 00a755c (ws/f1-travel-density-3), 13 Nov 2026

**Candidate:** 00a755c4313723ac2f1683e1d348d72558bd5f0d, tree 73efd96d. It is 5bd4753 + merge c090d902 of develop/sf-base cdecb9c + the review lows.

**Independent review: accept with lows.**
- The merge equals a fresh lead merge.
- The PlanCalendar conflict was resolved keeping both TripReadNotice and every density-4 change.
- Nothing was lost against afda8824, and there is no src/lib change.
- Lows routed to WS-F1:
  - three approver and needs-review rows not capped at 720 px on desktop;
  - no capture of a collapsed summary row;
  - jump-row sync on mount;
  - test timer cleanup;
  - README "both shells" wording.

**Lead runner: ACCEPTED.** Three runs, each 3,947 of 3,948 tests (1 skip, already in the base), 474 files.

**Mutation check:** moving the SummarySection heading back inside `<summary>` fails "L-A1 (screen-reader structure)" (1 of 18). Restored.

**Protected gate: PASS.**
- The new alias preview/ws-f1-d3 is not reachable through this session's proxy (403). The first link, on dpl_5Fc3wgA9Rv1cgYUHFwd6wSGDR8k5, was revoked unused.
- Instead, preview/ws-f1 was fast-forwarded to lead merge 3aa926e6 (afda8824 + 00a755c). Its tree is identical to 00a755c's (73efd96d), so the gate verifies exactly the verified tree.
- Deployment dpl_CfdJn2wCokUnHPeWMz9YEu2VELJo:
  - the bundle commit is 3aa926e;
  - fixture backend only, 0 production references;
  - no lock-screen leaks.
- `/_build/` chunks are served 200 as application/javascript. This is the first deployed check of the asset-folder rename.
- The scanner's high fetch-error count comes from string matches in bundles, not missing files. Four sampled chunks were 200.
- `/sw.js` 404 also occurred on the afda882 and 3df2daa previews.
- 43 captures: 0 overflow and 0 page errors on all three devices.
- iPhone and iPad G07, G08 and G09 are full-page captures of the same Claims page, with every section on it; desktop differs.
- The link was revoked. Anonymous access is 302, and the revoked link now redirects to SSO without a cookie (the first check, seconds after revoking, read 1).
