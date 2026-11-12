# Lead note — Track A 6394ac8 (tracka/receipt-correction-2)
Runner: ACCEPTED 3 x 3,465/3,466 (1 skipped by design: it.runIf(stack)); tree 08fe769d unchanged.
Independent reviews: dfe9287 (HIGH FK cascade) -> 47adabd (M stuck offline, M cleanup orphans) -> 8d29e85 (M md5 laundering, M deleteUser ignored) -> 6394ac8 delta: no High; claims verified.
Mutation check (lead, 2026-11-12 ~01:15Z): ignoring the deleteUser error in cleanup-demos.ts -> route test fails (1 failed | 2 passed); restored.
Merged develop/sf-base b306a637 (no-ff; merged tree == verified tree).
Open P20 release-gate items (fail closed; staged SQL only): hash pinned to UTC/ISO DateStyle; rollback LOCK TABLE; demo_sessions stuck row after successful deleteUser; .catch on void refresh() callers. See acceptance-ta-6394ac8.pending-gate.md.
