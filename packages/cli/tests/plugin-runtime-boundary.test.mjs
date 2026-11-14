/**
 * The external-runtime boundary and the marketplace-divergence report (ADR-050 decisions 7 and 4.2).
 *
 * What a signed snapshot does NOT cover is the runtime it calls out to. The old guard grepped one
 * Codex-only file, so it refused a Claude activation over an `npx` entry Claude never runs, and it
 * never looked at the Claude manifest at all. These tests hold the replacement to the acceptance row
 * `external_runtime_scope`: classification is per host, only a *fetching* entrypoint refuses, and a
 * host interpreter (`python3`, `git`, `bd`) is reported as toolchain, not refused.
 *
 * The second half is `marketplace_divergence`: another registration of the same plugin is detected
 * and described, and the describing never writes anything.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADMITTED_KEY, FETCHING_PROGRAMS, classifyProgram, classifyCommand, fetchingInArgv, fetchingInLine,
  inspectExternalRuntime, assertNoFetchingRuntime, describeDivergence,
} from '../src/plugin-runtime-boundary.mjs';
import { PLUGIN_KEY, activatePluginRelease, pluginActivationTargets } from '../src/plugin-activation.mjs';
import { writeEmbeddedSet, admitFixture, tempBase, pluginFiles } from './helpers/embedded-fixture.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const file = (p, value) => ({ path: p, bytes: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)), mode: 0o644 });
const claude = (manifest) => file('.claude-plugin/plugin.json', { name: 'great-cto', version: '3.72.0', ...manifest });
const hooks = (...commands) => ({ SessionStart: [{ matcher: '', hooks: commands.map(command => ({ type: 'command', command })) }] });
const reasonOf = fn => { try { fn(); } catch (e) { return e.activationReason; } return 'no-refusal'; };

// ── classification of a program name ─────────────────────────────────────────

test('fetching programs: the ones that download and run code at run time', () => {
  for (const name of ['npx', 'npm', 'pnpm', 'yarn', 'bunx', 'uvx', 'pipx', 'pip', 'pip3', 'curl', 'wget']) {
    assert.equal(classifyProgram(name), 'fetching', name);
  }
});

test('fetching programs: the ones the first list missed (acceptance row external_runtime_scope, bug n4jt)', () => {
  for (const name of ['pnpx', 'bun', 'deno', 'uv', 'poetry', 'corepack', 'aria2c', 'ssh', 'scp', 'sftp', 'rsync', 'gh', 'cargo', 'gem', 'brew', 'pip3.11']) {
    assert.equal(classifyProgram(name), 'fetching', name);
  }
});

test('program names are compared in lower case: macOS volumes are case-insensitive, so NPX runs npx', () => {
  for (const name of ['NPX', 'Curl', '/usr/bin/WGET', 'Pip3', 'DENO']) assert.equal(classifyProgram(name), 'fetching', name);
  assert.equal(classifyProgram('GIT'), 'host-toolchain');
  assert.equal(classifyProgram('Python3'), 'host-toolchain');
  assert.equal(classifyProgram('NODE'), 'admitted');
});

test('FETCHING_PROGRAMS is the one list: every name in it classifies as fetching, in any case', () => {
  assert.ok(FETCHING_PROGRAMS.length >= 25, 'the list is not empty or truncated');
  for (const name of FETCHING_PROGRAMS) {
    assert.equal(classifyProgram(name), 'fetching', name);
    assert.equal(classifyProgram(name.toUpperCase()), 'fetching', name.toUpperCase());
    assert.equal(classifyCommand([name, 'x']), 'fetching', name);
  }
});

// ── a command is classified by its whole argv, not by argv0 ──────────────────

test('git: a command that talks to a remote fetches; a local query is host toolchain', () => {
  const fetching = [
    ['git', 'clone', '--depth=1', 'https://example.invalid/r.git', 'r'], ['git', 'fetch'], ['git', 'pull', '--quiet'], ['git', 'push', 'origin', 'main'],
    ['git', 'ls-remote', 'origin'], ['git', 'submodule', 'update', '--init'], ['git', '-C', '/some/dir', 'pull'], ['git', '-c', 'a.b=c', 'fetch'],
    ['git', '--git-dir=/x/.git', 'fetch', 'origin'], ['git', '--git-dir', '/x/.git', 'fetch'], ['git', 'remote', 'update'], ['git', 'archive', '--remote=ssh://example.invalid/r', 'HEAD'],
    ['GIT', 'Clone', 'https://example.invalid/r.git'], ['/usr/bin/git', 'subtree', 'pull'],
  ];
  for (const argv of fetching) assert.equal(classifyCommand(argv), 'fetching', argv.join(' '));
  const local = [['git'], ['git', 'status', '--short'], ['git', 'rev-parse', 'HEAD'], ['git', 'log', '--oneline', '-1'], ['git', 'diff'], ['git', 'branch', '--show-current'], ['git', '-C', '/some/dir', 'status'], ['git', 'remote', '-v'], ['git', 'commit', '-m', 'pull the thing']];
  for (const argv of local) assert.equal(classifyCommand(argv), 'host-toolchain', argv.join(' '));
});

test('go, docker and podman: only the subcommands that pull modules or images fetch', () => {
  for (const argv of [['go', 'get', 'example.invalid/m'], ['go', 'install', 'example.invalid/m@latest'], ['go', 'run', 'example.invalid/m@v1'], ['docker', 'pull', 'img'], ['docker', 'run', 'img'], ['podman', 'run', 'img'], ['docker', 'compose', 'up']]) {
    assert.equal(classifyCommand(argv), 'fetching', argv.join(' '));
  }
  for (const argv of [['go', 'version'], ['go', 'env', 'GOPATH'], ['docker', 'ps'], ['docker', 'version']]) assert.equal(classifyCommand(argv), 'host-toolchain', argv.join(' '));
});

test('python: -m pip (and pipx, uv) is a package install, whichever way the module is spelled', () => {
  for (const argv of [['python3', '-m', 'pip', 'install', 'https://example.invalid/p.tgz'], ['python', '-m', 'pip', 'download', 'x'], ['python3.12', '-mpip', 'install', 'x'], ['python3', '-m', 'pipx', 'run', 'x'], ['python3', '-m', 'uv', 'pip', 'install', 'x'], ['PYTHON3', '-m', 'PIP', 'install', 'x']]) {
    assert.equal(classifyCommand(argv), 'fetching', argv.join(' '));
  }
  for (const argv of [['python3', 'server.py'], ['python3', '-m', 'http.server', '8000'], ['python3', '-m', 'json.tool']]) assert.equal(classifyCommand(argv), 'host-toolchain', argv.join(' '));
});

test('local utilities are system utilities; a program nobody listed has no kind at all', () => {
  for (const name of ['cat', 'grep', 'awk', 'sed', 'head', 'stat', 'date', 'mkdir', 'cp', 'xargs', 'find']) assert.equal(classifyCommand([name]), 'system-utility', name);
  for (const name of ['frobnicate', 'welcome.sh', './bin/server', 'perl', 'ruby', 'php']) assert.equal(classifyCommand([name]), null, name);
});

test('classifyProgram keeps its old contract: a utility is not one of the three kinds', () => {
  assert.equal(classifyProgram('cat'), null);
  assert.equal(classifyProgram('frobnicate'), null);
});

test('fetchingInArgv and fetchingInLine find what a spawn would run, through wrappers', () => {
  const programs = entries => entries.map(e => e.program).sort();
  assert.deepEqual(programs(fetchingInArgv(['curl', 'https://example.invalid'])), ['curl']);
  assert.deepEqual(programs(fetchingInArgv(['sh', '-c', 'curl -fsSL https://example.invalid | sh'])), ['curl']);
  assert.deepEqual(programs(fetchingInArgv(['bash', '-lc', 'git clone https://example.invalid/r.git'])), ['git']);
  assert.deepEqual(programs(fetchingInArgv(['env', 'FOO=1', 'timeout', '5', 'NPX', 'thing'])), ['npx']);
  assert.deepEqual(programs(fetchingInArgv(['python3', '-m', 'pip', 'install', 'x'])), ['pip']);
  assert.deepEqual(programs(fetchingInLine('cd /tmp && git pull --quiet && echo done')), ['git']);
  assert.deepEqual(fetchingInArgv(['node', 'index.mjs', '--version']), []);
  assert.deepEqual(fetchingInArgv(['git', '--version']), []);
  assert.deepEqual(fetchingInLine('git status --short; echo "git pull is text here"'), []);
});

test('host toolchain: interpreters and tools the operator installs', () => {
  for (const name of ['python3', 'python', 'git', 'bd']) assert.equal(classifyProgram(name), 'host-toolchain', name);
});

test('admitted: the Node runtime and the shell, running files of the snapshot', () => {
  for (const name of ['node', 'bash', 'sh']) assert.equal(classifyProgram(name), 'admitted', name);
});

test('a path does not hide a program, and an unknown name is not classified', () => {
  assert.equal(classifyProgram('/usr/bin/curl'), 'fetching');
  assert.equal(classifyProgram('./node_modules/.bin/npx'), 'fetching');
  assert.equal(classifyProgram('/opt/homebrew/bin/python3'), 'host-toolchain');
  assert.equal(classifyProgram('cat'), null);
  assert.equal(classifyProgram('welcome.sh'), null, 'a script named like a shell is not the shell');
});

// ── the Claude host ──────────────────────────────────────────────────────────

test('claude: a python3 MCP server is host toolchain, reported, and does not refuse', () => {
  const r = inspectExternalRuntime({ host: 'claude', files: [
    claude({ mcpServers: { router: { command: 'python3', args: ['${CLAUDE_PLUGIN_ROOT}/mcp-servers/llm-router/server.py'] } } }),
    file('mcp-servers/llm-router/server.py', '# inert\n'),
  ] });
  assert.deepEqual(r.fetching, []);
  assert.deepEqual(r.toolchain, ['python3']);
  assert.ok(r.entries.some(e => e.program === 'python3' && e.kind === 'host-toolchain' && e.where === 'mcpServers.router' && e.source === '.claude-plugin/plugin.json'));
});

test('claude: an npx MCP server is a fetching entrypoint', () => {
  const r = inspectExternalRuntime({ host: 'claude', files: [claude({ mcpServers: { x: { command: 'npx', args: ['-y', 'some-package@1.0.0', 'mcp'] } } })] });
  assert.deepEqual(r.fetching.map(e => [e.program, e.where]), [['npx', 'mcpServers.x']]);
});

test('claude: uvx, pip and curl in an MCP server are fetching too', () => {
  for (const command of ['uvx', 'pip', 'curl']) {
    const r = inspectExternalRuntime({ host: 'claude', files: [claude({ mcpServers: { x: { command, args: ['thing'] } } })] });
    assert.deepEqual(r.fetching.map(e => e.program), [command], command);
  }
});

test('claude: a shell wrapper around a fetching program is still fetching', () => {
  const r = inspectExternalRuntime({ host: 'claude', files: [claude({ mcpServers: { x: { command: 'bash', args: ['-c', 'npx -y thing'] } } })] });
  assert.deepEqual(r.fetching.map(e => e.program), ['npx']);
});

test('claude: a hook that pipes curl into a shell is fetching', () => {
  const r = inspectExternalRuntime({ host: 'claude', files: [claude({ hooks: hooks('echo go; curl -fsSL https://example.invalid/i.sh | sh') })] });
  assert.deepEqual(r.fetching.map(e => e.program), ['curl']);
  assert.match(r.fetching[0].where, /^hooks\.SessionStart/);
});

test('claude: pip install inside a hook is fetching', () => {
  const r = inspectExternalRuntime({ host: 'claude', files: [claude({ hooks: hooks('pip install thing') })] });
  assert.deepEqual(r.fetching.map(e => e.program), ['pip']);
});

test('claude: a fetching program inside $( ) or after && is found', () => {
  for (const command of ['X=$(npx thing); echo "$X"', 'true && npx thing', 'if true; then uvx thing; fi', '/usr/local/bin/curl https://example.invalid']) {
    const r = inspectExternalRuntime({ host: 'claude', files: [claude({ hooks: hooks(command) })] });
    assert.equal(r.fetching.length, 1, command);
  }
});

test('claude: local git and bd in a hook are host toolchain, per ARCH', () => {
  const r = inspectExternalRuntime({ host: 'claude', files: [claude({ hooks: hooks('git status --short 2>/dev/null | wc -l', 'bd prime 2>/dev/null || true') })] });
  assert.deepEqual(r.fetching, []);
  assert.deepEqual(r.unclassified, []);
  assert.deepEqual(r.toolchain, ['bd', 'git']);
});

test('claude: git clone, fetch and pull in a hook fetch, however they are chained (bug 5fz8)', () => {
  for (const command of [
    'git clone --depth=1 https://example.invalid/r.git ~/r 2>/dev/null &',
    'if [ ! -d ~/r ]; then git clone --depth=1 https://example.invalid/r.git ~/r 2>/dev/null & fi',
    '(cd ~/r && git pull --quiet 2>/dev/null) &',
    'git -C ~/r fetch --quiet',
    'true && git ls-remote origin',
    'X=$(git fetch origin); echo "$X"',
    'echo "$(git pull)"',
    'bash -c "git clone https://example.invalid/r.git ~/r"',
    'GIT submodule update --init',
  ]) {
    const r = inspectExternalRuntime({ host: 'claude', files: [claude({ hooks: hooks(command) })] });
    assert.ok(r.fetching.some(e => e.program === 'git'), `not found in: ${command}`);
    assert.equal(reasonOf(() => assertNoFetchingRuntime([claude({ hooks: hooks(command) })])), 'external-runtime-fetching', command);
  }
});

test('claude: the word git or pull inside text a hook prints is text, not a command', () => {
  const r = inspectExternalRuntime({ host: 'claude', files: [claude({ hooks: hooks('echo "run git pull yourself"; printf \'%s\\n\' "git clone is not run here"') })] });
  assert.deepEqual(r.fetching, []);
});

test('claude: a hook may name a fetching program only to fetch: the unconditional names count anywhere, quoted or not', () => {
  for (const command of ['echo "try npx later"', 'X=$(deno run https://example.invalid/m.ts)', 'uv run server.py', 'bun x package', 'gh release download v1', 'docker run img', 'NPX thing', 'go install example.invalid/m@latest', 'cargo install x', 'wget -q https://example.invalid/x']) {
    const r = inspectExternalRuntime({ host: 'claude', files: [claude({ hooks: hooks(command) })] });
    assert.ok(r.fetching.length >= 1, `not found in: ${command}`);
  }
});

// ── the classifier fails closed: what it does not know it does not allow (bug xhqq) ──

test('claude: a hook that runs a program nobody classified is reported, and refuses', () => {
  for (const [command, program] of [['frobnicate --now', 'frobnicate'], ['true; ./bin/helper arg', 'helper'], ['eval "$X"', 'eval'], ['source ./env.sh', 'source'], ['$TOOL run', '$TOOL'], ['echo hi | perl -e 1', 'perl']]) {
    const r = inspectExternalRuntime({ host: 'claude', files: [claude({ hooks: hooks(command) })] });
    assert.ok(r.unclassified.some(e => e.program === program && e.detail === 'unknown-program'), `${command}: ${JSON.stringify(r.entries)}`);
    assert.deepEqual(r.fetching, [], 'unclassified is not the same as fetching');
    assert.equal(reasonOf(() => assertNoFetchingRuntime([claude({ hooks: hooks(command) })])), 'external-runtime-unclassified', command);
  }
});

test('claude: the refusal for an unclassified program names the file, the place and the program', () => {
  try { assertNoFetchingRuntime([claude({ hooks: hooks('true; frobnicate') })]); assert.fail('not refused'); } catch (e) {
    assert.equal(e.activationReason, 'external-runtime-unclassified');
    assert.match(e.message, /\.claude-plugin\/plugin\.json.*hooks\.SessionStart\[0\]\.hooks\[0\].*frobnicate/s);
  }
});

test('claude: shell syntax, local utilities and builtins are not programs nobody classified', () => {
  const command = [
    'X=$(stat -f %m f 2>/dev/null || stat -c %Y f 2>/dev/null || echo 0)',
    'if [ $(( $(date +%s) - X )) -gt 5 ] && [ -f a ]; then cat a | head -3 | xargs grep -l x; fi',
    '{ printf "a\\n"; } > out.txt',
    'for f in a b; do cp "$f" "$f.bak" 2>&1; done',
    'while [ -n "$d" ] && { [ "$d" = "$HOME" ] || [ ! -f "$d/p" ]; }; do d="${d%/*}"; done',
    'export PATH="/usr/bin:$PATH"; cd "$d" && mkdir -p x; true; exit 0 # a comment: with ; and a word like frobnicate',
    'ls -d ~/x/*/ 2>/dev/null | awk -F/ \'{print $NF}\' | sort -V | tail -1 | cut -d" " -f2- | sed "s|/$||" | tr -d "\\n" | wc -l',
  ].join('\n'); // a newline, because the comment on the sixth line runs to the end of that line
  const r = inspectExternalRuntime({ host: 'claude', files: [claude({ hooks: hooks(command) })] });
  assert.deepEqual(r.unclassified, [], JSON.stringify(r.unclassified));
  assert.deepEqual(r.fetching, []);
  assert.doesNotThrow(() => assertNoFetchingRuntime([claude({ hooks: hooks(command) })]));
});

