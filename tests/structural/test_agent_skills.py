#!/usr/bin/env python3
"""
Integration test: agent × archetype → skill path resolution.

For every skill referenced in the AGENT_SKILLS heredoc inside
scripts/skill-discover.sh, verify that a corresponding .md file exists
somewhere in the skills/great_cto/ tree.

Skill name resolution rules (mirroring skill-discover.sh logic):
  1. Strip leading '+' (archetype-extra marker).
  2. If name starts with 'superpowers:' — external skill, skip (not bundled).
  3. Search in order:
       skills/great_cto/references/<name>.md
       skills/great_cto/templates/<name>.md
       skills/great_cto/packs/<name>.md
       skills/great_cto/playbooks/<name>.md
       skills/great_cto/<name>.md

Exit 0 on success, 1 with a human-readable error report otherwise.

Run from repository root:
    python3 tests/structural/test_agent_skills.py
"""

from __future__ import annotations

import json
import pathlib
import re
import sys
from typing import Iterator

ROOT = pathlib.Path(__file__).resolve().parents[2]
SKILL_DISCOVER = ROOT / "scripts" / "skill-discover.sh"
SKILLS_ROOT = ROOT / "skills" / "great_cto"

# Sub-directories searched (in order) when resolving a bare skill name.
SEARCH_DIRS = [
    SKILLS_ROOT / "references",
    SKILLS_ROOT / "templates",
    SKILLS_ROOT / "packs",
    SKILLS_ROOT / "playbooks",
    SKILLS_ROOT,
]


def extract_agent_skills(script_text: str) -> dict:
    """Extract the JSON object from the AGENT_SKILLS heredoc."""
    match = re.search(
        r"read\s+-r\s+-d\s+''\s+AGENT_SKILLS\s+<<'JSON'\s+\|\|\s+true\n(.*?)\nJSON",
        script_text,
        re.DOTALL,
    )
    if not match:
        raise ValueError(
            "Could not find AGENT_SKILLS heredoc in skill-discover.sh. "
            "Expected: read -r -d '' AGENT_SKILLS <<'JSON' || true ... JSON"
        )
    raw_json = "{" + match.group(1) + "}"
    try:
        return json.loads(raw_json)
    except json.JSONDecodeError as e:
        raise ValueError(f"AGENT_SKILLS heredoc is not valid JSON: {e}") from e


def iter_skill_names(agent_skills: dict) -> Iterator[tuple[str, str, str, str]]:
    """Yield (agent, archetype, raw_skill, resolved_name) tuples."""
    for agent, arch_map in agent_skills.items():
        for archetype, skills in arch_map.items():
            for raw in skills:
                name = raw.lstrip("+")
                yield agent, archetype, raw, name


def resolve_skill(name: str) -> pathlib.Path | None:
    """Return the Path to the skill file or None if not found."""
    for directory in SEARCH_DIRS:
        candidate = directory / f"{name}.md"
        if candidate.is_file():
            return candidate
    return None


def run() -> int:
    if not SKILL_DISCOVER.is_file():
        print(f"ERROR: {SKILL_DISCOVER} not found", file=sys.stderr)
        return 1

    try:
        agent_skills = extract_agent_skills(SKILL_DISCOVER.read_text())
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1

    errors: list[str] = []
    skipped: list[str] = []
    checked = 0

    for agent, archetype, raw, name in iter_skill_names(agent_skills):
        # External skills (superpowers:, beads:, etc.) are not bundled — skip.
        if ":" in name:
            skipped.append(f"  skip external  {name!r}  (agent={agent}, arch={archetype})")
            continue

        checked += 1
        path = resolve_skill(name)
        if path is None:
            errors.append(
                f"  MISSING  {name!r}  (agent={agent}, archetype={archetype}, raw={raw!r})"
            )

    # Report
    total_agents = len(agent_skills)
    total_archetypes = sum(len(v) for v in agent_skills.values())

    if errors:
        print(
            f"FAIL — {len(errors)} skill(s) referenced but not found "
            f"(checked {checked}, skipped {len(skipped)} external):\n",
            file=sys.stderr,
        )
        for e in errors:
            print(e, file=sys.stderr)
        print(
            f"\nSearched directories:\n"
            + "\n".join(f"  {d}" for d in SEARCH_DIRS),
            file=sys.stderr,
        )
        return 1

    print(
        f"PASS — all {checked} bundled skill references resolve "
        f"({total_agents} agents × {total_archetypes} archetype entries, "
        f"{len(skipped)} external skipped)"
    )
    if skipped:
        for s in skipped:
            print(s)
    return 0


if __name__ == "__main__":
    sys.exit(run())
