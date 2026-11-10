# Session lock: server-side review (lead, 11 Nov 2026)

Prompted by P0-029 and UIX §16.4/16.5. This is a code review of `develop/sf-base` (`e6e65d2`). No hosted system was touched.

## Findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| 1 | **Shell chrome sits outside the lock.** `DeviceLock` wraps only the page content (`AppShell.tsx:103`, `SignatureShell.tsx:152`). The header (workspace, avatar, bell count), rail/bottom navigation, Smart Add sheet, search palette and the root `<Toaster />` (`__root.tsx:187`) render outside it. | Code; hosted capture of 0aea59b | P0-029 (assigned to Track B) |
| 2 | **The lock is client-side only.** Locking sets React state; the Supabase session (access and refresh tokens) stays valid in browser storage, and the server is never told the device is locked. Anyone who can run code in the unlocked browser (devtools, an extension) can read data through the API while the screen shows "locked". | `OwnerLock.tsx` (no server call on lock) | **P0-030 (new)**: design gap against §16.5 "never treat UI hiding as access control" |
| 3 | **Data keeps loading while locked.** The store has no lock awareness and keeps its loaded financial records in memory. Shell-level pollers keep running, e.g. `BackgroundReports` every 15 s and `OfflineBanner` every 5 s, and toasts can still appear. The page subtree is unmounted, so page-level pollers stop. | `store.tsx` (no lock state); pollers above | Part of P0-029/P0-030 |
| 4 | **Unlock verification is sound for the full methods.** Password uses an isolated client verified by the server; email code uses server `verifyOtp`; passkey uses a one-use server challenge. None of them switches or replaces the session. | `device-reauth.ts`, `OwnerLock.tsx`, AGENTS.md | OK |
| 5 | **MPIN is device-only by design** (KK decision): a salted PBKDF2 hash in local storage with a 5-try limit. Both the fail counter and the hash live on the device, so someone with devtools on an unlocked desktop browser could reset the counter or attack the 4-digit space offline. That person could also read the session token directly, so the MPIN adds no protection against that attacker. | `mpin.ts` | Accepted risk under the current design; recorded for RB-P1-03 |
| 6 | **Push notifications on the lock screen carry no financial details.** | AGENTS.md (device push) | OK; to be confirmed on staging |

## Options for server-side enforcement (decision for KK; none implemented)

**A. Client hardening only (Track B, already in progress for P0-029).**
- Lock everything outside the lock overlay.
- Pause the store, pollers and toasts while locked, and drop rendered financial data from the DOM.
- Restore the workspace only after unlock.
- Does not stop a devtools attacker.

**B. Server-side session lock (proposed SQL, local tests only).**
- Lock calls an RPC that records `locked_at` for the caller's `session_id`. P4 already provides `jwt_session_id()`.
- A helper `session_unlocked()` is added to data-read RLS policies, so reads are refused for a locked session.
- Only a server-verified unlock clears the lock: password through the isolated client plus a server function, passkey, or email code.
- **Consequence:** MPIN alone could no longer lift the server lock. It would need to become "MPIN plus a short-lived device credential", or remain a client-only convenience layered on top. **This changes approved authentication behaviour, so it needs KK's approval.**

**C. Short token lifetime plus a refresh gate.**
- Lower the access-token lifetime (a hosted auth setting).
- While locked, the app refuses to refresh tokens, so tokens expire within minutes.
- Unlock re-establishes the session through a full method.
- This is a hosted configuration change, so it needs approval and is verified on staging.

**Lead recommendation:** A now, B designed and tested locally behind P4, and C evaluated on staging. Production authentication is unchanged until KK approves.
