# ADR-049 — The hosted relay acts only for the board that holds the key, and serves reports sandboxed

**Status:** Proposed
**Date:** 2026-11-11
**Deciders:** great_cto core
**Supersedes:** —
**Superseded by:** —
**Related:** [ADR-009 — gates follow reversibility](ADR-009-gates-follow-reversibility.md) ·
[ADR-048 — board local API guards](ADR-048-board-local-api-guards.md) ·
[RFC — accounts, SSO and hosting](../rfc/RFC-accounts-sso-and-hosting.md) (Phase 1)

## Context

`greatcto.systems` runs two small workers for the board: `/notify*` sends alert email,
`/r/*` hosts public share reports. Neither knew which board was talking to it.

### Measured before deciding

The share worker's source was not in this repository. It was read from the deployment
on 2026-11-11 (last modified 2026-04-30).

| Finding | Evidence |
|---|---|
| A paused report was served in full | the worker returned the stored page with `{{PAUSED}}` replaced by `true`; the board substitutes that placeholder with `false` before publishing (BH-22), so there was nothing left to replace |
| Anyone holding a report link could pause or resume it | `POST /r/<id>` checked nothing; the id is in the public URL |
| A report was served from the product's origin with no policy | no `Content-Security-Policy`; the content is whatever was posted to `/r/`, which is open to anyone |
| An expired report stayed in storage | expiry was checked on read; nothing deleted the object |
| Every republish created a new public link | one per approved gate while Share is on; the old report stayed up for 30 days |
| Anyone who knew a verified address could send it mail from the product's sender | `POST /notify` checked only that the address was verified; 100 a day, any title and body |
| `/notify/status?to=` told anyone whether an address was registered | no credential |

## Decision

1. **Send key for alerts.** `POST /notify/confirm` with `keyed: true` returns a random
   key once and stores its SHA-256. `POST /notify` and `GET /notify/status` for that
   address need the key as a bearer token. Verifying again replaces the key.
2. **Manage key for reports.** `POST /r/` with `manage: true` returns a key once and
   stores its hash. Pause, resume, replace and delete need it. Replace keeps the link;
   the board uses it for every republish it holds a key for.
3. **Keys only on request.** A board from before keys does not ask, gets none, and keeps
   working as before: its address sends without a key, and its report can be paused by
   id (pause only). A worker deploy therefore breaks no installed board. Two worker
   variables end the grace period when the owner decides: `REQUIRE_SEND_KEY=1` and
   `REQUIRE_MANAGE_KEY=1`.
4. **A paused report is never served.** The worker answers 410 with a notice.
5. **Reports are served in a CSP sandbox** (`sandbox allow-scripts …` without
   `allow-same-origin`, `default-src 'none'`). The report runs in an opaque origin: no
   cookies or storage of the hosting site, no forms, no network. This replaces the
   second domain the RFC asked for.
6. **An expired report is deleted when it is next requested.**
7. **Turning Share off is confirmed by the relay.** If the relay cannot be reached or
   refuses, the board reports that the report is still public and leaves Share on.
8. **Keys live in `~/.great_cto/notifications.json` and `share-<project>.json`, mode
   0600, and are stripped from every response to the board page.** Neither file is read
   into model context.
9. **The share worker's source is in the repository** (`share-worker.js`,
   `wrangler.share.toml`).

## Not decided here

- **Who may publish.** `POST /r/` stays open: there is no account to tie it to. The
  sandbox limits what a hostile page can do; it does not stop the domain being used to
  host text. A rate limit or a publish credential waits for accounts (the RFC).
- **Bucket lifecycle rule** for reports nobody requests after expiry. It is a bucket
  setting, not code.
- **When to set the two `REQUIRE_*` variables.**

## Consequences

- Nothing changes on `greatcto.systems` until the two workers are deployed. That is the
  owner's action: it changes a public service.
- The new board works against the old workers (it gets no keys and behaves as before),
  and old boards work against the new workers. Either side can ship first.
- A user who wants a key for an address verified earlier verifies it again.
- `GREATCTO_SHARE_URL` now overrides the share relay address, as `GREATCTO_NOTIFY_URL`
  already did for alerts. Tests use it; so can a self-hosted relay.

## Verification

- `packages/board/relay-send-key.test.mjs` — the notify worker with an in-memory store,
  and a running board against a stub relay.
- `packages/board/share-relay.test.mjs` — the share worker with an in-memory bucket, and
  a running board against a stub relay.
- After deploy, on the live service: a report paused from the board answers 410; a
  `POST /r/<id>` without the key answers 401; a served report carries the policy header;
  a test alert arrives; `POST /notify` for a keyed address without the key answers 401.
