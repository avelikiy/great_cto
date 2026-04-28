#!/usr/bin/env python3
"""
UserPromptSubmit hook for great_cto.

Sets the Claude session title to "<project-name> (<archetype>)" based on
.great_cto/PROJECT.md, so the session list is readable at a glance.

Outputs a JSON object to stdout (Claude Code hook protocol):
  {"sessionTitle": "<name> (<archetype>)"}

If PROJECT.md is missing or the fields are absent, outputs nothing (no title change).
"""

from __future__ import annotations

import json
import subprocess
import sys


def grep_first(pattern: str, path: str) -> str:
    """Return stripped first match of pattern in path, or empty string."""
    result = subprocess.run(
        ["grep", "-m1", pattern, path],
        capture_output=True,
        text=True,
    )
    return result.stdout.strip() if result.returncode == 0 else ""


def main() -> None:
    project_md = ".great_cto/PROJECT.md"

    try:
        raw_title = grep_first("^# ", project_md).lstrip("# ")
        raw_primary = grep_first("^primary:", project_md)
        archetype = raw_primary.split()[-1] if raw_primary else ""

        if raw_title and archetype:
            title = f"{raw_title} ({archetype})"
            print(json.dumps({"sessionTitle": title}))
    except Exception:  # noqa: BLE001
        # Never crash the hook — silently exit.
        pass


if __name__ == "__main__":
    main()
