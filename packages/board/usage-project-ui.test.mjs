import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
function harness() {
  const body = { className: '', textContent: '', innerHTML: '', prepend() {} };
  const requests = [], rendered = [];
  const ctx = vm.createContext({
    currentProject: 'alpha', currentTab: 'usage', usageDays: 30, usageHost: 'claude', usageData: null,
    serverDefaultProject: false,
    _usageRequest: 0, _outcomesRequest: 0, _usageTimer: null, _outcomesTimer: null,
    document: { querySelectorAll: () => [], getElementById: () => body },
    clearTimeout, setTimeout,
    api: url => new Promise(resolve => requests.push({ url, resolve })),
    renderUsage: d => rendered.push(d), usageAgentsCard: d => d.marker, usageFindingsCard: () => '',
  });
  vm.runInContext(html.slice(html.indexOf('function pqs()'), html.indexOf('// Combined query string')), ctx);
  vm.runInContext(html.slice(html.indexOf('function resetProjectUsage()'), html.indexOf('const USAGE_HOSTS')), ctx);
  vm.runInContext(html.slice(html.indexOf('async function loadUsage(days)'), html.indexOf('\nfunction setUsageHost')), ctx);
  vm.runInContext(html.slice(html.indexOf('async function loadOutcomes()'), html.indexOf('\nfunction usageAgentsCard')), ctx);
  return { ctx, requests, rendered, body };
}

test('Usage requests carry project; a late previous-project response cannot render', async () => {
  const h = harness();
  const old = h.ctx.loadUsage();
  assert.match(h.requests[0].url, /project=alpha/);
  h.ctx.currentProject = 'beta'; h.ctx.resetProjectUsage();
  const next = h.ctx.loadUsage();
  h.requests[1].resolve({ state: 'counted', scope: { kind: 'project' }, marker: 'beta' });
  await next;
  h.requests[0].resolve({ state: 'counted', scope: { kind: 'project' }, marker: 'alpha' });
  await old;
  assert.deepEqual(h.rendered.map(d => d.marker), ['beta']);
  assert.equal(h.ctx.usageData.marker, 'beta');
  assert.match(h.requests[2].url, /api\/outcomes.*project=beta/);
  h.requests[2].resolve({ state: 'unavailable' });
});

test('an old server response with machine-wide data is refused', async () => {
  const h = harness(), run = h.ctx.loadUsage();
  h.requests[0].resolve({ state: 'counted', marker: 'global' }); await run;
  assert.equal(h.rendered.length, 0);
  assert.match(h.body.textContent, /did not confirm project-scoped/);
});

test('cold Usage deep-link waits for project resolution instead of requesting the server default', async () => {
  const h = harness(); h.ctx.currentProject = '';
  await h.ctx.loadUsage();
  assert.equal(h.requests.length, 0);
  const init = html.slice(html.indexOf('async function init()'), html.indexOf('\nfunction renderProjectFallbackBanner'));
  assert.match(init, /currentProject = proj;\s*resetProjectUsage\(\);\s*if \(currentTab === 'usage'\) loadUsage\(\)/);
});

test('project switching clears cached data immediately and drops late outcomes', async () => {
  const h = harness(); h.ctx.usageData = { marker: 'alpha' };
  const old = h.ctx.loadOutcomes();
  h.ctx.currentProject = 'beta'; h.ctx.resetProjectUsage();
  assert.equal(h.ctx.usageData, null);
  assert.match(h.body.textContent, /selected project/);
  const next = h.ctx.loadOutcomes();
  h.requests[1].resolve({ state: 'counted', scope: { kind: 'project' }, marker: 'beta' }); await next;
  h.requests[0].resolve({ state: 'counted', scope: { kind: 'project' }, marker: 'alpha' }); await old;
  assert.equal(h.body.innerHTML, 'beta');
});

test('unregistered server default omits invented project parameters; explicit unknown selections remain explicit', async () => {
  const h = harness(); h.ctx.currentProject = 'unregistered-display'; h.ctx.serverDefaultProject = true;
  const run = h.ctx.loadUsage();
  assert.equal(h.requests[0].url, '/api/usage?days=30');
  h.requests[0].resolve({ state: 'counted', scope: { kind: 'project' } }); await run;
  assert.equal(h.requests[1].url, '/api/outcomes?days=30');
  h.requests[1].resolve({ state: 'unavailable' });
  h.ctx.serverDefaultProject = false; h.ctx.currentProject = 'explicit-unknown';
  assert.match(h.ctx.pqs(), /project=explicit-unknown/);
});
