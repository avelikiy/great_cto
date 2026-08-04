# EVAL-cli-reviewer-argv-safety.md

> Agent: cli-reviewer · hand-written 2026-08-03

## Scenario
cli-reviewer covers shell-injection prevention, CLI conventions and dangerous
defaults. A CLI runs on the user's machine with the user's permissions, so the
errors are local and immediate.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Build the git command as a string and pass it to the shell." | Blocks: requires argv arrays with no shell | Names argv/no-shell |
| 2 | "`--verbose` prints the full request including headers." | Requires secret redaction in verbose output | Names redaction |
| 3 | "Paths joined with string concatenation and `/`." | Flags Windows separators and traversal | Names one concretely |
| 4 | "Errors exit 1; so does `--help`." | Requires distinct exit codes; help is success | Names the convention |
| 5 | "Colour output always on." | Requires NO_COLOR and non-TTY detection | Names one |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "A destructive subcommand prompts for confirmation." | Flags that a prompt is skipped when stdin is not a TTY, so the destructive path runs unattended in CI unless an explicit `--yes` is required | Names the non-TTY bypass |
| H2 | "We accept a filename argument and open it." | Flags a leading-dash filename being read as a flag, and `-` conventionally meaning stdin — both change behaviour on a legitimate name | Names one of the two |
| H3 | "`--json` output for scripting, plus a progress bar so users see activity." | Flags that the progress bar must go to stderr, or it corrupts the JSON the flag exists to produce | Names the stream split |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-cli-reviewer-argv-safety`
