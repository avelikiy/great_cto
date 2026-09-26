// security-officer used to *describe* GitHub Actions risks in prose — "check for
// pull_request_target misuse" — and then read the YAML by eye. A pwn-request is
// one `ref:` line; an injection is one `${{ }}` inside `run:`. Eyes miss both.
// These fixtures pin each finding to a real workflow shape, plus one clean
// workflow that must stay silent (a checker that fires on everything is off).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  parseYaml, scanWorkflow, scanDir, renderTable,
} from '../../scripts/lib/workflow-security.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '..', '..', 'scripts', 'lib', 'workflow-security.mjs');
const SHA = 'a'.repeat(40);

const rules = (text) => scanWorkflow(text, 'wf.yml').map((f) => `${f.severity}:${f.rule}`);
const find = (text, rule) => scanWorkflow(text, 'wf.yml').filter((f) => f.rule === rule);

// ── parser ──────────────────────────────────────────────────────────────────

test('parser: maps, sequences at key indent, block scalars, flow lists, comments', () => {
  const doc = parseYaml([
    'on: [push, "pull_request_target"]  # trailing comment',
    'jobs:',
    '  build:',
    '    steps:',
    '    - uses: actions/checkout@v4',
    '      with:',
    '        ref: main # not part of the value',
    '    - run: |',
    '        echo one',
    '        echo "two # kept"',
    '',
  ].join('\n'));
  const on = doc.get('on');
  assert.deepEqual(on.items.map((x) => x.value), ['push', 'pull_request_target']);
  const steps = doc.get('jobs').get('build').get('steps');
  assert.equal(steps.items.length, 2);
  assert.equal(steps.items[0].get('with').get('ref').value, 'main');
  assert.equal(steps.items[0].get('with').get('ref').line, 7);
  const run = steps.items[1].get('run');
  assert.equal(run.block, true);
  assert.match(run.value, /echo one\necho "two # kept"/);
  assert.deepEqual(run.lines.map((l) => l.line), [9, 10]);
});

// ── HIGH: pwn-request ───────────────────────────────────────────────────────

const PWN = `name: pr
on:
  pull_request_target:
    types: [opened, synchronize]
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${SHA}
        with:
          ref: \${{ github.event.pull_request.head.sha }}
      - run: npm ci && npm test
`;

test('HIGH pwn-request: pull_request_target checks out the PR head and runs it', () => {
  const f = find(PWN, 'pwn-request');
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'HIGH');
  assert.equal(f[0].line, 13, 'points at the ref: line');
  assert.match(f[0].message, /npm ci/, 'names the step that executes the checked-out code');
});

test('HIGH pwn-request: workflow_run checking out head_branch, and github.head_ref', () => {
  const wr = `on:
  workflow_run:
    workflows: [ci]
    types: [completed]
jobs:
  j:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${SHA}
        with:
          ref: \${{ github.event.workflow_run.head_branch }}
`;
  assert.deepEqual(find(wr, 'pwn-request').map((f) => f.line), [11]);
  const hr = PWN.replace('github.event.pull_request.head.sha', 'github.head_ref');
  assert.equal(find(hr, 'pwn-request').length, 1);
  const refsPull = PWN.replace('${{ github.event.pull_request.head.sha }}',
    'refs/pull/${{ github.event.pull_request.number }}/merge');
  assert.equal(find(refsPull, 'pwn-request').length, 1);
});

test('no pwn-request: same checkout under plain pull_request, or default checkout under pull_request_target', () => {
  assert.equal(find(PWN.replace('pull_request_target:', 'pull_request:'), 'pwn-request').length, 0);
  const baseOnly = PWN.replace(/\n {8}with:\n {10}ref: .*\n/, '\n');
  assert.equal(find(baseOnly, 'pwn-request').length, 0);
});

// ── HIGH: script injection ──────────────────────────────────────────────────

test('HIGH script-injection: untrusted event text interpolated in run:', () => {
  const wf = `on: issues
permissions: {}
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - name: greet
        run: |
          echo "new issue"
          echo "\${{ github.event.issue.title }}"
      - run: echo \${{ github.head_ref }}
`;
  const f = find(wf, 'script-injection');
  assert.deepEqual(f.map((x) => [x.severity, x.line]), [['HIGH', 10], ['HIGH', 11]]);
});

test('HIGH script-injection: actions/github-script with untrusted text in script:', () => {
  const wf = `on: issue_comment
permissions: {}
jobs:
  j:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/github-script@${SHA}
        with:
          script: |
            const body = "\${{ github.event.comment.body }}";
`;
  assert.deepEqual(find(wf, 'script-injection').map((x) => x.line), [10]);
});

test('no script-injection: untrusted text routed through env:, or trusted fields inline', () => {
  const wf = `on: pull_request
permissions: {}
jobs:
  j:
    runs-on: ubuntu-latest
    steps:
      - env:
          TITLE: \${{ github.event.pull_request.title }}
        run: echo "$TITLE" \${{ github.event.pull_request.number }} \${{ github.event.pull_request.base.ref }}
`;
  assert.equal(find(wf, 'script-injection').length, 0);
});

// ── MEDIUM: permissions ─────────────────────────────────────────────────────

test('MEDIUM permissions: write-all anywhere', () => {
  const wf = `on: push
permissions: write-all
jobs:
  j:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
`;
  const f = find(wf, 'permissions-write-all');
  assert.deepEqual(f.map((x) => [x.severity, x.line]), [['MEDIUM', 2]]);
});

