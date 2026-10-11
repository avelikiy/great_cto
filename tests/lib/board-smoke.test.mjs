import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBoardSmoke } from '../../scripts/lib/board-smoke.mjs';
const agentsDir = fileURLToPath(new URL('../../agents', import.meta.url));
test('actual board HTTP fixture exercises eleven endpoints and nonvacuous task ratio', { timeout: 20000 }, async () => {
  const r = await runBoardSmoke({ serverPath: fileURLToPath(new URL('../../packages/board/server.mjs', import.meta.url)), agentsDir });
  assert.equal(r.endpointsVerified, 11);
  assert.equal(r.syntheticTaskRateRatio, 500);
  assert.equal(r.actualBeadsVerified, false);
  assert.equal(r.notificationDeliveryVerified, false);
  assert.equal(r.providerCalls, 0);
});
test('legacy board isolation refusal occurs before server entrypoint executes', async t => {
  const root = mkdtempSync(join(tmpdir(), 'great-cto-legacy-board-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'lib'));
  const marker = join(root, 'server-started'), serverPath = join(root, 'server.mjs');
  writeFileSync(serverPath, `import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(marker)},'started');`);
  writeFileSync(join(root, 'lib', 'config.mjs'), 'export const GREAT_CTO_DIR="legacy";');
  writeFileSync(join(root, 'lib', 'projects.mjs'), 'export const legacy=true;');
  await assert.rejects(runBoardSmoke({ serverPath, agentsDir }), { code: 'BOARD_SMOKE_ISOLATION_UNSUPPORTED' });
  assert.equal(existsSync(marker), false);
});

function admittedFixture(t, code) {
  const root = mkdtempSync(join(tmpdir(), 'great-cto-board-start-fault-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'lib'));
  const serverPath = join(root, 'server.mjs');
  writeFileSync(serverPath, code);
  const names = { PROJECTS_FILE:'projects.json', NOTIF_HISTORY_FILE:'notif-history.json', PUSH_SUBS_FILE:'push-subscriptions.json', VAPID_KEYS_FILE:'vapid-keys.json', SHARE_STATE_FILE:'board-share.json' };
  writeFileSync(join(root, 'lib', 'config.mjs'), "import{join}from'node:path';export const GREAT_CTO_DIR=process.env.GREAT_CTO_HOME;" + Object.entries(names).map(([name, file]) => `export const ${name}=join(GREAT_CTO_DIR,${JSON.stringify(file)});`).join(''));
  writeFileSync(join(root, 'lib', 'projects.mjs'), 'export function getDiscoveryScope(){return {roots:[process.env.GREAT_CTO_DISCOVERY_ROOT],includeClaudeProjects:false};}');
  return serverPath;
}

test('exit zero before listening is a failure, not an existing-server success', { timeout: 20000 }, async t => {
  const serverPath = admittedFixture(t, 'process.exit(0);');
  await assert.rejects(runBoardSmoke({ serverPath, agentsDir }), /exited before listening/);
});

test('unexpected model process is intercepted and fails the fixture', { timeout: 20000 }, async t => {
  const serverPath = admittedFixture(t, "import{spawn}from'node:child_process';spawn('claude',['-p','fixture must not execute']);");
  await assert.rejects(runBoardSmoke({ serverPath, agentsDir }), /unexpected child refused/);
});

test('unexpected fork is refused, not admitted by the read-worker fixture adapter', { timeout: 20000 }, async t => {
  const serverPath = admittedFixture(t, "import{fork}from'node:child_process';fork('claude',['bd','20250']);");
  await assert.rejects(runBoardSmoke({ serverPath, agentsDir }), /unexpected child refused/);
});

for (const mode of ['second-opinion', 'arbitrary-command']) test(`evidence adapter refuses a substituted worker for ${mode}`, { timeout: 20000 }, async t => {
  const serverPath = admittedFixture(t, `import{fork}from'node:child_process';import{fileURLToPath}from'node:url';fork(fileURLToPath(new URL('./lib/bd-read-worker.mjs',import.meta.url)),[process.execPath,'20250',JSON.stringify(['/untrusted/receipt-read-worker.mjs',${JSON.stringify(mode)}])]);`);
  await assert.rejects(runBoardSmoke({ serverPath, agentsDir }), /unexpected child refused/);
});

test('evidence adapter refuses an unknown operation on its exact trusted worker', { timeout: 20000 }, async t => {
  const serverPath = admittedFixture(t, "import{fork}from'node:child_process';import{fileURLToPath}from'node:url';fork(fileURLToPath(new URL('./lib/bd-read-worker.mjs',import.meta.url)),[process.execPath,'20250',JSON.stringify([fileURLToPath(new URL('./lib/receipt-read-worker.mjs',import.meta.url)),'arbitrary-command'])]);");
  await assert.rejects(runBoardSmoke({ serverPath, agentsDir }), /unexpected child refused/);
});
