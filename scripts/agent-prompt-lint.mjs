#!/usr/bin/env node
/**
 * scripts/agent-prompt-lint.mjs — structural validator for agents/*.md.
 *
 * Catches regressions in agent prompt content before they reach users:
 *   - Frontmatter schema drift (model/tools/timeout fields)
 *   - Missing "Phase task tracking" section in pipeline agents (v2.5.7+)
 *   - Stale path references (lessons.md, decisions.md)
 *   - File size blowups that risk context-window truncation
 *
 * See docs/plans/PLAN-v2.6.0-agent-prompt-linter.md for full rule list.
 *
 * Usage:
 *   node scripts/agent-prompt-lint.mjs              # lint all agents/
 *   node scripts/agent-prompt-lint.mjs --json       # machine-readable
 *   node scripts/agent-prompt-lint.mjs <file.md>    # lint one file
 *
 * Exit codes:
 *   0  clean
 *   1  errors (must fix)
 *   2  invalid invocation
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Pipeline agents — subject to PHASE rules ────────────────────────────────

const PIPELINE_AGENTS = new Set([
  'architect', 'pm', 'senior-dev',
  'qa-engineer', 'security-officer', 'performance-engineer',
  'devops', 'l3-support',
]);

// Agents that ship from external plugins or are exempt from pipeline rules
const PIPELINE_EXEMPT = new Set([
  'code-reviewer',          // ships from superpowers
  'continuous-learner',     // session-end utility
  'ai-prompt-architect',
  'ai-eval-engineer',
  'ai-security-reviewer',
  'project-auditor',
  'pm',                     // skipped — usually invoked from architect, no own phase
]);

// Reviewer agents — single-purpose, exempt from PHASE rules but subject to all others
const REVIEWER_PATTERN = /-reviewer\.md$/;

// ── Model-tier policy (CONS-MODEL, v2.7.0) ──────────────────────────────────
// Maps each agent slug to allowed model tiers. See ADR-002-model-tier-policy.md.
//
//   fable   — newest deepest tier (Fable 5, claude-fable-5); accepted anywhere opus is
//   opus    — deep cross-cutting reasoning (architect, ADRs)
//   sonnet  — balanced default for code/review (most agents)
//   haiku   — cheap repeatable utility (logging, summaries, fixed-shape output)
//
// `*` matches any reviewer that isn't explicitly listed.
const MODEL_TIER_POLICY = {
  // pipeline — deep reasoning preferred
  'architect':            ['opus', 'sonnet'],
  'senior-dev':           ['sonnet', 'opus'],
  'security-officer':     ['sonnet', 'opus'],
  'pm':                   ['sonnet', 'haiku'],
  'performance-engineer': ['sonnet', 'haiku'],
  'l3-support':           ['sonnet', 'haiku'],
  // utility — cheap is correct
  'devops':               ['sonnet', 'haiku'],
  'qa-engineer':          ['sonnet', 'haiku'],
  'continuous-learner':   ['haiku'],
  'project-auditor':      ['sonnet', 'opus'],
  // judge / eval / scorer roles — cost-of-error axis (ADR-004): cheap is correct for
  // T0/T1 (reversible, CI-checked) judging; a T2/regulated decision escalates to the
  // frontier model + the human gate at runtime, not via this static policy.
  'ai-eval-engineer':     ['sonnet', 'haiku'],
  'decision-scorer':      ['sonnet', 'haiku'],
  // AI subsystem
  'ai-prompt-architect':  ['sonnet', 'opus'],
  'ai-security-reviewer': ['sonnet', 'opus'],
  // reviewers — sonnet is the default; only flag opus/haiku
  '*-reviewer':           ['sonnet'],
};

function expectedTiersFor(slug, basename) {
  if (MODEL_TIER_POLICY[slug]) return MODEL_TIER_POLICY[slug];
  if (REVIEWER_PATTERN.test(basename)) return MODEL_TIER_POLICY['*-reviewer'];
  return null;  // unknown agent — no policy
}

function modelToTier(model) {
  const m = String(model).toLowerCase();
  const short = m.match(/^(haiku|sonnet|opus|fable)$/);
  if (short) return short[1];
  const fq = m.match(/^claude-(haiku|sonnet|opus|fable)-/);   // claude-fable-5, claude-opus-4-8, …
  if (fq) return fq[1];
  return null;
}

// Fable is the newest deepest tier — it satisfies any policy slot that allows opus.
function tierSatisfies(tier, expected) {
  if (expected.includes(tier)) return true;
  if (tier === 'fable' && expected.includes('opus')) return true;
  return false;
}

// ── Severity levels ─────────────────────────────────────────────────────────


// ── Resolving a phase-task section that lives in a shared file ──────────────
//
// `agents/_shared/phase-task.md` holds the canonical block; each pipeline agent
// keeps a short section that names it and binds the placeholder to its own slug.
// The PHASE rules need both halves: the shared file carries the helper
// invocation, the agent's own section carries the slug claim.

// Resolved from this file's location, not the process cwd: the linter is run
// from the repo root by ci-local and from anywhere by a person.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHARED_PHASE_TASK = 'agents/_shared/phase-task.md';

/** The agent's own `## Phase task tracking` section, or null. */
function ownPhaseSection(file) {
  const m = file.text.match(/##\s+Phase task tracking[\s\S]*?(?=\n##\s|$)/i);
  return m ? m[0] : null;
}

/**
 * @returns {{state:'ok'|'absent'|'unreadable', text:string, own:string,
 *            shared:boolean, message?:string}}
 *
 * Three states, deliberately. `unreadable` is what a section that points at a
 * shared block nobody can open must return — collapsing it into `ok` would let a
 * deleted shared file read as eight clean agents.
 */
function resolvePhaseSection(file) {
  const own = ownPhaseSection(file);
  if (!own) return { state: 'absent', text: '', own: '', shared: false };

  // Any reference to the shared block, however it is written in prose.
  if (!/_shared\/phase-task\.md/.test(own)) {
    return { state: 'ok', text: own, own, shared: false };
  }
  const abs = resolve(REPO_ROOT, SHARED_PHASE_TASK);
  let sharedText;
  try {
    sharedText = readFileSync(abs, 'utf8');
  } catch (err) {
    // The reason is carried, not swallowed: a file that is MISSING and a file
    // that is present but unreadable are different repairs — restore it, or fix
    // its permissions — and "could not be read" alone sends the reader to look
    // for the wrong one.
    return {
      state: 'unreadable', text: own, own, shared: true,
      message: `phase-task section references \`${SHARED_PHASE_TASK}\`, which could not be read (${err.code ?? err.message})`,
    };
  }
  return { state: 'ok', text: own + '\n' + sharedText, own, shared: true };
}

/** First `open <slug>` argument in a block, or null. */
function section_open(text) {
  const m = text.match(/open\s+([A-Za-z][A-Za-z0-9_-]*)/);
  return m ? m[1] : null;
}

const SEVERITY = { error: 'error', warn: 'warn' };

// ── Rule definitions ────────────────────────────────────────────────────────

const RULES = [
  // ── Frontmatter ──
  {
    id: 'FM-001',
    severity: SEVERITY.error,
    desc: 'YAML frontmatter parses',
    test(file) {
      const fm = parseFrontmatter(file.text);
      if (!fm) return ['no `---` frontmatter found at start of file'];
      try {
        parseYamlBlock(fm.body);
      } catch (e) {
        return [`frontmatter not valid YAML: ${e.message}`];
      }
      return [];
    },
  },
  {
    id: 'FM-002',
    severity: SEVERITY.error,
    desc: 'description field present and ≥ 20 chars',
    test(file) {
      const meta = file.frontmatter || {};
      const desc = meta.description;
      if (!desc) return ['frontmatter missing `description`'];
      if (typeof desc !== 'string') return ['`description` must be a string'];
      if (desc.length < 20) return [`\`description\` too short (${desc.length} chars; min 20)`];
      return [];
    },
  },
  {
    id: 'FM-003',
    severity: SEVERITY.error,
    desc: 'model field references a known Claude model tier',
    test(file) {
      const meta = file.frontmatter || {};
      const model = meta.model;
      if (!model) return ['frontmatter missing `model`'];
      const m = String(model).toLowerCase();
      // Accept short tier (haiku|sonnet|opus) or fully-qualified
      // (claude-haiku-4-5, claude-sonnet-4-6, claude-opus-4-8, etc.)
      if (/^(haiku|sonnet|opus)$/.test(m)) return [];
      if (/^claude-(haiku|sonnet|opus)-\d+(-\d+)?$/.test(m)) return [];
      return [`model must be a known tier (haiku/sonnet/opus or claude-<tier>-N-N), got: ${model}`];
    },
  },
  {
    id: 'FM-004',
    severity: SEVERITY.error,
    desc: 'tools field is a non-empty list',
    test(file) {
      const meta = file.frontmatter || {};
      const tools = meta.tools;
      if (!tools) return ['frontmatter missing `tools`'];
      // Frontmatter may be parsed as either array or comma-string — accept both
      if (typeof tools === 'string') {
        const list = tools.split(',').map(s => s.trim()).filter(Boolean);
        if (list.length === 0) return ['`tools` is empty'];
      } else if (Array.isArray(tools)) {
        if (tools.length === 0) return ['`tools` is an empty list'];
      } else {
        return [`\`tools\` must be a list or comma-string, got: ${typeof tools}`];
      }
      return [];
    },
  },

  // ── Structure ──
  {
    id: 'STR-001',
    severity: SEVERITY.error,
    desc: 'has at least one ## heading after frontmatter',
    test(file) {
      const body = file.bodyAfterFrontmatter || '';
      if (!/^## /m.test(body)) return ['no `## ` heading found in body'];
      return [];
    },
  },
  {
    id: 'STR-002',
    severity: SEVERITY.warn,
    desc: 'file size ≤ 64 KB (context-window safety)',
    test(file) {
      // 64 KB ≈ 16K tokens — comfortable headroom in any 200K context window
      // and still catches genuine prompt bloat. Was 50 KB in v2.6.0; raised
      // in v2.7.0 after architect.md (55 KB) tripped a false-positive: its
      // Workflow section legitimately covers 25 archetype branches.
      const max = 64 * 1024;
      if (file.bytes > max) {
        return [`file ${file.bytes} bytes exceeds ${max} byte threshold (context-window risk)`];
      }
      return [];
    },
  },

  // ── Phase task protocol (v2.5.7+) ──
  //
  // These three rules used to read ONLY the agent's own text. Then the eight
  // pipeline agents were refactored to stop duplicating the block and point at
  // `agents/_shared/phase-task.md` instead — the DRY move the CONS-NOREPEAT rule
  // asks for elsewhere in this same file. The rules kept looking for the inlined
  // text, so all eight failed at once, and the fix that would have satisfied them
  // was to paste the block back into every agent.
  //
  // A rule that is only satisfiable by undoing a deliberate refactor is reporting
  // on itself, not on the agents. So the section is RESOLVED first: a reference to
  // the shared block pulls that file in and the rules run over both halves.
  //
  // Resolution has three outcomes, never two. A section that names a shared block
  // which cannot be read is an ERROR that says so — it must never come back as
  // "no shared block referenced, judging the agent's own text", because that reads
  // exactly like a clean pass on a file whose instructions have gone missing.
  {
    id: 'PHASE-001',
    severity: SEVERITY.error,
    desc: 'pipeline agents have "Phase task tracking" section',
    appliesTo(file) { return PIPELINE_AGENTS.has(file.slug); },
    test(file) {
      const body = file.text;
      if (!/##\s+Phase task tracking/i.test(body)) {
        return ['pipeline agent missing `## Phase task tracking` section (added in v2.5.7)'];
      }
      return [];
    },
  },
  {
    id: 'PHASE-002',
    severity: SEVERITY.error,
    desc: 'phase-task block references the helper script',
    appliesTo(file) { return PIPELINE_AGENTS.has(file.slug); },
    test(file) {
      const r = resolvePhaseSection(file);
      if (r.state === 'absent') return [];        // PHASE-001 catches this
      if (r.state === 'unreadable') return [r.message];
      const section = r.text;
      if (!/phase-task\.sh/.test(section)) {
        return ['phase-task section does not reference `phase-task.sh` helper'];
      }
      if (!/bash\s+["$].*PT|bash\s+\$PT/.test(section) && !/\$\(bash\s+["$].*PT.*open/.test(section)) {
        // Loose check — the section should at least show how to invoke
        if (!/\$\(bash.*open/.test(section)) {
          return ['phase-task section does not show `bash $PT open <agent>` invocation pattern'];
        }
      }
      return [];
    },
  },
  {
    id: 'PHASE-003',
    severity: SEVERITY.error,
    desc: 'phase-task open uses correct agent slug',
    appliesTo(file) { return PIPELINE_AGENTS.has(file.slug); },
    test(file) {
      const r = resolvePhaseSection(file);
      if (r.state === 'absent') return [];
      if (r.state === 'unreadable') return [r.message];
      const expected = file.slug;

      // Shared form: the block is a template, so the agent's own section is where
      // the placeholder gets bound — `<agent-name> = architect`. That binding IS
      // the slug claim, and it is the half a copy-paste of another agent's file
      // gets wrong, so it is checked against the filename.
      const bind = r.own.match(/<agent[-_ ]?name>\s*=\s*([A-Za-z][A-Za-z0-9_-]*)/i);
      if (bind) {
        return bind[1] === expected
          ? []
          : [`phase-task block binds <agent-name> = '${bind[1]}' but file is for '${expected}'`];
      }

      // Inline form (pre-refactor): the literal invocation carries the slug.
      const openMatch = section_open(r.text);
      if (!openMatch) {
        return [r.shared
          ? 'phase-task block neither binds `<agent-name> = <slug>` nor shows an `open <agent>` example'
          : 'phase-task block missing `open <agent>` example'];
      }
      if (openMatch === 'AGENT_NAME_HERE' || openMatch === '<agent>' || openMatch === '<agent-name>') {
        return [];  // template placeholder is fine
      }
      if (openMatch !== expected) {
        return [`phase-task open uses '${openMatch}' but file is for '${expected}'`];
      }
      return [];
    },
  },

  // ── Memory paths ──
  // Only flag references that look like *file-path usage* in shell commands
  // (cat, grep, tail, [ -f, >, etc.) — narrative mentions in prose are fine.
  {
    id: 'MEM-001',
    severity: SEVERITY.warn,
    desc: 'lessons.md in shell commands uses canonical path',
    test(file) {
      // Match shell commands operating on bare lessons.md without a path prefix
      const re = /(?:cat|tail|head|grep|less|more|wc|less|sed|awk|\[\s*-[fFsr]\s*|>>|^>\s|<<|`\s)\s+lessons\.md\b/gm;
      const matches = file.text.match(re);
      if (matches && matches.length > 0) {
        return [`${matches.length} shell command(s) on bare \`lessons.md\` — should be \`.great_cto/lessons.md\` or \`~/.great_cto/lessons.md\``];
      }
      return [];
    },
  },
  {
    id: 'MEM-002',
    severity: SEVERITY.warn,
    desc: 'decisions.md in shell commands uses canonical path',
    test(file) {
      const re = /(?:cat|tail|head|grep|less|more|wc|less|sed|awk|\[\s*-[fFsr]\s*|>>|^>\s|<<|`\s)\s+decisions\.md\b/gm;
      const matches = file.text.match(re);
      if (matches && matches.length > 0) {
        return [`${matches.length} shell command(s) on bare \`decisions.md\` — should be \`~/.great_cto/decisions.md\``];
      }
      return [];
    },
  },

  // ── Output contracts ──
  {
    id: 'OUT-001',
    severity: SEVERITY.warn,
    desc: 'agent defines an explicit output (file path or contract)',
    appliesTo(file) {
      return PIPELINE_AGENTS.has(file.slug) || REVIEWER_PATTERN.test(file.basename);
    },
    test(file) {
      // Heuristic: must mention writing to docs/, .great_cto/, or "output:" contract
      const body = file.text;
      const hasFileOutput = /docs\/[a-z-]+\/[A-Z]+-/.test(body) || /\.great_cto\/[a-z]/.test(body);
      const hasContract = /^\s*(?:Output|Returns?|Produces?|Writes?):/im.test(body);
      if (!hasFileOutput && !hasContract) {
        return ['no explicit output (file path like `docs/xxx/YYY-*.md` or `Output:` contract)'];
      }
      return [];
    },
  },

  // ── Cross-prompt consistency (CONS-*, v2.7.0) ──
  {
    id: 'CONS-MODEL',
    severity: SEVERITY.warn,
    desc: 'agent uses a model tier appropriate for its role (see ADR-002)',
    test(file) {
      const meta = file.frontmatter || {};
      if (!meta.model) return [];  // FM-003 catches missing model
      const tier = modelToTier(meta.model);
      if (!tier) return [];  // FM-003 catches unparseable
      const expected = expectedTiersFor(file.slug, file.basename);
      if (!expected) return [];  // unknown agent — no policy
      if (!tierSatisfies(tier, expected)) {
        return [`model tier '${tier}' not in policy for '${file.slug}' (expected: ${expected.join('|')}). See ADR-002.`];
      }
      return [];
    },
  },
  {
    id: 'CONS-OUTPUT',
    severity: SEVERITY.warn,
    desc: 'reviewer declares an output file pattern (TM-/MIGRATE-/PERF-/etc.)',
    appliesTo(file) { return REVIEWER_PATTERN.test(file.basename); },
    test(file) {
      // A reviewer that mounts archetype-review-base INHERITS the canonical output
      // convention (docs/sec-threats/TM-{slug}.md) from the base skill — it need not
      // restate it. This is the consolidation invariant (great_cto-bjj): the scaffold
      // lives in one place. Only reviewers that do NOT mount the base must declare it.
      if (/^\s*-\s*archetype-review-base\s*$/m.test(file.text)) return [];
      // Reviewers must reference a docs/<dir>/<PREFIX>-{slug-or-name}.md output.
      // Allows TM-, MIGRATE-, PERF-, ARCH- variants, incl. a {domain}- segment.
      const re = /docs\/[a-z-]+\/[A-Z][A-Z0-9-]+-(?:\$\{?SLUG\}?|\{slug\}|extension-\{slug\}|[a-z][a-z0-9-]*)\.md/;
      if (!re.test(file.text)) {
        return [`reviewer missing explicit output file pattern (e.g. \`docs/sec-threats/TM-{slug}.md\`)`];
      }
      return [];
    },
  },
  {
    // Anti-regrowth (great_cto-ckf): a reviewer that mounts archetype-review-base
    // must NOT restate the scaffold the base skill owns. Warn (not error) because the
    // 46 not-yet-deep-trimmed reviewers still carry a redundant Step-0 copy — flagging
    // keeps it visible and blocks NEW regrowth in review without breaking CI.
    id: 'CONS-NOREPEAT',
    severity: SEVERITY.warn,
    desc: 'reviewer does not re-declare base-owned scaffold (Step-0 bash / "Skills used" footer)',
    appliesTo(file) {
      return REVIEWER_PATTERN.test(file.basename)
        && /^\s*-\s*archetype-review-base\s*$/m.test(file.text);
    },
    test(file) {
      const body = file.bodyAfterFrontmatter || file.text;
      const msgs = [];
      // A "## Skills used" footer is pure redundancy with the skills: frontmatter — the
      // clearest regrowth marker. (The Step-0 read-inputs bash is also base-owned, but
      // 46 reviewers legitimately still carry it post-mechanical-pass, so flagging it
      // would nag an accepted baseline rather than catch regrowth — left out on purpose.)
      if (/^##+\s+Skills used\b/im.test(body)) {
        msgs.push('drop the "## Skills used" footer — the `skills:` frontmatter is the source of truth');
      }
      return msgs;
    },
  },
  {
    // Size backstop (great_cto-ckf): flag a reviewer that has grown well past the
    // domain-only target. Generous cap — legit domain-table-heavy reviewers run ~200;
    // only egregious bloat (full scaffold re-added) crosses this.
    id: 'CONS-SIZE',
    severity: SEVERITY.warn,
    desc: 'reviewer stays within the domain-only size budget',
    appliesTo(file) { return REVIEWER_PATTERN.test(file.basename); },
    test(file) {
      const lines = file.text.split('\n').length;
      const CAP = 260;
      if (lines > CAP) return [`reviewer is ${lines} lines (> ${CAP}) — likely re-grown scaffold; trim to domain-only`];
      return [];
    },
  },
  {
    id: 'CONS-SIGNOFF',
    severity: SEVERITY.warn,
    desc: 'reviewer references sign-off / gate semantics',
    appliesTo(file) { return REVIEWER_PATTERN.test(file.basename); },
    test(file) {
      // Reviewer must mention sign-off / gate so handoff to senior-dev is unambiguous
      if (/sign[- ]?off|signs off|gate:|hand[- ]?off|HANDOFF/i.test(file.text)) return [];
      return ['reviewer body missing `sign-off` / `gate:` / `HANDOFF` semantics — handoff to senior-dev unclear'];
    },
  },

  // ── Cross-platform ──
  {
    id: 'DEPS-001',
    severity: SEVERITY.warn,
    desc: 'superpowers references in body guarded by HOST=claude-code',
    test(file) {
      // Skip frontmatter — `tools: [- superpowers:foo]` is a tool dep,
      // managed by the DEPS_MISSING_SOFT layer in SKILL.md, not by the
      // agent prompt itself.
      const body = file.bodyAfterFrontmatter || file.text;
      if (!/superpowers/i.test(body)) return [];
      if (/HOST.*claude-code|claude-code.*superpowers|host=claude-code/i.test(body)) return [];
      if (/fallback|inline|without superpowers|non-Claude/i.test(body)) return [];
      return ['body references `superpowers` without HOST=claude-code guard or fallback note (breaks Codex/Cursor users)'];
    },
  },
];

// ── Frontmatter parser (minimal — accepts list-or-string for `tools`) ───────

function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) return null;
  return {
    body: text.slice(4, end),
    after: text.slice(end + 5),
  };
}

function parseYamlBlock(yaml) {
  // Hand-rolled: flat key:value, list-of-strings via `- item` or `[a, b]`, and
  // YAML block scalars (`key: |` / `key: >`) whose value spans indented lines.
  const out = {};
  let key = null;
  let listMode = false;
  let blockKey = null;          // active `|` / `>` block scalar
  for (const rawLine of yaml.split('\n')) {
    const line = rawLine.replace(/\r$/, '');

    // collect a block scalar's indented continuation lines into one string
    if (blockKey !== null) {
      if (line.trim() === '' || /^\s/.test(line)) {
        const t = line.trim();
        if (t) out[blockKey] = out[blockKey] ? out[blockKey] + ' ' + t : t;
        continue;
      }
      blockKey = null;          // dedented → block ended; fall through to parse this line
    }

    if (!line.trim()) continue;
    if (line.startsWith('#')) continue;

    if (listMode && /^\s+-\s+/.test(line)) {
      out[key].push(line.replace(/^\s+-\s+/, '').trim().replace(/^["']|["']$/g, ''));
      continue;
    }
    listMode = false;

    const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) {
      if (line.startsWith(' ')) continue;  // continuation, skip
      throw new Error(`unparseable line: ${line.slice(0, 60)}`);
    }
    const [, k, v] = m;
    if (/^[|>][+-]?$/.test(v.trim())) {
      // YAML block scalar (`| literal` / `> folded`) — value is the indented lines below
      out[k] = '';
      blockKey = k;
    } else if (v === '' || v === null) {
      // List or block follows
      out[k] = [];
      key = k;
      listMode = true;
    } else if (v.startsWith('[') && v.endsWith(']')) {
      // Inline list
      out[k] = v.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      // Scalar — strip quotes
      out[k] = v.replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

// ── Linter engine ───────────────────────────────────────────────────────────

function lintFile(path) {
  const text = readFileSync(path, 'utf8');
  const bytes = statSync(path).size;
  const basename = path.split('/').pop();
  const slug = basename.replace(/\.md$/, '');

  const fm = parseFrontmatter(text);
  let frontmatter = null;
  let bodyAfterFrontmatter = text;
  if (fm) {
    bodyAfterFrontmatter = fm.after;
    try {
      frontmatter = parseYamlBlock(fm.body);
    } catch {
      // FM-001 catches this; leave frontmatter=null
    }
  }

  const file = {
    path, basename, slug, text, bytes, frontmatter, bodyAfterFrontmatter,
  };

  const findings = [];
  for (const rule of RULES) {
    if (rule.appliesTo && !rule.appliesTo(file)) continue;
    const violations = rule.test(file);
    for (const msg of violations) {
      findings.push({ rule: rule.id, severity: rule.severity, desc: rule.desc, message: msg });
    }
  }
  return { path, basename, slug, findings };
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const wantJson = args.includes('--json');
  const targets = args.filter(a => !a.startsWith('-'));

  const root = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(root, '..');
  const agentsDir = join(repoRoot, 'agents');

  let files;
  if (targets.length > 0) {
    files = targets.map(t => resolve(t));
  } else {
    try {
      files = readdirSync(agentsDir)
        .filter(f => f.endsWith('.md'))
        .map(f => join(agentsDir, f))
        .sort();
    } catch (e) {
      console.error(`agent-prompt-lint: failed to read ${agentsDir}: ${e.message}`);
      process.exit(2);
    }
  }

  const results = files.map(lintFile);
  const errors = results.flatMap(r => r.findings.filter(f => f.severity === 'error').map(f => ({ ...f, path: r.path })));
  const warns = results.flatMap(r => r.findings.filter(f => f.severity === 'warn').map(f => ({ ...f, path: r.path })));
  const ok = results.filter(r => r.findings.length === 0).length;

  if (wantJson) {
    console.log(JSON.stringify({
      total: results.length, ok,
      errors: errors.length, warnings: warns.length,
      results: results.map(r => ({
        file: r.basename,
        findings: r.findings,
      })),
    }, null, 2));
  } else {
    console.error(`Linting ${results.length} agent prompts in ${agentsDir}...\n`);
    for (const r of results) {
      const errs = r.findings.filter(f => f.severity === 'error');
      const wrns = r.findings.filter(f => f.severity === 'warn');
      const sym = errs.length > 0 ? '✗' : (wrns.length > 0 ? '⚠' : '✓');
      const colorReset = '\x1b[0m';
      const color = errs.length > 0 ? '\x1b[31m' : (wrns.length > 0 ? '\x1b[33m' : '\x1b[32m');
      console.error(`  ${color}${sym}${colorReset} ${r.basename}`);
      for (const f of r.findings) {
        console.error(`      ${f.rule} (${f.severity}): ${f.message}`);
      }
    }
    console.error(`\n──────────────────────────────────────`);
    console.error(`  ✓ ${ok} ok · ⚠ ${warns.length} warnings · ✗ ${errors.length} errors\n`);
    if (errors.length > 0) {
      console.error('Failures (must fix):');
      for (const e of errors) {
        console.error(`  - ${e.path.replace(repoRoot + '/', '')} (${e.rule}): ${e.message}`);
      }
    }
  }

  // `process.exitCode`, not `process.exit()`. On a pipe stdout is asynchronous
  // and `process.exit()` does not wait for it to drain, so anything past the
  // ~8KB pipe buffer is discarded — silently, with a zero-length tail that looks
  // like the end of the report. The JSON report sat just under 8,192 bytes for
  // months and one added skill pushed it over, which surfaced as four unrelated
  // agent tests failing on `Unterminated string in JSON`.
  //
  // Setting exitCode gives the same status and lets the runtime flush first.
  process.exitCode = errors.length > 0 ? 1 : 0;
}

main();
