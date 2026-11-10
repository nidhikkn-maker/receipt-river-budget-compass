# Working notes: fidelity correction (2026-11-10)

Worktree /home/user/thapal-uixf, branch uix/fidelity from 937cfaf. No commits. Preview ports 8088 (PREVIEW_PORT) / 8089 (VITE_PORT) only.

## Log
- step 0: worktree clean at 937cfaf (only the audit dir untracked). node_modules missing -> bun install --frozen-lockfile.
- KK binding (via coordinator): adopt licensed Manrope + Tamil/Devanagari fallbacks; fix 61 "visible at arm's length" rows first, then subtle; keep 44px, "09 Nov 2026", structure, iPhone nav. Net-worth panel: CSS typography/spacing only (other branch edits Card payment metric content).
- plan: all CSS in a new end-of-file block "B1d fidelity" with html[data-theme="signature-flow"] prefix; fonts via @fontsource-variable; preload injected by theme head script only when theme is signature-flow.
- step 1 done: before captures in captures/before-asis (ref+classic) and before-manrope (ref, Manrope injected). Synthetic receipt docs/evidence/fidelity-correction-2026-11-10/sample-receipt.png (extraction stubbed).
- font metrics (fontTools): Manrope upm 2000, asc 2132 desc 600 gap 0; width vs Liberation/Arial: 400 1.014, 500 1.033, 700 1.005, 800 1.023 -> fallback size-adjust 102%, ascent 104.5%, descent 29.4%, line-gap 0.
- 44px policy: element boxes stay >=44; visual pill drawn by ::before (z-index -1, isolation) for buttons the reference draws 36-42px.
- step 2: writing CSS block "B1d" at end of src/styles.css (prefix html[data-theme="signature-flow"]).
- step 3: CSS block written + __root preload; iteration 1 checked desktop home/money/canvas08 + iPhone home; fixed metric-sub on phone, note wrap, rail gap, generic .sf-btn 44/12px.
- step 4: re-capturing BEFORE with git stash of src/styles.css+__root.tsx (pop afterwards!). If container restarts: run 'git stash list' and pop.
- step 4 done: before-asis/before-manrope/classic captured at 937cfaf code (stash popped OK).
- step 5: before-manrope capture FAILED (stale log misread); must redo via stash after after-run. restart-preview.sh hardened (kills children, waits).
- pipeline.sh: after ref/classic/devices then (WITH_BEFORE_MANROPE=1) stash->before-manrope->pop. If interrupted: git stash list; git stash pop.
- step 5 done: after (ref/classic/devices) + before-manrope captured; stash popped.
- step 6: before-asis had a draft banner (stale run) -> pipeline-before.sh re-captures classic(after,before)+before ref on fresh previews (stash inside). If interrupted: git stash list/pop.
- step 6 done: before re-captured cleanly; stash popped.
- step 7: final code (workspace 44 on phone, preload guard). Re-running after pipeline for final evidence; then compose.py, classic.py, register_after.py, README.
- step 8: preview stopped by PID. Final: classic diff 0 px x6; tests 165+9 pass; typecheck/build OK. Writing README.
- DONE: README written; final report handed back.
