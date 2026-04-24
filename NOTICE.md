# Third-Party Attribution

`great_cto` bundles, adapts, or references work from the projects below. The
original license of each work is preserved; see the specific files for full
terms.

## agent-style (yzhao062/agent-style)

- Upstream: https://github.com/yzhao062/agent-style (pinned v0.3.1)
- Upstream license: CC-BY-4.0 (documentation / rules) and MIT (enforcement lists)
- Adapted files in this repo:
  - `skills/great_cto/prose-style.md` — subset of 7 rules from upstream `RULES.md`
    (CC-BY-4.0). Directive text and one BAD/GOOD pair per rule adapted;
    rationale condensed for agent-context budget. Upstream carries 5+ examples
    per rule and per-source citations (Strunk & White, Orwell, Pinker, Gopen &
    Swan) — consult upstream for the full blocks.
  - `enforcement/prose-deny.txt` — reference-only subset of upstream
    `enforcement/deny-phrases.txt` (MIT). Trimmed to phrases that fire in
    great_cto agent output (audit findings, QA/CSO reports, CHANGELOG). The
    file is a human-readable reference; the mechanical warn-grep in
    `agents/qa-engineer.md` inlines a smaller curated pattern list.

Applied rules: RULE-01 (curse of knowledge), RULE-03 (abstract vs concrete),
RULE-04 (needless words), RULE-05 (dying metaphors), RULE-08 (claim
calibration), RULE-A (bullet overuse), RULE-H (citation discipline for
factual claims).
