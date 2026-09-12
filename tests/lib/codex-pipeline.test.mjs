import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { newRun, runStage as stage, approve, safePath, validateProposal, verifyStage } from '../../scripts/lib/codex-pipeline.mjs';
import { codexRoleProfile } from '../../scripts/lib/codex-role-profiles.mjs';
const runStage = (state, options = {}) => stage(state, { verify: async () => ({ state: 'verified', findings: [], checks: ['test fixture'] }), ...options });

function fixture(t, graph = '[transitions.writer]\non = ["DONE"]\nproduces = ["report"]\ngate = "gate:code"\nnext = ["reviewer"]\n[transitions.reviewer]\non = ["PASS"]\ngate = "gate:ship"\nnext = []') {
  const root = mkdtempSync(join(tmpdir(), 'codex-host-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const pluginRoot = join(root, 'plugin');
  mkdirSync(join(pluginRoot, 'shared'), { recursive: true }); mkdirSync(join(pluginRoot, 'agents'));
  writeFileSync(join(pluginRoot, 'shared/pipeline.toml'), graph);
  for (const role of ['writer', 'reviewer', 'qa', 'security']) writeFileSync(join(pluginRoot, `agents/${role}.md`), `You are ${role}.\nRun bd close forbidden-host-task and write .great_cto/gate.json.`);
  return newRun({ root, pluginRoot, prompt: 'Build a fixture', allowed: ['src', 'docs'], entry: 'writer' });
}
const response = (verdict = 'DONE', files = [{ path: 'src/app.js', before: null, content: 'export const x = 1;\n' }]) =>
  ({ state: 'ok', code: 0, errors: [], text: JSON.stringify({ verdict, summary: 'fixture', meta: { report: 'src/app.js' }, files }), usage: null });

test('role -> guarded write -> human gate -> resume -> terminal gate -> done', async t => {
  const s = fixture(t); const calls = [];
  await runStage(s, { execute: async opts => { calls.push(opts); return response(); } });
  assert.equal(s.status, 'awaiting-gate'); assert.equal(calls.length, 1);
  assert.match(calls[0].prompt, /You are the writer specialist/);
  assert.doesNotMatch(calls[0].prompt, /forbidden-host-task|\.great_cto\/gate\.json/);
  assert.equal(calls[0].sandbox, 'read-only'); assert.ok(calls[0].extraArgs.includes('--ignore-user-config'));
  assert.ok(calls[0].extraArgs.includes('plugins')); assert.ok(calls[0].extraArgs.includes('apps'));
  assert.equal(readFileSync(join(s.root, 'src/app.js'), 'utf8'), 'export const x = 1;\n');
  await runStage(s, { execute: async () => { throw Error('must not run across gate'); } });
  assert.throws(() => approve(s, 'wrong'), /token/);
  const oldToken = s.pending.token; approve(s, oldToken);
  await runStage(s, { execute: async opts => { assert.match(opts.prompt, /You are the reviewer specialist/); return response('PASS', []); } });
  assert.equal(s.status, 'awaiting-gate'); assert.deepEqual(s.pending.gates, ['gate:ship']);
  assert.throws(() => approve(s, oldToken), /token/);
  approve(s, s.pending.token); assert.equal(s.status, 'done');
});

test('controlled role profiles cover the shipped graph and exclude host prompt authority', async t => {
  const s = fixture(t);
  assert.throws(() => codexRoleProfile('unknown-side-effecting-role'), /no controlled Codex profile/);
  const graph = newRun({ root: s.root, pluginRoot: resolve(fileURLToPath(import.meta.url), '../../..'), prompt: 'coverage', allowed: ['docs'], entry: 'product-owner' }).graph;
  for (const role of Object.keys(graph).filter(key => !key.includes('.'))) assert.ok(codexRoleProfile(role), role);

  // A graph role cannot silently inherit arbitrary instructions from its
  // agents/*.md file: unknown roles fail closed before Codex is launched.
  writeFileSync(join(s.pluginRoot, 'shared/pipeline.toml'), '[transitions.unknown-side-effecting-role]\non=["DONE"]\nnext=[]');
  const unknown = newRun({ root: s.root, pluginRoot: s.pluginRoot, prompt: 'test', allowed: ['docs'], entry: 'unknown-side-effecting-role' });
  let called = false;
  await assert.rejects(stage(unknown, { execute: async () => { called = true; return response(); } }), /no controlled Codex profile/);
  assert.equal(called, false);
});

test('secret in any proposed file prevents ALL writes', async t => {
  const s = fixture(t);
  const files = [{ path: 'src/ok.js', before: null, content: 'okay' }, { path: 'src/secret.js', before: null, content: 'AKIA' + 'A'.repeat(16) }];
  await runStage(s, { execute: async () => response('DONE', files) });
  assert.equal(s.status, 'blocked'); assert.match(s.reason, /secret blocked/);
  assert.equal(existsSync(join(s.root, 'src/ok.js')), false);
  assert.doesNotMatch(s.reason, /AKIA/);
});

test('reject path escapes, protected files, symlinks and changes outside ownership', t => {
  const s = fixture(t);
  for (const path of ['../outside', '/tmp/outside', 'docs/../outside', 'docs/AGENTS.md', '.great_cto/gate.json', '.codex/config.toml', 'other/file', 'src/.env', 'src\\escape']) {
    assert.throws(() => safePath(s.root, path, s.allowed));
  }
  mkdirSync(join(s.root, 'src')); symlinkSync(tmpdir(), join(s.root, 'src/link'));
  assert.throws(() => safePath(s.root, 'src/link/escape', s.allowed), /symlink/);
  symlinkSync(join(tmpdir(), 'nonexistent-codex-target'), join(s.root, 'src/dangling'));
  assert.throws(() => safePath(s.root, 'src/dangling', s.allowed), /symlink/);
});

test('semantic verification failure prevents gate approval and downstream dispatch', async t => {
  const s = fixture(t); s.maxAttempts = 1;
  await runStage(s, { execute: async () => response(), verify: async () => ({ state: 'rework', findings: ['wrong implementation'], checks: ['read implementation'] }) });
  assert.equal(s.status, 'blocked'); assert.equal(s.pending, null); assert.equal(s.results.writer, undefined);
  assert.match(s.reason, /wrong implementation/);
});

test('verifier rework survives serialization, carries findings and opens gate only after correction', async t => {
  let s = fixture(t);
  await runStage(s, { execute: async () => response(), verify: async () => ({ state: 'rework', findings: ['x must equal 2'], checks: ['read x'] }) });
  assert.equal(s.status, 'ready'); assert.equal(s.active, null); assert.equal(s.pending, null);
  assert.deepEqual(s.queue, ['writer']); assert.equal(s.results.writer, undefined);
  s = JSON.parse(JSON.stringify(s));
  await runStage(s, { execute: async opts => {
    assert.match(opts.prompt, /x must equal 2/);
    return response('DONE', [{ path: 'src/app.js', before: createHash('sha256').update(readFileSync(join(s.root, 'src/app.js'))).digest('hex'), content: 'export const x = 2;\n' }]);
  } });
  assert.equal(s.status, 'awaiting-gate'); assert.equal(s.rework, null);
  assert.deepEqual(s.attempts.map(a => a.status), ['rework', 'verified']);
  assert.notEqual(s.attempts[0].id, s.attempts[1].id);
  assert.equal(s.results.writer.attemptId, s.attempts[1].id);
});

test('bounded rework cannot dispatch forever or approve failed output', async t => {
  const s = fixture(t);
  for (let i = 0; i < 3; i++) await runStage(s, {
    execute: async () => response('DONE', i === 0 ? undefined : []),
    verify: async () => ({ state: 'rework', findings: ['still wrong'], checks: ['inspected'] }),
  });
  assert.equal(s.status, 'blocked'); assert.match(s.reason, /rework limit/);
  assert.equal(s.attempts.length, 3); assert.equal(s.pending, null);
  await runStage(s, { execute: async () => { throw Error('must not execute'); } });
  assert.equal(s.attempts.length, 3);
});

test('old run state does not silently opt in to automatic rework', async t => {
  const s = fixture(t); delete s.maxAttempts; delete s.attempts;
  await runStage(s, { execute: async () => response(), verify: async () => ({ state: 'rework', findings: ['wrong'], checks: ['read'] }) });
  assert.equal(s.status, 'blocked'); assert.equal(s.attempts.length, 1);
});

test('unverifiable and malformed evidence never trigger automatic retries', async t => {
  for (const verification of [{ state: 'unverifiable', checks: ['test unavailable'], findings: ['missing runtime'] }, { state: 'verified', checks: [], findings: [] }]) {
    const s = fixture(t);
    await runStage(s, { execute: async () => response(), verify: async () => verification });
    assert.equal(s.status, 'blocked'); assert.equal(s.active, 'writer'); assert.equal(s.pending, null);
    assert.equal(s.attempts[0].status, 'blocked');
  }
});

test('drift after gate approval and between rework attempts blocks worker launch', async t => {
  for (const rework of [false, true]) {
    const s = fixture(t);
    await runStage(s, { execute: async () => response(), ...(rework ? { verify: async () => ({ state: 'rework', findings: ['fix'], checks: ['read'] }) } : {}) });
    if (!rework) approve(s, s.pending.token);
    writeFileSync(join(s.root, 'src/app.js'), 'external change');
    await assert.rejects(runStage(s, { execute: async () => { assert.fail('worker must not launch'); } }), /artifact changed/);
  }
});

test('verifier cannot change a controlled artifact and still verify the stage', async t => {
  const s = fixture(t);
  await runStage(s, { execute: async () => response(), verify: async () => {
    writeFileSync(join(s.root, 'src/app.js'), 'changed by verifier');
    return { state: 'verified', findings: [], checks: ['read'] };
  } });
  assert.equal(s.status, 'blocked'); assert.match(s.reason, /artifact changed/);
});

test('verifier runs separately with actual file paths and refuses empty evidence', async t => {
  const s = fixture(t); const proposal = JSON.parse(response().text);
  const result = await verifyStage(s, 'writer', proposal, async opts => {
    assert.match(opts.prompt, /ACTUAL files/); assert.match(opts.prompt, /Controller release evidence: null/); assert.equal(opts.sandbox, 'read-only');
    assert.doesNotMatch(opts.prompt, /export const x/);
    return { ...response(), text: JSON.stringify({ state: 'verified', checks: ['read src/app.js'], findings: [] }) };
  });
  assert.equal(result.state, 'verified');
  await assert.rejects(verifyStage(s, 'writer', proposal, async () => ({ ...response(), text: '{"state":"verified","checks":[],"findings":[]}' })), /empty/);
});

test('post-release worker and verifier receive bounded controller evidence without artifact bytes', async t => {
  const s = fixture(t, '[transitions.writer]\non=["DONE"]\nnext=[]');
  s.release = {
    status: 'verified', path: '/designated/releases/id-digest', artifactDigest: 'overall', verifiedAt: '2026-09-08T00:00:00Z',
    token: 'must-not-leak', artifacts: [{ path: 'dist/app.mjs', sha256: 'file-digest', base64: 'must-not-leak' }],
    smoke: { state: 'passed', code: 0, image: 'node@sha256:pinned', files: { 'dist/app.mjs': 'file-digest' }, inputDigest: 'input', policyDigest: 'policy' },
  };
  const prompts = [];
  await runStage(s, {
    execute: async opts => {
      prompts.push(opts.prompt);
      return opts.prompt.includes('independent verifier')
        ? { ...response(), text: JSON.stringify({ state: 'verified', findings: [], checks: ['inspected release'] }) }
        : response('DONE', []);
    },
    verify: (state, role, proposal, execute) => verifyStage(state, role, proposal, execute),
  });
  assert.equal(s.status, 'done');
  assert.equal(prompts.length, 2);
  for (const prompt of prompts) {
    assert.match(prompt, /id-digest/); assert.match(prompt, /file-digest/); assert.match(prompt, /node@sha256:pinned/);
    assert.doesNotMatch(prompt, /must-not-leak/);
  }
});

test('stale replacement and duplicate paths rejected', t => {
  const s = fixture(t); mkdirSync(join(s.root, 'src')); writeFileSync(join(s.root, 'src/app.js'), 'user edit');
  assert.throws(() => validateProposal(s, JSON.parse(response().text)), /stale/);
  const proposal = JSON.parse(response().text); proposal.files = [{ path: 'docs/new', content: 'x', before: null }, { path: 'docs/new', content: 'y', before: null }];
  assert.throws(() => validateProposal(s, proposal), /duplicate/);
});

test('approval refuses artifact drift', async t => {
  const s = fixture(t); await runStage(s, { execute: async () => response() });
  writeFileSync(join(s.root, 'src/app.js'), 'changed after review');
  assert.throws(() => approve(s, s.pending.token), /changed since gate/);
});

test('process failure, malformed output, missing evidence and degraded host all block', async t => {
  for (const result of [{ ...response(), code: 1 }, { ...response(), text: 'not JSON' }, response('DONE', []), { ...response(), errors: ['skills truncated'] }]) {
    const s = fixture(t); await runStage(s, { execute: async () => result });
    assert.equal(s.status, 'blocked'); assert.equal(s.results.writer, undefined);
  }
});

test('exact optional shell snapshot timeout is recoverable; sandbox and other snapshot failures block', async t => {
  const timestamp = '2026-09-08T12:08:08.240314Z  ';
  const safe = fixture(t);
  await runStage(safe, { execute: async () => ({ ...response(), errors: [
    `${timestamp}WARN codex_rollout::list: state db discrepancy during find_thread_path_by_id_str_in_subdir: falling_back\n` +
    `${timestamp}WARN codex_core::shell_snapshot: Failed to create shell snapshot for zsh: Snapshot command timed out for zsh`,
  ] }) });
  assert.equal(safe.status, 'awaiting-gate');

  for (const warning of [
    'WARN codex_core::shell_snapshot: Failed to create shell snapshot for zsh: validation failed',
    'WARN codex_sandboxing::violation: command attempted a prohibited write',
  ]) {
    const blocked = fixture(t);
    await runStage(blocked, { execute: async () => ({ ...response(), errors: [warning] }) });
    assert.equal(blocked.status, 'blocked');
  }
});

test('persist in-flight marker BEFORE launching; refuse replay after interruption', async t => {
  const s = fixture(t); const saved = [];
  await runStage(s, { save: x => saved.push(JSON.parse(JSON.stringify(x))), execute: async () => { assert.equal(saved[0].active, 'writer'); throw Error('interrupted'); } });
  assert.equal(s.active, 'writer');
  await assert.rejects(runStage(s), /interrupted stage/);
});

test('join waits for both branches; duplicate downstream dispatch is suppressed', async t => {
  const s = fixture(t, '[transitions.writer]\non=["DONE"]\nnext=["qa","security"]\n[transitions.qa]\non=["PASS"]\njoin=["security"]\nnext=["reviewer"]\n[transitions.security]\non=["PASS"]\njoin=["qa"]\nnext=["reviewer"]\n[transitions.reviewer]\non=["PASS"]\nnext=[]');
  await runStage(s, { execute: async () => response('DONE', []) });
  await runStage(s, { execute: async () => response('PASS', []) });
  assert.deepEqual(s.queue, ['security']);
  await runStage(s, { execute: async () => response('PASS', []) });
  assert.deepEqual(s.queue, ['reviewer']);
  await runStage(s, { execute: async () => response('PASS', []) });
  assert.equal(s.status, 'done');
});

// The SHIPPED graph, walked end to end. The two-role fixture above proves the
// state machine; this proves it on shared/pipeline.toml, which has a join
// (qa-engineer ∥ security-officer) the fixture does not — and the join is where
// the receipt check was wrong: a partner's legitimate write read as tampering
// and gate:ship could never be approved. Every role that produces a receipt
// needs a real git tree, so the project gets one.
test('the shipped pipeline.toml walks from product-owner to done, through the join and every gate', async t => {
  const REPO = resolve(fileURLToPath(import.meta.url), '../../..');
  const root = mkdtempSync(join(tmpdir(), 'codex-real-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'docs'), { recursive: true }); mkdirSync(join(root, 'src'), { recursive: true });
  execSync('git init -q . && git -c user.email=t@t -c user.name=t commit -q -m base --allow-empty', { cwd: root });

  const s = newRun({ root, pluginRoot: REPO, prompt: 'walk the shipped graph', allowed: ['docs', 'src'], entry: 'product-owner' });
  const list = v => (Array.isArray(v) ? v : [v]).filter(Boolean);
  const execute = async () => {
    const role = s.active?.role ?? s.queue[0];
    const rule = s.graph[role] || {};
    const verdict = list(rule.on)[0] || 'DONE';
    const produces = list(rule.produces).filter(k => k !== 'receipt');
    const files = produces.map((k, i) => ({ path: `docs/${role}-${k}.md`, before: null, content: `# ${role} ${k}\n\nbody ${i}\n` }));
    if (list(rule.produces).includes('receipt')) files.push({ path: `src/${role}.js`, before: null, content: `// ${role}\n` });
    const meta = Object.fromEntries(produces.map((k, i) => [k, files[i].path]));
    return { state: 'ok', code: 0, errors: [], usage: null, text: JSON.stringify({ verdict, summary: role, meta, files }) };
  };

  // `manual-action` is terminal for this controller, on purpose: devops deploys
  // and publishes, and a step with side effects is not a file proposal. The
  // full cycle the controller can honestly claim is every proposal-shaped role
  // through every gate INCLUDING gate:ship, then a hand-off for the one step
  // that must not be a proposal — not `done`.
  const TERMINAL = ['done', 'blocked', 'manual-action'];
  const walked = [], gates = [];
  for (let i = 0; i < 80 && !TERMINAL.includes(s.status); i += 1) {
    if (s.status === 'awaiting-gate') { gates.push(s.pending.gates.join(',')); approve(s, s.pending.token); continue; }
    walked.push(s.queue[0]);
    await runStage(s, { execute });
  }
  assert.equal(s.status, 'manual-action', `${s.status}: ${s.reason} after ${walked.join(' → ')}`);
  assert.match(s.reason, /^devops requires execution outside/, 'the hand-off is devops, and it says so');
  assert.ok(walked.includes('qa-engineer') && walked.includes('security-officer'), 'the join ran both branches');
  assert.ok(gates.some(g => g.includes('gate:ship')), 'gate:ship was raised AND approved before the hand-off');
  assert.equal(walked.filter(r => r === 'devops').length, 1, 'devops is dispatched once, not re-queued in a loop');
  assert.deepEqual(walked, ['product-owner', 'architect', 'pm', 'senior-dev', 'code-reviewer', 'qa-engineer', 'security-officer', 'devops']);
});

// The exact failure the walk found, isolated: a partner writes AFTER the first
// branch's stage ends and BEFORE its gate is raised. That is not tampering.
test('a join partner writing before the gate is raised is not "working tree changed"', async t => {
  const graph = [
    '[transitions.writer]', 'on = ["DONE"]', 'produces = ["report"]', 'next = ["qa", "security"]',
    '[transitions.qa]', 'on = ["DONE"]', 'produces = ["qa"]', 'join = ["security"]', 'gate = "gate:ship"', 'next = []',
    '[transitions.security]', 'on = ["DONE"]', 'produces = ["sec"]', 'next = []',
  ].join('\n') + '\n';
  const s = fixture(t, graph);
  const exec = (path, key) => async () => ({ state: 'ok', code: 0, errors: [], usage: null,
    text: JSON.stringify({ verdict: 'DONE', summary: key, meta: { [key]: path }, files: [{ path, before: null, content: `${key}\n` }] }) });
  await runStage(s, { execute: exec('src/w.js', 'report') });
  assert.equal(s.status, 'ready');
  await runStage(s, { execute: exec('src/qa.js', 'qa') });        // qa ends; gate must wait for security
  assert.notEqual(s.status, 'awaiting-gate', 'the join is not complete yet');
  await runStage(s, { execute: exec('src/sec.js', 'sec') });      // security writes its own file
  assert.equal(s.status, 'awaiting-gate'); assert.deepEqual(s.pending.gates, ['gate:ship']);
  approve(s, s.pending.token);                                      // used to throw "working tree changed"
  assert.equal(s.status, 'done');
});
