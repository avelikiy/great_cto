#!/usr/bin/env python3
"""
Structural validator for tests/eval/EVAL-*.md → pack mapping.

For every EVAL-*.md in tests/eval/, verifies:
  1. References a pack from skills/great_cto/packs/ in its "Pack:" line.
  2. References a TM-template at skills/great_cto/templates/TM-{slug}.md.
  3. Lists at least one of: gate:* OR a reviewer agent name.
  4. Has the required canonical sections (Scenario, Cases, Pass threshold, Cross-refs, History).

Exit 0 on success, 1 with a human-readable error report otherwise.

Run from repository root:
    python3 tests/structural/test_eval_pack_mapping.py
"""

from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
EVAL_DIR = ROOT / "tests" / "eval"
PACKS_DIR = ROOT / "skills" / "great_cto" / "packs"
TEMPLATES_DIR = ROOT / "skills" / "great_cto" / "templates"

REQUIRED_SECTIONS = ["## Scenario", "## Cases", "## Pass threshold", "## Cross-refs", "## History"]

PACK_RE = re.compile(r"Pack:\s*([\w-]+)", re.IGNORECASE)
TM_RE = re.compile(r"TM-([\w-]+)")
GATE_RE = re.compile(r"gate:[\w-]+")


def main() -> int:
    errors: list[str] = []
    eval_files = sorted(EVAL_DIR.glob("EVAL-*.md"))
    if not eval_files:
        print("FAIL — no tests/eval/EVAL-*.md files found")
        return 1

    available_packs = {p.stem for p in PACKS_DIR.glob("*.md")}
    available_tms = {p.stem for p in TEMPLATES_DIR.glob("TM-*.md")}

    for path in eval_files:
        text = path.read_text(encoding="utf-8", errors="replace")
        rel = path.relative_to(ROOT)

        # Required canonical sections (look-ahead, not strict-order)
        for section in REQUIRED_SECTIONS:
            if section not in text:
                errors.append(f"{rel}: missing section '{section}'")

        # Pack reference
        m = PACK_RE.search(text)
        if not m:
            errors.append(f"{rel}: no 'Pack:' reference found")
        else:
            pack_name = m.group(1)
            if pack_name not in available_packs:
                errors.append(f"{rel}: references unknown pack '{pack_name}' "
                              f"(available: {sorted(available_packs)})")

        # TM-template reference
        tm_matches = TM_RE.findall(text)
        if not tm_matches:
            errors.append(f"{rel}: no TM-* template reference")
        else:
            unresolved = [t for t in tm_matches if f"TM-{t}" not in available_tms]
            if unresolved and all(t not in {x.replace("TM-", "") for x in available_tms} for t in tm_matches):
                errors.append(f"{rel}: TM template(s) {tm_matches} not found in templates/")

        # Gate or reviewer reference
        if not GATE_RE.search(text):
            errors.append(f"{rel}: no gate:* reference (cross-ref to human-gate)")

    if errors:
        print(f"FAIL — eval pack mapping ({len(errors)} issues):")
        for e in errors:
            print(f"  • {e}")
        return 1
    print(f"OK — all {len(eval_files)} EVAL files reference valid packs + TM-templates + gates")
    return 0


if __name__ == "__main__":
    sys.exit(main())