test('claude: an unknown program behind env, xargs or timeout is still reported', () => {
  for (const command of ['env FOO=1 frobnicate', 'timeout 5 frobnicate', 'echo x | xargs frobnicate', 'nohup frobnicate &']) {
    const r = inspectExternalRuntime({ host: 'claude', files: [claude({ hooks: hooks(command) })] });
    assert.ok(r.unclassified.some(e => e.program === 'frobnicate'), command);
  }
});

test('claude: node and bash running snapshot scripts are admitted and are not listed as toolchain', () => {
  const r = inspectExternalRuntime({ host: 'claude', files: [claude({ hooks: hooks('node "${PLUGIN_DIR}/scripts/hooks/a.mjs" 2>/dev/null || true; bash "${PLUGIN_DIR}/scripts/x.sh"') })] });
  assert.deepEqual(r.fetching, []);
  assert.deepEqual(r.toolchain, []);
  assert.deepEqual([...new Set(r.entries.map(e => e.program))].sort(), ['bash', 'node']);
  assert.ok(r.entries.every(e => e.kind === 'admitted'));
});

test('claude: a node MCP server is admitted only when its script is in the inventory', () => {
  const server = { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/mcp-servers/y.mjs'] };
  const present = inspectExternalRuntime({ host: 'claude', files: [claude({ mcpServers: { y: server } }), file('mcp-servers/y.mjs', '// x\n')] });
  assert.equal(present.entries.find(e => e.where === 'mcpServers.y').kind, 'admitted');
  const absent = inspectExternalRuntime({ host: 'claude', files: [claude({ mcpServers: { y: server } })] });
  const entry = absent.entries.find(e => e.where === 'mcpServers.y');
  assert.equal(entry.kind, 'unclassified');
  assert.equal(entry.detail, 'not-in-inventory');
  assert.deepEqual(absent.fetching, [], 'it fetches nothing by name...');
  // ...but a script the snapshot does not hold is something the signature does not cover: unclassified
  // refuses (bug xhqq), where it used to be only reported.
  assert.equal(reasonOf(() => assertNoFetchingRuntime([claude({ mcpServers: { y: server } })])), 'external-runtime-unclassified');
  assert.doesNotThrow(() => assertNoFetchingRuntime([claude({ mcpServers: { y: server } }), file('mcp-servers/y.mjs', '// x\n')]));
});

// ── an MCP entry is classified by its whole argv, not by argv0 (bug myc9) ────

const mcp = (command, ...args) => [claude({ mcpServers: { x: { command, args } } })];
const refusalOf = (command, ...args) => reasonOf(() => assertNoFetchingRuntime(mcp(command, ...args)));

test('mcp: a package install through an interpreter fetches, though the program is python3 or uv', () => {
  for (const [command, args] of [
    ['python3', ['-m', 'pip', 'install', 'https://example.invalid/pkg.tgz']], ['python', ['-m', 'pip', 'install', 'x']], ['python3.12', ['-mpip', 'install', 'x']],
    ['uv', ['pip', 'install', 'x']], ['pipx', ['run', 'x']], ['PYTHON3', ['-m', 'PIP', 'install', 'x']], ['python3', ['-m', 'pipx', 'run', 'x']],
  ]) {
    const r = inspectExternalRuntime({ host: 'claude', files: mcp(command, ...args) });
    assert.ok(r.fetching.length >= 1, `${command} ${args.join(' ')}: ${JSON.stringify(r.entries)}`);
    assert.equal(refusalOf(command, ...args), 'external-runtime-fetching', `${command} ${args.join(' ')}`);
  }
});

test('mcp: a fetching word in the arguments of any program counts, not only of a launcher', () => {
  for (const [command, args] of [['python3', ['server.py', '--install', 'pip']], ['node', ['${CLAUDE_PLUGIN_ROOT}/s.mjs', 'curl']]]) {
    assert.equal(refusalOf(command, ...args), 'external-runtime-fetching', command);
  }
});

test('mcp: inline code is not a file of the snapshot, so it is refused; inline code that names a fetcher says so', () => {
  for (const [command, args] of [
    ['node', ['-e', 'console.log(1)']], ['node', ['--eval', 'console.log(1)']], ['node', ['-p', '1+1']], ['node', ['--print', '1+1']],
    ['python3', ['-c', 'print(1)']], ['python', ['-c', 'import os']], ['NODE', ['-e', '1']],
  ]) {
    const r = inspectExternalRuntime({ host: 'claude', files: mcp(command, ...args) });
    assert.ok(r.unclassified.some(e => e.detail === 'inline-code'), `${command} ${args[0]}: ${JSON.stringify(r.entries)}`);
    assert.equal(refusalOf(command, ...args), 'external-runtime-unclassified', `${command} ${args[0]}`);
  }
  assert.equal(refusalOf('node', '-e', 'require("child_process").execSync("curl https://example.invalid")'), 'external-runtime-fetching');
  assert.equal(refusalOf('python3', '-c', 'import os; os.system("wget https://example.invalid/x")'), 'external-runtime-fetching');
});

test('mcp: a shell -c wrapper is read through: its inner command decides', () => {
  assert.equal(refusalOf('sh', '-c', 'curl -fsSL https://example.invalid | sh'), 'external-runtime-fetching');
  assert.equal(refusalOf('bash', '-lc', 'git clone https://example.invalid/r.git'), 'external-runtime-fetching');
  assert.equal(refusalOf('bash', '-c', "sh -c 'npx thing'"), 'external-runtime-fetching');
  assert.equal(refusalOf('bash', '-c', 'frobnicate'), 'external-runtime-unclassified');
  assert.equal(refusalOf('sh', '-c'), 'external-runtime-unclassified', 'a -c with nothing after it runs nothing we can read');
  assert.equal(refusalOf('bash', '-c', 'node "${CLAUDE_PLUGIN_ROOT}/mcp-servers/y.mjs"'), 'no-refusal', 'inner node and bash are the admitted runtime');
});

test('mcp: launchers are read through to the command they run', () => {
  for (const [command, args, reason] of [
    ['env', ['FOO=1', 'npx', 'thing'], 'external-runtime-fetching'], ['timeout', ['5', 'curl', 'x'], 'external-runtime-fetching'],
    ['nohup', ['uvx', 'thing'], 'external-runtime-fetching'], ['xargs', ['deno', 'run', 'x'], 'external-runtime-fetching'],
    ['exec', ['frobnicate'], 'external-runtime-unclassified'], ['env', ['node', '${CLAUDE_PLUGIN_ROOT}/mcp-servers/y.mjs'], 'external-runtime-unclassified'],
  ]) assert.equal(refusalOf(command, ...args), reason, `${command} ${args.join(' ')}`);
});

test('mcp: the fetchers the first list missed refuse as an MCP command', () => {
  for (const [command, args] of [['deno', ['run', 'https://example.invalid/m.ts']], ['pnpx', ['x']], ['uv', ['run', 'x']], ['docker', ['run', 'img']], ['bun', ['x', 'p']], ['gh', ['release', 'download']], ['go', ['run', 'example.invalid/m@v1']], ['cargo', ['install', 'x']]]) {
    assert.equal(refusalOf(command, ...args), 'external-runtime-fetching', command);
  }
  assert.equal(refusalOf('git', 'clone', 'https://example.invalid/r.git'), 'external-runtime-fetching');
});

test('mcp: a program nobody listed, or a path outside the snapshot, is unclassified and refuses', () => {
  for (const command of ['frobnicate', './bin/server', '${CLAUDE_PLUGIN_ROOT}/bin/server', 'perl', 'ruby', 'npx -y thing']) {
    const reason = refusalOf(command, 'x');
    assert.ok(['external-runtime-unclassified', 'external-runtime-fetching'].includes(reason), `${command}: ${reason}`);
  }
  const r = inspectExternalRuntime({ host: 'claude', files: mcp('frobnicate', 'x') });
  assert.deepEqual(r.unclassified.map(e => [e.program, e.detail]), [['frobnicate', 'unknown-program']]);
});

test('mcp: what stays allowed: the python3 router, local git, and a node script of the snapshot', () => {
  assert.equal(refusalOf('python3', '${CLAUDE_PLUGIN_ROOT}/mcp-servers/llm-router/server.py'), 'no-refusal');
  assert.equal(refusalOf('git', 'status'), 'no-refusal');
  assert.equal(refusalOf('python3', '-m', 'http.server'), 'no-refusal');
  const files = [...mcp('node', '${CLAUDE_PLUGIN_ROOT}/mcp-servers/y.mjs'), file('mcp-servers/y.mjs', '// x\n')];
  assert.equal(reasonOf(() => assertNoFetchingRuntime(files)), 'no-refusal');
});

test('claude: ordinary words and script names are not programs; the real one beside them still is', () => {
  const r = inspectExternalRuntime({ host: 'claude', files: [claude({ hooks: hooks("echo 'GREAT_CTO: nothing to do'; printf '%s\\n' welcome.sh install.sh node_modules; python3 x.py") })] });
  assert.deepEqual(r.fetching, []);
  assert.deepEqual(r.toolchain, ['python3'], 'only python3 is a program here');
});

test('the scan is a lint over the publisher\'s own manifest, so it is conservative: a fetching name anywhere in a command counts', () => {
  // Deliberate: it does not claim to parse shell. A false positive costs one edit before release
  // (the shipped-manifest test below catches it); a false negative would let a download through.
  const r = inspectExternalRuntime({ host: 'claude', files: [claude({ hooks: hooks("echo 'run npx later'") })] });
  assert.deepEqual(r.fetching.map(e => e.program), ['npx']);
});

test('claude: a manifest with neither servers nor hooks has no external runtime', () => {
  const r = inspectExternalRuntime({ host: 'claude', files: [claude({})] });
  assert.equal(r.host, 'claude');
  assert.deepEqual(r.sources, ['.claude-plugin/plugin.json'], 'it read the Claude manifest, and only that');
  assert.deepEqual([r.entries, r.fetching, r.toolchain], [[], [], []]);
});

// ── per host: the acceptance row ─────────────────────────────────────────────

const codexFiles = () => [
  file('.codex-plugin/plugin.json', { name: 'great-cto', version: '3.72.0', mcpServers: './.codex-plugin/mcp.json', hooks: './.codex-plugin/hooks.json' }),
  file('.codex-plugin/mcp.json', { mcpServers: { great_cto: { command: 'npx', args: ['-y', 'great-cto@3.72.0', 'mcp'] } } }),
  file('.codex-plugin/hooks.json', { hooks: hooks('node "$_pd/scripts/hooks/codex-adapter.mjs"') }),
];

test('a Codex-only npx entry does not refuse a Claude activation', () => {
  const files = [claude({ hooks: hooks('node "${PLUGIN_DIR}/a.mjs"') }), ...codexFiles()];
  assert.equal(inspectExternalRuntime({ host: 'codex', files }).fetching.length, 1, 'the npx is really there, for Codex');
  assert.deepEqual(inspectExternalRuntime({ host: 'claude', files }).fetching, []);
  assert.doesNotThrow(() => assertNoFetchingRuntime(files, { host: 'claude' }));
});

test('the same files do refuse a Codex activation, naming the file and the program', () => {
  const files = [claude({}), ...codexFiles()];
  const r = inspectExternalRuntime({ host: 'codex', files });
  assert.deepEqual(r.fetching.map(e => [e.source, e.program, e.where]), [['.codex-plugin/mcp.json', 'npx', 'mcpServers.great_cto']]);
  assert.equal(reasonOf(() => assertNoFetchingRuntime(files, { host: 'codex' })), 'external-runtime-fetching');
});

test('a fetching command in the Claude manifest refuses a Claude activation, with the evidence in the message', () => {
  const files = [claude({ mcpServers: { x: { command: 'npx', args: ['y'] } } })];
  assert.equal(reasonOf(() => assertNoFetchingRuntime(files)), 'external-runtime-fetching');
  try { assertNoFetchingRuntime(files); } catch (e) { assert.match(e.message, /\.claude-plugin\/plugin\.json.*mcpServers\.x.*npx/s); }
});

test('assertNoFetchingRuntime returns the report when nothing fetches, so the caller can show it', () => {
  const report = assertNoFetchingRuntime([claude({ hooks: hooks('python3 x.py') })]);
  assert.equal(report.host, 'claude');
  assert.deepEqual(report.toolchain, ['python3']);
});

test('an unknown host, and a manifest that cannot be read, are refused by name', () => {
  assert.equal(reasonOf(() => inspectExternalRuntime({ host: 'cursor', files: [claude({})] })), 'external-runtime-host-unsupported');
  assert.equal(reasonOf(() => inspectExternalRuntime({ host: 'claude', files: [] })), 'plugin-manifest-unreadable');
  assert.equal(reasonOf(() => inspectExternalRuntime({ host: 'claude', files: [file('.claude-plugin/plugin.json', '{')] })), 'plugin-manifest-unreadable');
  assert.equal(reasonOf(() => inspectExternalRuntime({ host: 'codex', files: [file('.codex-plugin/plugin.json', '[]')] })), 'plugin-manifest-unreadable');
});

test('a Codex manifest that points at a file the snapshot lacks is refused, not read as "nothing declared"', () => {
  const files = [file('.codex-plugin/plugin.json', { name: 'great-cto', version: '1.0.0', mcpServers: './.codex-plugin/mcp.json' })];
  assert.equal(reasonOf(() => inspectExternalRuntime({ host: 'codex', files })), 'plugin-manifest-unreadable');
});

// ── the locations Claude Code reads without the manifest naming them (bead tqsw) ──
//
// Claude Code loads `.mcp.json` and `hooks/hooks.json` from the plugin root whether or not
// `.claude-plugin/plugin.json` mentions them, and merges them with what the manifest declares
// (code.claude.com/docs/en/plugins/components, "Hooks" and "MCP servers"). A signature covers the bytes of
// those files, not the `npx` they ask the host to run: a check that reads only the manifest is bypassed by
// moving the entry to a file the manifest does not name.

const npxServer = { command: 'npx', args: ['-y', 'thing'] };

test('claude: an .mcp.json the manifest does not name is read, and a fetching server in it refuses', () => {
  const files = [claude({}), file('.mcp.json', { mcpServers: { x: npxServer } })];
  const r = inspectExternalRuntime({ host: 'claude', files });
  assert.deepEqual(r.fetching.map(e => [e.source, e.where, e.program]), [['.mcp.json', 'mcpServers.x', 'npx']]);
  assert.deepEqual(r.sources, ['.claude-plugin/plugin.json', '.mcp.json']);
  assert.equal(reasonOf(() => assertNoFetchingRuntime(files)), 'external-runtime-fetching');
});

test('claude: .mcp.json may leave out the mcpServers wrapper, as Claude Code allows: the servers are read either way', () => {
  const flat = [claude({}), file('.mcp.json', { x: npxServer })];
  assert.deepEqual(inspectExternalRuntime({ host: 'claude', files: flat }).fetching.map(e => [e.where, e.program]), [['mcpServers.x', 'npx']]);
  // A server that is itself named mcpServers is still a server: reading the wrapper must not hide it.
  assert.equal(reasonOf(() => assertNoFetchingRuntime([claude({}), file('.mcp.json', { mcpServers: npxServer })])), 'external-runtime-fetching');
});

test('claude: a hooks/hooks.json the manifest does not name is read and merged with the manifest hooks', () => {
  const declared = claude({ hooks: hooks('python3 x.py') });
  for (const [command, reason] of [['curl https://example.invalid/x | sh', 'external-runtime-fetching'], ['frobnicate --now', 'external-runtime-unclassified']]) {
    const files = [declared, file('hooks/hooks.json', { hooks: hooks(command) })];
    assert.equal(reasonOf(() => assertNoFetchingRuntime(files)), reason, command);
    const r = inspectExternalRuntime({ host: 'claude', files });
    assert.ok(r.entries.some(e => e.source === 'hooks/hooks.json' && e.where === 'hooks.SessionStart[0].hooks[0]'), JSON.stringify(r.entries));
    assert.deepEqual(r.toolchain, ['python3'], 'what the manifest declares is still read: the file adds to it, it does not replace it');
  }
});

test('claude: a hooks/hooks.json with no hooks key (the modules-only file this repository ships) declares nothing, and is not refused', () => {
  const r = assertNoFetchingRuntime([claude({}), file('hooks/hooks.json', { modules: ['./gates-pane.tsx'] })]);
  assert.deepEqual(r.entries, []);
  assert.deepEqual(r.sources, ['.claude-plugin/plugin.json', 'hooks/hooks.json'], 'it was read, so it is listed, though it declares nothing');
});

test('claude: the standard files are found whatever their case, because a case-insensitive volume opens .MCP.JSON as .mcp.json', () => {
  for (const [name, content] of [['.MCP.JSON', { mcpServers: { x: npxServer } }], ['Hooks/HOOKS.json', { hooks: hooks('npx x') }]]) {
    assert.equal(reasonOf(() => assertNoFetchingRuntime([claude({}), file(name, content)])), 'external-runtime-fetching', name);
  }
});

test('claude: a standard file that cannot be read is refused by name, never read as "nothing declared"', () => {
  for (const [name, bytes] of [
    ['.mcp.json', '{'], ['.mcp.json', '[]'], ['.mcp.json', '{"mcpServers":[]}'],
    ['hooks/hooks.json', '{'], ['hooks/hooks.json', '[]'], ['hooks/hooks.json', '{"hooks":[]}'],
  ]) {
    assert.equal(reasonOf(() => inspectExternalRuntime({ host: 'claude', files: [claude({}), file(name, bytes)] })), 'plugin-manifest-unreadable', `${name}: ${bytes}`);
  }
});

test('claude: a file the manifest points at that is also a standard file is read once and listed once', () => {
  const files = [claude({ mcpServers: './.mcp.json', hooks: './hooks/hooks.json' }), file('.mcp.json', { mcpServers: { x: npxServer } }), file('hooks/hooks.json', { hooks: hooks('npx y') })];
  const r = inspectExternalRuntime({ host: 'claude', files });
  assert.deepEqual(r.sources, ['.claude-plugin/plugin.json', '.mcp.json', 'hooks/hooks.json']);
  assert.equal(r.fetching.length, 2, 'one entry per command, not one per way of reaching the file');
});

test('codex: the Claude standard files are not read for a Codex activation; only the Codex manifest decides', () => {
  const files = [file('.codex-plugin/plugin.json', { name: 'great-cto', version: '3.72.0' }), file('.mcp.json', { mcpServers: { x: npxServer } }), file('hooks/hooks.json', { hooks: hooks('npx y') })];
  const r = inspectExternalRuntime({ host: 'codex', files });
  assert.deepEqual(r.sources, ['.codex-plugin/plugin.json']);
  assert.deepEqual(r.fetching, []);
});

// ── the manifests this repository ships ──────────────────────────────────────

function shippedFiles() {
  const rels = ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', '.codex-plugin/mcp.json', '.codex-plugin/hooks.json', 'hooks/hooks.json', 'mcp-servers/llm-router/server.py'];
  return rels.map(rel => ({ path: rel, bytes: fs.readFileSync(path.join(REPO, rel)), mode: 0o644 }));
}

test('shipped: the Claude manifest has no fetching and no unclassified entrypoint, so a real activation is not refused', () => {
  const r = assertNoFetchingRuntime(shippedFiles(), { host: 'claude' });
  assert.deepEqual(r.fetching, []);
  assert.deepEqual(r.unclassified.map(e => `${e.where}: ${e.program}`), []);
  assert.ok(r.entries.length >= 30, `only ${r.entries.length} entries: the scan did not read the shipped hooks`);
});

test('shipped: the standard-location hooks/hooks.json is read, and holds modules only: it declares no command (bead tqsw)', () => {
  const r = inspectExternalRuntime({ host: 'claude', files: shippedFiles() });
  assert.ok(r.sources.includes('hooks/hooks.json'), `the scan did not read it: ${r.sources}`);
  assert.deepEqual(r.entries.filter(e => e.source === 'hooks/hooks.json'), []);
});

test('shipped: no hook clones or pulls a repository (bug 5fz8): skills come from `great-cto skills sync`, on request', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO, '.claude-plugin/plugin.json'), 'utf8'));
  const commands = Object.values(manifest.hooks).flat().flatMap(g => g.hooks).map(h => h.command);
  assert.ok(commands.length > 30, 'the scan saw the hooks');
  for (const command of commands) {
    assert.doesNotMatch(command, /git\s+(?:-\S+\s+\S+\s+)*(?:clone|pull|fetch)\b|github\.com\/(?:davila7|anthropics|avelikiy)\//i, `a hook fetches: ${command.slice(0, 160)}`);
  }
  const hint = commands.find(c => /great-cto skills sync/.test(c));
  assert.ok(hint, 'the session start says how to get the catalogs, where it used to clone them');
});

