#!/usr/bin/env node
/**
 * scripts/skill-lint.mjs — structural validator for skills/*\/SKILL.md, the skill
 * counterpart of agent-prompt-lint.mjs. Agents had a lint, a review and a retire
 * loop; skills shipped with none, so a skill whose frontmatter did not load, whose
 * name drifted from its directory, or which pointed at a deleted script was found
 * only by a model failing to use it.
 *
 * Rules:
 *   SK-001 error  YAML frontmatter present and parses
 *   SK-002 error  `name` equals the skill's directory
 *   SK-003 error  `description` present, 40–1024 chars (the model routes on it)
 *   SK-004 warn   SKILL.md over 20 KB (loaded whole into context) — HEAVY_ALLOWED exempts
 *   SK-005 error  a relative link or backticked repo path points at a file that does not exist
 *   SK-006 error  a private absolute path (/Users/<name>/…, /home/<name>/…)
 *
 * Usage:
 *   node scripts/skill-lint.mjs [--root <repo>] [--json]
 * Exit: 0 clean or warnings only · 1 errors · 2 invalid invocation
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SIZE_BUDGET = 20 * 1024;
export const DESC_MIN = 40;
export const DESC_MAX = 1024;

/** Skills allowed over the size budget, each with the reason it is allowed. */
export const HEAVY_ALLOWED = {
  'ui-ux-pro-max': 'vendored design reference (MIT, upstream layout); its tables are the payload and are loaded only for UI work',
};

// Backticked paths into great_cto's own tree. docs/ and tests/ are left out on
// purpose: skills name those as paths in the *target* project far more often.
const REPO_PATH = /^(scripts|skills|agents|commands|shared|hooks|packages)\/[A-Za-z0-9._/-]+\.[A-Za-z0-9]+$/;
const MD_LINK = /\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const TICKED = /`([^`\n]+)`/g;
const PRIVATE_PATH = /(?<![\w.~$}])\/(?:Users|home)\/[A-Za-z0-9][A-Za-z0-9._-]*\//g;

/**
 * Minimal YAML frontmatter reader: top-level `key: value`, block scalars
 * (`|` / `>`), and indented continuation (lists, nested maps) kept as text.
 * Throws on a top-level line that is not a key.
 */
export function parseFrontmatter(text) {
  const t = String(text).replace(/\r\n/g, '\n');
  if (!t.startsWith('---\n')) return null;
  const end = t.indexOf('\n---', 3);
  if (end === -1) return null;
  const yaml = t.slice(4, end);
  const body = t.slice(end + 4).replace(/^\n/, '');
  const data = {};
  let key = null;
  let block = false;
  for (const line of yaml.split('\n')) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    if (/^\s/.test(line)) {
      if (key === null) throw new Error(`indented line before any key: ${line.slice(0, 60)}`);
      const v = line.trim();
      if (block || typeof data[key] === 'string') data[key] = data[key] ? `${data[key]} ${v}` : v;
      continue;
    }
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:(?:\s+(.*)|\s*)$/);
    if (!m) throw new Error(`unparseable line: ${line.slice(0, 60)}`);
    key = m[1];
    const v = (m[2] ?? '').trim();
    block = /^[|>][+-]?$/.test(v);
    data[key] = block ? '' : v === '' ? null : v.replace(/^(["'])([\s\S]*)\1$/, '$2');
  }
  return { data, body };
}

const placeholder = (s) => /[{}<>*…$]|\.\.\./.test(s);

function danglingRefs(text, skillDir, repoRoot) {
  const out = [];
  const exists = (rel) => [skillDir, repoRoot].some((base) => fs.existsSync(path.resolve(base, rel)));
  for (const m of text.matchAll(MD_LINK)) {
    const target = m[1].replace(/#.*$/, '');
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(m[1]) || m[1].startsWith('#') || target.startsWith('/') || placeholder(target)) continue;
    if (!exists(target)) out.push(`link to missing file \`${target}\``);
  }
  for (const m of text.matchAll(TICKED)) {
    const p = m[1].trim().replace(/:\d+(-\d+)?$/, '');
    if (!REPO_PATH.test(p) || placeholder(p)) continue;
    if (!exists(p)) out.push(`reference to missing file \`${p}\``);
  }
  return out;
}

function lintOne(name, file, repoRoot) {
  const errors = [];
  const warnings = [];
  const push = (list, rule, msg) => list.push({ skill: name, rule, msg });
  const text = fs.readFileSync(file, 'utf8');

  let fm = null;
  try {
    fm = parseFrontmatter(text);
    if (!fm) push(errors, 'SK-001', 'no `---` frontmatter at the start of the file');
  } catch (e) {
    push(errors, 'SK-001', `frontmatter does not parse: ${e.message}`);
  }
  if (fm) {
    const { name: n, description: d } = fm.data;
    if (n !== name) push(errors, 'SK-002', `name \`${n ?? '(missing)'}\` does not match directory \`${name}\``);
    if (typeof d !== 'string' || !d.trim()) push(errors, 'SK-003', 'frontmatter missing `description`');
    else if (d.length < DESC_MIN) push(errors, 'SK-003', `description too short (${d.length} chars; min ${DESC_MIN})`);
    else if (d.length > DESC_MAX) push(errors, 'SK-003', `description too long (${d.length} chars; max ${DESC_MAX})`);
  }

  const bytes = Buffer.byteLength(text);
  if (bytes > SIZE_BUDGET && !HEAVY_ALLOWED[name]) {
    push(warnings, 'SK-004', `${(bytes / 1024).toFixed(1)} KB over the ${SIZE_BUDGET / 1024} KB budget — loaded whole into context`);
  }
  for (const msg of danglingRefs(text, path.dirname(file), repoRoot)) push(errors, 'SK-005', msg);
  for (const m of text.matchAll(PRIVATE_PATH)) push(errors, 'SK-006', `private absolute path \`${m[0]}…\``);
  return { errors, warnings };
}

/** Lint every skills/<name>/SKILL.md under repoRoot. */
export function lintSkills({ repoRoot }) {
  const dir = path.join(repoRoot, 'skills');
  const names = fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md')))
    .map((e) => e.name).sort();
  const errors = [];
  const warnings = [];
  for (const n of names) {
    const r = lintOne(n, path.join(dir, n, 'SKILL.md'), repoRoot);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }
  return { skills: names.length, errors, warnings };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const a = process.argv.slice(2);
  const i = a.indexOf('--root');
  if (i >= 0 && !a[i + 1]) { process.stderr.write('usage: skill-lint.mjs [--root <repo>] [--json]\n'); process.exit(2); }
  const repoRoot = i >= 0 ? path.resolve(a[i + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let r;
  try { r = lintSkills({ repoRoot }); } catch (e) { process.stderr.write(`skill-lint: ${e.message}\n`); process.exit(2); }
  if (a.includes('--json')) {
    process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
  } else {
    for (const e of r.errors) process.stdout.write(`ERROR ${e.rule} skills/${e.skill}: ${e.msg}\n`);
    for (const w of r.warnings) process.stdout.write(`warn  ${w.rule} skills/${w.skill}: ${w.msg}\n`);
    const heavy = Object.keys(HEAVY_ALLOWED).join(', ');
    process.stdout.write(`skill-lint: ${r.skills} skills · ${r.errors.length} errors · ${r.warnings.length} warnings (heavy by allow-list: ${heavy})\n`);
  }
  process.exit(r.errors.length ? 1 : 0);
}
