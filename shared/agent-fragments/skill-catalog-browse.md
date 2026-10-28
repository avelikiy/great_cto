# Skill catalog browse (canonical — v1.0.140+)

Read `~/.great_cto/skills-registry.json` → `agent_skills["<agent-name>"][_default]`
plus `agent_skills["<agent-name>"][<archetype>]`. Decide which SKILL.md files to
Read for this run.

**Open-world discovery (v1.0.142+):** also scan tier2 (`anthropic:*`) and tier3
(`personal:*`) entries for skills whose `summary` matches the current task —
not just the pre-wired suggestions.

```bash
REG=~/.great_cto/skills-registry.json
ARCHETYPE=$(grep "^archetype:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}')
node -e '
  const r = require(process.env.HOME + "/.great_cto/skills-registry.json");
  const a = r.agent_skills?.["<agent-name>"] || {};
  console.log(JSON.stringify({ default: a._default || [], archetype: a[process.argv[1]] || [] }));
' "$ARCHETYPE" 2>/dev/null
```

If the registry is missing (first session; `skill-discover.sh` runs async at
SessionStart), proceed without it — never block on catalog availability.
