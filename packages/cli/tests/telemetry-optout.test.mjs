import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const mainUrl = new URL('../dist/main.js', import.meta.url).href;
const telemetryUrl = new URL('../dist/telemetry.js', import.meta.url).href;
const flag = '--no-telemetry';

// These fixtures execute compiled production modules. The loader replaces only
// side-effecting collaborators; init itself and the consent/sender gates run.
const loaderSource = String.raw`
import { readFile } from 'node:fs/promises';
const trace = "const trace = (kind, value) => process.stderr.write('@trace ' + JSON.stringify({kind,value}) + '\\n');\n";
export async function load(url, context, nextLoad) {
  const mode = process.env.GCTO_TEST_MODE;
  const name = url.split('/').pop();
  if (!url.includes('/dist/')) return nextLoad(url, context);
  if (name === 'main.js' && mode === 'parser') {
    const source = (await readFile(new URL(url), 'utf8')).replace('await main();', 'export { parseArgs };');
    return { format:'module', source, shortCircuit:true };
  }
  if (name === 'telemetry.js' && (mode === 'init' || mode === 'sender')) {
    let source = await readFile(new URL(url), 'utf8');
    source = source.replace('export function isTelemetryEnabled(cliFlag = false) {',
      "export function isTelemetryEnabled(cliFlag = false) { trace('resolver', cliFlag);");
    source = source.replace('export async function sendInstallPing(opts) {',
      "export async function sendInstallPing(opts) { trace('install', opts.noTelemetry ?? false);");
    source = source.replace('export async function sendUsagePing(opts) {',
      "export async function sendUsagePing(opts) { trace('usage', opts.noTelemetry ?? false);");
    return { format:'module', source:trace + source, shortCircuit:true };
  }
  const stubs = {
    'installer.js': "export const findInstalledVersions=()=>[]; export const install=()=>{trace('bootstrap-install',true);return {alreadyInstalled:true,version:'0.0.0',pluginDir:'fixture'}};",
    'settings.js': "export const enableGreatCto=()=>({alreadyEnabled:true,settingsPath:'fixture'});",
    'companion.js': "export const installAllCompanions=()=>[];",
    'overlay.js': "export const applyOverlays=()=>{};",
    'bootstrap.js': "export const bootstrap=()=>{trace('bootstrap',true);return {created:true,projectMdPath:'fixture'}};",
    'worker.js': "export const runTask=async a=>{trace('delegate',a);return 0}; export const runWorker=runTask;",
    'work-task.js': "export const runWorkTask=a=>{trace('delegate',a);return 0};",
    'codex-host.js': "export const runCodexHost=a=>{trace('delegate',a);return 0};",
    'run.js': "export const runDaily=(c,a)=>{trace('delegate',a);return 0};",
    'statusline.js': "export const runStatuslineCommand=a=>{trace('delegate',a);return 0};",
  };
  if (mode === 'delegate-values' && name === 'webhook-cli.js') {
    let source = await readFile(new URL(url), 'utf8');
    source = source.replace('export async function runWebhookCli(', 'async function originalRunWebhookCli(');
    source += "\nexport async function runWebhookCli(args) { trace('webhook-value', args); return 0; }";
    return {format:'module', source:trace+source, shortCircuit:true};
  }
  if (mode === 'init' && name === 'ui.js') {
    let source = await readFile(new URL(url), 'utf8');
    source = source.replace('export async function confirm(', 'async function originalConfirm(');
    source += "\nexport async function confirm(question) { trace('confirm', question); return true; }";
    return {format:'module', source:trace+source, shortCircuit:true};
  }
  if ((mode === 'init' || mode === 'delegate') && stubs[name]) {
    return {format:'module', source:trace+stubs[name], shortCircuit:true};
  }
  return nextLoad(url, context);
}
`;

