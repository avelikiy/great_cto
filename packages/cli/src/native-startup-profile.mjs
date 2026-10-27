/** Inactive source inspection only; never artifact admission or activation. */
import { createHash } from 'node:crypto';
import { parseStrictObject } from './release-json.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const own = (o, k) => Object.hasOwn(o, k);
const record = o => o !== null && typeof o === 'object' && !Array.isArray(o);
const exact = (o, keys) => record(o) && Object.keys(o).length === keys.length && keys.every(k => own(o, k));
const refused = reason => ({ schema: 1, state: 'REFUSED', authority: 'NONE', reason });
const fail = () => { throw Error('native startup inventory refused'); };
const events = new Set(['SessionStart', 'PreCompact', 'SubagentStart', 'SubagentStop', 'PreToolUse', 'PostToolUse',
 'SessionEnd', 'UserPromptSubmit', 'PermissionDenied', 'Stop', 'Notification', 'PostToolUseFailure']);
const hookKeys = new Set(['type', 'command', 'timeout', 'statusMessage', 'async']);

/** A matching inventory does not establish that a hook loaded or ran. */
export function inspectClaudeStartupInventory(manifestText, policyText) {
 try {
  const manifest = parseStrictObject(manifestText, { maxBytes: 1048576 });
  const policy = parseStrictObject(policyText);
  if (!exact(policy, ['schema', 'scope', 'authority', 'sourceCommit', 'manifestSha256', 'slots']) ||
   policy.schema !== 1 || policy.scope !== 'SOURCE_HOOK_BASELINE_ONLY' || policy.authority !== 'NONE' ||
   !/^[a-f0-9]{40}$/.test(policy.sourceCommit) || !/^[a-f0-9]{64}$/.test(policy.manifestSha256) ||
   !Array.isArray(policy.slots) || !policy.slots.length || policy.slots.length > 512 || !record(manifest.hooks)) fail();
  const hooks = [];
  for (const [event, entries] of Object.entries(manifest.hooks)) {
   if (!events.has(event) || !Array.isArray(entries) || !entries.length || entries.length > 256) fail();
   for (const [entry, group] of entries.entries()) {
    if (!record(group) || Object.keys(group).some(k => !['matcher', 'hooks'].includes(k)) ||
     (own(group, 'matcher') && (typeof group.matcher !== 'string' || group.matcher.length > 1024)) ||
     !Array.isArray(group.hooks) || !group.hooks.length || group.hooks.length > 256) fail();
    for (const [commandIndex, hook] of group.hooks.entries()) {
     if (!record(hook) || Object.keys(hook).some(k => !hookKeys.has(k)) || hook.type !== 'command' ||
      typeof hook.command !== 'string' || !hook.command.trim() || Buffer.byteLength(hook.command) > 65536 ||
      (own(hook, 'timeout') && (!Number.isFinite(hook.timeout) || hook.timeout <= 0 || hook.timeout > 600)) ||
      (own(hook, 'async') && typeof hook.async !== 'boolean') ||
      (own(hook, 'statusMessage') && (typeof hook.statusMessage !== 'string' || hook.statusMessage.length > 1024))) fail();
     const identity = { event, entry, commandIndex, matcherPresent: own(group, 'matcher'), matcher: group.matcher ?? null, hook };
     hooks.push({ id: event + '/' + entry + '/' + commandIndex, sha256: sha(JSON.stringify(identity)), commandSha256: sha(hook.command) });
     if (hooks.length > 512) fail();
    }
   }
  }
  if (hooks.length !== policy.slots.length || sha(manifestText) !== policy.manifestSha256) fail();
  for (const [i, expected] of policy.slots.entries()) {
   if (!exact(expected, ['id', 'sha256', 'commandSha256']) ||
    !/^[a-f0-9]{64}$/.test(expected.sha256) || !/^[a-f0-9]{64}$/.test(expected.commandSha256) ||
    expected.id !== hooks[i].id || expected.sha256 !== hooks[i].sha256 || expected.commandSha256 !== hooks[i].commandSha256) fail();
  }
  return { schema: 1, state: 'UNCHANGED_SOURCE_INVENTORY', authority: 'NONE', activation: 'UNSUPPORTED',
   manifestSha256: policy.manifestSha256, hooks,
   blockers: ['startup-effects-not-admitted', 'mandatory-guard-runtime-closure-not-established',
    'native-toolchain-environment-not-admitted', 'native-transaction-recovery-not-established'] };
 } catch { return refused('native-startup-inventory-refused'); }
}

const environmentHandles = new WeakMap();
const environmentKeys = new Set(['LANG', 'TZ', 'TERM', 'NO_COLOR', 'OPENROUTER_API_KEY', 'GREAT_CTO_ROUTER_MODEL',
 'GREAT_CTO_ROUTER_MAX_TOKENS', 'GREAT_CTO_ROUTER_TIMEOUT', 'GREAT_CTO_ROUTER_TEMPERATURE']);

/** Narrow caller-selected inputs only. No process environment is inherited. */
export function inspectNativeEnvironment(input) {
 try {
  if (!record(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) fail();
  const copy = Object.create(null), keys = Reflect.ownKeys(input);
  for (const key of keys) {
   if (typeof key !== 'string' || !environmentKeys.has(key)) fail();
   const d = Object.getOwnPropertyDescriptor(input, key);
   if (!d || !own(d, 'value') || typeof d.value !== 'string' || d.value.includes('\0') ||
    Buffer.byteLength(d.value) > (key === 'OPENROUTER_API_KEY' ? 8192 : 4096)) fail();
   copy[key] = d.value;
  }
  const handle = Object.freeze({ schema: 1, state: 'INSPECTED_ENVIRONMENT_ONLY', authority: 'NONE', keys: Object.freeze(keys.slice().sort()) });
  environmentHandles.set(handle, Object.freeze(copy)); return handle;
 } catch { return Object.freeze(refused('native-environment-refused')); }
}
/** Trusted caller receives a copy; serialized inspection is not a capability. */
export function nativeChildEnvironment(handle) {
 const value = environmentHandles.get(handle); if (!value) throw Error('environment handle refused');
 return { ...value };
}
