# Working notes: fidelity pass 2 (2026-11-11)

Worktree /home/user/thapal-uixb, branch uix/signature-shell, HEAD 0aea59b. No commits/pushes. Preview ports 8088/8089 only, stop by PID.
Raw PNGs: scratchpad caps dir (outside repo): /tmp/claude-0/-home-user-receipt-river-budget-compass/382db65e-850d-5794-85c4-0e091a6faac5/scratchpad/caps/{before,after}; JSON copied into captures/.
Playwright: global, NODE_PATH=/opt/node22/lib/node_modules.

## Log
- step 0: scripts copied from fidelity-correction-2026-11-10/scripts; adapting capture.cjs (OUT=$CAPS/<LABEL>, travel/review sets, contrast, bbox).
- step 1: BEFORE pipeline started at clean 0aea59b (LABEL=before, CAPS=/tmp/claude-0/-home-user-receipt-river-budget-compass/382db65e-850d-5794-85c4-0e091a6faac5/scratchpad/caps, PIDF=/tmp/claude-0/-home-user-receipt-river-budget-compass/382db65e-850d-5794-85c4-0e091a6faac5/scratchpad/preview.pid). Do NOT edit src until it finishes (captures read live dev server).
- step 1 done: before (ref, devices, classic, pill) captured, 71 shots. step 1b: before-c (ref, new contrast scanner w/ ::before pills) running
- step 1b done. NOW editing src (B1e).
- step 2: src edits B1e written (canvas-model, IntelligentCanvas, PreviewInfoPanel, SyncStatus, navigation, PageHeader RecordsSubnav, SignatureShell, HomePage, records_.travel route, styles B1e, themes swatch, switch.test). Next: preview check, typecheck, tests
- step 3: tests added (pass2.test.tsx, navigation, IntelligentCanvas, PreviewInfoPanel); typecheck OK; wip ref capture done
- step 4: AFTER pipeline started (LABEL=after, all sets). Don't edit src until PIPELINE-DONE in caps/pipeline-after.log
- step 4 done (teal Add run). KK approved ref colours as default; Add -> --sf-add #223B35. Next: iPhone nav fidelity, then final after rerun
- step 5: iPhone nav proportions added; final AFTER run started (after-tealadd = previous run kept)
- step 5 done: final after captured (76). Running compose/analyse; next: P0-029 lock screen
- step 6: P0-029 lock implemented (app-lock-state, OwnerLock LockSurface portal+isolate, shells hide chrome, DeviceLock history blocker+refresh/invalidate, Toaster/Preview/ConfirmHost). Lock capture run LABEL=lock SETS=lock CLOCK=1
- step 7: P0-029 verified (lock captures in caps/lock; tests 260+42 pass; typecheck+build OK). Final AFTER rerun (warning token AA + lock code) started; prior run moved to caps/after-run2
- step 8: toast measured-offset fix in B1e; rerun LABEL=after-fix SETS='ref devices pill' then merge into caps/after (classic kept)
- step 9: toast-placement observes sheet resize; rerun ref as after-fix2 and merge
- step 10 DONE: final evidence composed; README written; tests 26 files/278 pass; typecheck + build OK. Sign-in §16.1 not started.
