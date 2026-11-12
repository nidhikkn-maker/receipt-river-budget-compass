# Protected-preview test access — 12 Nov 2026 (second gate; no credentials in this file)
Owner instruction: KK in the lead's interactive session (12 Nov): restricted, short-lived, deployment-specific testing access; keep Thapal auth intact; verify protection restored. ChatGPT note 4216778898 (recommendation only).
Mechanism: Vercel deployment-scoped Shareable Link on the single deployment below, ttl 7200 s, revoked immediately after use. Project Vercel Authentication stays ON; no project-wide bypass.
Scope: WS-E Records dpl_7hPMYmXSr7A3GRgKDQsGFA7Qm2hY, commit bfa5b9d0c8953c74750f54ddae5049d73f75c1cb, via alias thapal-project-git-preview-ws-e-krna-group.vercel.app (gate verifies bundle commit).
Data: fixture backend only (gate fails on any production reference). Captures sign in with the fixture account through Thapal's own /auth.
Secret held only in a umask-077 scratch file; never in GitLab, commits or chat output.
After-checks: anonymous -> 302; revoked link -> no cookie; project protection unchanged.
