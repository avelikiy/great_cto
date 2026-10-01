#!/usr/bin/env python3
"""
Structural validator for the 15 new domain reviewers (Wave 1-3).

For each reviewer in NEW_REVIEWERS, verifies:
  1. agents/{name}.md exists with required frontmatter (name, model, tools,
     maxTurns, timeout, applies_to).
  2. A TM-template at skills/great_cto/templates/TM-{slug}.md exists.
  3. A pack overlay at skills/great_cto/packs/{pack}.md exists when the
     reviewer is part of a pack.
  4. The reviewer is reachable as `/review --domain {domain}`: the domain table in
     commands/review.md has a row for the domain naming this agent.
  5. Plugin SessionStart copy-loop in .claude-plugin/plugin.json registers
     the agent.

Exit 0 on success, 1 with a human-readable error report otherwise.

Run from repository root:
    python3 tests/structural/test_new_reviewers.py
"""

from __future__ import annotations

import json
import pathlib
import re
import sys
from typing import Iterable

ROOT = pathlib.Path(__file__).resolve().parents[2]
AGENTS = ROOT / "agents"
TEMPLATES = ROOT / "skills" / "great_cto" / "templates"
PACKS = ROOT / "skills" / "great_cto" / "packs"
COMMANDS = ROOT / "commands"
PLUGIN_JSON = ROOT / ".claude-plugin" / "plugin.json"

# Reviewer registry: (agent name, TM slug, pack name, /review --domain name)
# pack may be None if the reviewer has no domain-specific pack overlay yet.
NEW_REVIEWERS: list[tuple[str, str, str | None, str | None]] = [
    ("voice-ai-reviewer",                "voice",    "voice-pack",            "voice"),
    ("hr-ai-reviewer",                   "hrai",     "hr-ai-pack",            "hr-ai"),
    ("api-platform-reviewer",            "api",      "api-platform-pack",     "api"),
    ("legal-reviewer",                   "legal",    "legaltech-pack",        "legal"),
    ("rcm-reviewer",                     "rcm",      "rcm-pack",              "rcm"),
    ("procurement-reviewer",             "procurement", "procurement-pack",   "procurement"),
    ("accounting-reviewer",              "accounting",  "accounting-pack",    "accounting"),
    ("msp-reviewer",                     "msp",         "msp-pack",           "msp"),
    ("tax-reviewer",                     "tax",         "tax-pack",           "tax"),
]

REQUIRED_AGENT_FIELDS = {"name", "description", "model", "tools", "maxTurns", "timeout", "applies_to"}

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)


def parse_frontmatter(path: pathlib.Path) -> dict[str, str] | None:
    """Cheap YAML frontmatter scrape — enough for required-field presence."""
    text = path.read_text(encoding="utf-8", errors="replace")
    m = FRONTMATTER_RE.match(text)
    if not m:
        return None
    fields: dict[str, str] = {}
    for line in m.group(1).splitlines():
        line = line.rstrip()
        if not line or line.startswith(" "):
            # multi-line / list continuation — not validated here
            continue
        if ":" in line:
            k, _, v = line.partition(":")
            fields[k.strip()] = v.strip()
    return fields


def check_agent(name: str, errors: list[str]) -> dict[str, str] | None:
    p = AGENTS / f"{name}.md"
    if not p.exists():
        errors.append(f"agent file missing: {p}")
        return None
    fm = parse_frontmatter(p)
    if fm is None:
        errors.append(f"agent has no YAML frontmatter: {p}")
        return None
    missing = REQUIRED_AGENT_FIELDS - set(fm.keys())
    if missing:
        errors.append(f"agent {name} missing frontmatter fields: {sorted(missing)}")
    return fm


def check_tm_template(slug: str, errors: list[str]) -> None:
    p = TEMPLATES / f"TM-{slug}.md"
    if not p.exists():
        errors.append(f"TM-template missing: {p}")
        return
    text = p.read_text(encoding="utf-8", errors="replace")
    if "<!-- HANDOFF -->" not in text:
        errors.append(f"TM-template missing HANDOFF block: {p}")


def check_pack(pack: str | None, errors: list[str]) -> None:
    if pack is None:
        return
    p = PACKS / f"{pack}.md"
    if not p.exists():
        errors.append(f"pack overlay missing: {p}")


REVIEW_CMD = COMMANDS / "review.md"
DOMAIN_ROW_RE = re.compile(r"^\|\s*`([a-z0-9-]+)`\s*\|[^|]*\|\s*`([a-z0-9-]+)`\s*\|", re.MULTILINE)


def check_domain(agent: str, domain: str | None, errors: list[str]) -> None:
    """The reviewer must be reachable as `/review --domain <domain>`."""
    if domain is None:
        return
    if not REVIEW_CMD.exists():
        errors.append(f"/review command missing: {REVIEW_CMD}")
        return
    rows = dict(DOMAIN_ROW_RE.findall(REVIEW_CMD.read_text(encoding="utf-8")))
    if domain not in rows:
        errors.append(f"/review --domain {domain}: no row in the domain table of {REVIEW_CMD}")
    elif rows[domain] != agent:
        errors.append(f"/review --domain {domain} routes to {rows[domain]}, expected {agent}")


def check_plugin_registration(items: Iterable[str], errors: list[str]) -> None:
    text = PLUGIN_JSON.read_text(encoding="utf-8", errors="replace")
    # The SessionStart whitelist names every agent. Domain reviews have no command of
    # their own any more — they run as `/review --domain <name>` (checked above).
    for agent_name in items:
        if agent_name not in text:
            errors.append(f"plugin.json SessionStart loop missing agent: {agent_name}")


def main() -> int:
    errors: list[str] = []
    plugin_items: list[str] = []
    for agent, slug, pack, domain in NEW_REVIEWERS:
        check_agent(agent, errors)
        check_tm_template(slug, errors)
        check_pack(pack, errors)
        check_domain(agent, domain, errors)
        plugin_items.append(agent)
    check_plugin_registration(plugin_items, errors)

    if errors:
        print("FAIL — new-reviewer structural checks:")
        for e in errors:
            print(f"  • {e}")
        return 1
    n = len(NEW_REVIEWERS)
    print(f"OK — all {n} new reviewers wired (agent + TM-template + pack + /review --domain + plugin.json)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
