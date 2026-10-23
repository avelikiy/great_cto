# Public screenshots and claims

The README and website demonstrate the released task-first board, not the
operator's projects. All ACME tasks, run records, role verdicts and numbers in
these screenshots are synthetic presentation data, not a live-model benchmark.

## Capture

From a source checkout with its development dependencies installed:

```sh
node scripts/capture-screenshots.mjs
node --test tests/lib/screenshot-fixture.test.mjs tests/lib/screenshot-routing.test.mjs tests/lib/screenshot-freshness.test.mjs
```

Capture starts a separate server on port 3242 by default (`CAPTURE_PORT`
overrides it), with an isolated HOME, project registry, task store and run store.
It never replaces the operator's running board or invokes a model. It renders
the actual UI and reads actual local APIs, not intercepted API responses.

Every PNG includes its package version, panel, fixture and synthetic-data notice
in embedded metadata. Patch releases may reuse the same feature-line images.
Do not relabel an old image as newly captured. Source and website copies must
retain identical bytes; website copy captions must disclose sample data.

## Main views

| Image | What it demonstrates | What it does not prove |
|---|---|---|
| `board.png` | Selected task, acceptance and pending host decision | Live execution or approval |
| `execution.png` | Explicitly linked attempts, hosts and rework | Causal dependencies or concurrent execution |
| `evidence.png` | Recorded versus unknown evidence categories | Current-tree verification or independent review |
| `knowledge.png` | Source document and supported declared diagram | Complete Mermaid support or runtime topology |
| `insights.png` | Task metadata and explicit unavailable metrics | Acceptance rate, cost per accepted task or host ranking |

Legacy `ledger.png`, `fleet.png`, `harness.png` and `settings.png` remain available
for technical documentation. They are not the primary product tour.

## Publication boundaries

Describe native Claude workflows, the experimental controlled Codex/mixed-host
runtime and ordinary Codex plugin sessions separately. A pipeline template is
not a causal execution trace. Presence of an installed skill/domain pack does
not prove it loaded or improved a task. Historical `/proof` results retain their
original context and cannot establish current-version quality uplift.

Recommended GitHub About text (apply separately, after review):

> Coding workflows for Claude Code and controlled Codex runs, with explicit gates, review evidence and a local project workspace. Open source, MIT.

Recommended additional topics: `codex`, `workflow`, `human-in-the-loop`.
This document does not change repository settings or authorize deployment.
