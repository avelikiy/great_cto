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
| How to disable | unset env var, or `GREAT_CTO_TELEMETRY=off`, or `DO_NOT_TRACK=1` |
| Honors `DO_NOT_TRACK=1` (consoledonottrack.com) | Yes — overrides everything else |
| Skips automatically in CI | Yes (detected via `CI=true`, `GITHUB_ACTIONS`, etc.) |
| Where data goes | `https://telemetry.greatcto.systems/v1/event` (Cloudflare Worker) |
| Server logs IP addresses | No — Cloudflare gives us the IP, we drop it before write |
| Personal info collected | None |
| Project content collected | None |
| Source for transparency | `packages/cli/src/telemetry.ts` + `workers/telemetry/index.ts` |

---

## What we collect (when enabled)

A single JSON object per command run, ≤ 256 bytes:

```json
{
  "ts":         "2026-05-10T12:34:56Z",
  "version":    "2.7.0",
  "command":    "scan",
  "archetype":  "cli",
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
- **`command`** — the subcommand executed (`init` / `scan` / `ci` / `board` / `adapt` / `mcp` / `report` / `serve` / `register`). One of a fixed allowlist; anything else is dropped.
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
- ❌ **User-agent fingerprints** (the only request header we read is `Content-Type`).
- ❌ **Email / username / real name**.
- ❌ **Repo URL or git remote**.

## How opt-out works (in priority order)

The client checks all of these before sending. Any one disabling = no event sent.

1. `DO_NOT_TRACK=1` env var (industry standard, [consoledonottrack.com](https://consoledonottrack.com/))
2. `GREAT_CTO_TELEMETRY=off` env var
3. `GREAT_CTO_DISABLE_TELEMETRY=1` env var (legacy alias)
4. `~/.great_cto/telemetry.json: { "enabled": false }`
5. CI detection: `CI` / `GITHUB_ACTIONS` / `GITLAB_CI` / `CIRCLECI` / `BUILDKITE` / `JENKINS_URL` / `TF_BUILD`
6. **Default state when none of the above is set: opt-out** (telemetry off until you explicitly turn it on)

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
GREAT_CTO_TELEMETRY=on GREAT_CTO_TELEMETRY_DRYRUN=1 great-cto scan ./
# stderr: [telemetry] would-send: { "ts":"...", "command":"scan", ... }
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
- Public dashboard: only aggregates. No way to look up an individual user's history.

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

## Changelog

- **2026-05-10**: initial telemetry pipeline (Phase 3). Default off. Schema v1.
