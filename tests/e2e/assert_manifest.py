#!/usr/bin/env python3
"""Assert a fixture workdir satisfies its expected/manifest.json.

Usage:
    assert_manifest.py <manifest.json> <workdir>

The manifest schema is defined informally in
tests/fixtures/<fixture>/expected/manifest.json — see cli-tool-python for
the reference example. This script is lenient: it skips checks for the
"after_audit" section when no audit artefacts are found at all (i.e. when the
runner was invoked in --assert-only mode without an actual audit), so the
harness still verifies fixture bootstrapping without requiring live API calls.
"""

from __future__ import annotations

import json
import pathlib
import re
import subprocess
import sys
from typing import Any

OK = "\033[32m✓\033[0m"
FAIL = "\033[31m✗\033[0m"


def fail(message: str) -> None:
    print(f"{FAIL} {message}", file=sys.stderr)
    sys.exit(1)


def ok(message: str) -> None:
    print(f"{OK} {message}")


def check_files_exist(workdir: pathlib.Path, patterns: list[str]) -> list[str]:
    errors: list[str] = []
    for pattern in patterns:
        matches = list(workdir.glob(pattern))
        if not matches:
            errors.append(f"expected file matching {pattern!r} — none found")
    return errors


def check_project_md(workdir: pathlib.Path, required_patterns: list[str]) -> list[str]:
    path = workdir / ".great_cto" / "PROJECT.md"
    if not path.is_file():
        return [f"expected {path}"]
    text = path.read_text()
    errors: list[str] = []
    for pattern in required_patterns:
        if not re.search(pattern, text, re.MULTILINE):
            errors.append(f"PROJECT.md missing line matching {pattern!r}")
    return errors


def check_verdict_log(workdir: pathlib.Path, pattern: str) -> list[str]:
    logs = list((workdir / ".great_cto" / "verdicts").glob("*.log"))
    if not logs:
        return ["no .great_cto/verdicts/*.log — post-condition never wrote"]
    combined = "\n".join(p.read_text() for p in logs)
    if not re.search(pattern, combined):
        return [f"verdict log missing pattern {pattern!r}"]
    return []


def check_beads(workdir: pathlib.Path, topics: list[str], min_n: int, max_n: int) -> list[str]:
    errors: list[str] = []
    try:
        out = subprocess.run(
            ["bd", "list", "--status", "open"],
            cwd=workdir,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except FileNotFoundError:
        return ["bd CLI not installed — skipping Beads checks"]
    if out.returncode != 0:
        return [f"bd list failed: {out.stderr.strip()}"]
    body = out.stdout.lower()
    n = len([ln for ln in body.splitlines() if ln.strip()])
    if n < min_n:
        errors.append(f"only {n} open Beads issues (expected ≥ {min_n})")
    if n > max_n:
        errors.append(f"{n} open Beads issues (expected ≤ {max_n}) — agent may be over-filing")
    missing_topics = [t for t in topics if t.lower() not in body]
    if missing_topics:
        errors.append(f"Beads missing coverage for topics: {missing_topics}")
    return errors


def audit_ran(workdir: pathlib.Path) -> bool:
    return any((workdir / "docs" / "audit").glob("AUDIT-*.md"))


def cso_ran(workdir: pathlib.Path) -> bool:
    return any((workdir / "docs" / "security").glob("CSO-*.md"))


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: assert_manifest.py <manifest.json> <workdir>", file=sys.stderr)
        return 2
    manifest_path = pathlib.Path(sys.argv[1])
    workdir = pathlib.Path(sys.argv[2])
    manifest: dict[str, Any] = json.loads(manifest_path.read_text())
    all_errors: list[str] = []

    fixture = manifest.get("fixture", "?")
    print(f"→ asserting fixture={fixture} workdir={workdir}")

    if audit_ran(workdir):
        after = manifest.get("after_audit", {})
        all_errors += check_files_exist(workdir, after.get("files_must_exist", []))
        all_errors += check_project_md(
            workdir, after.get("project_md_must_contain_lines_matching", [])
        )
        pat = after.get("verdict_log_must_contain_pattern")
        if pat:
            all_errors += check_verdict_log(workdir, pat)
        topics = after.get("beads_issues_must_cover_topics", [])
        all_errors += check_beads(
            workdir,
            topics,
            after.get("min_beads_open", 0),
            after.get("max_beads_open", 10_000),
        )
    else:
        ok("audit artefacts not present — skipping after_audit assertions (assert-only mode)")

    # Optional after_cso block — used by trading-system-rust to assert the
    # security gate actually fires on P0-SEC findings.
    if "after_cso" in manifest:
        if cso_ran(workdir):
            after_cso = manifest["after_cso"]
            all_errors += check_files_exist(workdir, after_cso.get("files_must_exist", []))
            pat = after_cso.get("verdict_log_must_contain_pattern")
            if pat:
                all_errors += check_verdict_log(workdir, pat)
        else:
            ok("CSO artefacts not present — skipping after_cso assertions")

    # Fixture bootstrap is always checked regardless of audit state.
    # README is required everywhere; at least one project-manifest must exist.
    if not (workdir / "README.md").is_file():
        all_errors.append("fixture missing bootstrap file: README.md")
    manifests = ["pyproject.toml", "package.json", "Cargo.toml", "go.mod", "pom.xml"]
    if not any((workdir / m).is_file() for m in manifests):
        all_errors.append(f"fixture missing any project manifest ({manifests})")

    if all_errors:
        for e in all_errors:
            print(f"{FAIL} {e}", file=sys.stderr)
        print(f"\nFAIL: {len(all_errors)} assertion(s) failed", file=sys.stderr)
        return 1

    ok(f"all assertions passed for {fixture}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
