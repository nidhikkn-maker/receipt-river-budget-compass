# Lead protected-preview gate — 12 Nov 2026

Access: deployment-scoped Vercel shareable links (2 h TTL), one per deployment, revoked immediately after use. Project Vercel Authentication stayed on throughout; no project-wide bypass was used. Thapal's sign-in was used unchanged, with the fixture account. See ACCESS_PLAN.md and AFTER_CHECKS.txt. No credentials are in this folder.

| Workstream | Deployment | Commit | Gate | Captures |
|---|---|---|---|---|
| WS-F1 Travel | dpl_3kP1XmziHqzrJ6dKELu9MU1eA2oQ | 3df2daa6144763590e33c591a359690c33f2680d | PASS: anonymous 302; bundle commit exact; prod-ref 0; fixture backend only; 307 files (1 fetch error); lock screen leaks none on iPhone/iPad/desktop | 42 screens (G01–G11 + Report Centre × 3 devices): overflow 0, page errors 0; 5–7 targets under 44 px per screen (Track B shell) |
| WS-E Records | dpl_FTfd9fXQqccQCDWEuDWvnzPtLNt2 | de52a470318df4192748f01e81ef4a54e68bf0a3 | PASS: anonymous 302; bundle commit exact; prod-ref 0; fixture backend only; 312 files (0 fetch errors); lock screen leaks none | 48 screens (F01–F09, I01–I07, Records hub × 3): overflow 0, page errors 0; /assets direct load blank (known hosting clash, Track B); I01 via in-app navigation renders |

After: both aliases anonymous 302; revoked links issue no cookie; secret files deleted; project protection unchanged (ssoProtection all, password off).
Screenshots stay in the lead scratchpad; SCREENSHOTS.sha256 lists every image with its hash.
