# Privacy & Telemetry

great_cto can send anonymous usage telemetry to help us understand which
commands and archetypes are most used, and where users are getting stuck.
**Telemetry is OFF by default.** You opt in explicitly.

This document describes exactly what we collect, what we never collect,
how to opt in, how to opt out, and how to verify what's being sent.

---

## TL;DR

| Question | Answer |
|---|---|
| Default state | **Disabled** |
| How to enable | `GREAT_CTO_TELEMETRY=on` env var or `~/.great_cto/telemetry.json: { "enabled": true }` |
| How to disable | unset env var, or `GREAT_CTO_TELEMETRY=off`, or `DO_NOT_TRACK` set to anything |
| Disable for one invocation | `great-cto --no-telemetry <command>` overrides env/config opt-in without changing it |
| Honors `DO_NOT_TRACK` (consoledonottrack.com) | Yes, at any non-empty value — overrides everything else |
| Skips automatically in CI | Yes (detected via `CI=true`, `GITHUB_ACTIONS`, etc.) |
| Where data goes | `https://telemetry.greatcto.systems/v1/event` (Cloudflare Worker) |
| Server logs IP addresses | No — Cloudflare gives us the IP, we drop it before write |
| Country / region collected | No — Cloudflare exposes country via `cf-ipcountry`; the worker deliberately ignores it |
| Personal info collected | None |
| Project content collected | None |
| Source for transparency | `packages/cli/src/telemetry.ts` + `workers/telemetry/index.ts` |

---

## What we collect (when enabled)

A single JSON object per command run, ≤ 256 bytes:

```json
{
  "ts":         "2026-05-10T12:34:56Z",
  "version":    "2.70.0",
  "command":    "init",
  "archetype":  "fintech",
  "node":       "20.11.1",
  "os":         "darwin",
  "exit_code":  0,
  "duration_ms": 1234,
  "anon_id":    "a3f2dd91"
}
```

That's it. Eight fields, no payload, no user content.

### Field details

- **`ts`** — UTC timestamp of the event.
- **`version`** — great_cto version that emitted the event.
- **`command`** — the subcommand executed (`init` / `ci` / `board` / `console` / `adapt` / `mcp` / `report` / `serve` / `webhook` / `upgrade` / `register`). One of a fixed allowlist; anything else is dropped.
- **`archetype`** — value of `archetype:` from `.great_cto/PROJECT.md` if it exists, else `"none"`. One of the 25 documented archetype slugs; unknown values become `"unknown"`.
- **`node`** — `process.versions.node`.
- **`os`** — `process.platform` (`linux` / `darwin` / `win32`).
- **`exit_code`** — process exit code so we can see where users are hitting failures.
- **`duration_ms`** — wall-clock time the command took. Useful for finding the slow paths.
- **`anon_id`** — first 8 hex chars of `sha256("great_cto/" + os.userInfo().username + "/" + os.hostname())`. Stable per machine, not reversible. Lets us see DAU/MAU without identifying anyone. We never publish or share the raw mapping; only the count of unique IDs in aggregate.

## What we NEVER collect

These are not in the schema and the worker rejects events containing them.

