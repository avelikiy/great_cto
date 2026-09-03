# Where the checks run

Three places, and the split is deliberate. See also
[architecture-map.md](architecture-map.md) for what the checks are checking.

## The short version

| | What runs there | Why not elsewhere |
|---|---|---|
| **`scripts/ci-local.sh`** | 109 checks, before every push | The gate. Fast, free, and on the machine that wrote the code |
| **GitHub Actions** | publishing, OpenSSF Scorecard | `npm publish --provenance` signs only through Actions or GitLab CI OIDC; Scorecard grades the GitHub repository itself |
| **Cirrus CI** (`.cirrus.yml`) | the daily canary, two weekly crons, and the local gate on a clean container | macOS + Linux matrix, and a schedule that fires whether or not anyone is at a keyboard |

`scripts/lib/guard-parity.mjs` reads **both** remote configs and asserts that
every command in them either runs in `ci-local.sh` too or is named in
`REMOTE_BY_DESIGN` with a reason. A correctness gate that exists only remotely
is not a gate.

## Why Cirrus and not the others

GitHub Actions is free and unlimited on a public repository, and this
repository is public — so `.cirrus.yml` is **not** a cost decision. It exists
because the account's billing lock disables Actions org-wide, public repos
included: 100 consecutive runs since 2026-06-25 refused with
"your account is locked due to a billing issue".

If that lock is lifted, prefer Actions and delete `.cirrus.yml`. It is the only
path to npm provenance.

Ruled out, each for one reason:

- **Cloud Build** — Linux containers only. A canary without macOS cannot fail
  the way users fail, which is the entire point of a canary.
- **Circle CI** — macOS is not in the free tier.
- **Self-hosted runner** — it would be the same Mac that already runs
  `ci-local.sh`, so it proves nothing new.

Cirrus is free for public repositories and offers macOS, Linux, Windows and
FreeBSD images. It is the only free option that covers the matrix this
repository actually needs.

## What did NOT move, and why

- **`npm publish`** — provenance signing works only through GitHub Actions or
  GitLab CI OIDC. Publishing from Cirrus would ship an *unsigned* package,
  which is worse than `scripts/cd-local.sh --publish`, which is what actually
  publishes today.
- **`scorecard.yml`** — OpenSSF Scorecard grades the GitHub repository,
  including whether it has CI on GitHub. It does not move by definition.
- **`plugin-ci` / `runtime-ci` / `cli-ci` / `evals-runner`** — these duplicate
  `ci-local.sh`. The `ci_task` in `.cirrus.yml` runs the whole local gate on a
  clean container instead, which is the part that is *not* a duplicate: proof
  that the gate passes somewhere other than the machine that wrote the code.

## Setup that cannot live in a file

1. Install the Cirrus CI GitHub App on `avelikiy/great_cto`.
2. Cirrus Cron is configured in the web UI. The `only_if` guards in
   `.cirrus.yml` expect these **names**:

   | Cron name | Quartz expression | Branch | Task |
   |---|---|---|---|
   | `daily-canary` | `0 0 6 ? * *` | `main` | `canary_linux_task`, `canary_macos_task` |
   | `evals-drift` | `0 17 6 ? * MON` | `main` | `evals_drift_task` |
   | `awesome-list` | `0 0 8 ? * MON` | `main` | `awesome_list_task` |

   **These are Quartz expressions, not crontab.** Cirrus uses Quartz, which has
   six fields instead of five — the first is SECONDS — and requires a `?` in
   either day-of-month or day-of-week but not both. A crontab-shaped `0 6 * * *`
   pasted here is not a daily 06:00 build; it is rejected or means something
   else. Times are UTC either way.

   A cron whose name does not match runs **nothing** rather than everything —
   a task firing on the wrong trigger is worse than one that does not fire.
3. Encrypted variables: `OPENROUTER_API_KEY` (drift) and `GITHUB_TOKEN`
   (opening an issue when a canary cell breaks). Without them those tasks
   **skip and say so**; they do not report a pass.

## The two scripts the config calls

Both were inline YAML in GitHub workflows and therefore runnable nowhere else.
They are files now so they can be read, run by hand, and called from any runner:

- **`scripts/ci/canary-report.sh`** — opens one issue per broken matrix cell,
  and not a second while the first is open. Ten cells failing one root cause
  would otherwise file ten issues a day until the label gets muted.
- **`scripts/ci/awesome-list-check.sh`** — weekly check that lists which had
  us still do. It distinguishes three states: `listed`, `pending` (submitted,
  not accepted — absence is expected, not news) and dropped. The first version
  lacked the middle one and reported "no longer listed" for two lists we had
  never been in.
