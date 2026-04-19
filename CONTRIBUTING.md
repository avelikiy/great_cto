# Contributing to great_cto

Thanks for thinking about contributing! This repo has two codebases with
different contribution rules.

## Which part are you touching?

| Part | Location | License | Contribution |
|---|---|---|---|
| **Plugin** (agents, commands, skills) | `agents/`, `commands/`, `skills/` | CC BY-NC 4.0 | PRs welcome — see section below |
| **CLI** (npm installer) | `packages/cli/` | MIT | PRs welcome — see section below |

---

## Contributing to the CLI (`packages/cli/`)

The CLI is a small TypeScript program with zero runtime dependencies. It
detects your stack, picks an archetype, and installs the plugin. Small,
focused PRs are easiest to land.

### Quick start

```bash
git clone https://github.com/avelikiy/great_cto.git
cd great_cto/packages/cli
npm ci
npm run build
npm test
```

### What you need

- **Node.js 18.17+** (matches the `engines.node` constraint)
- **Git** (for the install path the CLI exercises)
- No other runtime deps — the CLI is pure Node `node:*` imports

### How to run locally

```bash
# From packages/cli/
node index.mjs --help
node index.mjs init --dry-run --dir /tmp/some-fixture
```

To exercise against real fixtures without mutating your real `~/.claude/`,
use `--dry-run` or run in a throwaway `$HOME`:

```bash
HOME=/tmp/fakehome node index.mjs init --yes --dir /tmp/fixture
```

### Adding a new stack signal

Most feature work lives in `src/detect.ts`. To add detection for a new
framework / library / config file:

1. Add a signal line inside the matching block (`package.json` parse for
   Node/TS; filesystem check for everything else).
2. Add a test in `tests/detect.test.mjs` that creates a minimal fixture and
   asserts the new signal ends up in `result.stack` or `result.signals`.
3. If the new signal should influence archetype selection, update
   `src/archetypes.ts` (add a scoring rule) and `tests/archetypes.test.mjs`.

### Archetype changes

- **Adding a rule**: give it a clear `score` function (integer points per
  signal), a clear `reason` function (one sentence explaining why), and a
  test case in `tests/archetypes.test.mjs`.
- **Confidence scoring**: we compute `high` / `medium` / `low` from absolute
  score and gap to next-best — don't introduce free-form confidence levels.
- Keep the rule ordering deterministic: highest score wins, no time-based or
  random tiebreakers.

### Tests

- We use Node's built-in `node:test` runner — no Jest, no Mocha, no extra deps.
- Tests import the compiled JavaScript from `dist/`, so `npm test` runs
  `npm run build` first.
- Aim for: one test per branch, one test per public API behavior, one test
  per edge case you introduce.

### PR checklist

- [ ] `npm test` passes locally
- [ ] You added a test for the behavior change
- [ ] You updated `packages/cli/CHANGELOG.md` under an "Unreleased" section
- [ ] You didn't add a new runtime dependency (the CLI stays zero-dep)
- [ ] Behavior that touches `~/.claude/` has a backup or dry-run path

---

## Contributing to the plugin (`agents/`, `commands/`, `skills/`)

The plugin is licensed **CC BY-NC 4.0** (non-commercial). If your
contribution is non-commercial in nature (bug fix, new archetype, command
refinement) — PRs welcome.

### Plugin workflow

1. Open an issue first describing the change — agent behavior changes can be
   subtle, and we'd rather discuss design before you spend time.
2. For agent prompt changes: include before/after examples of how the agent
   responds.
3. For new commands: add an entry to `commands/` with the standard frontmatter
   and a usage example.
4. For new archetype or compliance framework: update
   `skills/great_cto/ARCHETYPES.md` and add a test case in the CLI
   (`packages/cli/tests/archetypes.test.mjs`) so dry-run picks it correctly.

---

## Issue reports

Useful issue reports include:

- **CLI install bugs**: your Node version, OS, and the exact `npx great-cto
  init` output (redact paths if needed).
- **Archetype mis-pick**: the `package.json` / config files in your repo
  (or a minimal repro), what archetype was picked, what you expected.
- **Plugin behavior**: the command you ran, the archetype in your
  `.great_cto/PROJECT.md`, the agent output (trimmed to the relevant
  section).

## Code of conduct

Be decent. Assume good faith. Focus on the code and the behavior, not the
person. Project maintainers may decline PRs for any reason; that decision
is about scope and direction, not you.

## Questions?

- File an issue at https://github.com/avelikiy/great_cto/issues
- Or open a Discussion on the same repo
