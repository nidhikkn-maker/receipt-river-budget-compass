# P20 release-gate items open after 6394ac8 (from delta review, 2026-11-12 ~01:05Z)
- M1: hash depends on session TimeZone/DateStyle (created_at timestamptz::text). Fix: SET TimeZone='UTC', DateStyle='ISO, MDY', IntervalStyle='postgres' on track_retained; SET LOCAL same in rollback and install before hashing. Test with non-UTC rollback session.
- M2: rollback takes no LOCK TABLE; E1 delete committing between $post$ check and commit leaves record falsely stale. Fix: LOCK TABLE claim_receipt_corrections IN SHARE ROW EXCLUSIVE MODE at rollback start.
- L3: deleteUser ok but demo_sessions delete fails -> row stuck forever as skip-unconfirmed; expired_demo_owners limit 200 no ORDER BY could starve. Fix: treat user-not-found + existing demo_sessions row as "finish cleanup" (delete row), order the query.
- L4: void refresh() callers (SyncStatus.tsx:26, about.tsx:70, DeviceLock.tsx:53) may emit unhandled rejections; add .catch.
All fail closed; P20 hosted install remains Blocked pending KK.
