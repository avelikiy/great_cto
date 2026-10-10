import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { skillInventory } from './lib/skills-inventory.mjs';

const text = '---\nname: retry\ndescription: Test retries with a fixed idempotency key and bounded attempts.\n---\n\n# Retry\n';
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-skills-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const home = path.join(dir, 'home'), cwd = path.join(dir, 'project');
  fs.mkdirSync(home); fs.mkdirSync(cwd);
  const write = (rel, body = text, base = home) => {
    const file = path.join(base, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body);
    return file;
  };
  return { home, cwd, write };
}
test('discovers host and selected-project scopes, document hashes, not quality scores', async t => {
  const f = fixture(t);
  f.write('.claude/skills/retry/SKILL.md');
  f.write('.codex/skills/retry/SKILL.md');
  f.write('.agents/skills/shared/SKILL.md', text.replace('name: retry', 'name: shared'));
  f.write('.claude/skills/local/SKILL.md', text.replace('name: retry', 'name: local'), f.cwd);
  const foreign = path.join(path.dirname(f.cwd), 'other');
  f.write('.claude/skills/foreign/SKILL.md', text, foreign);
  const s = await skillInventory(f);
  assert.equal(s.state, 'observed'); assert.equal(s.skills.length, 4);
  const claude = s.skills.find(x => x.location === '~/.claude/skills/retry/SKILL.md');
  assert.equal(claude.host, 'Claude Code'); assert.equal(claude.scope, 'machine');
  assert.equal(claude.document_sha256, createHash('sha256').update(text).digest('hex'));
  assert.equal(claude.integrity, 'document-only'); assert.equal(claude.upstream_revision, null);
  assert.equal(claude.loaded, 'unknown'); assert.equal(claude.quality, 'not-measured');
  assert.ok(s.skills.some(x => x.host === 'Shared' && x.scope === 'machine'));
  assert.ok(s.skills.some(x => x.scope === 'project' && x.name === 'local'));
  assert.ok(!JSON.stringify(s).includes(f.home)); assert.ok(!JSON.stringify(s).includes(f.cwd));
  assert.ok(!JSON.stringify(s).includes('quality_score'));
});
test('inventory is read-only, repeatable identities and observes local document edits', async t => {
  const f = fixture(t), file = f.write('.codex/skills/retry/SKILL.md');
  const a = await skillInventory(f), b = await skillInventory(f);
  assert.equal(a.skills[0].id, b.skills[0].id);
  assert.equal(fs.readFileSync(file, 'utf8'), text);
  assert.ok(!fs.existsSync(path.join(f.home, '.great_cto')));
  fs.appendFileSync(file, 'Local edit\n');
  const c = await skillInventory(f);
  assert.equal(c.skills[0].id, a.skills[0].id);
  assert.notEqual(c.skills[0].document_sha256, a.skills[0].document_sha256);
});
test('reads existing registry declarations but never its quality heuristic or arbitrary paths', async t => {
  const f = fixture(t);
  const file = f.write('.great_cto/catalog/retry/SKILL.md');
  const secret = f.write('secret.txt', 'DO NOT EXPOSE');
  f.write('.great_cto/skills-registry.json', JSON.stringify({
    discovered_at: '2026-10-01T00:00:00Z', plugin_version: '3.59.1',
    tier2_external: [{ name: 'retry', source: 'catalog', path: file, quality_score: 100 }],
    tier3_personal: [{ name: 'secret', source: 'personal', path: secret }],
  }));
  const s = await skillInventory(f);
  assert.equal(s.registry.state, 'observed');
  assert.equal(s.registry.declared_at, '2026-10-01T00:00:00Z');
  assert.equal(s.skills.length, 1);
  assert.equal(s.skills[0].declared_source, 'catalog');
  assert.equal(s.skills[0].host, 'Registry');
  assert.equal(s.state, 'partial');
  assert.ok(!JSON.stringify(s).includes('DO NOT EXPOSE'));
  assert.ok(!JSON.stringify(s).includes(secret));
});
test('corrupt registry and unreadable directory are partial, never empty success', async t => {
  const f = fixture(t);
  f.write('.great_cto/skills-registry.json', '{broken');
  f.write('.claude/skills', 'not a directory');
  const s = await skillInventory(f);
  assert.equal(s.state, 'partial'); assert.equal(s.registry.state, 'unreadable');
  assert.ok(s.sources.some(x => x.state === 'unreadable'));
});
test('symlink directories, documents and registry are not followed', async t => {
  const f = fixture(t), secret = f.write('outside/SKILL.md', text.replace('retry', 'secret'));
  const root = path.join(f.home, '.claude/skills');
  fs.mkdirSync(root, { recursive: true });
  fs.symlinkSync(path.dirname(secret), path.join(root, 'escape'));
  fs.mkdirSync(path.join(root, 'linked')); fs.symlinkSync(secret, path.join(root, 'linked/SKILL.md'));
  fs.mkdirSync(path.join(f.home, '.great_cto'));
  fs.symlinkSync(secret, path.join(f.home, '.great_cto/skills-registry.json'));
  const s = await skillInventory(f);
  assert.equal(s.skills.length, 0); assert.equal(s.state, 'partial');
  assert.equal(s.registry.state, 'unreadable');
});
test('bounded scan reports truncation rather than claiming a complete total', async t => {
  const f = fixture(t);
  for (let n = 0; n < 10; n++) f.write(`.codex/skills/s${n}/SKILL.md`);
  const s = await skillInventory({ ...f, limits: { entries: 3 } });
  assert.equal(s.state, 'partial'); assert.equal(s.truncated, true);
  assert.ok(s.skills.length < 10);
});
test('oversized files and malformed frontmatter have explicit states', async t => {
  const f = fixture(t);
  f.write('.codex/skills/large/SKILL.md', 'x'.repeat(140000));
  f.write('.codex/skills/broken/SKILL.md', '---\nnot yaml\n---\n');
  const s = await skillInventory(f);
  assert.equal(s.state, 'partial');
  const large = s.skills.find(x => x.name === 'large');
  assert.equal(large.document_sha256, null); assert.equal(large.read_state, 'too-large');
  const broken = s.skills.find(x => x.name === 'broken');
  assert.ok(broken.warnings.includes('invalid-frontmatter'));
});
test('plugin caches retain declared cache version, not upstream SHA or enabled state', async t => {
  const f = fixture(t);
  f.write('.codex/plugins/cache/vendor/product/1.2.3/skills/retry/SKILL.md');
  const s = await skillInventory(f);
  assert.equal(s.skills.length, 1);
  assert.equal(s.skills[0].host, 'Codex');
  assert.equal(s.skills[0].cache_version, '1.2.3');
  assert.equal(s.skills[0].upstream_revision, null);
  assert.equal(s.skills[0].enabled, 'unknown');
});
test('duplicate names are not merged and document warnings reuse existing lint rules', async t => {
  const f = fixture(t);
  f.write('.codex/skills/retry/SKILL.md', text);
  f.write('.claude/skills/retry/SKILL.md', text.replace('description:', 'description: unquoted:'));
  const s = await skillInventory(f);
  assert.equal(s.skills.length, 2); assert.notEqual(s.skills[0].id, s.skills[1].id);
  assert.ok(s.skills.some(x => x.warnings.includes('ambiguous-yaml')));
});
test('large cache dependency trees cannot starve project roots or the other host cache', async t => {
  const f = fixture(t);
  for (let n = 0; n < 25; n++) f.write(`.claude/plugins/cache/vendor/product/1.2.3/node_modules/dep${n}/SKILL.md`);
  f.write('.claude/plugins/cache/vendor/product/1.2.3/skills/retry/SKILL.md');
  f.write('.codex/plugins/cache/vendor/product/1.2.3/skills/retry/SKILL.md');
  f.write('.agents/skills/local/SKILL.md', text.replace('name: retry', 'name: local'), f.cwd);
  const s = await skillInventory({ ...f, limits: { entries: 25 } });
  assert.equal(s.skills.length, 3);
  assert.equal(s.truncated, false);
  assert.ok(s.skills.some(x => x.scope === 'project'));
  assert.ok(s.skills.some(x => x.host === 'Codex'));
});
test('per-cache quotas keep both ecosystems visible while reporting incomplete coverage', async t => {
  const f = fixture(t);
  for (const host of ['.claude', '.codex']) for (const name of ['a', 'b'])
    f.write(`${host}/plugins/cache/vendor/product/1.2.3/skills/${name}/SKILL.md`);
  const s = await skillInventory({ ...f, limits: { cacheSkills: 1 } });
  assert.equal(s.state, 'partial'); assert.equal(s.truncated, true);
  assert.ok(s.skills.some(x => x.host === 'Claude Code'));
  assert.ok(s.skills.some(x => x.host === 'Codex'));
  assert.ok(s.sources.filter(x => x.host === 'Codex').some(x => x.warnings.includes('source-limit')));
});
test('migrated Codex commands are catalogued; a too-large registry remains unreadable', async t => {
  const f = fixture(t);
  f.write('.codex/plugins/cache/vendor/product/1.2.3/.codex-plugin/migrated-command-skills/retry/SKILL.md');
  f.write('.great_cto/skills-registry.json', '{' + ' '.repeat(200));
  const s = await skillInventory({ ...f, limits: { registryBytes: 100 } });
  assert.equal(s.registry.state, 'unreadable'); assert.equal(s.state, 'partial');
  assert.equal(s.skills.length, 1); assert.equal(s.skills[0].host, 'Codex');
});
test('a genuinely empty inventory distinguishes absent sources from unreadable sources', async t => {
  const f = fixture(t), s = await skillInventory(f);
  assert.equal(s.state, 'observed'); assert.equal(s.skills.length, 0);
  assert.equal(s.registry.state, 'absent');
  assert.ok(s.sources.every(x => x.state === 'absent'));
});
