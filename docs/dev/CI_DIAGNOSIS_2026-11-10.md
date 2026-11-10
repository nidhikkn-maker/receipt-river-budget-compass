# Why GitLab shows no `verify` jobs (evidence, 10 Nov 2026)

## Facts observed

1. **Creating a pipeline through the GitLab API is refused** with "Identity verification is required in order to run CI jobs". This happened for `integration/phase2-3-p0` (a branch our rules include) and for `phase3/completion` (a branch our rules exclude). GitLab checks identity *before* reading the CI configuration, so this error says nothing about whether `.gitlab-ci.yml` is read.
2. **Every "success" pipeline on a branch our rules include has no jobs and no artifacts:**
   - `integration/phase2-3-p0`: #3048743755 (49 s), #3048844969 (8 s), #3049612745 (8 s)
   - `phase3/completion`: #3049612997 (6 s)
   - `modules/connections`: #3049612919 (6 s)
3. **Pipelines appear on branches our `workflow:rules` exclude** (`phase3/completion`, `modules/connections`), with source "push". If GitLab evaluated our file, those branches would get no pipeline at all. So these pipelines were not produced by our `.gitlab-ci.yml`.
4. **Their durations match Vercel's builds or cancellations** for the same commits. Vercel is connected to this GitLab project and reports a commit status for every push. `review/visual`, `uix/*` and `main` show pipelines with source "external", which is how GitLab records third-party statuses.
5. **`.gitlab-ci.yml` is present on the integration branch.** It parsed locally, and the exact job ran green in a clean clone (2,761 tests at the time).

## Conclusion

| Cause | Status |
|---|---|
| Identity verification | Blocks every CI job; the API returns it verbatim. |
| The "success" pipelines | Fact 3 shows they are not our CI; facts 2 and 4 make Vercel commit statuses the most likely source. |
| Project-level CI settings | Unconfirmed; the MCP tools cannot read them. |

## Checks only the project owner can make (GitLab web UI)

1. **Account → identity verification:** complete the verification prompt shown on any pipeline page, or under the account's settings.
2. **Project → Settings → General → Visibility, project features, permissions:** "CI/CD" must be enabled.
3. **Project → Settings → CI/CD → General pipelines:** "CI/CD configuration file" must be empty (meaning `.gitlab-ci.yml`) or exactly `.gitlab-ci.yml`. Auto DevOps should be off.
4. **Project → Settings → CI/CD → Runners:** "Enable instance runners for this project" must be on. If an organisation policy disables them, a project or group runner is needed.
5. **Any pipeline → Jobs and External tabs:** an External tab listing only "vercel" confirms the status source.

## Confirmation test after the fixes

Push a trivial code change to `integration/phase2-3-p0`. Expected: a pipeline with a `verify` job taking about 8 minutes, a log showing install, typecheck, build and the test count, and `reports/junit.xml` and `reports/vitest.json` as artifacts, all for that exact commit SHA. RB-CI-01 closes only on that evidence.
