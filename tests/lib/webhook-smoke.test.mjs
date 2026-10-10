import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runWebhookSmoke } from '../../scripts/lib/webhook-smoke.mjs';

const cliPath = fileURLToPath(new URL('../../packages/cli/index.mjs', import.meta.url));
for (const signature of ['valid', 'invalid']) {
  test(`actual source CLI isolated ${signature} HMAC smoke`, { timeout: 20000 }, async () => {
    const result = await runWebhookSmoke({ cliPath, signature });
    assert.equal(result.status, signature === 'valid' ? 200 : 401);
    assert.equal(result.isolated, true);
    assert.equal(result.dispatchedTo, signature === 'valid' ? 0 : null);
  });
}

for (const mismatch of ['missing-event-path', 'ambient-config', 'ambient-dlq']) {
  test(`incompatible artifact ${mismatch} refused before CLI mutation`, async t => {
    const root = mkdtempSync(join(tmpdir(), 'great-cto-legacy-webhook-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const marker = join(root, 'cli-started');
    const sentinel = join(root, 'ambient-config');
    writeFileSync(sentinel, 'unchanged');
    const entry = join(root, 'index.mjs');
    writeFileSync(entry, `import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(marker)},'mutated');`);
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'dist', 'package.json'), '{"type":"module"}');
    const getter = (name, filename, wrong) => `import{join}from'node:path';export function ${name}(){return ${wrong ? JSON.stringify(sentinel) : `join(process.env.GREAT_CTO_HOME,${JSON.stringify(filename)})`};}`;
    writeFileSync(join(root, 'dist', 'webhook-config.js'), getter('getConfigPath', 'webhooks.json', mismatch === 'ambient-config'));
    writeFileSync(join(root, 'dist', 'webhook-dispatch.js'), getter('getDlqPath', 'webhook-dlq.log', mismatch === 'ambient-dlq'));
    writeFileSync(join(root, 'dist', 'serve.js'), mismatch === 'missing-event-path' ? 'export const legacy=true;' : getter('getEventsLogPath', 'webhook-events.log', false));
    await assert.rejects(runWebhookSmoke({ cliPath: entry }), { code: 'WEBHOOK_SMOKE_ISOLATION_UNSUPPORTED' });
    assert.equal(existsSync(marker), false);
    assert.equal(readFileSync(sentinel, 'utf8'), 'unchanged');
  });
}
