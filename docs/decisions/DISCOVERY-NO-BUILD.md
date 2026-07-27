# Discovery — evaluated and deliberately NOT built

Ideas that were investigated against this repo and rejected, with the evidence
that decided it. The point of writing them down is to stop re-litigating: a good
idea with no consumer is still not work, and re-discovering that costs a day each
time.

Format: what was proposed · why it was rejected · **what would change the answer**.

---

## 2026-07-23 — from VVAH (visa/visa-vulnerability-agentic-harness)

An 11-stage agentic pipeline for vulnerability discovery → triage → remediation.
Worth noting for calibration: its own README states no precision/recall figures
are published, so its architecture is thoughtful-but-unproven, not a benchmark to
copy. Three of its ideas were evaluated.

### V1 — SARIF output for security findings · **DEFERRED (no consumer)**

Emit machine-readable SARIF so findings land in GitHub Code Scanning / IDEs.

The pipe already exists: `.github/workflows/scorecard.yml` uses
`github/codeql-action/upload-sarif@v3` with `security-events: write`, so the cost
would have been a converter alone. The nearest structured source,
`.great_cto/triage-log.jsonl` (schema in `skills/skeptical-triage/SKILL.md`),
maps almost 1:1 onto a SARIF result.

**What killed it — the input does not exist:**

| Artifact | Count on this machine |
|---|---|
| `docs/security/CSO-*.md` | 0 files |
| `.great_cto/triage-log.jsonl` | never written (local or global) |
| `~/.great_cto/verdicts/security-officer.log` | 4 lines, all history |

Telemetry says the same thing from the other side: `adapt` is 69 of 100 recorded
runs, `board` is 2 — most users never reach the security pipeline at all. A
converter would read a file that has never been produced.

**What would change the answer:** a second consumer of structured findings
appearing (IDE, Code Scanning, a dashboard panel) — or the security pipeline
actually running and producing `triage-log.jsonl`. At that point the right build
is not "scrape CSO markdown → SARIF" but "make security-officer write findings
JSONL", after which SARIF is a ~40-line mapping.

**Cheap experiment first:** run security-officer once on a real feature and check
whether `triage-log.jsonl` appears. If nothing is produced in 30 days, close
this permanently.

### V3 — adversarial verification requiring an exploit chain · **ALREADY HAVE (denser)**

VVAH's S6 traces exploitability before a finding survives. great_cto enforces the
same thing in four independent layers, and its triage is stricter than the source:

| Layer | Where | Requirement |
|---|---|---|
| Evidence gate | `agents/security-officer.md` | direct proof (`file:line`, or a CVE confirmed for *this* version) → OWASP/CWE attribution → signal strength 1–3. **Default is no finding.** Unproven items go to `## Observations` and open no task |
| Severity calibration | same | "P0/P1 only if exploitable *today* — if you cannot name the attacker, the entry point and the impact, it is not a P1" |
| Adversarial pass | `skills/skeptical-triage/SKILL.md` | 3 rounds + an arbiter, logged with confidence. VVAH's S6 runs **one** verifier |
| Quality rubric | `agents/security-officer.md` | a boilerplate report **blocks gate:ship**; with no evidence at all the agent must return BLOCKED rather than a clean pass |

Trust boundaries are covered upstream too: `skills/great_cto/playbooks/threat-model.md`
requires a Mermaid dataflow with trust zones, and every Critical/High must map to
a concrete test or runtime control.

**The one real gap** is narrow: the evidence gate proves the vulnerable code
exists, but does not mechanically require proving reachability from an untrusted
entry point — that is asked for in prose only. **Fix is an eval case, not a
feature:** add to `tests/eval/EVAL-security-officer-finding-gate.md` — "SQL
injection in an admin script unreachable from outside → must be an Observation,
not a P1."

### V2 — a pre-run `estimate` command · **ALREADY HAVE (as a command); the loop was the gap**

Forecasting exists in two places already: `scripts/hooks/cost-guard.mjs` runs on
`UserPromptSubmit` (before the prompt) with a `ROUGH_COST_USD` table and
budget-remaining maths, and `agents/architect.md` Checkpoint A prints a pipeline
cost estimate before the ARCH doc, with a separate `gate:cost` for AI-heavy
archetypes. A third command would duplicate both. **Not built.**

What *was* missing — and **has now been built** — is the feedback loop: no
estimate was ever compared against measured spend. See `scripts/lib/cost-drift.mjs`.

Also worth recording, because the original justification was wrong: the pain that
motivated this was **session-quota exhaustion, not dollars**. A dollar forecast
would not have predicted it. The actual cause was found separately —
`quota-check.mjs` only read `~/.claude/.credentials.json` while macOS keeps OAuth
in the Keychain, so the warning never fired on this platform at all.

---

## 2026-07-23 — Agent Flow (patoles/agent-flow) · **SKIP (duplicates the board)**

A real-time visualiser of Claude Code / Codex execution — a node graph of tool
calls, fed by the same hooks great_cto already uses.

It shows the *trace* (what the agent did); the board shows *state and outcome*
(stage, gates, cost, QA/security verdicts) — which is what running a pipeline
needs. It would also add a second process, a second port, and its own opt-out
telemetry (on by default in `npx` mode), against this project's off-by-default rule.

**What would change the answer:** wanting an execution trace specifically for
debugging a single session. Even then, the cheaper move is a board tab — the hook
data is already flowing — not a second product.