test('shipped: the same refusal would catch the clones that used to be there (the check is not vacuous)', () => {
  const files = shippedFiles().map(f => f.path === '.claude-plugin/plugin.json'
    ? { ...f, bytes: Buffer.from(JSON.stringify({ ...JSON.parse(f.bytes), hooks: hooks('if [ ! -d ~/.great_cto/catalog ]; then git clone --depth=1 https://github.com/davila7/claude-code-templates.git ~/.great_cto/catalog 2>/dev/null & fi') })) }
    : f);
  assert.equal(reasonOf(() => assertNoFetchingRuntime(files, { host: 'claude' })), 'external-runtime-fetching');
});

test('shipped: python3 (the router and two hooks), git and bd are reported as host toolchain', () => {
  const r = inspectExternalRuntime({ host: 'claude', files: shippedFiles() });
  for (const program of ['python3', 'git', 'bd']) assert.ok(r.toolchain.includes(program), `${program} missing from ${r.toolchain}`);
  assert.ok(r.entries.some(e => e.program === 'python3' && e.where === 'mcpServers.great_cto_llm_router'));
  assert.ok(r.entries.filter(e => e.program === 'python3' && e.where.startsWith('hooks.')).length >= 2);
});

test('shipped: the Codex MCP entry is the npx the ARCH names, and it refuses only a Codex activation', () => {
  const files = shippedFiles();
  assert.deepEqual(inspectExternalRuntime({ host: 'codex', files }).fetching.map(e => [e.source, e.program]), [['.codex-plugin/mcp.json', 'npx']]);
  assert.deepEqual(inspectExternalRuntime({ host: 'claude', files }).fetching, []);
});

