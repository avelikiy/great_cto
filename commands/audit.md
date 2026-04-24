---
description: "Audit an existing codebase. Detects stack, finds gaps, creates tasks, generates PROJECT.md."
argument-hint: "[optional: 'eval' | 'lint' | focus area, e.g. 'focus on security']"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---

You are the Great CTO audit command for **existing projects**.

Fast by default (v1.0.43+): phases 1-4 run in parallel via sub-agents + CVE scan cached 24h. Typical runtime ~1-1.5 min on medium projects. No separate refresh mode — just re-run `/audit`.

## Action: `eval` — run eval harness

If argument is `eval` (i.e. `/audit eval`):

```bash
EVAL_DIR="tests/eval"
ls "$EVAL_DIR"/EVAL-*.md 2>/dev/null | sort || echo "NO_EVALS"
```

If no eval files found:
```
No eval cases in tests/eval/.
Run /audit to create initial eval cases, or see tests/eval/ for the format.
```

If eval files exist — for each `EVAL-*.md`:
1. Read the file — extract `## Assertions` bash block
2. Run each assertion
3. Collect PASS / FAIL / WARN per assertion
4. Report summary:

```
/audit eval — Eval Harness Results

EVAL-001 CRUD endpoint:       PASS (3/3)
EVAL-002 Auth service:        PASS (4/4)
EVAL-003 Discovery guard:     WARN (manual verification needed)
EVAL-004 Hotfix nano:         PASS (2/2)
EVAL-005 Security block:      FAIL (1/3) — CSO report missing

Score: 4/5 passing | 1 failing | 1 manual

FAILURES:
  EVAL-005: docs/security/CSO-*.md not found
  → Run the auth-service eval scenario first to generate the artifact

MANUAL CHECKS:
  EVAL-003: discovery guard behavior requires live /start run
```

Exit after eval report. Do NOT proceed with normal audit.

---

## Action: `lint` — scan artefacts against anti-pattern blocklist

If argument is `lint` (i.e. `/audit lint`):

Scans `docs/architecture/`, `docs/threat-models/`, `docs/releases/SBOM-*.json`,
`docs/postmortems/`, `.great_cto/verdicts/` against rules in
`skills/great_cto/references/anti-patterns.md`. Advisory findings, not blocking.
Respects `<!-- anti-pattern-waiver: <rule-id> reason:<why> -->` lines.

```bash
python3 - <<'PY' 2>/dev/null
import os, re, glob, json
from pathlib import Path

FINDINGS = []

def flag(rule, path, line_no, snippet):
    FINDINGS.append((rule, path, line_no, snippet.strip()[:120]))

def has_waiver(line, rule):
    return f"anti-pattern-waiver: {rule}" in line

def scan_file(path, rules):
    try:
        lines = Path(path).read_text(encoding='utf-8', errors='ignore').splitlines()
    except Exception: return
    text = "\n".join(lines)
    for rule_id, pattern, needs_section, section_pattern in rules:
        if needs_section:
            # Structural rule: section MUST exist
            if not re.search(section_pattern, text, re.I | re.M):
                flag(rule_id, path, 0, f"missing section: {section_pattern}")
            continue
        for i, line in enumerate(lines, 1):
            if re.search(pattern, line, re.I) and not has_waiver(line, rule_id):
                flag(rule_id, path, i, line)

# ARCH rules
ARCH_RULES = [
    ("A1", None, True,  r"^##\s+(Non-goals?|Out of scope)"),
    ("A2", r"\b(scalable|reliable|performant|robust|cutting-edge|best-in-class|world-class)\b", False, None),
    ("A3", r"\b(a database|a queue|a cache|some storage|some database)\b", False, None),
    ("A4", r"(monitoring|logging|tracing|observability).{0,30}(later|phase 2|TODO|future)", False, None),
    ("A6", r"\b(rewrite|greenfield)\b", False, None),  # pair with missing Migration manually
]
for p in glob.glob("docs/architecture/ARCH-*.md"):
    scan_file(p, ARCH_RULES)
    # A8: Security section exists but too thin
    try:
        t = Path(p).read_text()
        m = re.search(r"^##\s+Security\s*\n(.*?)(?=^##|\Z)", t, re.M|re.S)
        if m and len(m.group(1).strip().splitlines()) < 3:
            flag("A8", p, 0, "Security section is < 3 lines")
    except: pass

# Threat model rules
TM_RULES = [
    ("T1", r"mitigation.*:.*\b(validation|sanitis[ae]tion)\s*$", False, None),
    ("T3", None, True, r"^##\s+Accepted risks?"),
    ("T4", None, True, r"(mermaid|```mermaid|flowchart|graph\s+(LR|TD))"),
]
for p in glob.glob("docs/threat-models/TM-*.md"):
    scan_file(p, TM_RULES)

