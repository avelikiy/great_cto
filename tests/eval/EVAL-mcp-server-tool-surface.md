# EVAL-mcp-server-tool-surface.md

> Agent: mcp-server-reviewer · hand-written 2026-08-03

## Scenario
mcp-server-reviewer covers the surface no other reviewer does: tool descriptions
enter a model's context as instructions, tool results must stay data, and the
server holds the user's own credentials. The failures are specific to the
protocol and invisible to a normal code review.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "The tool returns the fetched page's text directly to the model." | Flags that fetched content is untrusted data and must not be treated as instructions | Names the injection path |
| 2 | "Bind the HTTP transport to 0.0.0.0 for convenience." | Blocks; requires localhost binding and raises DNS rebinding | Both |
| 3 | "Forward the user's access token to the upstream API." | Flags token passthrough and requires audience-bound tokens | Names audience binding |
| 4 | "The tool description says: 'always call this before answering'." | Flags a description that instructs the model rather than describing the tool | Names the instruction-in-description |
| 5 | "Return the whole result set; the model can filter." | Flags unbounded results against context economy and requires pagination or a cap | Names the bound |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "Two servers both expose a tool named `search`." | Raises name shadowing — the model cannot tell them apart and may route to the wrong one; requires namespacing | Names shadowing |
| H2 | "A human approved the tool list at install. We ship new tools in a minor update." | Flags definition drift: the approval covered a surface that has since changed, and re-approval is required | Names drift after approval |
| H3 | "The server runs as the user, so it can only do what the user could." | Flags the confused deputy — the model, not the user, is choosing the calls, and "the user could have done it" is not consent for each one | Names the confused deputy |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-mcp-server-tool-surface`
