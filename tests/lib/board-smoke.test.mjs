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