# SBOM rules (JSON)
for p in glob.glob("docs/releases/SBOM-*.json"):
    try:
        data = json.loads(Path(p).read_text())
        comps = data.get("components", [])
        if len(comps) < 5:
            flag("S1", p, 0, f"only {len(comps)} components — tool may not have run")
        if comps and not any("hashes" in c for c in comps[:10]):
            flag("S2", p, 0, "no integrity hashes on components")
        range_versions = [c for c in comps if re.search(r"[\^~>*]", str(c.get("version","")))]
        if range_versions:
            flag("S3", p, 0, f"{len(range_versions)} components with version ranges (should be pinned)")
    except Exception: pass

# PM rules
PM_RULES = [
    ("P1", r"root cause.*:.*\b(human error|operator (mistake|error)|user error)\b", False, None),
]
for p in glob.glob("docs/postmortems/PM-*.md"):
    scan_file(p, PM_RULES)

# PM-SEC must have Notification log
for p in glob.glob("docs/postmortems/PM-SEC-*.md"):
    t = Path(p).read_text(errors='ignore')
    if not re.search(r"^##\s+Notification log", t, re.M|re.I):
        flag("P6", p, 0, "PM-SEC missing Notification log section")

# Cross-doc link rot (L1–L4) — scan all docs/**/*.md
import time
ALL_DOCS = glob.glob("docs/**/*.md", recursive=True)
DOC_SET = set(os.path.abspath(p) for p in ALL_DOCS)
# Build inline-ref inventory for L2 (name -> absolute path)
ARTEFACT_INDEX = {}
for p in ALL_DOCS + glob.glob("docs/releases/SBOM-*.json"):
    ARTEFACT_INDEX[os.path.basename(p)] = os.path.abspath(p)