- ❌ **File paths** (no `cwd`, no `argv`, no project-name slugs).
- ❌ **Project content** (no source code, no prompts, no CLAUDE.md, no agent outputs).
- ❌ **Verdicts or cost data** (`.great_cto/verdicts/` stays on your disk, never leaves).
- ❌ **API keys / secrets** (we don't read env vars beyond opt-out signals).
- ❌ **IP addresses** (Cloudflare provides them in `cf.connectingIP`; the worker drops the field before D1 insert).
- ❌ **Geolocation / country / region** — Cloudflare automatically derives country from IP and provides it via the `cf-ipcountry` request header. The worker deliberately does **not** read this header. No geographic data is collected, derived, or stored.
- ❌ **User-agent fingerprints** (the only request header we read is `Content-Type`).
- ❌ **Email / username / real name**.
- ❌ **Repo URL or git remote**.

## How opt-out works (in priority order)

The client checks all of these before sending. Any one disabling = no event sent.

1. `DO_NOT_TRACK` env var set to any non-empty value — `1`, `true`, `yes`, anything
   (industry standard, [consoledonottrack.com](https://consoledonottrack.com/))
2. `GREAT_CTO_TELEMETRY=off` env var
3. `GREAT_CTO_DISABLE_TELEMETRY=1` env var (legacy alias)
4. `~/.great_cto/telemetry.json: { "enabled": false }`
5. CI detection: `CI` / `GITHUB_ACTIONS` / `GITLAB_CI` / `CIRCLECI` / `BUILDKITE` / `JENKINS_URL` / `TF_BUILD`
6. **Default state when none of the above is set: opt-out** (telemetry off until you explicitly turn it on)

The root CLI also accepts `--no-telemetry` for one invocation. It overrides
environment and config opt-in, skips the init consent question, and leaves
`telemetry.json` unchanged. A later invocation without the flag uses your
existing preference again. Explicit `telemetry on` and `telemetry off`
commands still change that stored preference.

For ordinary commands, the flag may appear before or after the command:
`great-cto --no-telemetry help` and `great-cto help --no-telemetry` are equivalent.
For `task`, `worker`, `codex-host`, `run`, `status`, `resume`, and `statusline`,
place it **before the command**, for example `great-cto --no-telemetry run -- "my prompt"`.
Everything after those command names belongs to the delegated parser; a literal
`--no-telemetry` in that tail is preserved as data or a delegated option.

This flag does not disable the separate update check (use
`GREAT_CTO_NO_UPDATE_CHECK=1`) or network access performed by the selected command.

## How to opt in

Telemetry is opt-in. Three equivalent ways:

```bash
# One-shot via env var (current shell only):
export GREAT_CTO_TELEMETRY=on

# Persistent via config file:
mkdir -p ~/.great_cto
echo '{ "enabled": true }' > ~/.great_cto/telemetry.json

# Or run the helper:
npx great-cto telemetry on
```

To disable again:

```bash
unset GREAT_CTO_TELEMETRY
echo '{ "enabled": false }' > ~/.great_cto/telemetry.json
# OR:
npx great-cto telemetry off
```

## How to verify what's being sent

We log the exact JSON to stderr in dry-run mode:

```bash
GREAT_CTO_TELEMETRY=on GREAT_CTO_TELEMETRY_DRYRUN=1 great-cto board
# stderr: [telemetry] would-send: { "ts":"...", "command":"board", ... }
# (no actual network call)
```

Source code:

- Client: [`packages/cli/src/telemetry.ts`](../packages/cli/src/telemetry.ts) — under 100 lines, fire-and-forget POST with 1s timeout.
- Server: [`workers/telemetry/index.ts`](../workers/telemetry/index.ts) — schema validation, IP drop, D1 insert.

If you find a discrepancy between this doc and the code, please open an issue
labelled `privacy-discrepancy` — we treat that as P0 and ship a fix same-day.

## Data retention

- Raw events: **30 days** in Cloudflare D1, then auto-deleted by a daily Worker cron.
- Aggregates (daily counts per `command × archetype × os`): retained indefinitely, no `anon_id`.
- Reviewed weekly by the maintainer to inform product decisions. Aggregates
  are **not currently published publicly** — they may be in the future once
  weekly active users exceed 100, and only as anonymous counts (never `anon_id`).

## Right to be forgotten

Send the request from any address to `privacy@greatcto.systems` with your
`anon_id` (you can compute it locally: `npx great-cto telemetry whoami`).
We delete all events with that ID within 7 days and confirm by reply.

## Why opt-in (not opt-out) is the default

Telemetry default-on without explicit consent is sketchy in 2026 even when
the data is anonymous. We follow [Honeycomb's approach](https://www.honeycomb.io/blog/our-stance-on-telemetry):
ship the plumbing, document it, let users decide. The cost of "no telemetry
data for the first 6 months" is low. The cost of one user feeling
surprised is very high for an open-source project that asks for trust.

## Update check (separate from telemetry — on by default)

The CLI periodically checks npm for a newer `great-cto` version and notifies
you on stderr when one is available (classic `update-notifier` pattern,
implemented with zero dependencies): the first interactive run per release
asks `Update to x.y.z? [Y/n]` (15s timeout, defaults to No on timeout), and
every later run prints a one-line hint. This is **not** telemetry: it's
a read-only `GET https://registry.npmjs.org/-/package/great-cto/dist-tags`
request — the same traffic `npm install`/`npm outdated` already make — and it
sends nothing about you or your project. The result (`{"latest": "x.y.z"}`),
plus which release you've already been prompted about, is cached locally at
`~/.great_cto/update-check.json` for 24h; the check runs in a detached
background process so it never delays or blocks your command.
It's skipped automatically for `mcp`/`worker`/`task` (protocol-sensitive
stdio) and for non-interactive/CI runs (the prompt additionally requires an
interactive stdin). Opt out with `GREAT_CTO_NO_UPDATE_CHECK=1`.
Source: `packages/cli/src/update-check.ts`.

## Local agent events (not telemetry — on by default, never sent)

So the board can show what agents are doing while they run (ADR-021), the hooks
append one line per agent event to `.great_cto/events.jsonl` **inside your
project**. Nothing in this file is sent anywhere; it is read only by the board
running on your machine.

An event records facts, and only these fields: `ts`, `kind` (`agent-start`,
`agent-stop`, `tool`, `denied`, `stop`, `pipeline`), `session`, `agent`, `tool`,
up to ten `paths` a tool touched, `ok`, `duration_ms`, and for pipeline events an
`outcome` and a verdict token.

It **never** records command text, file contents, prompts, tool output or
environment variables — those can hold secrets. The allowlist is enforced in code
(`scripts/lib/agent-events.mjs`), not by convention, and a test fails if an event
carries any other field.

The file is capped at 5 MB and keeps one previous generation
(`events.1.jsonl`). Delete either whenever you like. Turn recording off with
`GREAT_CTO_DISABLE_EVENTS=1`.

The controlled Codex host (`great-cto codex-host`) writes the same file, with the
same fields, because Codex has no hook surface of its own. Its agents appear as
`codex-<role>` and `codex-verifier`, and `session` is the run id. A tool call is
recorded as `shell`, `apply_patch` (with the paths it touched), `mcp:<server>.<tool>`
or `web_search`, a command the sandbox declined as `denied` — **never** with the
command text, its output, MCP arguments or results, or a search query.
`GREAT_CTO_DISABLE_EVENTS=1` silences the host too.

The events log is not part of a review receipt: appending to it does not make a
reviewed tree look changed.

## Local turn snapshots (not telemetry — on by default, never sent)

The plugin stores a turn snapshot at the end of each agent turn so a reviewer can inspect
what changed (ADR-023). Snapshot commits and their refs are stored locally
**in your project's own Git database**, under
`refs/great-cto/turns/<session>/<n>`. A snapshot holds the
same content your working tree already holds, including uncommitted work; gitignored
files and the agent events log are left out. Nothing is uploaded.

Snapshot refs are not branches and are not pushed by a normal `git push`;
a `git clone` does not carry them either.
A mirror push would, so the plugin's pre-push hook refuses any push that includes
`refs/great-cto/`. The newest 50 turns per session are kept, and sessions untouched
for 14 days are removed. Delete them all with
`git for-each-ref --format='%(refname)' refs/great-cto/ | xargs -n1 git update-ref -d`.
Turn them off with `GREAT_CTO_DISABLE_TURNS=1`.

Automatic diagnostic commands suppress configured executable Git helpers;
your ordinary commit/push hooks and signing configuration remain unchanged.
See the [execution-boundary audit](analysis/2026-10-02-turn-snapshot-executable-boundary.md)
for the tested controls and limitations, not an OS-sandbox guarantee.

## Judge key check (not telemetry — sent only to OpenRouter)

When the board shows the judge settings with a key stored, it asks OpenRouter whether
that key is live: one `GET https://openrouter.ai/api/v1/key` carrying the key, which
costs nothing and returns the key's limit and usage. The request goes to OpenRouter
and nowhere else, carries nothing about your project, and is started only from the
board page itself (another site cannot trigger it). The answer is kept in the board's
memory for that key; a restart or a replaced key checks again. Nothing is sent when
no key is stored.

## Architecture council (not telemetry — sent only to the models you declared, only if you opt in)

Off unless `.great_cto/PROJECT.md` says `council: arch` (ADR-025). When it does,
before the architect writes, the project's brief and `PROJECT.md` are sent to each
council member — the providers you declared (`council-members:`, or your
`second_opinion` capability): Codex through your own `codex` login, OpenRouter with
your own key. Each member's draft is written to
`docs/architecture/council/<feature>/` in your project, with a `council.json`
recording who drafted, who failed or was skipped, and what it cost. Nothing is sent
to great_cto, and nothing is sent when `council:` is absent.

## Cross-model code review (not telemetry — sent only to the provider you declared)

The code reviewer's second opinion (`scripts/lib/cross-model-review.mjs`) sends the
reviewed diff, and the spec when one is given, to one provider: the one named by
`--provider`, or by `capabilities: second_opinion:` in `.great_cto/PROJECT.md`.
`codex` runs through your own `codex` login; `openrouter` uses your own key.
An exported `OPENROUTER_API_KEY` does not choose the provider: with nothing declared
the review is skipped (exit 3) and nothing is sent. Each review appends one line to
`.great_cto/cross-review.log` in your project. Nothing is sent to great_cto.

## Optional Kimi advisory profile (explicit selected context only)

The `kimi-readonly-v1` profile adds a separately requested OpenRouter/Moonshot
opinion. It is off by default. An API key, an existing second-opinion declaration
or `council: arch` alone does not request it. The caller must provide an explicit
public/synthetic envelope, task, reason, source manifest and review-rubric hash.
Only the selected diff/spec or brief/project excerpt is sent. Ambient project
files, home settings, memory and transcripts are not collected. Classification
covers the exact submitted bytes; a public repository does not classify local
dirty changes. Private, unknown or EU-required context is denied.

The strict route requests the standard Moonshot endpoint, ZDR, denied data
collection and no provider fallback. These requested controls do not establish
account compatibility, data residency or an independent compliance guarantee.
The profile has no model tools and its answer has `authority: NONE`,
`releaseEligibility: NOT_CHECKED` and an advisory label. It cannot satisfy the
mandatory native review or a human gate.

Reports stay under `.great_cto/kimi-review/<task-hash>/<request-uuid>/`, excluded
from Git. Directories use mode `0700` and files `0600`. Existing task and operator
runtime parents must also be caller-owned and private; unsafe permissions are
rejected without changing those directories. Metadata records ids,
hashes, status, usage and cost provenance, without prompts, raw provider bodies,
credentials or reasoning text. Parsed findings and alternatives may quote source
and therefore remain private in a separate report. Status output omits those
quotes. The profile does not write to the native cross-review log. Council returns
extra member metadata separately and keeps the private draft and its absolute
path out of the tracked `council.json` and ordinary drafts.

An explicit operator runtime directory holds the authoritative budget ledger;
the task has a secondary local record. Reservations survive process restarts.
Timeout, cancellation or response loss after possible sending leaves cost Unknown
and retains the full reserve unless complete usage and accounting are durable.
If a validated response and known charge are durably settled, the final deadline
or cancellation check still withholds late advice, but keeps the charge and
private validated report and releases only the unused reserve. Accounting
settlement is not proof of advice delivery. No automatic retry, paid
reconciliation or background cleanup is performed. Missing usage fields do not
become zero; provider-reported cost is distinct from cost calculated using the
pinned standard token rates.

Retention is an operator procedure: keep task reports for the task's lifetime,
and metadata/known accounting records for 30 days after its terminal state.
Unresolved Unknown reservations have no automatic expiry. Export only explicitly
selected reports, reconcile uncertain charges before clearing their accounting,
and record deletion without report contents. This implementation has offline
fixture coverage only; activation, live billing behavior and quality gains
require their own evidence and authorization. See [usage details](DETAILS.md#optional-kimi-advisory-review).

## Local project registry (not telemetry — never sent)

The board's project switcher reads `~/.great_cto/projects.json`. At session start and
at the end of each turn, a directory with `.great_cto/PROJECT.md` is added to it:
name, archetype, description and path. The file stays on your machine. Temp
directories and agent worktrees are not added; turn it off with
`GREAT_CTO_NO_AUTO_REGISTER=1`, and remove a project by deleting its entry.

## Local usage index (not telemetry — never sent)

The board's **Usage** screen shows what Claude Code and Codex consumed on this
machine. It reads the hosts' own session logs — `~/.claude/projects` and
`~/.codex/sessions` — and keeps per-day totals in `~/.great_cto/session-usage-index.v<N>.json` (N is the index format):
tokens per model, tool / skill / agent / MCP call counts, conversation titles,
project folder names, hourly spend, the words of each limit refusal, the plan-window
readings Codex reported, and counts of hook refusals, failures and timeouts. The same screen
reads every registered project's verdict logs and runs `bd list` in each project that keeps
Beads, to count bugs by priority; it keeps counts only — no bug title or description reaches
the page. The logs are
only read, never changed. The index stays on your machine, is served by the board
on its own host only, and is not part of telemetry, even when telemetry is on.
Delete the file to drop it; the next board open rebuilds it from the logs.
Source: `scripts/lib/session-usage.mjs`.

## Claude plan use, from the status line (opt-in, never sent)

Claude Code hands its plan use — the 5-hour window, the week, the per-model weeks, each
with a used percentage and a reset time — to the status line command, and to nothing
else. `great-cto statusline install` replaces the `statusLine` entry in
`~/.claude/settings.json` with a small script copied to `~/.great_cto/statusline.mjs`
(the settings file is backed up first). The script runs the status line you already had
and prints its output unchanged, and appends one line per *change* of those numbers to
`~/.great_cto/claude-limits.jsonl`: a timestamp and the windows — no prompt, no path, no
project. The board's Usage → Limits reads it. `great-cto statusline uninstall` restores
your previous status line exactly. Nothing is sent anywhere.

Readings arrive only from a status line Claude Code draws: the terminal `claude` draws
one, the desktop app's Code tab does not. To tell "on, no reading yet" from "never
installed", the board reads the `statusLine.command` entry of `~/.claude/settings.json`
and checks whether it points at `~/.great_cto/statusline.mjs` — that one field, nothing
else from the file, and only on the machine the board runs on.

## Changelog

- **2026-05-10**: initial telemetry pipeline (Phase 3). Default off. Schema v1.

## Local execution graph observations

The graph observation journal is local-only and separate from anonymous usage
telemetry. Controlled runs enable supplementary host events explicitly with
`codex-host start --observe-graph`. Native sessions require explicit enrollment
for one canonical project, host and session through `task work graph-bind`, or
project-and-host opt-in through `task work graph-enable` before SessionStart.
Removing enrollment stops future collection; it does not delete existing history.
No native transcript discovery, historical transcript import, terminal control,
provider call or network export is performed by the observer.

The private journal under `~/.great_cto/host-graphs/` keeps allowlisted lifecycle,
tool class, outcome, opaque event/call identities, explicit parent references and
observation timestamps. Enrollment is under `~/.great_cto/graph-bindings/`.
Prompts, messages, commands, tool arguments/results, document contents,
credentials and file paths are excluded from event records. Enrollment retains
the canonical root privately to verify exact project membership. Stores require
owner-only access and reject symlinks. Event and byte quotas are bounded; gaps,
corruption and unsupported source formats remain incomplete observations.

The journal grants no execution, approval, verification or release authority.
Native event claims cannot establish a passed gate or accepted task. Users can
inspect enrollment with `task work graph-read` and revoke it with
`task work graph-unbind --host HOST --session SESSION`.
