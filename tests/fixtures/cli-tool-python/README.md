# cli-tool-python — great_cto fixture

A deliberately small, deliberately broken Python CLI tool used to test the
great_cto pipeline end-to-end.

**Deliberate problems posed here for agents to find:**

1. Committed `.env.example` references `API_TOKEN=sk-live-FAKE...` — should be
   detected as a committed-secret risk (low severity — it's a placeholder, but
   the pattern should trigger scanner warnings).
2. `requirements.txt` pins `requests==2.25.0` — known CVE-2023-32681 (proxy auth leak).
3. `src/cli.py` contains a bare `except:` that hides errors.
4. `src/cli.py` has a `# TODO: validate input` on the entry point with no
   validation logic.
5. No test file exists yet (tests/ is empty) — QA should flag 0% coverage.
6. `pyproject.toml` lists this as `cli-tool-python` — a project-auditor run
   should detect type `cli-tool` and archetype `library` per TYPE_MAP.md.

**Expected agent outputs:**

After `/audit` the fixture should have:
- `docs/audit/AUDIT-<date>.md`
- `docs/audit/REFACTOR-PLAN.md`
- `.great_cto/audit-state.json`
- `.great_cto/verdicts/<date>.log` with one `project-auditor | DONE` line
- `.great_cto/PROJECT.md` with `Stack:` and `Type:` single-line format
- Beads issues for: committed-secret pattern, CVE-2023-32681, bare except, missing tests

See `expected/` for the golden manifest the e2e runner asserts against.
