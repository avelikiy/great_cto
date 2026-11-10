---
name: web-release
description: Release a web frontend (Vercel, Cloudflare Pages / Workers static assets, S3/CDN, Netlify) so that production serves exactly the build that was tested, and rolling back is one named command. Covers clean-tree builds, immutable preview deployments, E2E on the preview URL, promote by alias or route switch, build-id proof, cache purge, source maps, and rollback by re-aliasing the previous deployment. Use for any frontend ship step ("выкати фронт", "промоутни в прод", "откати сайт", "почему на проде старая версия"). Loaded by release-manager.
when_to_use: |
  Apply when:
  - deploying a web frontend to preview, staging or production
  - promoting a preview deployment, or rolling production back
  - production serves an older build than expected
  Do NOT apply to:
  - backend services, containers, databases — that is devops
  - creating the hosting project, domain or DNS — that is infra-provisioner
effort: medium
allowed-tools: Read, Bash, Grep
---

# web-release — production serves the build you tested, and the previous one is one command away

A frontend release fails quietly: the command exits 0, the CDN keeps the old bundle, a
`_headers` file is ignored, or the build picked up an uncommitted file. The rule is the
same as for any artifact: **build once, test that build, promote that build**.

## 1. Build from what CI checked

- `git status --porcelain` empty and `HEAD` = the commit whose CI is green (all checks,
  browser E2E included). The bundler packs the directory, not HEAD: another session's
  uncommitted edit would ship.
- Inject the commit into the bundle so it can be read back: `NEXT_PUBLIC_BUILD_SHA`,
  `VITE_BUILD_SHA`, or a generated `public/version.json` `{ "sha": "<40 hex>", "builtAt": … }`.
- Use the lockfile (`npm ci`, `pnpm i --frozen-lockfile`), never a fresh resolve.

## 2. Preview first, always

| Host | Preview | Its immutable id |
|---|---|---|
| Vercel | `vercel deploy` (no `--prod`) or the git preview | deployment URL / `dpl_…` id |
| Cloudflare Pages | `wrangler pages deploy <dir> --branch <non-prod>` | deployment id + `<hash>.<project>.pages.dev` |
| Workers static assets | `wrangler versions upload` | version id (not yet deployed) |
| S3 + CDN | upload to a versioned prefix `releases/<sha>/` | the prefix |

Then `e2e-test-engineer` runs the Playwright golden paths **against that preview URL**.
A local `next start` or a rebuild is a different artifact and is not evidence.

## 3. Promote — after `gate:release`

Promotion makes the tested deployment the production one. It does not rebuild.

| Host | Promote | Rollback (record it before promoting) |
|---|---|---|
| Vercel | `vercel promote <deployment-url>` (or alias assign) | `vercel promote <previous-deployment-url>` / `vercel rollback` |
| Cloudflare Pages | promote the deployment to production in the project (or deploy the same dir with `--branch <production branch>`) | rollback to the previous production deployment id |
| Workers | `wrangler versions deploy <version-id>@100%` | `wrangler versions deploy <previous-id>@100%` / `wrangler rollback` |
| S3 + CDN | switch the origin path / `index.html` pointer to `releases/<sha>/` | point back to `releases/<previous-sha>/` |

- Never `vercel --prod` from a working tree as "the promote": that is a new build nobody tested.
- Gradual rollout where the host supports it (Vercel rolling releases, Workers percentage
  deploy): start small, decide on a named signal (error rate, Web Vitals for this
  deployment), then 100 %.
- The production domain and its DNS are infra-provisioner's. Missing domain → stop, route there.

## 4. Prove it landed

- The production URL's `/version.json` (or the build-sha meta tag) returns the promoted
  sha. Read it from outside the CDN edge cache — a cache-busting query — and read the
  `age` / `cf-cache-status` / `x-vercel-cache` response header.
- HTML is served fresh (`cache-control: no-cache` or short max-age); hashed assets are
  immutable. A long max-age on `index.html` keeps users on the old build for its full life.
- Purge only what changed (tags / paths), not the whole zone, and only when the host does
  not version automatically.
- Core journeys on production (Playwright smoke, logged in where the product needs it).
- Source maps: uploaded to the error tracker for this sha, **not** served publicly
  unless the project chose that.

## 5. Keep one rollback, clean the rest

Hosts keep deployments; your machine keeps `dist/`, `.next/`, `.vercel/output`, `out/`.
After the release: keep the live deployment and the previous one; delete local build
output of older releases by exact path (`artifact-retention`).

## Report

```
WEB-RELEASE <project> @ <sha>
  ci       : PASS — all checks green on <sha> (run <id>)
  preview  : PASS — <deployment url / id>
  e2e      : PASS — playwright 9/9 on the preview URL
  promote  : PASS — after gate:release (<gate id>)
  landed   : PASS — /version.json = <sha>, cache MISS→HIT
  rollback : vercel promote <previous deployment url>
```