// ── through the real adapter ─────────────────────────────────────────────────

function machine(t, extra = [], { claudeDir: present = true } = {}) {
  const base = tempBase(t), claudeDir = path.join(base, 'claude'), stateRoot = path.join(base, 'state');
  if (present) fs.mkdirSync(claudeDir, { mode: 0o755 });
  fs.mkdirSync(stateRoot, { mode: 0o700 });
  const version = '3.72.0';
  // Extra files replace the fixture's defaults of the same path: an archive cannot hold a path twice.
  const defaults = pluginFiles(version).filter(f => !extra.some(e => e.path === f.path));
  const set = writeEmbeddedSet(base, { version, files: [...defaults, ...extra] });
  const targets = pluginActivationTargets(claudeDir, version);
  const run = () => activatePluginRelease(admitFixture(set), { claudeDir, stateRoot, testing: true, smoke: () => {} });
  return { base, claudeDir, targets, run };
}
const none = targets => ['registry', 'settings', 'marketplace', 'versionDir'].filter(k => fs.existsSync(targets[k]));

test('adapter: a fetching entrypoint in the Claude manifest refuses before anything is written', t => {
  const m = machine(t, [claude({ mcpServers: { x: { command: 'npx', args: ['-y', 'thing'] } } })]);
  const r = m.run();
  assert.equal(r.state, 'REFUSED');
  assert.equal(r.reason, 'external-runtime-fetching');
  assert.deepEqual(none(m.targets), [], 'no registry, settings, marketplace entry or cache directory was created');
});

