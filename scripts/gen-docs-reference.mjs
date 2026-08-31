#!/usr/bin/env node
// scripts/gen-docs-reference.mjs — auto-generate the docs reference from agent &
// command frontmatter, so the reference never drifts from the source of truth.
//
// Produces:
//   docs/reference/agents.md    — table of all agents/*.md (name, model, effort, description)
//   docs/reference/commands.md  — table of all commands/*.md (command, model, args, description)
//   docs/reference/skills.md    — table of all skills/*/SKILL.md (skill, description)
//
// Skills were the third kind of thing this project ships and the only one with no
// reference page. Measured before adding it: of 35 skills, TWELVE appeared nowhere
// in docs/ at all — ten vertical domain packs and two discovery skills — while
// every one of 69 agents and 44 commands was documented. The gap was not twelve
// missing paragraphs; it was a missing page.
//
// Usage:
//   node scripts/gen-docs-reference.mjs            # (re)generate the reference pages
//   node scripts/gen-docs-reference.mjs --check    # CI: exit 2 if generated output is stale
//
// Exit: 0 ok · 1 error · 2 stale (with --check)

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { systemMap, toMermaid, pipelineMermaid } from './lib/system-map.mjs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLES, ROLE_ORDER, roleForAgent } from '../shared/lifecycle-map.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS_DIR = join(ROOT, 'skills');
const AGENTS_DIR = join(ROOT, 'agents');
const COMMANDS_DIR = join(ROOT, 'commands');
const OUT_DIR = join(ROOT, 'docs', 'reference');

/**
 * Parse the leading `---`…`---` YAML frontmatter into a flat {key:value} map.
 * Only top-level scalar keys are captured (enough for a reference table).
 */
