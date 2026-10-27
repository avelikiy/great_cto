import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectClaudeStartupInventory, inspectNativeEnvironment, nativeChildEnvironment } from '../../packages/cli/src/native-startup-profile.mjs';
const source = readFileSync('.claude-plugin/plugin.json', 'utf8');
const policy = readFileSync('scripts/hooks/native-startup-policy.json', 'utf8');
const inspect = text => inspectClaudeStartupInventory(text, policy);
test('all54 original hook identities remain accounted for, without activation authority', () => {
 const r = inspect(source); assert.equal(r.state, 'UNCHANGED_SOURCE_INVENTORY'); assert.equal(r.hooks.length, 54);
 assert.equal(r.authority, 'NONE'); assert.equal(r.activation, 'UNSUPPORTED');
 for (const name of ['PreToolUse', 'Stop']) assert(r.hooks.some(h => h.id.startsWith(name + '/')));
 for (const suffix of ['frozen-gates-guard.mjs', 'gate-weakening-guard.mjs', 'secret-scan.mjs']) {
  const m = JSON.parse(source); assert(m.hooks.PreToolUse.some(e => e.hooks.some(h => h.command.includes(suffix))));
 }
 assert(r.blockers.includes('startup-effects-not-admitted'));
 assert(!JSON.stringify(r).includes('git clone')); assert(!JSON.stringify(r).includes('plugins/cache/'));
});
test('every command removal, mutation, matcher, timeout and async change is detected', () => {
 const baseline = JSON.parse(source);
 for (const event of Object.keys(baseline.hooks)) {
  const m = structuredClone(baseline); m.hooks[event][0].hooks[0].command += ' ';
  assert.equal(inspect(JSON.stringify(m)).state, 'REFUSED', event);
 }
 for (const mutate of [m => m.hooks.PreToolUse[0].hooks.pop(), m => m.hooks.Stop.reverse(),
  m => m.hooks.PreToolUse[0].matcher = 'Write', m => m.hooks.PreToolUse[0].hooks[0].timeout = 6,
  m => m.hooks.PreToolUse[0].hooks[0].async = true, m => m.hooks.Stop[0].hooks.push(structuredClone(m.hooks.Stop[0].hooks[0]))]) {
  const m = structuredClone(baseline); mutate(m); assert.equal(inspect(JSON.stringify(m)).state, 'REFUSED');
 }
});
test('unknown hook extensions/types and duplicate JSON keys are refused, never ignored', () => {
 for (const mutate of [m => m.hooks.Unknown = [], m => m.hooks.Stop[0].unknown = true,
  m => m.hooks.Stop[0].hooks[0].type = 'prompt', m => m.hooks.Stop[0].hooks[0].unknown = true]) {
  const m = JSON.parse(source); mutate(m); assert.equal(inspect(JSON.stringify(m)).state, 'REFUSED');
 }
 assert.equal(inspect(source.replace('"name":', '"name":"duplicate","name":')).state, 'REFUSED');
 assert.equal(inspectClaudeStartupInventory(source, '{}').state, 'REFUSED');
});
test('environment is explicit, privately held and cannot become an admission ticket', () => {
 const secret = ['owned', 'dummy', 'credential'].join('-');
 const env = { LANG: 'C', OPENROUTER_API_KEY: secret };
 const r = inspectNativeEnvironment(env); assert.equal(r.state, 'INSPECTED_ENVIRONMENT_ONLY'); assert.equal(r.authority, 'NONE');
 assert(!JSON.stringify(r).includes(secret)); assert.equal(nativeChildEnvironment(r).OPENROUTER_API_KEY, secret);
 env.LANG = 'changed'; assert.equal(nativeChildEnvironment(r).LANG, 'C');
 const returned = nativeChildEnvironment(r); returned.LANG = 'mutated'; assert.equal(nativeChildEnvironment(r).LANG, 'C');
 assert.throws(() => nativeChildEnvironment(JSON.parse(JSON.stringify(r))), /environment handle refused/);
});
test('preloads, shell initialization, aliases and unknown authority variables refuse without values', () => {
 const before = process.env.NODE_OPTIONS;
 for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'BASH_ENV', 'ENV', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES',
  'CLAUDE_PLUGIN_ROOT', 'PLUGIN_ROOT', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'GIT_CONFIG_GLOBAL', 'PATH', 'HOME', 'GREAT_CTO_DIR', 'HTTPS_PROXY', 'UNDECLARED']) {
  const r = inspectNativeEnvironment({ [key]: 'private rejected value' }); assert.equal(r.state, 'REFUSED', key);
  assert(!JSON.stringify(r).includes('private rejected value')); assert.throws(() => nativeChildEnvironment(r));
 }
 assert.equal(process.env.NODE_OPTIONS, before);
});
test('prototype authority, accessors, symbols and invalid values are refused without invocation', () => {
 let invoked = false; const getter = {}; Object.defineProperty(getter, 'LANG', { enumerable: true, get() { invoked = true; throw Error('must not invoke'); } });
 const inherited = Object.create({ LANG: 'C' });
 for (const env of [inherited, getter, { LANG: 'x\0y' }, { LANG: 7 }, { [Symbol('unexpected')]: 'x' }, JSON.parse('{"__proto__":{"LANG":"C"}}')]) assert.equal(inspectNativeEnvironment(env).state, 'REFUSED');
 assert.equal(invoked, false);
});
