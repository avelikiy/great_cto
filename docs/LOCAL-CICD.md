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

## CD: admitted immutable artifacts

ADR-045 now explicitly keeps local CI/CD as the operational route and adds a
separately enrolled Ed25519 release authority. This approved design does not
mean its production key is selected, enrolled or authorized to sign yet.
The exact contract is [verified-updates.md](reference/verified-updates.md).

The safe default `bash scripts/cd-local.sh` retains local CI, build, pack and
publication dry-run. `--push` still needs the ordinary source hooks/authority.
The legacy `--publish` route must refuse early before any CI, credential access
or external mutation: its old clean-tree/login/version checks do not establish
artifact admission. `release.sh` must also refuse its legacy real-release path
before mutation. A green gate cannot bypass either refusal.

The admitted local release sequence is:

1. Validate and independently review the exact clean source commit/tree.
2. Build the complete npm/plugin/runtime set twice in clean worktrees, compare
   the five deliverables byte for byte and freeze the index and final bytes.
3. After separate operator key selection and independent public-fingerprint
   enrollment, sign all artifacts and the index under `local-ed25519` policy.
4. Verify through the production consumer. Complete the artifact and ship gates.
5. Publish only with explicit approval pins for the exact commit and index
   digest. Recheck the exact current public tag and source ancestry in main
   before any registry mutation; unavailable metadata causes refusal.
6. Publish the admitted tarball path without rebuilding or directory repacking,
   then compare downloaded registry bytes/integrity against the original set.
   Preserve immutable signed GitHub assets; install/activate separately.

The publisher requires an explicitly selected canonical owner-only `0600` npm
authentication file. It copies only the registry-scoped `_authToken` into a
private temporary configuration; it does not inherit ambient npm tokens, npm
configuration or Node preloads. Authentication is not inferred from `npm whoami`
or copied from a candidate. Never put the token in argv, reports or release
assets. This is local operator authentication, not npm Trusted Publisher/OIDC.
Actual CLI flags must follow the delivered publisher help; this document does
not invent a command or authorize a production invocation.

In-place rotate/revoke commands are unsupported; production key-lifecycle
acceptance remains NOT_RUN. Future trust replacement/removal needs reviewed
operator action without automatic migration. Retained tickets recheck the key
file, but removing configuration does not revoke an already held ticket.

The optional hosted profile remains separate and requires its own exact-tag
OIDC proof, protected owner review and npm Trusted Publisher. A hosted billing
failure never silently selects a local key or bypasses admission. The immutable
`v3.71.0` preparation tag remains unchanged; changed source needs a fresh
candidate version/tag after its gates.

### Historical path

Commit `dc90600c` introduced `cd-local.sh` on 2026-06-28 for account-wide Actions
startup failures. It ran CI, build, pack and dry-run; optional `--publish` checked
a clean tree, npm login and absence of the version, then published the directory.
`3b281937` deliberately omitted `--provenance` locally because GitHub OIDC was
unavailable. That history explains previous releases; it is not an exception to
the new exact-artifact admission requirement. The old invocation must not be
used to publish this candidate.

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
excluded. The one exception is the compiled CLI, `packages/cli/dist/` — ignored by
Git, required for the installed `great-cto` to start: it is copied when the plugin
tracks `packages/cli/index.mjs`, and the install is refused when it is missing or
older than `packages/cli/src` (run `npm run build` in `packages/cli`). Files are
checked in a staging directory and renamed into an unused
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

For isolated CLI/board probes, `GREAT_CTO_HOME` must be an absolute dedicated
state directory. Empty/unset retains the normal home default; relative paths
are refused, not reinterpreted against each process cwd. `GREAT_CTO_DISCOVERY_ROOT`
controls project discovery separately: set both for an isolated probe. A discovery
root alone does not relocate the operator registry. The global store and its
parent project-shaped marker are excluded from project registration/discovery.
Webhook config/DLQ and VAPID key files use mode 0600 with file-symlink refusal;
existing secret files are tightened when read/written. New state directories use
0700; existing parent directories are not chmod-ed. This does not migrate all
legacy plugin writers or claim OS isolation from another same-user process.

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

## Smoke-check an installed plugin

`bash scripts/smoke-learning-and-gates.sh [<plugin-dir>]` runs the 3.65–3.67
behaviour (lesson evidence, component arms, the /crystallize stamp, the change-map
rule, the gate brief on a live board) against an **installed** plugin — the newest
great_cto version in any marketplace cache by default — with HOME redirected to
a sandbox. No network, no model calls. Point it at an older version to see the checks
fail: 3.64.0 fails 14 of them, 3.65.0 fails the 4 that 3.66–3.67 added.
