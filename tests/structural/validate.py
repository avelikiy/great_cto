#!/usr/bin/env python3
"""
Structural validator for great_cto plugin.

Checks that plugin artefacts are internally consistent BEFORE any runtime:
 1. plugin.json parses and has required top-level keys + valid version.
 2. Every command file has a parseable YAML frontmatter.
 3. Every agent file has a parseable YAML frontmatter with a name, model,
    tools, maxTurns, timeout.
 4. The SessionStart CMD-copy loop references only command files that exist,
    and every command file in commands/ is listed in the CMD loop (or
    explicitly exempted).
 5. TYPE_MAP.md has at least one backticked slug per row.
 6. Every keyword in TYPE_MAP.md maps to a slug that appears in at least
    one row's right-hand column (no dangling keywords).

Exit 0 on success, 1 with a human-readable error report otherwise.

Run from repository root:
    python3 tests/structural/validate.py
"""

from __future__ import annotations

import json
import pathlib
import re
import sys
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parents[2]

# Commands in the repo that are intentionally hidden from the SessionStart
# CMD-copy loop (e.g. experimental or scheduler-only).
EXEMPT_FROM_CMD_LOOP: set[str] = set()

REQUIRED_AGENT_FIELDS = {"name", "description", "model", "tools", "maxTurns", "timeout"}


def fail(errors: list[str]) -> None:
    print("FAIL — structural validation found issues:\n", file=sys.stderr)
    for e in errors:
        print(f"  - {e}", file=sys.stderr)
    sys.exit(1)


def parse_frontmatter(md_text: str) -> dict[str, Any]:
    """Parse the --- YAML block at the start of a markdown file.

    Intentionally minimal: we only need flat string/list fields. We avoid a
    yaml dependency to keep tests fast and self-contained.
    """
    if not md_text.startswith("---"):
        raise ValueError("file does not start with '---' frontmatter")
    try:
        _, fm, _ = md_text.split("---", 2)
    except ValueError as e:
        raise ValueError("unterminated frontmatter block") from e
    data: dict[str, Any] = {}
    for raw_line in fm.strip().splitlines():
        line = raw_line.rstrip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        data[key.strip()] = value.strip().strip('"\'')
    return data


def check_plugin_json(errors: list[str]) -> dict[str, Any] | None:
    pj = ROOT / ".claude-plugin" / "plugin.json"
    if not pj.is_file():
        errors.append(f"missing {pj}")
        return None
    try:
        data = json.loads(pj.read_text())
    except json.JSONDecodeError as e:
        errors.append(f"plugin.json invalid JSON: {e}")
        return None
    for required in ("name", "id", "version", "hooks"):
        if required not in data:
            errors.append(f"plugin.json missing key: {required}")
    version = str(data.get("version", ""))
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        errors.append(f"plugin.json version must be semver, got: {version!r}")
    return data


def extract_cmd_loop(plugin_data: dict[str, Any]) -> list[str]:
    hooks = plugin_data.get("hooks", {})
    start = hooks.get("SessionStart", [])
    commands: list[str] = []
    for group in start:
        for hook in group.get("hooks", []):
            cmd = hook.get("command", "")
            match = re.search(r"for CMD in ([a-z][a-z0-9\s\-]*?);\s*do", cmd)
            if match:
                commands.extend(match.group(1).split())
    return commands


def check_commands(plugin_data: dict[str, Any], errors: list[str]) -> None:
    cmd_dir = ROOT / "commands"
    if not cmd_dir.is_dir():
        errors.append("commands/ directory missing")
        return
    on_disk = {p.stem for p in cmd_dir.glob("*.md")}
    in_loop = set(extract_cmd_loop(plugin_data))

    missing_files = in_loop - on_disk
    missing_loop = on_disk - in_loop - EXEMPT_FROM_CMD_LOOP

    for cmd in sorted(missing_files):
        errors.append(f"CMD loop references non-existent command: {cmd}")
    for cmd in sorted(missing_loop):
        errors.append(f"command on disk but not in CMD loop: {cmd}")

    # Frontmatter sanity on each command file.
    for path in sorted(cmd_dir.glob("*.md")):
        try:
            fm = parse_frontmatter(path.read_text())
        except ValueError as e:
            errors.append(f"{path.name}: {e}")
            continue
        if "description" not in fm:
            errors.append(f"{path.name}: missing 'description' in frontmatter")


def check_agents(errors: list[str]) -> None:
    agent_dir = ROOT / "agents"
    if not agent_dir.is_dir():
        errors.append("agents/ directory missing")
        return
    for path in sorted(agent_dir.glob("*.md")):
        try:
            fm = parse_frontmatter(path.read_text())
        except ValueError as e:
            errors.append(f"{path.name}: {e}")
            continue
        for field in REQUIRED_AGENT_FIELDS:
            if field not in fm:
                errors.append(f"{path.name}: missing '{field}' in frontmatter")


def check_type_map(errors: list[str]) -> None:
    tm = ROOT / "skills" / "great_cto" / "TYPE_MAP.md"
    if not tm.is_file():
        errors.append(f"missing {tm}")
        return
    rows = 0
    for lineno, raw in enumerate(tm.read_text().splitlines(), start=1):
        if not raw.startswith("|") or raw.startswith("|--") or "keyword" in raw.lower():
            continue
        if raw.strip() == "|":
            continue
        # row shape: | keywords | `slug` [, `slug`] |
        cells = [c.strip() for c in raw.strip().strip("|").split("|")]
        if len(cells) < 2:
            continue
        # Slugs may live in the first cell (archetype-row format) or the last
        # cell (keyword-to-slug row format). Accept either. Rows with no
        # backticks are header rows of sub-tables — skip silently.
        slugs = re.findall(r"`([a-z0-9-]+)`", raw)
        if not slugs:
            continue
        rows += 1
    if rows == 0:
        errors.append("TYPE_MAP.md has no valid rows")


def main() -> int:
    errors: list[str] = []
    plugin_data = check_plugin_json(errors)
    if plugin_data is not None:
        check_commands(plugin_data, errors)
    check_agents(errors)
    check_type_map(errors)
    if errors:
        fail(errors)
    print("OK — structural validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
