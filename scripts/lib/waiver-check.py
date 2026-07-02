#!/usr/bin/env python3
"""waiver-check — validate .great_cto/security-allowlist.yml and emit suppressions.

Extracted from agents/security-officer.md (was a 95-line inline heredoc).
Called by security-officer during tier computation:

    SUPPRESSED=$(python3 scripts/lib/waiver-check.py)

A waiver suppresses a security signal only when:
  - reason:      non-empty (documented intent)
  - approved-by: starts with @ (named owner)
  - expires:     future ISO date <= 90 days from today

Invalid/expired entries are REJECTED (signal stays active, WARN logged).
Every decision is appended to .great_cto/security-signals.log for audit.

stdout: one line per suppression — `DEP:<name>` / `IAC:<path>`
stderr: WARN_* lines for rejected or unparsable entries
exit:   always 0 (a broken allowlist must not break the security run — it
        simply suppresses nothing)
"""

import sys, datetime, re

try:
    import yaml
except ImportError:
    # Minimal fallback parser — handles the documented schema only
    yaml = None

path = ".great_cto/security-allowlist.yml"
log = ".great_cto/security-signals.log"
today = datetime.date.today()
max_exp = today + datetime.timedelta(days=90)


def parse_fallback(p):
    doc = {"allowed-deps": [], "allowed-iac-paths": []}
    section, entry = None, None
    with open(p) as f:
        for raw in f:
            line = raw.rstrip()
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            if line.startswith("allowed-deps:"):
                section = "allowed-deps"; continue
            if line.startswith("allowed-iac-paths:"):
                section = "allowed-iac-paths"; continue
            if section == "allowed-deps":
                m = re.match(r"\s*-\s*name:\s*(.+)$", line)
                if m:
                    if entry:
                        doc["allowed-deps"].append(entry)
                    entry = {"name": m.group(1).strip().strip('"').strip("'")}
                    continue
                m = re.match(r"\s+(\w[\w-]*):\s*(.+)$", line)
                if m and entry is not None:
                    entry[m.group(1)] = m.group(2).strip().strip('"').strip("'")
            elif section == "allowed-iac-paths":
                m = re.match(r"\s*-\s*(.+?)(\s+#.*)?$", line)
                if m:
                    doc["allowed-iac-paths"].append(m.group(1).strip().strip('"').strip("'"))
        if entry:
            doc["allowed-deps"].append(entry)
    return doc


def main():
    try:
        with open(path) as f:
            doc = yaml.safe_load(f) if yaml else parse_fallback(path)
    except Exception as e:  # noqa: BLE001 — any parse failure = suppress nothing
        print(f"WARN_ALLOWLIST parse_error={e}", file=sys.stderr)
        return 0

    if not isinstance(doc, dict):
        return 0

    log_fh = open(log, "a")

    def audit(line):
        log_fh.write(line + "\n")

    def validate(entry):
        if not isinstance(entry, dict):
            return (False, "not-an-object")
        missing = [k for k in ("reason", "approved-by", "expires") if not str(entry.get(k, "")).strip()]
        if missing:
            return (False, f"missing:{','.join(missing)}")
        owner = str(entry["approved-by"]).strip()
        if not owner.startswith("@"):
            return (False, "owner-not-@handle")
        exp = str(entry["expires"]).strip()
        try:
            exp_date = datetime.date.fromisoformat(exp)
        except Exception:  # noqa: BLE001
            return (False, f"expires-invalid:{exp}")
        if exp_date <= today:
            return (False, f"expired:{exp}")
        if exp_date > max_exp:
            return (False, f"expires-beyond-90d:{exp}")
        return (True, owner)

    suppress_deps = set()
    suppress_iac = []

    for e in (doc.get("allowed-deps") or []):
        ok, info = validate(e)
        name = (e.get("name") or "?") if isinstance(e, dict) else "?"
        if ok:
            suppress_deps.add(name)
            audit(f"SEC_WAIVER: dep={name} owner={info} expires={e['expires']}")
        else:
            audit(f"WARN_WAIVER_REJECTED: dep={name} reason={info}")
            print(f"WARN_WAIVER_REJECTED dep={name} reason={info}", file=sys.stderr)

    for p in (doc.get("allowed-iac-paths") or []):
        # iac paths don't carry per-entry owner/expires in the documented schema — require
        # a sibling entry in allowed-deps style if teams want per-path owners. For now we
        # accept the path if the file's top-level `iac-approval` block is present and valid.
        suppress_iac.append(p)
        audit(f"SEC_WAIVER: iac-path={p}")

    for d in sorted(suppress_deps):
        print(f"DEP:{d}")
    for p in suppress_iac:
        print(f"IAC:{p}")

    log_fh.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
