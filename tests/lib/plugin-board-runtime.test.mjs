import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { startServerOnFreePort } from '../helpers/board-start.mjs';
import { reap } from '../helpers/reap.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('shipped gate policy is current and agrees with the CLI across every gate combination', async () => {
  execFileSync(process.execPath, [path.join(root, 'scripts/build-gate-policy.mjs'), '--check']);
  const plugin = await import('../../scripts/lib/gate-policy.mjs');
  const cli = await import('../../packages/cli/dist/archetypes.js');
  assert.deepEqual(plugin.GATES_BY_ARCHETYPE, cli.GATES_BY_ARCHETYPE);
  for (const archetype of [...Object.keys(cli.GATES_BY_ARCHETYPE), 'unknown']) {
    for (const size of ['nano', 'small', 'medium', 'large', 'enterprise']) {
      assert.deepEqual(plugin.gatesFor(archetype, size), cli.gatesFor(archetype, size));
      for (const tier of ['T0', 'T1', 'T2', 'unknown']) {
        assert.deepEqual(plugin.effectiveGates(archetype, size, tier), cli.effectiveGates(archetype, size, tier),
          `${archetype}/${size}/${tier}`);
      }
    }
  }
});

test('marketplace board boots without any CLI dist or node_modules', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-plugin-runtime-'));
  let proc;
  try {
    const plugin = path.join(tmp, 'plugin'), home = path.join(tmp, 'home');
    const project = path.join(home, 'sample-project');
    fs.mkdirSync(path.join(project, '.great_cto'), { recursive: true });
    fs.writeFileSync(path.join(project, '.great_cto/PROJECT.md'), 'project: sample-project\narchetype: fintech\n');
    fs.mkdirSync(path.join(project, '.codex/skills/demo'), { recursive: true });
    fs.writeFileSync(path.join(project, '.codex/skills/demo/SKILL.md'),
      '---\nname: demo\ndescription: A project skill document observed by an isolated marketplace runtime.\n---\n');
    fs.mkdirSync(path.join(home, '.great_cto'), { recursive: true });
    fs.writeFileSync(path.join(home, '.great_cto/projects.json'), JSON.stringify({ projects: [{ slug: 'sample-project', path: project }] }));
    for (const dir of ['packages/board', 'scripts', 'shared', '.claude-plugin']) {
      fs.cpSync(path.join(root, dir), path.join(plugin, dir), { recursive: true,
        filter: (src) => !/node_modules|\.test\.mjs$/.test(src) });
    }
    assert.equal(fs.existsSync(path.join(plugin, 'packages/cli/dist')), false);
    const started = await startServerOnFreePort({ entry: path.join(plugin, 'packages/board/server.mjs'),
      cwd: project, env: { HOME: home, USERPROFILE: home, NODE_PATH: '',
        GREAT_CTO_PROJECTS_FILE: path.join(home, '.great_cto/projects.json'),
        GREAT_CTO_NO_UPDATE_CHECK: '1', GREAT_CTO_BD_BIN: '/nonexistent/bd' },
      portEnv: 'BOARD_PORT', readyPath: '/api/version', timeoutMs: 10000 });
    proc = started.proc;
    const response = await fetch(`http://127.0.0.1:${started.port}/api/harnesses?project=sample-project`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('X-Project-Resolved'), 'slug');
    assert.equal(response.headers.get('X-Project-Fallback'), null);
    const projects = await (await fetch(`http://127.0.0.1:${started.port}/api/projects`)).json();
    assert.ok(projects.some((p) => p.slug === 'sample-project' && p.path === project));
    const skillsResponse = await fetch(`http://127.0.0.1:${started.port}/api/skills?project=sample-project`);
    assert.equal(skillsResponse.status, 200);
    const inventory = await skillsResponse.json();
    assert.equal(inventory.skills.length, 1);
    assert.equal(inventory.skills[0].name, 'demo');
    assert.equal(inventory.skills[0].read_state, 'observed');
    assert.match(inventory.skills[0].document_sha256, /^[0-9a-f]{64}$/);
  } finally {
    if (proc) await reap(proc);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
