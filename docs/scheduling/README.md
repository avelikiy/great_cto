# Scheduled runs

great_cto benefits from two recurring background jobs:

| Job | Schedule | Why |
|---|---|---|
| `/digest 7` | **Mondays 09:00** | Weekly velocity + incident + ADR digest |
| `/audit` | **Sundays 10:00** (monthly recommended) | Codebase gap refresh |

Neither is set up automatically — both require per-user configuration through
Claude Code's scheduler or your OS cron. The plugin stays stateless.

## Option A — Claude Code scheduler (recommended)

If your Claude Code has the `scheduled-tasks` MCP enabled:

```
/mcp scheduled-tasks create_scheduled_task \
  name="great_cto-digest-weekly" \
  schedule="0 9 * * 1" \
  command="claude -p '/digest 7'"

/mcp scheduled-tasks create_scheduled_task \
  name="great_cto-audit-monthly" \
  schedule="0 10 1 * *" \
  command="claude -p '/audit'"
```

Check with `/mcp scheduled-tasks list_scheduled_tasks`.

## Option B — OS cron

`crontab -e`:

```
# great_cto weekly digest (Mon 09:00)
0 9 * * 1 cd /path/to/repo && claude -p '/digest 7' >> .great_cto/cron.log 2>&1

# great_cto monthly audit (1st of month, 10:00)
0 10 1 * * cd /path/to/repo && claude -p '/audit' >> .great_cto/cron.log 2>&1
```

## Option C — GitHub Actions (self-hosted runner only)

Actions can't invoke `claude` directly on Anthropic's side; self-hosted runners
only. See `.github/workflows/scheduled.yml.example` if you want this path.

## Staleness detection

Both commands drop artefacts that `/doctor` checks:

- `.great_cto/digest-latest.md` — > 8d triggers SessionStart warning
- `docs/audit/AUDIT-*.md` — > 30d triggers SessionStart warning

If a warning appears but the scheduler is configured, check
`.great_cto/cron.log` or the MCP task logs.

## Manual run

Either can always be invoked manually:

```
/digest 7       # covers last 7 days
/digest Q2 board   # quarterly board format
/audit          # full repo audit
```