export function parseFrontmatter(content) {
  const m = String(content).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const km = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!km) continue; // skip list items / nested lines
    const key = km[1];
    if (key in out) continue; // first occurrence wins
    let val = km[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const esc = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();

/**
 * A skill is a DIRECTORY holding SKILL.md, not a flat file, so it needs its own
 * reader rather than `readDefs`. Description lives in the same frontmatter.
 */
function readSkills(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const file = join(dir, e.name, 'SKILL.md');
      if (!existsSync(file)) return null;
      const fm = parseFrontmatter(readFileSync(file, 'utf8'));
      return { file: `${e.name}/SKILL.md`, name: fm.name || e.name, fm };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Grouped by what a skill IS, because 35 flat rows is a list nobody reads twice.
 * The `vertical-*` prefix is a real convention in this repo — ten domain packs an
 * agent loads when it works in that industry — and it carries the grouping.
 */
function renderSkills(defs) {
  const verticals = defs.filter((d) => d.name.startsWith('vertical-'));
  const rest = defs.filter((d) => !d.name.startsWith('vertical-'));
  // First sentence only. A skill's `description` is written for a MODEL deciding
  // whether to load it, so several run past 200 words — as table cells they made a
  // reference nobody could scan. The full text stays in the skill, which is where
  // someone who has decided to use it will be looking anyway.
  const clean = (t) => {
    const raw = String(t || '').replace(/^["']|["']$/g, '').trim();
    const cut = raw.match(/^(.+?[.!?])(\s|$)/);
    const one = (cut ? cut[1] : raw).trim();
    return (one.length > 200 ? `${one.slice(0, 197)}…` : one).replace(/\|/g, '\\|');
  };
  const row = (d) => `| \`${d.name}\` | ${clean(d.fm.description) || '—'} |`;
  return [
    '# Reference — Skills',
    '',
    '> **Auto-generated** by `scripts/gen-docs-reference.mjs` from `skills/*/SKILL.md` frontmatter.',
    '> Do not edit by hand — edit the skill and re-run the generator.',
    '',
    'A skill is knowledge an agent loads on demand, rather than a thing that runs.',
    `${defs.length} in total: ${verticals.length} industry domain packs and ${rest.length} others.`,
    '',
    `## Industry domain packs (${verticals.length})`,
    '',
    'Loaded when a product is being built for that industry, so `architect` and `pm`',
    'are not naive about the domain.',
    '',
    '| Skill | What it carries |',
    '|---|---|',
    ...verticals.map(row),
    '',
    `## Everything else (${rest.length})`,
    '',
    '| Skill | What it carries |',
    '|---|---|',
    ...rest.map(row),
    '',
  ].join('\n');
}

function readDefs(dir, { nameKey }) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const fm = parseFrontmatter(readFileSync(join(dir, f), 'utf8'));
      const name = fm[nameKey] || basename(f, '.md');
      return { file: f, name, fm };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function renderAgents(defs) {
  // Group every agent by team role (see shared/lifecycle-map.mjs) — after Boris
  // Cherny's 5 roles plus the two axes his model omits. This is a LENS over the
  // agents, not a merge: agents stay narrowly scoped; we only group them here.
  const byRole = new Map(ROLE_ORDER.map((r) => [r, []]));
  const unclassified = [];
  for (const d of defs) {
    const role = roleForAgent(d.name);
    if (role && byRole.has(role)) byRole.get(role).push(d);
    else unclassified.push(d);
  }
  const reviewerCount = byRole.get('reviewers').length;
  const coreCount = defs.length - reviewerCount;

  const table = (rows) => {
    const lines = ['| Agent | Model | Effort | What it does |', '|---|---|---|---|'];
    for (const d of rows) {
      lines.push(`| \`${esc(d.name)}\` | ${esc(d.fm.model) || '—'} | ${esc(d.fm.effort) || '—'} | ${esc(d.fm.description)} |`);
    }
    return lines.join('\n');
  };

  const out = [
    '# Reference — Agents',
    '',
    '> **Auto-generated** by `scripts/gen-docs-reference.mjs` from `agents/*.md` frontmatter.',
    '> Do not edit by hand — run `node scripts/gen-docs-reference.mjs` to refresh.',
    '',
    `**${defs.length} agents** · ${coreCount} core & specialists · ${reviewerCount} domain reviewers.`,
    '',
    "Grouped by **team role** — after Boris Cherny's (Anthropic, Claude Code) five roles of the",
    'IT team of the future (Prototyper · Builder · Sweeper · Grower · Maintainer), plus the two',
    "axes his model omits: **Reviewers & Safety** (the compliance/security moat) and",
    '**Orchestration & Meta**. Roles are a lens over the agents, not a merge — each agent stays',
    'narrowly scoped (focused prompt + right model tier + gates).',
    '',
  ];
  for (const key of ROLE_ORDER) {
    const rows = byRole.get(key);
    if (!rows.length) continue;
    const r = ROLES[key];
    const suffix = r.cherny ? '' : ' _(great_cto adds — beyond Cherny\'s 5)_';
    out.push(`## ${r.label} — ${r.tagline}${suffix}`, '', r.blurb, '', table(rows), '');
  }
  if (unclassified.length) {
    out.push(
      '## Unclassified',
      '',
      '> ⚠️ These agents are not mapped in `shared/lifecycle-map.mjs`. Classify them there.',
      '',
      table(unclassified),
      '',
    );
  }
  return out.join('\n');
}

function renderCommands(defs) {
  const userCmds = defs.filter((d) => String(d.fm['user-invocable']) === 'true');
  const rows = (userCmds.length ? userCmds : defs);
  const lines = [
    '# Reference — Commands',
    '',
    '> **Auto-generated** by `scripts/gen-docs-reference.mjs` from `commands/*.md` frontmatter.',
    '> Do not edit by hand — run `node scripts/gen-docs-reference.mjs` to refresh.',
    '',
    `**${rows.length} user-invocable commands.**`,
    '',
    '| Command | Model | Arguments | What it does |',
    '|---|---|---|---|',
  ];
  for (const d of rows) {
    lines.push(`| \`/${esc(d.name)}\` | ${esc(d.fm.model) || '—'} | ${esc(d.fm['argument-hint']) || '—'} | ${esc(d.fm.description)} |`);
  }
  return lines.join('\n') + '\n';
}

/**
 * The two diagrams this project already computes, written where a reader is.
 *
 * `toMermaid` and `pipelineMermaid` have existed for months with exactly one
 * consumer: the board's /api/docs endpoint. Measured before this was added, one
 * of 168 documents in docs/ contained a diagram — not a matter of taste, but a
 * generator that was never pointed at the documentation.
 *
 * NO TIMESTAMP, deliberately. A "generated at <now>" line changes on every run,
 * which would make `--check` report the page stale every time and train whoever
 * sees it to regenerate without reading. The freshness guarantee is the check
 * itself: CI regenerates and compares, so a diagram that disagrees with the code
 * fails the build. That is a stronger claim than a date, and one nobody has to
 * believe.
 */
function renderArchitecture(root) {
  const lines = [
    '<!-- GENERATED by scripts/gen-docs-reference.mjs — do not edit by hand. -->',
    '',
    '# Architecture maps',
    '',
    'Both diagrams below are **derived**, not drawn: one from the import graph of',
    'the code as it stands, the other from `shared/pipeline.toml` — the same file',
    'the dispatcher acts on. A diagram that disagrees with the system is therefore',
    'impossible rather than merely unlikely, and CI checks it by regenerating this',
    'page and comparing.',
    '',
    'There is no "generated on" date here on purpose. A date would change on every',
    'run and make the drift check useless; the check is the freshness claim.',
    '',
    'See also: [Agents](agents.md) · [Commands](commands.md) · [Skills](skills.md).',
    '',
  ];

  let map = null;
  try { map = systemMap(root); } catch { /* reported below */ }
  lines.push('## How the code is arranged', '');
  if (map && map.nodes.length) {
    lines.push('Derived from what imports what, across ' +
      `${map.nodes.reduce((n, x) => n + x.count, 0)} files in ${map.nodes.length} groups.`, '');
    lines.push('```mermaid', toMermaid(map), '```', '');
    lines.push('| Group | Files | What it holds |', '|---|---:|---|');
    for (const n of map.nodes) lines.push(`| \`${n.key}\` | ${n.count} | ${n.what || ''} |`);
    lines.push('');
  } else {
    // Absent and unreadable are different from empty — say which happened.
    lines.push('_The import graph could not be read, so this section is not a map of a',
      'project with no code — it is a missing measurement._', '');
  }

  lines.push('## How a feature moves', '');
  let pipeline = null;
  try { pipeline = pipelineMermaid(readFileSync(join(ROOT, 'shared', 'pipeline.toml'), 'utf8')); }
  catch { /* reported below */ }
  if (pipeline) {
    lines.push('Derived from `shared/pipeline.toml`. Gates are drawn because they are',
      'where a human stands in the flow, and a map of an automated pipeline that',
      'hides its stopping points describes something other than what runs.', '');
    lines.push('```mermaid', pipeline, '```', '');
  } else {
    lines.push('_`shared/pipeline.toml` could not be read — this section is a missing',
      'measurement, not a pipeline with no stages._', '');
  }
  return lines.join('\n');
}

export function generate() {
  const agents = readDefs(AGENTS_DIR, { nameKey: 'name' });
  const commands = readDefs(COMMANDS_DIR, { nameKey: 'name' }); // commands have no name → filename
  const skills = readSkills(SKILLS_DIR);
  return {
    'agents.md': renderAgents(agents),
    'commands.md': renderCommands(commands),
    'skills.md': renderSkills(skills),
    'architecture-map.md': renderArchitecture(ROOT),
  };
}

function main() {
  const check = process.argv.includes('--check');
  const outputs = generate();
  let stale = 0;
  if (!check) mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, content] of Object.entries(outputs)) {
    const path = join(OUT_DIR, name);
    if (check) {
      const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
      if (current !== content) {
        console.error(`stale: docs/reference/${name} — run: node scripts/gen-docs-reference.mjs`);
        stale++;
      }
    } else {
      writeFileSync(path, content);
      console.log(`  ✓ docs/reference/${name}`);
    }
  }
  if (check && stale > 0) process.exit(2);
  if (!check) console.log('Done.');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