test('MEDIUM permissions: privileged trigger without top-level permissions', () => {
  const wf = `on: pull_request_target
jobs:
  label:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
`;
  const f = find(wf, 'permissions-missing');
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'MEDIUM');
  // Every job scoping its own token is an acceptable alternative.
  const jobScoped = wf.replace('    runs-on:', '    permissions:\n      pull-requests: write\n    runs-on:');
  assert.equal(find(jobScoped, 'permissions-missing').length, 0);
  // A plain push workflow is not held to this rule.
  assert.equal(find(wf.replace('pull_request_target', 'push'), 'permissions-missing').length, 0);
});

test('MEDIUM permissions: contents: write combined with an untrusted trigger', () => {
  const wf = `on:
  workflow_run:
    workflows: [ci]
permissions:
  contents: write
jobs:
  j:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
`;
  const f = find(wf, 'contents-write-untrusted');
  assert.deepEqual(f.map((x) => [x.severity, x.line]), [['MEDIUM', 5]]);
  assert.equal(find(wf.replace('workflow_run', 'push'), 'contents-write-untrusted').length, 0);
});

// ── MEDIUM / LOW: action pinning ────────────────────────────────────────────

test('MEDIUM unpinned third-party action; LOW for official actions/* and github/*', () => {
  const wf = `on: push
permissions: {}
jobs:
  j:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@main
      - uses: some-org/deploy-action@v1
      - uses: other/thing@main
      - uses: pinned/thing@${SHA} # v2
      - uses: ./local-action
  reuse:
    uses: org/repo/.github/workflows/ci.yml@v3
`;
  const f = find(wf, 'unpinned-action').map((x) => [x.severity, x.line]);
  assert.deepEqual(f, [['LOW', 7], ['LOW', 8], ['MEDIUM', 9], ['MEDIUM', 10], ['MEDIUM', 14]]);
});

// ── MEDIUM: secrets and unsecure commands ───────────────────────────────────

test('MEDIUM secrets exposed to a pull_request_target job', () => {
  const wf = `on: pull_request_target
permissions:
  pull-requests: write
jobs:
  j:
    runs-on: ubuntu-latest
    steps:
      - run: ./notify.sh
        env:
          TOKEN: \${{ secrets.DEPLOY_TOKEN }}
      - run: gh pr comment --body hi
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`;
  const f = find(wf, 'secrets-untrusted-trigger');
  assert.deepEqual(f.map((x) => [x.severity, x.line]), [['MEDIUM', 10]],
    'the auto-scoped GITHUB_TOKEN is governed by permissions:, not flagged here');
  assert.equal(find(wf.replace('pull_request_target', 'push'), 'secrets-untrusted-trigger').length, 0);
});

test('MEDIUM ACTIONS_ALLOW_UNSECURE_COMMANDS: true', () => {
  const wf = `on: push
permissions: {}
env:
  ACTIONS_ALLOW_UNSECURE_COMMANDS: true
jobs:
  j:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
`;
  assert.deepEqual(find(wf, 'unsecure-commands').map((x) => [x.severity, x.line]), [['MEDIUM', 4]]);
});

// ── LOW: cache poisoning ────────────────────────────────────────────────────

test('LOW cache keyed on untrusted input under pull_request_target', () => {
  const wf = `on: pull_request_target
permissions:
  contents: read
jobs:
  j:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/cache@${SHA}
        with:
          path: ~/.npm
          key: npm-\${{ github.head_ref }}
`;
  assert.deepEqual(find(wf, 'cache-poisoning').map((x) => [x.severity, x.line]), [['LOW', 11]]);
  assert.equal(find(wf.replace('pull_request_target', 'pull_request'), 'cache-poisoning').length, 0);
});

// ── clean ───────────────────────────────────────────────────────────────────

test('a well-formed workflow produces no findings at all', () => {
  const wf = `name: ci
on:
  push:
    branches: [main]
  pull_request:
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${SHA} # v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@${SHA}
        with:
          node-version: 20
      - env:
          TITLE: \${{ github.event.pull_request.title }}
        run: |
          echo "$TITLE"
          npm ci --ignore-scripts
          npm test
`;
  assert.deepEqual(rules(wf), []);
});

// ── directory scan and CLI ──────────────────────────────────────────────────

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), 'wfsec-'));
  mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(join(dir, '.github', 'workflows', name), text);
  }
  return dir;
}

test('scanDir reads .yml and .yaml, reports relative paths, ignores other files', () => {
  const dir = project({ 'a.yml': PWN, 'b.yaml': 'on: push\npermissions: write-all\njobs: {}\n', 'notes.txt': PWN });
  try {
    const r = scanDir(dir);
    assert.equal(r.files.length, 2);
    const files = new Set(r.findings.map((f) => f.file));
    assert.deepEqual([...files].sort(), ['.github/workflows/a.yml', '.github/workflows/b.yaml']);
    assert.match(renderTable(r), /HIGH.*\.github\/workflows\/a\.yml:13/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('scanDir on a project with no workflows is clean, not an error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wfsec-empty-'));
  try {
    const r = scanDir(dir);
    assert.deepEqual(r.findings, []);
    assert.deepEqual(r.files, []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI: exit 1 on any HIGH, --json is machine-readable', () => {
  const dir = project({ 'pr.yml': PWN });
  try {
    const r = spawnSync(process.execPath, [CLI, '--cwd', dir, '--json'], { encoding: 'utf8' });
    assert.equal(r.status, 1, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.summary.HIGH, 1);
    assert.ok(out.findings.every((f) => f.file && f.line && f.severity && f.rule && f.message));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI: exit 0 when findings are MEDIUM or below', () => {
  const dir = project({ 'x.yml': 'on: push\npermissions: write-all\njobs: {}\n' });
  try {
    const r = spawnSync(process.execPath, [CLI, '--cwd', dir], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /MEDIUM/);
    assert.match(r.stdout, /permissions-write-all/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
