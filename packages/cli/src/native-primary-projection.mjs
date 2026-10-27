/** Deterministic unsigned fixture projection. No host or artifact admission. */
import { createHash } from 'node:crypto';
import { parseStrictObject } from './release-json.mjs';
import { inspectClaudeStartupInventory } from './native-startup-profile.mjs';

export const NATIVE_ROOT_PREFIX = '[ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ "${CLAUDE_PLUGIN_ROOT}" = "${GREAT_CTO_NATIVE_PLUGIN_ROOT:-}" ] || { printf "%s\\n" "native plugin root binding refused" >&2; exit 2; }; ';
const sha = value => createHash('sha256').update(value).digest('hex');
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const fail = () => { throw Error('native primary projection refused'); };
const fields = ['sourceManifestText', 'policyText', 'contextBytes', 'routerBytes'];
const contextCommand = '_gd="$PWD"; while [ -n "$_gd" ] && { [ "$_gd" = "$HOME" ] || [ ! -f "$_gd/.great_cto/PROJECT.md" ]; }; do _gd="${_gd%/*}"; done; [ -n "$_gd" ] || { printf "%s\\n" "native project context refused" >&2; exit 2; }; exec node "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/native-session-context.mjs" --project-root "$_gd" --plugin-root "${CLAUDE_PLUGIN_ROOT}"';
const removed = Object.freeze(['newest-cache-selection', 'background-acquisition', 'catalog-clone-pull',
 'skill-discovery-refresh', 'update-installation', 'cache-pruning', 'global-managed-sync', 'model-override-write',
 'project-bootstrap-writes', 'automatic-codebase-scan', 'implicit-global-memory-patterns',
 'provider-credential-quota-refresh', 'automatic-git-reviewer-scan']);
function values(input, extras = []) {
 if (!input || typeof input !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(input)) ||
  Reflect.ownKeys(input).length !== fields.length + extras.length || Reflect.ownKeys(input).some(k => ![...fields, ...extras].includes(k))) fail();
 const copy = {};
 for (const key of [...fields, ...extras]) {
  const d = Object.getOwnPropertyDescriptor(input, key); if (!d || !Object.hasOwn(d, 'value')) fail(); copy[key] = d.value;
 }
 for (const key of ['sourceManifestText', 'policyText']) if (typeof copy[key] !== 'string' || Buffer.byteLength(copy[key]) > 1048576) fail();
 for (const key of ['contextBytes', 'routerBytes', ...extras]) if (!Buffer.isBuffer(copy[key]) || !copy[key].length || copy[key].length > 1048576 || copy[key].buffer instanceof SharedArrayBuffer) fail();
 return copy;
}

/** Paths are fixed templates; executable and canonical-root admission is external. */
export function prepareClaudePrimaryProjection(input) {
 try {
  const { sourceManifestText, policyText, contextBytes, routerBytes } = values(input);
  const inventory = inspectClaudeStartupInventory(sourceManifestText, policyText);
  if (inventory.state !== 'UNCHANGED_SOURCE_INVENTORY' || inventory.hooks.length !== 54) fail();
  const manifest = parseStrictObject(sourceManifestText, { maxBytes: 1048576 });
  if (!manifest.mcpServers || Object.keys(manifest.mcpServers).length !== 1 || !Object.hasOwn(manifest.mcpServers, 'great_cto_llm_router')) fail();
  let retained = 0, replacements = 0;
  for (const [event, entries] of Object.entries(manifest.hooks)) for (const [ei, group] of entries.entries()) for (const [hi, hook] of group.hooks.entries()) {
   if (event === 'SessionStart' && ei === 0 && hi === 1) { hook.command = NATIVE_ROOT_PREFIX + contextCommand; replacements++; }
   else { hook.command = NATIVE_ROOT_PREFIX + hook.command; retained++; }
  }
  if (retained !== 53 || replacements !== 1) fail();
  manifest.mcpServers = { great_cto_llm_router: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/mcp-servers/llm-router/server-native.mjs'] } };
  const manifestBytes = encode(manifest);
  const descriptorBytes = encode({ schema: 1, profile: 'great-cto-claude-primary-fixture-v1', authority: 'NONE', activation: 'UNSUPPORTED',
   sourceManifestSha256: sha(sourceManifestText), policySha256: sha(policyText), projectedManifestSha256: sha(manifestBytes),
   sourceSlots: 54, retainedSourceSlots: retained, replacedSlot: 'SessionStart/0/1',
   runtimeEntries: [
    { path: 'scripts/hooks/native-session-context.mjs', sha256: sha(contextBytes) },
    { path: 'mcp-servers/llm-router/server-native.mjs', sha256: sha(routerBytes) },
   ], removedEffects: removed,
   unknownObservations: ['provider-quota', 'automatic-changed-file-reviewer-guidance'],
   blockers: ['remaining-startup-effects-not-admitted', 'runtime-toolchain-not-admitted',
    'native-hook-trust-review-required', 'native-transaction-recovery-not-established', 'native-N01-N20-not-completed'] });
  return { manifestBytes, descriptorBytes, authority: 'NONE', activation: 'UNSUPPORTED' };
 } catch { fail(); }
}

/** Reconstruct from independent source inputs; candidate digests are not authority. */
export function validateClaudePrimaryProjection(input) {
 try {
  const selected = values(input, ['manifestBytes', 'descriptorBytes']);
  const source = Object.fromEntries(fields.map(k => [k, selected[k]]));
  const expected = prepareClaudePrimaryProjection(source);
  parseStrictObject(selected.manifestBytes.toString('utf8'), { maxBytes: 1048576 });
  parseStrictObject(selected.descriptorBytes.toString('utf8'));
  if (!expected.manifestBytes.equals(selected.manifestBytes) || !expected.descriptorBytes.equals(selected.descriptorBytes)) fail();
  return { schema: 1, state: 'VALID_UNSIGNED_PROJECTION_ONLY', authority: 'NONE', activation: 'UNSUPPORTED' };
 } catch { return { schema: 1, state: 'REFUSED', authority: 'NONE', reason: 'native-primary-projection-refused' }; }
}