MD_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+\.md)(?:#[^)]*)?\)")
ARTEFACT_REF_RE = re.compile(r"\b((?:ARCH|PM|PM-SEC|ADR|RFC|TM|SBOM|CSO|QA|AUDIT|PENTEST|RISK|USER-SPEC|RELEASE)-[A-Za-z0-9._-]+\.(?:md|json))\b")
TEMPORAL_RE = re.compile(r"\b(current version|latest release|TBD|to be determined)\b", re.I)

# L3 incoming-link index
incoming = {os.path.abspath(p): 0 for p in ALL_DOCS}
for p in ALL_DOCS:
    try: text = Path(p).read_text(errors='ignore')
    except Exception: continue
    base_dir = os.path.dirname(os.path.abspath(p))
    for m in MD_LINK_RE.finditer(text):
        href = m.group(2)
        if href.startswith("http"): continue
        target = os.path.normpath(os.path.join(base_dir, href))
        if target in incoming:
            incoming[target] += 1
    for m in ARTEFACT_REF_RE.finditer(text):
        name = m.group(1)
        if name in ARTEFACT_INDEX:
            incoming[ARTEFACT_INDEX[name]] = incoming.get(ARTEFACT_INDEX[name], 0) + 1

NOW = time.time()
# Skip template placeholders like <slug>, <feature>, <YYYY-MM-DD>, {name}, ...
PLACEHOLDER_RE = re.compile(r"[<{][^>}]+[>}]|\.\.\.|N{2,}|\bfoo\b|\bbar\b|\bbaz\b|\bslug\b|\bfeature\b")
for p in ALL_DOCS:
    try:
        lines = Path(p).read_text(errors='ignore').splitlines()
        mtime = os.path.getmtime(p)
    except Exception: continue
    base_dir = os.path.dirname(os.path.abspath(p))
    p_abs = os.path.abspath(p)
    in_fence = False
    for i, line in enumerate(lines, 1):
        # Track fenced code blocks — treat them as examples, not real links
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence: continue
        # L1: ghost relative markdown link (skip placeholders)
        for m in MD_LINK_RE.finditer(line):
            href = m.group(2)
            if href.startswith("http") or has_waiver(line, "L1"): continue
            if PLACEHOLDER_RE.search(href): continue
            target = os.path.normpath(os.path.join(base_dir, href))
            if not os.path.exists(target):
                flag("L1", p, i, f"→ {href} (not found)")
        # L2: artefact ref in prose without backing file (skip placeholders)
        for m in ARTEFACT_REF_RE.finditer(line):
            name = m.group(1)
            if has_waiver(line, "L2") or PLACEHOLDER_RE.search(name): continue
            if name not in ARTEFACT_INDEX:
                flag("L2", p, i, f"ref {name} (no such file under docs/)")
        # L4: expired temporal marker in old doc
        if TEMPORAL_RE.search(line) and not has_waiver(line, "L4"):
            age_days = (NOW - mtime) / 86400
            if age_days > 90:
                flag("L4", p, i, f"'{TEMPORAL_RE.search(line).group(0)}' in doc {int(age_days)}d old")

# L3: orphan ADR/RFC
for pat in ("docs/adr/ADR-*.md", "docs/rfcs/RFC-*.md", "docs/decisions/ADR-*.md"):
    for p in glob.glob(pat):
        p_abs = os.path.abspath(p)
        # Ignore index/log files
        if os.path.basename(p).lower() in ("adr-index.md", "rfc-index.md", "decision-log.md"): continue
        if incoming.get(p_abs, 0) == 0:
            flag("L3", p, 0, "orphan — no incoming references from other docs")

# Report
if not FINDINGS:
    print("LINT: 0 anti-pattern findings. Artefacts look honest.")
else:
    by_rule = {}
    for f in FINDINGS:
        by_rule.setdefault(f[0], []).append(f)
    print(f"LINT: {len(FINDINGS)} finding(s) across {len(by_rule)} rule(s).\n")
    for rule in sorted(by_rule):
        for _, path, ln, snippet in by_rule[rule]:
            loc = f"{path}:{ln}" if ln else path
            print(f"  {rule}  {loc}")
            print(f"        {snippet}")
    print("\nSee skills/great_cto/references/anti-patterns.md for rule definitions.")
    print("Waive a false positive with: <!-- anti-pattern-waiver: <rule-id> reason:<why> -->")
PY
```

Exit after lint report. Do NOT proceed with normal audit.

---

## Guard: no code to audit

```bash
ls package.json Cargo.toml go.mod requirements.txt pyproject.toml pom.xml build.gradle 2>/dev/null | head -1
```

If no recognizable project file found AND no src/ or app/ directory:
```
Nothing to audit — no project detected in this directory.
Run /start to set up a new project instead.
```

## Guard: PROJECT.md already exists

```bash
cat .great_cto/PROJECT.md 2>/dev/null | head -5
```

If PROJECT.md exists → tell CTO:
```
This project is already configured (type: <type>).
Running audit anyway to find gaps and update config.
```
Continue — audit is always safe to re-run.

## Pre-audit: surface active risks

Before the agent runs, prepend the active-risks summary so both CTO and auditor see the current risk landscape — new gaps found by `/audit` can then be cross-referenced.

```bash
if [ -f "docs/risks/RISK-REGISTER.md" ]; then
  echo "=== ACTIVE RISKS (top 5) ==="
  awk '/## Active risks/,/^## /' docs/risks/RISK-REGISTER.md 2>/dev/null | \
    grep -E "^\| R-[0-9]+" | head -5
fi
```

## Deprecation auto-suggestions

As part of dependency scanning, detect stale packages (no releases > 24 months) and framework majors diverging from upstream. For each detected candidate, output an auto-suggest line the auditor reviews — do **not** auto-append to DEPRECATION-CALENDAR without CTO confirmation.

```bash
# Node: scan package.json vs npm latest, flag "last release > 2 years ago"
# Python: pip-audit metadata → date of last release
# Suggestions go to /tmp/deprecation-suggestions.txt for the auditor to review.
echo "See skills/great_cto/references/deprecations.md for what to flag and how."
```

## Vendor coverage scan

Detect calls to known third-party services (paid SaaS / critical free-tier) and flag any without a matching `docs/vendors/VENDOR-*.md`. See `skills/great_cto/references/vendors.md` for criticality thresholds.

```bash
# Known-vendor SDK patterns — extend as new integrations land.
VENDOR_PATTERNS="stripe auth0 openai anthropic twilio sendgrid datadog segment mixpanel firebase supabase vercel cloudflare"
MISSING=""
for VP in $VENDOR_PATTERNS; do
  FOUND_IN_DEPS=""
  for DEP in package.json requirements.txt pyproject.toml go.mod Cargo.toml Gemfile composer.json; do
    [ -f "$DEP" ] && grep -qi "\"$VP\\|$VP-\\|$VP_\\|/$VP/" "$DEP" 2>/dev/null && FOUND_IN_DEPS=1 && break
  done
  if [ -n "$FOUND_IN_DEPS" ]; then
    [ ! -f "docs/vendors/VENDOR-${VP}.md" ] && MISSING="$MISSING $VP"
  fi
done
[ -n "$MISSING" ] && echo "=== VENDOR DOCS MISSING (advisory) ===$MISSING" > /tmp/vendor-suggestions.txt
# Suggestions are advisory — auditor reviews, CTO confirms criticality before creating VENDOR-*.md.
```

## Cost-model coverage scan

For services deployed via IaC without a matching ARCH Cost Model section, emit an advisory finding. See `skills/great_cto/references/cost-model.md`.

```bash
IAC_FILES=$(ls *.tf terraform/*.tf helm/values.yaml k8s/*.yaml 2>/dev/null | head -20)
if [ -n "$IAC_FILES" ]; then
  # For each aws_instance / aws_db_instance / k8s Deployment resource name,
  # grep docs/architecture/ARCH-*.md for a "## Cost Model" section referencing the resource.
  NO_COST=0
  for ARCH in docs/architecture/ARCH-*.md; do
    [ -f "$ARCH" ] || continue
    grep -q "^## Cost Model" "$ARCH" || NO_COST=$((NO_COST+1))
  done
  [ "$NO_COST" -gt 0 ] && echo "=== COST MODEL GAP (advisory) === $NO_COST ARCH doc(s) missing Cost Model section"
fi
```

## Onboarding generation (first-run)

If `team-size ≥ 2` and `docs/onboarding/README.md` does not yet exist, invoke project-auditor for synthesis. See `skills/great_cto/references/onboarding.md`.

```bash
TEAM_SIZE=$(grep "^team-size:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' | tr -d '[:alpha:]')
if [ "${TEAM_SIZE:-1}" -ge 2 ] && [ ! -f "docs/onboarding/README.md" ]; then
  echo "Onboarding not yet generated — project-auditor will synthesize (see skills/great_cto/references/onboarding.md)"
fi
```

## Run audit

Spawn `great_cto-project-auditor` with this context (vary by MODE):

> "Run a full audit of this repository.
>
> Tasks (in order):
> 1. **Stack detection** — identify language, framework, runtime version, major dependencies
> 2. **Type classification** — map to one or more of the 73 types in TYPE_MAP.md → resolve to archetype. Primary + secondary.
> 3. **Gap analysis** — what's missing vs. the pipeline requirements for detected type:
>    - Tests (coverage estimate, test framework present?)
>    - CI/CD (pipeline file present?)
>    - Docs (README, ARCH docs, ADRs?)
>    - Security (dependency audit, secrets scan)
>    - Observability (logging, error tracking)
> 4. **Create Beads tasks** for each gap found:
>    `bd create "<gap description>" --type task --priority <0-3>`
>    Priority 0 = blocks deploy. Priority 1 = important. Priority 2 = nice to have.
> 5. **Write .great_cto/PROJECT.md** (overwrite if exists):
>    Use detected stack, type, and team size (estimate from git log authors).
>    Set review_mode: auto unless security-critical type (then: strict).
> 6. **Report** in this format:
>    ```
>    Audit complete — <project name>
>    Type: <primary>[+ <secondary>]
>    Stack: <summary>
>    Gaps found: <N> tasks created
>    Top priority: <highest priority gap>
>    Config: .great_cto/PROJECT.md
>    Run /inbox to see all tasks.
>    ```
>
> Focus area (if CTO specified): <argument or 'full audit'>
> Keep report concise — no section-by-section breakdown unless CTO asks."

## After agent completes

Tell CTO what was found in 2-3 lines. Do NOT repeat the agent's full output.