test('adapter: an unclassified entrypoint in the Claude manifest refuses before anything is written (bug xhqq)', t => {
  const m = machine(t, [claude({ hooks: hooks('node "${PLUGIN_DIR}/a.mjs"; frobnicate --now') })]);
  const r = m.run();
  assert.equal(r.state, 'REFUSED');
  assert.equal(r.reason, 'external-runtime-unclassified');
  assert.deepEqual(none(m.targets), []);
});

test('adapter: a fetching entry in a standard-location .mcp.json or hooks/hooks.json refuses before anything is written, as one in the manifest does (bead tqsw)', t => {
  for (const extra of [file('.mcp.json', { mcpServers: { x: npxServer } }), file('hooks/hooks.json', { hooks: hooks('npx y') })]) {
    const m = machine(t, [claude({}), extra], { claudeDir: false });
    const r = m.run();
    assert.equal(r.state, 'REFUSED', `${extra.path}: ${r.reason}`);
    assert.equal(r.reason, 'external-runtime-fetching', extra.path);
    assert.equal(fs.existsSync(m.claudeDir), false, 'and no ~/.claude either');
    assert.deepEqual(none(m.targets), []);
  }
});

test('adapter: a refusal on a machine with no ~/.claude yet creates nothing, not even the directory (bug 7j8w)', t => {
  for (const extra of [
    [claude({ mcpServers: { x: { command: 'npx', args: ['-y', 'thing'] } } })],
    [claude({ hooks: hooks('frobnicate') })],
  ]) {
    const m = machine(t, extra, { claudeDir: false });
    assert.equal(fs.existsSync(m.claudeDir), false, 'precondition: this machine has no Claude directory');
    const r = m.run();
    assert.equal(r.state, 'REFUSED', r.reason);
    assert.equal(fs.existsSync(m.claudeDir), false, 'a REFUSED outcome is documented as nothing written: no ~/.claude either');
  }
});

