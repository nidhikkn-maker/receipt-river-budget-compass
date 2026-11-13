# Lead note — Track B cdecb9c (trackb/density-4), 13 Nov 2026

**Commit and tree:** cdecb9c9a3d227efacb5925e656662fdf28d3a86, tree a1f1271456178ad92050dbef480e0146c1ba0b44. density-3 (057f53de) plus density-4, built on develop/sf-base a21f34dd.

**Scope**
- Review lows: amount detection, a whole-theme 12 px floor, the 44 px class test, subnav re-scroll, left-aligned wrapped text.
- 32 px page titles, 18 px section titles, 12 px badges.
- PlanCalendar: 44 px cells; days grow instead of overlapping; 0 overlaps at 320/375/390 (was 73); a scroll fade.
- The `/assets` cache fix: built files move to `/_build/`. Verified on a real cloudflare-module build with local wrangler: `/assets` returns HTML with no immutable header; the precache entries resolve.
- Worker cleanup of orphaned `/assets/*` lazy-cache entries.
- Phone hero 28 px; the AGENTS.md PWA line updated.

**Independent review of 057f53de:** accepted with lows. Its one regression (M1, calendar overflow) is fixed in cdecb9c, which I reviewed myself: the worker cleanup touches only same-origin `/assets/` entries in `ledgerline-lazy`.

**Lead runner: assembled evidence, recorded openly.** Container restarts interrupted five consecutive runner attempts. I am counting three complete, separate passes, all on the same commit and tree, each with the tree unchanged before and after:
- **run-1** (attempt int4, 04:21–04:27Z): 3,535 of 3,536 passed, 0 failed.
- **run-2** (05:48–05:55Z, foreground, same vitest command): 3,535 of 3,536, 0 failed.
- **run-3** (05:55–06:01Z): 3,535 of 3,536, 0 failed.
- Typecheck and build PASSED in every attempt (int1–int4).
- The skip was already in the base.

**Mutation check:** removing `height: auto` from the Signature Flow calendar cell rule fails density.test "density 4 / review M1" (1 of 24). Restored.

**develop/sf-base fast-forwarded** a21f34dd → cdecb9c.

**Release risk for KK at release:** whether Lovable's hosting honours `_headers` and has no fixed `/assets/*` rule is unknown. After the first publish, check with `curl -I /assets` and one `/_build/` file.
