# Protected-preview test access — 13 Nov 2026 (no credentials in this file)
Owner approval: KK-20261112-02 (KK interactive session, 12 Nov ~22:00 UTC). It allows tonight's candidates to use the restricted method: a deployment-specific Vercel shareable link, TTL 7200 s or less, revoked straight after captures, with anonymous access re-checked afterwards. Vercel Authentication and Thapal's own auth stay ON. Sample data only.
Scope: WS-F1 Travel lead candidate afda8824ced7428c16c3d1d370bf0eaae829bcee (5bd4753 + develop/sf-base a21f34dd), deployment dpl_6vvhiAxWQA1wKJKERhcdHRy3d7tp, accessed via the alias thapal-project-git-preview-ws-f1-krna-group.vercel.app. The gate verifies the bundle commit.
The secret is held only in a umask-077 scratch file; it never goes in GitLab, commits or chat output.
After-checks: anonymous access gets 302; the revoked link issues no cookie; the secret file is shredded.