function fixture(t, config) {
  const root = mkdtempSync(join(tmpdir(), 'gc-optout-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'home'), cwd = join(root, 'project');
  mkdirSync(join(home, '.great_cto'), { recursive: true });
  mkdirSync(cwd);
  writeFileSync(join(cwd, 'package.json'), '{"name":"fixture","private":true}');
  // Avoid the skill bootstrap's clones without changing that production path.
  for (const name of ['anthropic-skills', 'personal-skills']) mkdirSync(join(home, '.great_cto', name));
  writeFileSync(join(home, '.great_cto', 'secrets.env'), '# isolated fixture\n');
  const configFile = join(home, '.great_cto', 'telemetry.json');
  if (config !== undefined) writeFileSync(configFile, config);
  const loader = join(root, 'loader.mjs');
  writeFileSync(loader, loaderSource);
  const preload = join(root, 'preload.mjs');
  writeFileSync(preload, `
    import { register, syncBuiltinESMExports } from 'node:module';
    import cp from 'node:child_process';
    globalThis.fetch = async () => { process.stderr.write('@network-blocked\\n'); throw new Error('unexpected HTTP'); };
    cp.spawnSync = () => { throw new Error('unexpected subprocess'); };
    cp.execFileSync = () => { throw new Error('unexpected subprocess'); };
    syncBuiltinESMExports();
    if (process.env.GCTO_TEST_TTY === '1') Object.defineProperty(process.stdin, 'isTTY', {value:true});
    register(${JSON.stringify(pathToFileURL(loader).href)});
  `);
  const env = { PATH: process.env.PATH || '/usr/bin:/bin', HOME: home, USERPROFILE: home,
    LANG: 'C', TZ: 'UTC', NO_COLOR: '1', GREAT_CTO_TELEMETRY_DRYRUN: '1', GREAT_CTO_NO_UPDATE_CHECK: '1' };
  function run(argv, overrides = {}, mode = '', code) {
    const nodeArgs = ['--import', preload];
    if (code) nodeArgs.push('--input-type=module', '-e', code, ...argv);
    else nodeArgs.push(new URL(mainUrl).pathname, ...argv);
    const r = spawnSync(process.execPath, nodeArgs, { cwd, env: { ...env, ...overrides, GCTO_TEST_MODE: mode }, encoding:'utf8', timeout:10000 });
    assert.ifError(r.error);
    assert.doesNotMatch(r.stderr, /@network-blocked/);
    // Never expose the machine's anon_id in assertion diagnostics.
    const stderr = r.stderr.replace(/"anon_id":"[^"]*"/g, '"anon_id":"redacted"');
    const events = (stderr.match(/\[telemetry\] would-send:/g) || []).length;
    const traces = stderr.split('\n').filter(l => l.startsWith('@trace ')).map(l => JSON.parse(l.slice(7)));
    return { ...r, stderr, events, traces };
  }
  const unchanged = () => config === undefined
    ? assert.equal(existsSync(configFile), false)
    : assert.equal(readFileSync(configFile, 'utf8'), config);
  return { run, unchanged, cwd, configFile };
}

for (const optin of ['env', 'config']) {
  test(`${optin} opt-in: help/version aliases honor either flag position and repetition`, t => {
    const f = fixture(t, optin === 'config' ? '{ "enabled": true, "decided_at": "fixture" }\n' : undefined);
    const env = optin === 'env' ? { GREAT_CTO_TELEMETRY:'on' } : {};
    for (const command of ['help', '--help', '-h', 'version', '--version', '-v']) {
      const baseline = f.run([command], env);
      assert.equal(baseline.status, 0);
      assert.equal(baseline.events, 1, command);
      for (const argv of [[flag, command], [command, flag], [flag, flag, command]]) {
        const r = f.run(argv, env);
        assert.equal(r.status, 0, r.stderr);
        assert.equal(r.events, 0, argv.join(' '));
        assert.equal(r.stdout, baseline.stdout);
        f.unchanged();
      }
      assert.equal(f.run([command], env).events, 1, 'refusal must not persist');
    }
  });
}

test('default OFF, config false and all existing env refusals retain their semantics', t => {
  for (const config of [undefined, '{"enabled":false}\n']) {
    const f = fixture(t, config);
    for (const argv of [['help'], [flag, 'help'], ['help', flag]]) {
      assert.equal(f.run(argv).events, 0);
      f.unchanged();
    }
  }
  const f = fixture(t, '{"enabled":true}\n');
  for (const override of [ {DO_NOT_TRACK:'yes'}, {GREAT_CTO_TELEMETRY:'off'},
    {GREAT_CTO_DISABLE_TELEMETRY:'1'}, {GREATCTO_NO_TELEMETRY:'1'}, {CI:'1'}, {GITHUB_ACTIONS:'1'} ]) {
    for (const argv of [['help'], [flag, 'help']]) {
      assert.equal(f.run(argv, {GREAT_CTO_TELEMETRY:'on', ...override}).events, 0);
    }
  }
});

test('unknown command/long flag retain rc2 and diagnostics with either position', t => {
  const f = fixture(t);
  for (const token of ['definitely-unknown', '--definitely-unknown', '--no-telemetry=false']) {
    const baseline = f.run([token]);
    assert.equal(baseline.status, 2);
    for (const argv of [[flag, token], [token, flag]]) {
      const r = f.run(argv, {GREAT_CTO_TELEMETRY:'on'}, 'init');
      assert.equal(r.status, 2);
      assert.equal(r.stdout, baseline.stdout);
      assert.equal(r.stderr.split('\n').filter(l => !l.startsWith('@trace ')).join('\n'), baseline.stderr);
      assert.equal(r.traces.some(x => ['bootstrap', 'bootstrap-install', 'confirm'].includes(x.kind)), false, 'must never initialize');
      f.unchanged();
    }
  }
});

test('ordinary delegates keep report/webhook verbs and parseable output', t => {
  const f = fixture(t);
  for (const command of [['report', 'cost', '--format', 'json'], ['webhook', 'list'], ['ci', '--no-archetype', '--no-budget']]) {
    const baseline = f.run(command);
    assert.equal(baseline.status, 0, baseline.stderr);
    for (const argv of [[flag, ...command], [command[0], flag, ...command.slice(1)], [...command, flag]]) {
      const r = f.run(argv, {GREAT_CTO_TELEMETRY:'on'});
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.events, 0);
      if (command[0] === 'report') assert.doesNotThrow(() => JSON.parse(r.stdout));
      else assert.equal(r.stdout, baseline.stdout);
    }
  }
});

test('root value options own a literal flag value; only consumed root indices are removed', t => {
  const f = fixture(t);
  const code = `const {parseArgs}=await import(${JSON.stringify(mainUrl)}); console.log(JSON.stringify(parseArgs(JSON.parse(process.argv[1]))));`;
  for (const [option, field] of [['--archetype','archetype'], ['--version-tag','version'], ['--bind','consoleBind'], ['--host','hostInput'], ['--dir','dir']]) {
    const r = f.run([JSON.stringify([option, flag, 'help'])], {}, 'parser', code);
    assert.equal(r.status, 0, r.stderr);
    const args = JSON.parse(r.stdout);
    assert.equal(args.noTelemetry, false);
    assert.equal(args[field], field === 'dir' ? join(realpathSync(f.cwd), flag) : flag);
  }
  const argv = ['report', '--archetype', flag, flag, 'cost', '--format', 'json'];
  const parsed = f.run([JSON.stringify(argv)], {}, 'parser', code);
  assert.deepEqual(JSON.parse(parsed.stdout).rootArgv, ['report', '--archetype', flag, 'cost', '--format', 'json']);
  // The first flag is data, the second is a root option. Removing both by
  // value would erase the root archetype's value before delegation.
  for (const command of ['ci','report','webhook','upgrade']) {
    const original = [flag, command, '--version-tag', flag, flag, 'verb'];
    const r = f.run([JSON.stringify(original)], {}, 'parser', code);
    assert.deepEqual(JSON.parse(r.stdout).rootArgv, [command, '--version-tag', flag, 'verb']);
  }
});

test('every passthrough boundary preserves literal tail and prefix opt-out', t => {
  const f = fixture(t);
  const tail = ['--', flag, 'prompt with spaces', '--host', flag, ''];
  const code = `const {parseArgs}=await import(${JSON.stringify(mainUrl)}); console.log(JSON.stringify(parseArgs(JSON.parse(process.argv[1]))));`;
  for (const command of ['task','worker','codex-host','run','status','resume','statusline']) {
    for (const prefix of [[], [flag]]) {
      const r = f.run([...prefix, command, ...tail], {GREAT_CTO_TELEMETRY:'on'}, 'delegate');
      assert.equal(r.status, 0, r.stderr);
      assert.deepEqual(r.traces.find(x => x.kind === 'delegate')?.value, tail);
      const parsed = f.run([JSON.stringify([...prefix, command, ...tail])], {}, 'parser', code);
      assert.equal(JSON.parse(parsed.stdout).noTelemetry, prefix.length > 0);
    }
  }
});

test('webhook option values equal to the root flag remain delegated data', t => {
  const f = fixture(t);
  const fields = {secret:'secret',url:'url',format:'format',triggers:'triggers',events:'events','routing-key':'routingKey'};
  for (const [option, field] of Object.entries(fields)) {
    const argv = ['webhook', 'add-incoming', 'fixture-hook', `--${option}`, flag];
    for (const prefix of [[], [flag]]) {
      const r = f.run([...prefix, ...argv], {GREAT_CTO_TELEMETRY:'on'}, 'delegate-values');
      assert.equal(r.status, 0, r.stderr);
      const value = r.traces.find(x => x.kind === 'webhook-value')?.value[field];
      assert.deepEqual(value, ['triggers','events'].includes(field) ? [flag] : flag);
      assert.equal(r.events, prefix.length ? 0 : 1, 'only a separate root option may refuse telemetry');
    }
  }
});

test('webhook option-shaped values do not steal a later standalone root refusal', t => {
  const f = fixture(t);
  for (const value of ['--secret', '--no-telemetry']) {
    const argv = ['webhook', 'add-incoming', 'fixture-hook', '--secret', value, flag];
    const r = f.run(argv, {GREAT_CTO_TELEMETRY:'on'}, 'delegate-values');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.traces.find(x => x.kind === 'webhook-value')?.value.secret, value);
    assert.equal(r.events, 0, 'the final standalone root refusal must still be consumed');
  }
});

