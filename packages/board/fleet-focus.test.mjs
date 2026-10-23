import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { focusRegistry } from '../../scripts/lib/focus-registry.mjs';
import { conditionalGraphProposal } from '../../scripts/lib/conditional-graph-proposal.mjs';

const html = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
function fixture(api = async () => null, host = 'codex') {
  const context = createContext({
    scope: '?project=a', api, sharedRegistry: focusRegistry(), sharedProposal: conditionalGraphProposal({focusId:'mental-care',host:'codex'}), pqs() { return context.scope; },
    renderFleetList() {}, renderLegacyAgentsSection() {}, location: { hash: '', search:host ? `?host=${host}` : '' },
    document: { getElementById() { return null; } },
  });
  const start = html.indexOf('const fleetState = {');
  const end = html.indexOf('function sortFleet(', start);
  assert.ok(start > 0 && end > start);
  runInContext(html.slice(start, end), context);
  runInContext("if (typeof acceptFocusRegistry === 'function') acceptFocusRegistry({projectId:'a',registry:sharedRegistry});", context);
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

test('focus choices require explicit selection and do not narrow the reviewer catalog', () => {
  const run = fixture(); run(known);
  assert.equal(run('fleetState.focusId'), null);
  run("setFleetFocus('mental-care')");
  assert.equal(run('fleetState.focusId'), 'mental-care');
  assert.equal(run("inFleetView({slug:'pci-reviewer'},'project')"), true);
  run("setFleetFocus('inferred-from-project-name')");
  assert.equal(run('fleetState.focusId'), null);
});

test('missing host identity stays unavailable rather than inferring controlled execution', () => {
  const run = fixture(undefined, null);
  assert.equal(run('fleetState.focusHost'), null);
});

test('unknown registry preserves full catalog even when reviewer requirements are known', () => {
  const run = fixture(); run(known);
  run('acceptFocusRegistry({registry:{schemaVersion:2}})');
  assert.equal(run("inFleetView({slug:'game-reviewer'},'project')"), true);
  assert.equal(run("inFleetView({slug:'pci-reviewer',retired:true},'project')"), true);
});

test('late proposal success, error and finally cannot replace a newer focus or project', async () => {
  const pending = [];
  const run = fixture(url => new Promise((resolve, reject) => pending.push({url, resolve, reject})));
  run("fleetState.focusId='mental-care'");
  const old = run('refreshFocusProposal()');
  run("fleetState.focusId='telemedicine'");
  const latest = run('refreshFocusProposal()');
  pending[0].reject(new Error('/private/overlay TOKEN_CANARY'));
  await old;
  assert.equal(run('fleetState.proposalLoading'), true);
  pending[1].resolve({projectId:'a',host:'codex',changeIdentity:null,proposal:conditionalGraphProposal({focusId:'telemedicine',host:'codex'})});
  await latest;
  assert.equal(run('fleetState.proposalLoading'), false);
  assert.equal(run('fleetState.proposal.proposal.focusId'), 'telemedicine');
  run("fleetState.focusId='mental-care'");
  const slow = run('refreshFocusProposal()');
  run("scope='?project=b'; fleetState.projectId='b'; fleetState.focusId=null");
  pending[2].resolve({projectId:'a',proposal:{schemaVersion:1,focusId:'mental-care'}});
  await slow;
  assert.equal(run('fleetState.proposal?.proposal?.focusId === "mental-care"'), false);
});

test('unsupported proposal reason, dangling edge or dropped mandatory roles cannot claim available assessment', () => {
  const run = fixture();
  assert.equal(run('validFocusProposal(sharedProposal)'), true);
  run("sharedProposal.reasons=['/private/overlay TOKEN_CANARY']");
  assert.equal(run('validFocusProposal(sharedProposal)'), false);
  run("sharedProposal.reasons=['missing-evidence']; sharedProposal.requiredRoles=[]");
  assert.equal(run('validFocusProposal(sharedProposal)'), false);
});

test('change and registry version switches invalidate an in-flight proposal', async () => {
  const pending = [];
  const run = fixture(url => new Promise(resolve => pending.push(resolve)));
  run("fleetState.focusId='mental-care'");
  const first = run('refreshFocusProposal()');
  run("fleetState.changeIdentity='new-change'");
  pending[0]({projectId:'a',proposal:{schemaVersion:1,focusId:'mental-care'}}); await first;
  assert.equal(run('fleetState.proposal'), null);
  const second = run('refreshFocusProposal()');
  run('fleetState.registry.registryVersion=2');
  pending[1]({projectId:'a',proposal:{schemaVersion:1,focusId:'mental-care'}}); await second;
  assert.equal(run('fleetState.proposal'), null);
});

test('denied registry read purges focus and proposal without reflecting the refusal payload', async () => {
  const run = fixture(async () => ({error:'host not allowed /private/overlay TOKEN_CANARY'}));
  run("fleetState.focusId='mental-care'; fleetState.proposal={private:'TOKEN_CANARY'}");
  await run('refreshFocusRegistry()');
  assert.equal(run('fleetState.registryDenied'), true);
  assert.equal(run('fleetState.registry'), null);
  assert.equal(run('fleetState.focusId'), null);
  assert.equal(run('fleetState.proposal'), null);
});
