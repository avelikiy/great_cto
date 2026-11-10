# Pipeline rules by archetype

Read from `skills/great_cto/SKILL.md` § Pipeline Rule Enforcement (Archetype-Based).

At the start of every pipeline, after loading PROJECT.md, read the archetype to derive pipeline rules:

```bash
ARCHETYPE=$(grep "^archetype:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}'); ARCHETYPE=${ARCHETYPE:-web-service}
```

All rules come from ARCHETYPES.md by archetype. No type-specific lookup. Agents read:
- **QA strategy** → ARCHETYPES.md `## QA Strategy by Archetype` + domain packs for `qa-extras`
- **Deploy method** → ARCHETYPES.md `## Deploy Method by Archetype`
- **Security gate** → ARCHETYPES.md archetype table (`mandatory` column) + TYPE_MAP.md Overrides
- **Compliance checklists** → `compliance:` params in PROJECT.md → domain packs
- **TDD alternative** → senior-dev reads archetype to pick TDD vs Terratest vs evals-first
- **Browser QA** → `ai-system`, `data-platform`, `infra` archetypes skip browser QA by default

**Composite types** (primary + secondary): merge rules at archetype level. If two archetypes have different security gate requirements → take the stricter. Threshold = strictest across both.

**Multi-region** — if PROJECT.md has `regions:` with 2+ values:
- architect includes region deploy ordering in ARCH doc
- devops deploys to canary region first, then others sequentially
