import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
function fixture(read) {
  const nodes = { 'proj-search': { value: ' wallet ', focus() {} }, 'proj-menu-list': { innerHTML: '' }, 'proj-menu-status': { textContent: '' }, 'proj-switch': { classList: { contains: () => true } } };
  const ctx = { document: { getElementById: id => nodes[id] }, api: read, AbortController, setTimeout, clearTimeout, esc: x => String(x), archetypeIcon: () => '' };
  vm.createContext(ctx);
  const refresh = html.slice(html.indexOf('let _projMenuRead ='), html.indexOf('function closeProjMenu()'));
  const render = html.slice(html.indexOf('function renderProjMenu('), html.indexOf('async function switchProject('));
  vm.runInContext('let allProjects = [{slug:"fixture-clinic"}]; const currentProject="fixture-clinic";\n' + refresh + render, ctx);
  return { ctx, nodes, run: code => vm.runInContext(code, ctx) };
}
test('opening with a retained search does not restore unrelated projects', () => {
  const f = fixture(); f.run('renderProjMenu()');
  assert.match(f.nodes['proj-menu-list'].innerHTML, /No matches/);
  assert.doesNotMatch(f.nodes['proj-menu-list'].innerHTML, /fixture-clinic/);
});
test('fresh registry entries appear without reload and preserve current input', async () => {
  const f = fixture(async () => [{ slug: 'fixture-wallet', archetype: 'fintech' }, { slug: 'fixture-clinic' }]);
  await f.run('refreshProjMenu()');
  assert.match(f.nodes['proj-menu-list'].innerHTML, /fixture-wallet/);
  assert.doesNotMatch(f.nodes['proj-menu-list'].innerHTML, /fixture-clinic/);
  assert.equal(f.nodes['proj-search'].value, ' wallet ');
});
test('late refresh cannot replace a newer registry snapshot', async () => {
  const pending = [], f = fixture(() => new Promise(resolve => pending.push(resolve)));
  const first = f.run('refreshProjMenu()'), second = f.run('refreshProjMenu()');
  pending[1]([{ slug: 'fixture-wallet' }]); await second;
  pending[0]([{ slug: 'fixture-clinic' }]); await first;
  assert.match(f.nodes['proj-menu-list'].innerHTML, /fixture-wallet/);
});
test('failed refresh retains cached projects and reports that the list is stale', async () => {
  const f = fixture(async () => { throw Error('network'); });
  await f.run('refreshProjMenu()');
  assert.equal(f.run('allProjects[0].slug'), 'fixture-clinic');
  assert.match(f.nodes['proj-menu-status'].textContent, /last loaded list/);
});