test('public senders pass optional request refusal into resolver before sanitizing', t => {
  const f = fixture(t);
  const code = `
    const m = await import(${JSON.stringify(telemetryUrl)});
    const opts=JSON.parse(process.argv[1]);
    await m[opts.sender]({cliVersion:'fixture', subcommand:'help', exitCode:0, archetype:'devtools', consent:opts.consent, ...opts.option});
  `;
  for (const sender of ['sendUsagePing', 'sendInstallPing']) {
    for (const option of [{}, {noTelemetry:false}, {noTelemetry:true}]) {
      const r = f.run([JSON.stringify({sender, option, consent:true})], {GREAT_CTO_TELEMETRY:'on'}, 'sender', code);
      assert.equal(r.status, 0, r.stderr);
      assert.deepEqual(r.traces.filter(x => x.kind === 'resolver').map(x => x.value), [option.noTelemetry ?? false]);
      assert.equal(r.events, sender === 'sendUsagePing' && !option.noTelemetry ? 1 : 0);
    }
    const r = f.run([JSON.stringify({sender, option:{}, consent:false})], {GREAT_CTO_TELEMETRY:'on'}, 'sender', code);
    if (sender === 'sendInstallPing') assert.equal(r.traces.some(x => x.kind === 'resolver'), false);
  }
});

