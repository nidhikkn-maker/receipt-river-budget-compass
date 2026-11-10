# Visual-review preview: https://preview.thapal.app (KK approval, 10 Nov 2026)

GitLab (`krna-group/THAPAL-project`) is the only source repository. Vercel (team KRNA-Group, project `thapal-project`) only hosts builds.

## How it is wired
- **Only one branch builds:** `review/visual`. Vercel's ignored-build step skips every other branch (`main`, `integration/*`, `uix/*`, track branches), so development pushes never change the preview and nothing auto-publishes to production.
- **`review/visual` receives only verified commits** (typecheck, build and three identical full test runs passed). Current: `29f609e` (Signature Flow B1b).
- **preview.thapal.app** is pointed at the verified deployment by an explicit alias.
- **thapal.app is reserved** for an owner-approved release; no Git branch deploys to production.
- **Protection:** Vercel Authentication on all deployments, custom domains included. Only signed-in members of the KRNA-Group Vercel team can open it.
- **Fixture data only:**
  - Supabase variables point to the separate `thapal-fixture-backend` project, which holds sample data only, with writes kept in memory.
  - The build command deletes every `.env*` file, then **fails** if the production project reference appears anywhere in `.vercel/output`.
  - There is no AI key, so receipt reading reports a failure; manual entry works.

## Updating the preview to a newer verified commit
1. Verify the commit: typecheck, build, three full runs.
2. Fast-forward the branch: `git push gitlab <sha>:refs/heads/review/visual`.
3. If Vercel does not build it automatically (it skips a commit already deployed), create the deployment from the GitLab source: project `thapal-project`, ref `review/visual`, that sha.
4. Alias `preview.thapal.app` to the new deployment.
5. Check access is refused without sign-in, inspect the served JS for the production reference, and capture screenshots.

## Verification of 29f609e (10 Nov 2026)
- Deployment `dpl_5HUgh4if1Bv2czAmbqEvLm69xHoZ`, built from GitLab `review/visual` @ `29f609e`.
- Without sign-in: 302 to Vercel sign-in.
- 277 served JS files: 0 contain the production reference; the only backend URL is the fixture backend.
- Browser run (iPhone 15, iPad Pro 11, 1440×900):
  - Home, Money, To-do, Records and Smart Add open, with no horizontal overflow;
  - requests reached only `preview.thapal.app`, the fixture backend and `fonts.googleapis.com`;
  - logs and captures are in `docs/evidence/screens/2026-11-10-hosted-preview/`.
- Known 404s: `sw.js` (offline worker not generated in this build) and a Lovable-hosted monogram image.
- The temporary automation bypass used for the run was revoked afterwards.
