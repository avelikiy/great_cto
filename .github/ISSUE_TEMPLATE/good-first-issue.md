---
name: 🌱 Good first issue (maintainers only)
about: Template for maintainers to file beginner-friendly tasks
title: "[gfi] "
labels: good-first-issue, help-wanted
assignees: ''
---

<!--
USAGE: This template is for maintainers filing beginner-friendly issues, not for users.
       Drop a real, concrete, ≤2-hour task that follows a CONTRIBUTING.md pattern.
       Every "good first issue" must have ALL fields below filled in.
-->

## Pattern

Which `CONTRIBUTING.md` pattern does this match?
- [ ] 1. Add a new project archetype
- [ ] 2. Add a new domain reviewer
- [ ] 3. Add a new stack adapter
- [ ] 4. Add a new skill
- [ ] 5. Add a new i18n locale
- [ ] 6. Bug report
- [ ] 7. Docs / typo

## Files to touch

List the 1-3 files the contributor will edit. Paste paths, not vague hints.

- `packages/cli/src/...`
- `tests/fixtures/...`

## Acceptance criteria

A checklist a reviewer can run against the PR:

- [ ] CI passes
- [ ] New fixture passes detection / contract tests
- [ ] Documentation reflects the new addition

## Reading list

3 files the contributor should read before writing code. Paste paths.

- `packages/cli/src/archetypes/web-app.ts` — closest existing example
- `packages/cli/tests/fixtures/web-app/` — the fixture shape
- `CONTRIBUTING.md#1-add-a-new-project-archetype` — the pattern docs

## Time estimate

How long this should take a contributor unfamiliar with the codebase. Target ≤2h.

**Estimate:** _e.g. 1h_

## Help available

- Comment on this issue with questions
- [Discord](https://discord.gg/greatcto) #good-first-issue channel
- Tag `@avelikiy` if stuck >24h
