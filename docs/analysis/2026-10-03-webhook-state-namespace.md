# Webhook state namespace prerequisite

Related: [hook lifecycle contract](../HOOKS.md) and the subsequent
[stock smoke migration](2026-10-03-webhook-smoke-isolation.md).

The stock pipeline HMAC smoke currently backs up and modifies the operator's
webhook config. Adding an incoming hook preserves outgoing hooks. A correctly
signed `pull_request.opened` fixture can consequently dispatch real configured
notifications. This is a source-proven risk, not evidence that a previous run
actually delivered a notification.

The source CLI now honors the existing `GREAT_CTO_HOME` convention consistently
for `webhooks.json`, `webhook-events.log`, and `webhook-dlq.log`. Unset or empty
values retain the existing `~/.great_cto` default. The receiver reports its
actual bound port, including an OS-selected ephemeral port. Public signatures
and HMAC defaults are unchanged. The CLI delivery hint uses the selected DLQ
path rather than a hard-coded default.

## Verification plan and results

`packages/cli/tests/webhook-namespace.test.mjs` exercises five cases:

| Scope | Evidence |
| --- | --- |
| Configuration and dispatch | Isolated incoming registration cannot load the ambient outgoing fixture; fired count is zero. |
| Default compatibility | Both unset and empty overrides select the original default path, using a child-local builtin home stub. |
| Actual CLI | Add, list and remove select the dedicated config through the real CLI entrypoint. |
| Failure/DLQ | Injected fetch failure and accelerated retry scheduling produce a dead letter only in the fixture namespace. No real outgoing request. |
| Real HTTP | Actual receiver on an ephemeral loopback port refuses invalid HMAC with 401; valid HMAC returns 200, dispatched count zero, and records exactly one isolated event. |

All five passed without skips after a successful TypeScript build. Ambient
fixture config and a preexisting backup remain byte-identical; ambient event
and DLQ files are absent. Tests never override `HOME` or `CODEX_HOME`. The
direct imports of the config, dispatch and serve modules are exercised; the
webhook CLI caller is exercised through the real entrypoint. The `main.ts`
serve caller was inspected for unchanged argument forwarding; the real HTTP
test calls `runServe` directly, not the CLI serve command.

## Remaining boundary

This prerequisite does **not** make the existing stock pipeline safe to run.
Its HMAC checks still require migration to isolated fixtures and refusal when
an installed artifact does not support the namespace. Its SessionEnd check
still runs at the repository cwd and can register lessons, launch a merge, and
launch a paid learner according to ambient configuration. Full stock CI has
not been rerun. Installed plugin files, defaults, release state and approval
gates are unchanged. This is not a production guardian admission or full
Codex/Claude lifecycle proof.
