import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
const start = html.indexOf('let skillsData = null;');
const end = html.indexOf('// ── Usage (great_cto-egkw)', start);
function fixture() {
  const nodes = Object.fromEntries(['skills-body', 'skills-status', 'skills-search', 'skills-host', 'skills-scope'].map(id =>
    [id, { value: id === 'skills-search' ? '' : 'all', innerHTML: '', textContent: '', attrs: {},
      setAttribute(k, v) { this.attrs[k] = v; } }]));
  const requests = [];
  const context = vm.createContext({
    currentProject: 'alpha', document: { getElementById: id => nodes[id] },
    pqs: () => '?project=' + context.currentProject, fmtDate: s => s,
    esc: s => String(s).replaceAll('<', '&lt;'), AbortSignal,
    api(url, options) { assert.ok(options.signal); return new Promise(resolve => requests.push({ url, resolve })); },
  });
  vm.runInContext(html.slice(start, end), context);
  return { context, nodes, requests };
}
const snapshot = name => ({ state: 'observed', observed_at: '2026-10-10T00:00:00Z', skills: [{
  name, location: 'project/.agents/skills/' + name, host: 'Shared', scope: 'project',
  document_sha256: null, read_state: 'unreadable', warnings: [],
}], registry: { state: 'absent' }, sources: [] });
test('late old-project and old-reload responses cannot overwrite newer inventory', async () => {
  const { context: c, nodes, requests: r } = fixture();
  const old = c.loadSkillsInventory();
  c.currentProject = 'beta';
  const recent = c.loadSkillsInventory();
  r[1].resolve(snapshot('beta-skill')); await recent;
  r[0].resolve(snapshot('alpha-skill')); await old;
  assert.match(nodes['skills-body'].innerHTML, /beta-skill/);
  assert.doesNotMatch(nodes['skills-body'].innerHTML, /alpha-skill/);
  const earlier = c.loadSkillsInventory(), later = c.loadSkillsInventory();
  r[3].resolve(snapshot('newer')); await later;
  r[2].resolve(snapshot('older')); await earlier;
  assert.match(nodes['skills-body'].innerHTML, /newer/);
  assert.doesNotMatch(nodes['skills-body'].innerHTML, /older/);
  assert.equal(nodes['skills-body'].attrs['aria-busy'], 'false');
});
test('loading clears previous data and an invalid response remains unknown, not zero', async () => {
  const { context: c, nodes, requests: r } = fixture();
  nodes['skills-body'].innerHTML = 'previous data';
  const p = c.loadSkillsInventory();
  assert.equal(nodes['skills-body'].innerHTML, '');
  assert.equal(nodes['skills-body'].attrs['aria-busy'], 'true');
  r[0].resolve({ error: 'could not read' }); await p;
  assert.match(nodes['skills-status'].textContent, /Could not read/);
  assert.equal(nodes['skills-body'].innerHTML, '');
});
