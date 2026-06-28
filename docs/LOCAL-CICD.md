# Local CI/CD (run the pipeline on your mac)

GitHub Actions is the source of truth when healthy. While it is **unavailable at
the account level** (every job `startup_failure` with 0 steps — an account billing
/ payment hold, not the code; see below), run the pipeline locally on the mac.

## CI — `scripts/ci-local.sh`

Reproduces every GitHub Actions gate locally:

```bash
bash scripts/ci-local.sh          # full gate: structural, docs-ref, all tests, cli build+pack
bash scripts/ci-local.sh --quick  # fast inner-loop (skip cli build/pack)
bash scripts/ci-local.sh --e2e    # also the heavier archetype e2e suite
```

Green here ≈ green in CI. Exit 0 = all gates pass.

## CD — `scripts/cd-local.sh`

Runs the CI gate, then the release stages:

```bash
bash scripts/cd-local.sh           # CI + build + pack + npm publish --dry-run (safe, default)
bash scripts/cd-local.sh --push    # + git push the current branch to GitHub
bash scripts/cd-local.sh --publish # + real npm publish (GUARDED — see below)
```

`--publish` refuses unless: CI green · git tree clean · `npm whoami` logged in ·
the version is **not already on npm**. Bump first — never republish:

```bash
( cd packages/cli && npm version patch )   # 2.74.0 → 2.74.1
bash scripts/cd-local.sh --publish
git tag "v$(node -p "require('./packages/cli/package.json').version")" && git push --tags
```

## Why GitHub Actions is failing (account-level, not the code)

- Repo is **public** → Actions minutes are unlimited (rules out a minutes cap).
- Actions are **enabled** (`allowed_actions: all`).
- Every job is `startup_failure`: **0 steps executed**, ~3 s, across all workflows,
  0/40 recent runs succeeded.

That pattern = GitHub has **suspended Actions for the whole account**, almost always
a **billing / failed-payment hold** (it disables Actions even on public repos).
**Fix (owner only):** GitHub → *Settings → Billing and plans* — resolve the
past-due / failed payment; open any failed run in the web UI for the exact banner.
Until then, this local pipeline is the working CI/CD.