test('successful init skips consent promotion and install dispatch for one request', t => {
  for (const config of [undefined, '{"enabled":true}\n']) {
    for (const tty of ['0','1']) {
      for (const argv of [[flag, 'init'], ['init', flag]]) {
      const f = fixture(t, config);
      const env = {GCTO_TEST_TTY:tty, ...(config === undefined ? {GREAT_CTO_TELEMETRY:'on'} : {})};
      const r = f.run([...argv, '--archetype', 'devtools'], env, 'init');
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /great_cto is ready/);
      assert.equal(r.traces.filter(x => x.kind === 'bootstrap').length, 1);
      assert.equal(r.traces.filter(x => x.kind === 'bootstrap-install').length, 1);
      assert.equal(r.traces.some(x => x.kind === 'confirm' && /telemetry/i.test(x.value)), false);
      assert.equal(r.traces.some(x => x.kind === 'install'), false);
      assert.deepEqual(r.traces.filter(x => x.kind === 'resolver').map(x => x.value), [true, true]);
      assert.equal(r.events, 0);
      f.unchanged();
      const baseline = f.run(['init', '--yes', '--archetype', 'devtools'], env, 'init');
      assert.equal(baseline.status, 0, baseline.stderr);
      assert.equal(baseline.traces.some(x => x.kind === 'install' && x.value === false), true);
      assert.equal(baseline.events, 1, 'init must reach the real post-bootstrap telemetry block');
      if (tty === '1' && config === undefined) {
        const promptControl = f.run(['init', '--archetype', 'devtools'], env, 'init');
        assert.equal(promptControl.status, 0, promptControl.stderr);
        assert.equal(promptControl.traces.some(x => x.kind === 'confirm' && /telemetry/i.test(x.value)), true,
          'TTY positive control must actually reach the consent question');
      }
      }
    }
  }
});

test('explicit telemetry on/off retain persistent meaning even with request refusal', t => {
  const f = fixture(t);
  for (const [verb, expected] of [['on',true], ['off',false]]) {
    const r = f.run([flag, 'telemetry', verb], {GREAT_CTO_TELEMETRY:'on'});
    assert.equal(r.status, 0);
    assert.equal(r.events, 0);
    assert.equal(JSON.parse(readFileSync(f.configFile, 'utf8')).enabled, expected);
  }
});
