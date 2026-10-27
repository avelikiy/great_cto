# Retrospective accumulation

Read from `skills/great_cto/SKILL.md` § Retrospective Accumulation.

After every deploy (in devops post-deploy step), append learnings to `.great_cto/retrospectives/RETRO-<YYYY-MM>.md`:

```bash
mkdir -p .great_cto/retrospectives
RETRO_FILE=".great_cto/retrospectives/RETRO-$(date +%Y-%m).md"
```

Format (append, not overwrite):
```markdown
## Deploy <date> — <feature>
- What slowed down: <if any agent was blocked, what caused it>
- QA findings: <pattern, e.g. "auth boundary tests keep failing">
- Security findings: <pattern, e.g. "hardcoded tokens found again">
- Perf delta: <p95 trend>
- Action taken: <what was changed>
```

After 3+ entries in a month — surface to CTO at session start if recurring pattern detected (same "What slowed down" 2+ times):
`"⚠ Recurring pattern: <pattern> appeared 3 times this month → suggest adding to architecture checklist"`
