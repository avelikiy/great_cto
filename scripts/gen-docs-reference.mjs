#!/usr/bin/env node
// scripts/gen-docs-reference.mjs — auto-generate the docs reference from agent &
// command frontmatter, so the reference never drifts from the source of truth.
//
// Produces:
//   docs/reference/agents.md    — table of all agents/*.md (name, model, effort, description)
//   docs/reference/commands.md  — table of all commands/*.md (command, model, args, description)
//
// Usage:
//   node scripts/gen-docs-reference.mjs            # (re)generate the reference pages
//   node scripts/gen-docs-reference.mjs --check    # CI: exit 2 if generated output is stale
//
// Exit: 0 ok · 1 error · 2 stale (with --check)

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLES, ROLE_ORDER, roleForAgent } from '../shared/lifecycle-map.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
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

export function generate() {
  const agents = readDefs(AGENTS_DIR, { nameKey: 'name' });
  const commands = readDefs(COMMANDS_DIR, { nameKey: 'name' }); // commands have no name → filename
  return {
    'agents.md': renderAgents(agents),
    'commands.md': renderCommands(commands),
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
