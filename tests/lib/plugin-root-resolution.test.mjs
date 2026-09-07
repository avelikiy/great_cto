// One way to find the plugin, and it must not be a guess about where it lives.
//
// Every hook and every shipped command resolved the plugin by globbing
// `~/.claude/plugins/cache/local/great_cto/*/` — a path that exists only for
// the `local` DIRECTORY marketplace the CLI's own installer writes. Installed
// from a GitHub marketplace the plugin lands at
// `cache/<marketplace>/<plugin>/<ref>/`, that glob matches nothing, and every
// one of those commands then runs as `node "/scripts/hooks/x.mjs"` behind
// `2>/dev/null || true`: the session starts, the plugin looks installed, and
// not one hook fires. Silently. Which is the failure this product exists to
// make impossible.
//
// Claude Code sets CLAUDE_PLUGIN_ROOT for the hooks it runs. That is the
// answer, and the fallback for everything else must look across EVERY
// marketplace rather than assuming one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HARDCODED = /cache\/local\/great_cto/;

/** Every file this repository SHIPS — the plugin's own surface, not its tooling. */
function shipped() {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(ROOT, rel);
    let entries;
    try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const r = path.join(rel, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(r); }
      else if (/\.(md|mjs|sh|json)$/.test(e.name)) out.push(r);
    }
  };
  for (const dir of ['commands', 'scripts', 'skills', 'agents', '.claude-plugin']) walk(dir);
  return out;
}

test('nothing shipped assumes the plugin lives under the `local` marketplace', () => {
  const offenders = shipped().filter((rel) => {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    if (!HARDCODED.test(text)) return false;
    // A line that NAMES the old path while explaining why it is wrong is
    // documentation, not a dependency. Comments and prose are exempt; a line
    // that assigns from it is not.
    const lines = text.split('\n');
    return lines.some((l, i) => HARDCODED.test(l)
      && !/^\s*(#|\/\/|\*|<!--)/.test(l)
      // A deliberate use is explained on the lines above it, not crammed onto the
      // command itself. Two lines of lookback is enough for a real explanation and
      // too few to launder an accident.
      && !/(deliberately|historic|used to|no longer|instead of|previously)/i
           .test([lines[i - 3], lines[i - 2], lines[i - 1], l].join(' ')));
  });
  assert.deepEqual(offenders, [],
    'these resolve the plugin by a path that only exists for a directory-marketplace install — '
    + 'use ${CLAUDE_PLUGIN_ROOT} with a fallback that walks every marketplace');
});

test('the hooks prefer the variable the host sets, and fall back across marketplaces', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin/plugin.json'), 'utf8'));
  const commands = Object.values(manifest.hooks || {})
    .flat().flatMap((g) => g.hooks || []).map((h) => h.command || '');
  const resolving = commands.filter((c) => /PLUGIN_DIR=/.test(c));
  assert.ok(resolving.length > 0, 'some hook resolves the plugin directory');
  for (const c of resolving) {
    assert.match(c, /CLAUDE_PLUGIN_ROOT/,
      `a hook resolves PLUGIN_DIR without asking the host first: ${c.slice(0, 90)}`);
    assert.match(c, /cache\/\*\/great_cto|cache\/\$\{?\w/,
      `the fallback names one marketplace instead of all of them: ${c.slice(0, 90)}`);
  }
});

test('a plugin that cannot be located says so once, rather than every hook failing mutely', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin/plugin.json'), 'utf8'));
  const commands = Object.values(manifest.hooks || {})
    .flat().flatMap((g) => g.hooks || []).map((h) => h.command || '');
  const loud = commands.filter((c) => /-z "\$PLUGIN_DIR"/.test(c) && /GREAT_CTO/.test(c));
  assert.ok(loud.length >= 1,
    'no hook reports an unresolvable plugin — the whole failure would be invisible');
});

// ── Removing what the plugin no longer ships ────────────────────────────────
//
// The copy step kept two hand-written kill lists — `for STALE in triage gates
// dora …` and `for STALE_AGENT in tech-lead` — so a command or agent dropped
// from the plugin kept working at the user level until somebody remembered to
// add its name. Nobody audits a list like that; it is a roster pretending to be
// a rule. The marker the copies already carry makes the rule available: a file
// WE wrote whose source is gone from the plugin is stale, by definition.
test('stale copies are found by a rule, not by a list somebody must remember to edit', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin/plugin.json'), 'utf8'));
  const commands = Object.values(manifest.hooks || {})
    .flat().flatMap((g) => g.hooks || []).map((h) => h.command || '');
  const copyHook = commands.find((c) => c.includes('.claude/commands') && c.includes('great_cto-managed'));
  assert.ok(copyHook, 'the hook that copies commands and agents to the user level still exists');

  assert.ok(!/for STALE(_AGENT)? in /.test(copyHook),
    'a hand-maintained list of names to delete is back — the rule reads the plugin instead');

  // The rule, in both halves: only OUR files, and only when the source is gone.
  for (const dir of ['commands', 'agents']) {
    const half = copyHook.slice(copyHook.indexOf(`~/.claude/${dir}/`));
    assert.match(half, /grep -q 'great_cto-managed'/,
      `the ${dir} sweep must touch only files great_cto wrote`);
    assert.match(half, new RegExp(`\\[ -f "\\$\\{PLUGIN_DIR\\}/${dir}/`),
      `the ${dir} sweep must decide by whether the plugin still ships it`);
  }
});
