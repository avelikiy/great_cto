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

## Installing the working copy as the local plugin

great_cto is developed from source but Claude Code loads it as a plugin from a
versioned cache dir (`~/.claude/plugins/cache/local/great_cto/<version>/`). The
SessionStart hook keeps only the 3 newest versions, so after a few bumps — or a
plugins-cache reset — that dir can end up **empty**, and the hook silently
no-ops ("plugin dir not found"): no `ARCHETYPES.md`/`SKILL.md` bootstrap, no
agents refreshed, docs/metrics look broken on the board.

Re-populate it in one idempotent command:

```bash
bash scripts/install-local.sh                # publish + managed files + Claude local registry
bash scripts/install-local.sh --no-agents    # publish + Claude local registry
bash scripts/install-local.sh --no-register  # cache-only, no managed files/registry activation
bash scripts/install-local.sh --prune        # also prune validated unused versions, keep newest 3
```

The source must be a Git checkout root with a commit. Only tracked regular files
are copied, with local state, credentials, environment secrets and dependencies
excluded. Files are checked in a staging directory and renamed into an unused
version directory. A content inventory and source commit are retained in
`.great-cto-local-install.json`; this is build identity, not security approval.
An identical re-run leaves files unchanged. Different bytes under the same
version are refused: bump the plugin version, never overwrite a running cache.

Registration requires an existing readable Claude version-2 registry. Its
update is atomic, preserves non-user registrations and retains a unique backup
of the previous registry. Required-step failures exit nonzero and do not print
DONE. Managed-file refresh is not a global transaction; on a later failure some
managed files or a published cache can remain, while prior cache versions remain
available. Automatic rollback of the whole host is not claimed.

No board restart or Claude/Codex marketplace update occurs here. Those operations
can select different source bytes and need separate approval and runtime checks.
Restart Claude Code explicitly after registration. This command does not install
or activate the local candidate in Codex, confirm enabled-plugin selection, or
prove the running host has adopted it. Existing live-root protection during prune
is observational, not an OS-level guarantee against same-user filesystem races.

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
