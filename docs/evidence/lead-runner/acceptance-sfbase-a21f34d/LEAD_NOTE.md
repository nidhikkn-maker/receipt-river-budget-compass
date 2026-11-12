# Lead note — develop/sf-base a21f34dd (Track B f1710c5 shell density onto 6408e610), 12 Nov 2026

**What it is:** lead candidate `lead/sfbase-trackb-density` a21f34dd8154d3de03ceb93d630048c4c7ccd834, a no-ff merge of Track B f1710c59 (trackb/density-2, on 0f6171b0) onto develop/sf-base 6408e610.

**Track B scope**
- SH-1 to SH-9 from the density matrix (shared shell).
- Review M1 of 0f6171b fixed: the shared `Row` now treats amounts and text differently. Amounts stay whole; text wraps. This also overrides the global `.font-mono` nowrap rule for text values.
- UIX master §3.3/§4: page insets of 20 / 28 / 32 / 40 px; shell support text of at least 12 px; the iPad list/detail split kept, with persistent selection.
- A real no-remount test, a ResizeObserver on the subnav, and workspace-label truncation.

**Review history**
- 0f6171b: the independent review found M1 (a shared `Row` text value that could not wrap clipped the Weekly brief lists in both themes). The lead runner was stopped.
- f1710c5: the independent review accepted it with lows only:
  - coded-currency strings classed as text;
  - `sf-worth-sub` support text at 10 px, with a test that exempts it;
  - a dropped 44 px class test;
  - no re-scroll after a resize;
  - wrapped lists right-aligned;
  - wording about header alignment.
  These go to the next Track B round.

**Lead runner on a21f34dd: ACCEPTED.** Typecheck and build passed; three runs, each 3,522 of 3,523 tests (1 skip, already in the base), 447 files.

**Mutation check:** making text values non-wrapping again fails 3 tests: Money.test (wrap; long amount whole) and brief-rows. The code was restored.

**develop/sf-base fast-forwarded** 6408e610 → a21f34dd; the tree is the verified tree. This lands SH-6 (one `.sf-page` container), and WS-E and WS-F1 were told.

**Measured by Track B (fixture, emulated Chromium):**
- 0 page overflow at 320–1728 px.
- No shell control under 44 px.
- iPad 768 keeps the list and the selected detail side by side.
- The Weekly brief lists wrap at 320 and 390 px.
- Not verified: whether Add stays clear of the iPhone keyboard. That needs a physical device.
