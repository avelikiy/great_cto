/** ADR-046 compatibility inspection only. No filesystem mutation or host execution. */
import { getAdmissionInfo, inspectPluginPayload, parseStrictReleaseIndex } from './release-trust.mjs';
import { inspectBundledNativeCompanions } from './native-companion-bundle.mjs';

const own = (object, key) => Object.hasOwn(object, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const localEntry = /^\$\{CLAUDE_PLUGIN_ROOT\}\/([a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)*\.mjs)$/;
const manifestKeys = new Set(['name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords',
  'agents', 'commands', 'skills', 'outputStyles', 'dependencies', 'hooks', 'mcpServers']);

/**
 * A compatibility result is never an activation capability. Even a structurally
 * local manifest still needs native process, hook and recovery acceptance.
 * Serialized results cannot be supplied back as an admission ticket.
 */
export function inspectClaudeNativeAdmission(admission) {
  const result = {
    schema: 1, adapter: 'claude-local', state: 'REFUSED', authority: 'NONE', evidence: 'NOT_CHECKED',
    releaseEligibility: 'NOT_CHECKED', artifact: 'NOT_CHECKED', payload: 'NOT_CHECKED',
    registration: 'UNCHANGED', process: 'NOT_OBSERVED', mcp: 'NOT_CHECKED',
    hooks: 'NOT_CHECKED', recovery: 'NOT_EXERCISED', blockers: [],
  };
  try {
    const info = getAdmissionInfo(admission);
    result.evidence = info.isProduction ? 'ARTIFACT_INSPECTION_ONLY' : 'SYNTHETIC_ONLY';
    if (!info.isProduction || info.authority !== 'ARTIFACT_ADMISSION') {
      result.blockers.push('production-artifact-admission-required');
      return result;
    }
    // Re-read signed artifacts and their complete inventory on every inspection.
    const payload = inspectPluginPayload(admission);
    const files = new Map(payload.files.map(file => [file.path, file]));
    const read = name => parseStrictReleaseIndex(files.get(name).bytes.toString('utf8'));
    const block = code => { if (!result.blockers.includes(code)) result.blockers.push(code); };
    result.artifact = 'ADMITTED'; result.payload = 'ARCHIVE_BYTES_VERIFIED'; result.version = info.version;
    result.indexDigest = info.indexDigest; result.commit = info.commit;
    const manifest = read('.claude-plugin/plugin.json');
    for (const key of Object.keys(manifest)) if (!manifestKeys.has(key)) block('unsupported-native-manifest-extension');
    if (files.has('native-companions.json')) {
      try {
        result.dependencies = inspectBundledNativeCompanions(admission);
        block('native-companion-runtime-closure-not-established');
      } catch {
        result.state = 'REFUSED'; result.artifact = 'REFUSED'; result.payload = 'NOT_CHECKED';
        result.blockers.push('native-companion-bundle-refused'); return result;
      }
    }
    if (own(manifest, 'dependencies')) {
      if (!Array.isArray(manifest.dependencies) || manifest.dependencies.some(value => typeof value !== 'string' || !value)) {
        block('invalid-native-dependency-declaration');
      } else if (manifest.dependencies.length) {
        if (!files.has('native-companions.json')) block('external-plugin-dependency-admission-required');
      }
    }

    // Host-default files matter even when the manifest does not mention them.
    // Unsupported hooks are never ignored because an alternate profile says so.
    if (own(manifest, 'hooks') || files.has('hooks/hooks.json')) block('native-hook-execution-contract-required');
    if (['settings.json', '.claude/settings.json', '.claude-plugin/settings.json'].some(name => files.has(name))) {
      block('native-settings-execution-contract-required');
    }
    const configurations = [];
    if (own(manifest, 'mcpServers')) {
      if (typeof manifest.mcpServers === 'string') {
        const name = manifest.mcpServers.slice(2);
        if (!manifest.mcpServers.startsWith('./') || !files.has(name)) block('invalid-native-mcp-reference');
        else configurations.push(read(name));
      } else configurations.push(manifest.mcpServers);
    }
    if (files.has('.mcp.json')) configurations.push(read('.mcp.json'));
    if (configurations.length > 1) block('ambiguous-native-mcp-configuration');
    if (!configurations.length) block('local-native-mcp-required');
    for (const configuration of configurations) {
      const servers = record(configuration) && own(configuration, 'mcpServers') ? configuration.mcpServers : configuration;
      if (record(configuration) && own(configuration, 'mcpServers') && Object.keys(configuration).some(key => key !== 'mcpServers')) block('unsupported-native-mcp-extension');
      if (!record(servers) || !Object.keys(servers).length) { block('invalid-native-mcp-configuration'); continue; }
      for (const server of Object.values(servers)) {
        if (!record(server)) { block('invalid-native-mcp-configuration'); continue; }
        if (Object.keys(server).some(key => !['type', 'command', 'args', 'env'].includes(key)) ||
            (own(server, 'type') && server.type !== 'stdio')) block('unsupported-native-mcp-extension');
        if (server.command !== 'node') block('external-mcp-runtime-admission-required');
        const match = Array.isArray(server.args) && server.args.length === 1 && typeof server.args[0] === 'string' && server.args[0].match(localEntry);
        if (!match || match[1].split('/').some(part => part === '.' || part === '..') || !files.has(match[1])) block('local-native-mcp-entry-required');
        if (own(server, 'env') && (!record(server.env) || Object.keys(server.env).length)) block('native-mcp-environment-contract-required');
      }
    }
    // Literal import checks in archive admission do not prove dynamic runtime
    // closure. This state must remain unsupported until N01-N20 are executed.
    block('native-activation-and-recovery-not-established');
    result.state = 'UNSUPPORTED';
    return result;
  } catch {
    // Do not publish parser errors, artifact locations or private manifest values.
    result.blockers = ['artifact-admission-required'];
    return result;
  }
}