test('adapter: with no ~/.claude yet, an activation that passes every check creates it owner-only', t => {
  const m = machine(t, [], { claudeDir: false });
  const r = m.run();
  assert.equal(r.state, 'SIMULATED_SMOKE_PASSED', r.reason);
  assert.equal(fs.statSync(m.claudeDir).mode & 0o777, 0o700);
});

test('adapter: a Codex-only npx file does not stop a Claude activation', t => {
  const m = machine(t, [claude({}), ...codexFiles()]);
  const r = m.run();
  assert.equal(r.state, 'SIMULATED_SMOKE_PASSED', r.reason);
  assert.deepEqual(r.externalRuntime.fetching, []);
});

test('adapter: python3 is reported on the outcome as host toolchain, on first activation and on the idempotent one', t => {
  const m = machine(t, [claude({ mcpServers: { router: { command: 'python3', args: ['${CLAUDE_PLUGIN_ROOT}/mcp-servers/r.py'] } } }), file('mcp-servers/r.py', '# inert\n')]);
  const first = m.run();
  assert.equal(first.state, 'SIMULATED_SMOKE_PASSED', first.reason);
  assert.deepEqual(first.externalRuntime.toolchain, ['python3']);
  const again = m.run();
  assert.equal(again.state, 'SIMULATED_ALREADY_ACTIVE');
  assert.deepEqual(again.externalRuntime.toolchain, ['python3']);
});

