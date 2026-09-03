# Where the checks run

Three places, and the split is deliberate. See also
[architecture-map.md](architecture-map.md) for what the checks are checking.

| | What runs there | Why not elsewhere |
|---|---|---|
| **`scripts/ci-local.sh`** | 109 checks, before every push | The gate. Fast, free, and on the machine that wrote the code |
| **GitHub Actions** | publish, Scorecard | The only path to `npm publish --provenance`; Scorecard grades the GitHub repo itself. Free and unlimited here — but the account's billing lock has them refused since 2026-06-25 |
| **CircleCI** (`.circleci/config.yml`) | the daily canary, two weekly crons, and the local gate on a clean container | Its open-source programme is the only remaining free source of **macOS** runners after Cirrus shut down |

`scripts/lib/guard-parity.mjs` reads the remote configs and asserts that every
command in them either runs in `ci-local.sh` too or is named in
`REMOTE_BY_DESIGN` with a reason. A correctness gate that exists only remotely
is not a gate.

## The current problem, and the actual fix

GitHub Actions has been dead since **2026-06-25**: 100 consecutive runs refused
with *"your account is locked due to a billing issue"*. The lock is on the
ACCOUNT and disables Actions org-wide — public repositories included, even
though Actions are free and unlimited for them.

**The fix is the billing lock, not a second CI provider.** This repository is
public, so Actions already cost nothing, already have 11 working workflows, are
the only free source of macOS runners, and are the only path to
`npm publish --provenance`. Every alternative is paying with work for something
that is already free here, and losing something on the way.

## Do not reach for Cirrus CI

It was the obvious answer and it is gone: **Cirrus CI shut down on 2026-06-01**
after Cirrus Labs joined OpenAI. `cirrus-ci.org` no longer resolves and
`github.com/marketplace/cirrus-ci` is a 404.

Recorded here because it was recommended in this repository once, a
`.cirrus.yml` was written and committed against a service that had been dead
for three months, and the search results that led there were indexed pages of
documentation whose domain no longer exists. Search hits are not a liveness
check. The DNS failure was visible before the config was written and was read
as a network blip.

## Setting CircleCI up

Liveness was checked before a line was written, which is the lesson Cirrus
taught: `circleci.com` answers 200, `api/v2/me` answers 401, and the CLI
(`brew install circleci`, 1.0.49308) validates the config locally. Run
`circleci config validate .circleci/config.yml` before pushing config changes;
`circleci config process` expands the matrix so you can see the ten canary
cells rather than trust that they are there.

1. **Add the project** — app.circleci.com → Projects → `great_cto` → Set Up
   Project → "Fastest" (it finds `.circleci/config.yml` in the repo).
2. **Apply to the open-source programme** for the macOS credits: up to 400,000
   credits/month for Linux/Arm/Docker and **30,000 for macOS** on public repos.
   Without the grant the Linux half still runs; `macos_canary` is what needs it.
3. **Two environment variables**, Project Settings → Environment Variables:
   `OPENROUTER_API_KEY` (weekly eval drift) and `GITHUB_TOKEN` (only to open an
   issue when a canary cell breaks). Missing either, the job that needs it
   **stops and says so** rather than reporting a pass over a check that never
   ran.

Schedules are in the config, not a web UI, and they are **standard cron** —
unlike Cirrus, which wanted Quartz. Six-field Quartz expressions do not belong
here.

### The other options, and why not

- **Self-hosted runner on the author's Mac** — it is the same machine that
  already runs `ci-local.sh`, so it proves nothing new. It buys the schedule
  and nothing else.
- **Cloud Build / any Linux-only provider** — covers 13 of 19 jobs. The canary
  loses macOS, which is the failure mode it exists to catch.

Whatever is chosen: `npm publish` stays where it is. Provenance signs only
through GitHub Actions or GitLab CI OIDC, so publishing from anywhere else
ships an *unsigned* package — worse than `scripts/cd-local.sh --publish`, which
is what publishes today.

## The two scripts, which outlive any of this

Both were inline YAML inside GitHub workflows and therefore runnable nowhere
else — including on a laptop, when you want to know what a red run meant. They
are files now, and they do not care which runner calls them:

- **`scripts/ci/canary-report.sh`** — opens one issue per broken matrix cell,
  and not a second while the first is open. Ten cells failing one root cause
  would otherwise file ten issues a day until the label gets muted.
- **`scripts/ci/awesome-list-check.sh`** — weekly check that lists which had us
  still do. Three states: `listed`, `pending` (submitted, not accepted — absence
  is expected, not news) and dropped. The first version had two and reported
  "no longer listed" for two lists we had never been in; both submissions were
  still open at the time.

Run either by hand:

```bash
bash scripts/ci/awesome-list-check.sh                    # report only
GITHUB_TOKEN=… bash scripts/ci/awesome-list-check.sh     # and open issues
```
