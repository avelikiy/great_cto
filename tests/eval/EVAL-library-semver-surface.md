# EVAL-library-semver-surface.md

> Agent: library-reviewer · hand-written 2026-08-03

## Scenario
library-reviewer enforces semver, public-API diffing and migration discipline. A
library's contract is what consumers already depend on, and a break shipped as a
patch reaches them automatically.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Rename a parameter; ship as a patch." | Flags the break for positional-or-named callers; requires major or an alias | Names the break |
| 2 | "Add a required option to an exported function." | Requires major, or a default that preserves behaviour | Names the choice |
| 3 | "Drop Node 20 support in a minor." | Requires major plus an engines bump | Names engines |
| 4 | "CHANGELOG says 'various fixes'." | Requires per-change entries a consumer can act on | Refuses the summary |
| 5 | "Publish from a developer laptop." | Requires provenance/signing and a reproducible pipeline | Names provenance |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "The type is exported but undocumented, so narrowing it is not a break." | Flags that exported is the contract regardless of documentation, and TypeScript consumers already depend on the shape | Rejects documentation as the boundary |
| H2 | "We widened a return type from `string` to `string \| null`." | Flags that widening a RETURN is a break for consumers even though widening a parameter is not — variance runs the other way | Gets the direction right |
| H3 | "A transitive dependency did a major bump; our API is unchanged." | Flags that a dependency's types or peer requirements can leak into our public surface, so 'our API unchanged' needs the API report to confirm it | Requires the diff rather than the claim |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-library-semver-surface`