test('the adapter imports the boundary module and the boundary module imports nothing', () => {
  const source = fs.readFileSync(path.join(HERE, '..', 'src', 'plugin-runtime-boundary.mjs'), 'utf8');
  const specifiers = [...source.matchAll(/(?:from|import\()\s*'([^']+)'/g)].map(m => m[1]);
  assert.deepEqual(specifiers, [], 'it can neither write a file nor reach the plugin cache: it parses what it is handed');
  const adapter = fs.readFileSync(path.join(HERE, '..', 'src', 'plugin-activation.mjs'), 'utf8');
  assert.match(adapter, /from '\.\/plugin-runtime-boundary\.mjs'/);
});

// ── marketplace divergence ───────────────────────────────────────────────────

const registry = plugins => Buffer.from(JSON.stringify({ version: 2, plugins }));
const GIT_SHA = 'c7e1b2f'.padEnd(40, '0');
const ADMITTED_DIGEST = 'd'.repeat(64);
const gitCopy = { scope: 'user', installPath: '/h/.claude/plugins/cache/great-cto/great_cto/3.77.0', version: '3.77.0', gitCommitSha: GIT_SHA };
const admittedCopy = { scope: 'user', installPath: '/h/.claude/plugins/cache/local/great_cto/3.80.0', version: '3.80.0', localContentSha256: ADMITTED_DIGEST };

test('divergence: the admitted key is the one the adapter writes', () => {
  assert.equal(ADMITTED_KEY, PLUGIN_KEY);
});

test('divergence: no registry, or only the admitted registration, is not divergence', () => {
  const cases = [
    [null, null],
    [registry({}), null],
    [registry({ [ADMITTED_KEY]: [admittedCopy], 'other@market': [{ scope: 'user', installPath: '/x' }] }), admittedCopy.installPath],
  ];
  for (const [bytes, admittedPath] of cases) {
    const d = describeDivergence(bytes);
    assert.equal(d.diverged, false);
    assert.equal(d.admitted?.installPath ?? null, admittedPath, 'it still reports the admitted registration it found');
    assert.deepEqual(d.others, []);
    assert.deepEqual(d.lines, []);
  }
});

test('divergence: a great_cto registration from another marketplace is detected, with both paths and both identities', () => {
  const d = describeDivergence(registry({ [ADMITTED_KEY]: [admittedCopy], 'great_cto@great-cto': [gitCopy] }));
  assert.equal(d.diverged, true);
  assert.deepEqual(d.admitted, { key: ADMITTED_KEY, installPath: admittedCopy.installPath, version: '3.80.0', gitCommitSha: null, localContentSha256: ADMITTED_DIGEST });
  assert.deepEqual(d.others, [{ key: 'great_cto@great-cto', installs: [{ scope: 'user', installPath: gitCopy.installPath, version: '3.77.0', gitCommitSha: GIT_SHA }] }]);
  const text = d.lines.join('\n');
  for (const needle of [admittedCopy.installPath, gitCopy.installPath, GIT_SHA, ADMITTED_DIGEST]) assert.ok(text.includes(needle), `report lacks ${needle}`);
});

test('divergence: the report says the machine does not run admitted bytes in every session, and that nothing was changed', () => {
  const text = describeDivergence(registry({ [ADMITTED_KEY]: [admittedCopy], 'great_cto@great-cto': [gitCopy] })).lines.join('\n');
  assert.match(text, /not .*admitted bytes in every session/i);
  assert.match(text, /left .*unchanged|did not change|not changed/i);
  assert.match(text, /enabledPlugins/, 'and names the one key the user can set themselves');
});

test('divergence: several other marketplaces are all listed, in a stable order; lookalike keys are not counted', () => {
  const d = describeDivergence(registry({
    'great_cto@zeta': [{ scope: 'user', installPath: '/z', version: '1.0.0' }],
    'great_cto@alpha': [{ scope: 'user', installPath: '/a1', version: '1.0.0' }, { scope: 'project', installPath: '/a2', version: '1.1.0' }],
    'great_ctoX@m': [{ installPath: '/no' }], 'other@local': [{ installPath: '/no' }], [ADMITTED_KEY]: [admittedCopy],
  }));
  assert.deepEqual(d.others.map(o => o.key), ['great_cto@alpha', 'great_cto@zeta']);
  assert.deepEqual(d.others[0].installs.map(i => i.installPath), ['/a1', '/a2']);
});

test('divergence: another registration with no admitted one is still reported, and says there is no admitted registration', () => {
  const d = describeDivergence(registry({ 'great_cto@great-cto': [gitCopy] }));
  assert.equal(d.diverged, true);
  assert.equal(d.admitted, null);
  assert.match(d.lines.join('\n'), /no admitted registration/i);
});

test('divergence: a registry it cannot understand is refused by name, never read as "no divergence"', () => {
  assert.equal(reasonOf(() => describeDivergence(Buffer.from('{'))), 'registry-unparseable');
  assert.equal(reasonOf(() => describeDivergence(Buffer.from('[]'))), 'registry-not-an-object');
  assert.equal(reasonOf(() => describeDivergence(Buffer.from('{"version":1,"plugins":{}}'))), 'registry-schema-unsupported');
});

test('divergence: after a real activation, the other registration, its settings key and known_marketplaces.json are untouched', t => {
  const m = machine(t, []);
  const plugins = path.join(m.claudeDir, 'plugins');
  fs.mkdirSync(plugins, { recursive: true });
  const known = Buffer.from(JSON.stringify({ 'great-cto': { source: { source: 'git', url: 'https://example.invalid/great_cto.git' }, installLocation: '/x', lastUpdated: '2026-11-10T15:18:15Z' } }, null, 2) + '\n');
  fs.writeFileSync(path.join(plugins, 'known_marketplaces.json'), known);
  fs.writeFileSync(m.targets.registry, JSON.stringify({ version: 2, plugins: { 'great_cto@great-cto': [gitCopy] } }, null, 2) + '\n');
  fs.writeFileSync(m.targets.settings, JSON.stringify({ enabledPlugins: { 'great_cto@great-cto': true } }, null, 2) + '\n');

  assert.equal(m.run().state, 'SIMULATED_SMOKE_PASSED');

  const after = fs.readFileSync(m.targets.registry);
  const d = describeDivergence(after);
  assert.equal(d.diverged, true);
  assert.deepEqual(JSON.parse(after).plugins['great_cto@great-cto'], [gitCopy], 'the other registration is byte-equal in meaning');
  assert.equal(JSON.parse(fs.readFileSync(m.targets.settings)).enabledPlugins['great_cto@great-cto'], true, 'it was reported, not disabled');
  assert.deepEqual(fs.readFileSync(path.join(plugins, 'known_marketplaces.json')), known, 'known_marketplaces.json is never written');
  assert.deepEqual(fs.readdirSync(plugins).sort(), ['cache', 'installed_plugins.json', 'known_marketplaces.json', 'marketplaces']);
});
