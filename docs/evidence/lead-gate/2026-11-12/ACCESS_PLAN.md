# Protected-preview test access — 12 Nov 2026 (no credentials in this file)
Owner instruction: KK in the lead's interactive session (12 Nov), with ChatGPT security note 4216778898 (recommendation, not authority).
Mechanism: Vercel deployment-scoped Shareable Link (patch_url_protection_bypass on the deployment id, ttl 7200 s).
  - NOT the project-wide Protection Bypass for Automation; project Vercel Authentication (ssoProtection: all) stays ON throughout.
  - Thapal's own sign-in is unchanged: captures sign in to the fixture account (kk@example.invalid / preview-only) through /auth.
Scope:
  - WS-F1 Travel  dpl_3kP1XmziHqzrJ6dKELu9MU1eA2oQ  commit 3df2daa6144763590e33c591a359690c33f2680d  (alias thapal-project-git-preview-ws-f1-krna-group.vercel.app)
  - WS-E Records  dpl_FTfd9fXQqccQCDWEuDWvnzPtLNt2  commit de52a470318df4192748f01e81ef4a54e68bf0a3  (alias thapal-project-git-preview-ws-e-krna-group.vercel.app)
  Accessed via the branch aliases (per-deployment hostnames are blocked by this session's network proxy); the gate verifies the bundle commit equals the expected SHA.
Operator: lead session (Track D). Secret held only in umask-077 scratch files, never in GitLab, commits or chat output.
Direct access: anyone holding the link could view that one deployment until revoke/expiry; links are revoked immediately after captures (regenerate:false), then files deleted.
Data: fixture backend only (gate fails on any production Supabase reference); no live financial data, no production keys.
Before state: anonymous GET on both aliases -> 302 (Vercel Authentication). passwordProtection off; ssoProtection all.
After-checks required: anonymous -> 302; revoked share link -> no cookie / 302; project protection unchanged.
