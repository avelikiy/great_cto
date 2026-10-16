import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const html = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
function fixture(api = async () => null) {
  const context = createContext({
    scope: '?project=a', api, pqs() { return context.scope; },
    renderFleetList() {}, renderLegacyAgentsSection() {}, location: { hash: '' },
    document: { getElementById() { return null; } },
  });
  const start = html.indexOf('const fleetState = {');
  const end = html.indexOf('function sortFleet(', start);
  assert.ok(start > 0 && end > start);
  runInContext(html.slice(start, end), context);
  return code => runInContext(code, context);
}
const known = "fleetState.required = {state:'read',reviewers:[{agent:'pci-reviewer',verdict:false}]}; fleetState.requiredScope = pqs();";

test('focus is a presentation default over eight existing core roles', () => {
  const run = fixture();
  assert.equal(run('fleetState.view'), 'project');
  assert.equal(run('FLEET_CORE_ROLES.size'), 8);
  run(known);
  assert.equal(run("inFleetView({slug:'senior-dev'},'project')"), true);
  assert.equal(run("inFleetView({slug:'pci-reviewer'},'project')"), true);
  assert.equal(run("inFleetView({slug:'game-reviewer'},'project')"), false);
  assert.equal(run("inFleetView({slug:'game-reviewer'},'all')"), true);
});

test('unknown or malformed requirements fail visibly open to the catalog, not policy relaxation', () => {
  const run = fixture();
  assert.equal(run("inFleetView({slug:'game-reviewer'},'project')"), true);
  run("fleetState.required = {state:'read'}; fleetState.requiredScope = pqs();");
  assert.equal(run("inFleetView({slug:'game-reviewer'},'project')"), true);
  run(known + "scope='?project=b';");
  assert.equal(run("requiredOf('pci-reviewer')"), null);
  assert.equal(run("inFleetView({slug:'game-reviewer'},'project')"), true);
});

test('a retired but required reviewer is not hidden; other retired roles stay in Retired', () => {
  const run = fixture(); run(known);
  assert.equal(run("inFleetView({slug:'pci-reviewer',retired:true},'project')"), true);
  assert.equal(run("applyFleetFilters([{slug:'pci-reviewer',retired:true}]).length"), 1);
  assert.equal(run("inFleetView({slug:'senior-dev',retired:true},'project')"), false);
  assert.equal(run("inFleetView({slug:'game-reviewer',retired:true},'retired')"), true);
});

test('attention outside project focus remains available through its unfiltered view', () => {
  const run = fixture(); run(known);
  assert.equal(run("inFleetView({slug:'game-reviewer',health:'failing'},'project')"), false);
  assert.equal(run("inFleetView({slug:'game-reviewer',health:'failing'},'needs')"), true);
});

test('out-of-order reviewer responses cannot restore another project or an older request', async () => {
  const pending = [];
  const run = fixture(url => new Promise(resolve => pending.push({url, resolve})));
  const first = run('refreshRequiredReviewers()');
  run("scope='?project=b';");
  const second = run('refreshRequiredReviewers()');
  pending[1].resolve({state:'read',reviewers:[{agent:'legal-reviewer'}]});
  await second;
  pending[0].resolve({state:'read',reviewers:[{agent:'pci-reviewer'}]});
  await first;
  assert.equal(run("requiredOf('legal-reviewer').agent"), 'legal-reviewer');
  assert.equal(run("requiredOf('pci-reviewer')"), null);
  const old = run('refreshRequiredReviewers()');
  const latest = run('refreshRequiredReviewers()');
  pending[3].resolve({state:'read',reviewers:[]}); await latest;
  pending[2].resolve({state:'read',reviewers:[{agent:'pci-reviewer'}]}); await old;
  assert.equal(run("requiredOf('pci-reviewer')"), null);
});

test('failed refresh clears prior requirements instead of retaining a stale required chip', async () => {
  const run = fixture(); run(known);
  await run('refreshRequiredReviewers()');
  assert.equal(run('fleetRequirementsKnown()'), false);
  assert.equal(run("requiredOf('pci-reviewer')"), null);
});

test('late installed-roster replies cannot overwrite the selected project roster', async () => {
  const pending = [];
  const run = fixture(url => url.startsWith('/api/agents-installed')
    ? new Promise(resolve => pending.push(resolve)) : Promise.resolve(null));
  const first = run('refreshAgentsInstalled()');
  run("scope='?project=b';");
  const second = run('refreshAgentsInstalled()');
  pending[1]({agents:[{slug:'architect'}]}); await second;
  pending[0]({agents:[{slug:'pci-reviewer'}]}); await first;
  assert.equal(run('fleetState.agents[0].slug'), 'architect');
});

test('focus navigation is keyboard accessible and explains uncertainty without changing policy', () => {
  assert.match(html, /id="nav-view-project" role="button" tabindex="0"[^\n]+onkeydown=/);
  assert.match(html, /id="fleet-focus-note"[^>]+role="status"/);
  assert.match(html, /Project reviewer requirements are unknown/);
  assert.match(html, /required reviewer\(s\) missing from the installed catalog/);
  assert.match(html, /Display only, not an execution plan or proof of expertise/);
});
