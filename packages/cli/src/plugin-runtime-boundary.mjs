/**
 * The runtime a signed plugin snapshot calls out to, and who else has registered the plugin
 * (ADR-050 decisions 7 and 4.2; ARCH-plugin-activation Q5 and Q6).
 *
 * A signature covers the bytes of the snapshot. It does not cover `npx some-package`, which downloads
 * code when the host starts the plugin, nor the `python3` the host finds on PATH. The old guard
 * grepped one Codex-only file, so it refused a Claude activation over an `npx` entry Claude never
 * runs, and it never looked at the Claude manifest at all. Classification is therefore per host:
 *
 *   admitted        node, bash, sh: the runtime the CLI already trusts, running files of the snapshot
 *   host-toolchain  python3, git, bd: installed by the operator, recorded and reported, never refused
 *   fetching        npx, uvx, curl, pip and kin: they fetch and run code at run time; these refuse
 *
 * Only a fetching entrypoint in the activated host's manifest refuses that host's activation.
 *
 * The scan of a shell command is a lint over the publisher's own manifest, not a parser and not a
 * sandbox: it splits a command into words and classifies the ones that are program names. That makes
 * it conservative on purpose. A fetching name inside a quoted string counts, because a false
 * positive costs one edit before release (the shipped-manifest test catches it) while a false
 * negative would let a download through. It does not defend against a publisher who obfuscates a
 * command; that publisher holds the signing key.
 *
 * This module imports nothing. It parses bytes it is handed and returns data, so it can neither
 * write a file nor reach the plugin cache, and the adapter that imports it keeps its rule of node
 * built-ins and sibling release modules only.
 */

/** The registration `great-cto init` writes; plugin-activation.mjs exports the same value as PLUGIN_KEY. */
export const ADMITTED_KEY = 'great_cto@local';

const KINDS = [
  ['fetching', /^(?:npx|npm|pnpm|yarn|bunx|uvx|pipx|curl|wget|pip[0-9.]*)$/],
  ['host-toolchain', /^(?:git|bd|python[0-9.]*)$/],
  ['admitted', /^(?:node|bash|sh)$/],
];
const basename = word => word.slice(word.lastIndexOf('/') + 1);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const refuse = (reason, detail) => Object.assign(new Error(detail ? `${reason}: ${detail}` : reason), { activationReason: reason });

/**
 * @param {string} name a program name, possibly with a path
 * @returns {'fetching' | 'host-toolchain' | 'admitted' | null} null for any name this module has no opinion on
 */
export function classifyProgram(name) {
  const program = basename(String(name));
  for (const [kind, pattern] of KINDS) if (pattern.test(program)) return kind;
  return null;
}

/** Program names in a shell command line: every word that classifyProgram has an opinion on. */
function programsIn(commandLine) {
  const found = [];
  for (const word of String(commandLine).split(/[\s;&|(){}<>"'`$=\\]+/)) {
    if (word && classifyProgram(word) && !found.includes(basename(word))) found.push(basename(word));
  }
  return found;
}

// Commands that run another command line from their arguments, so the arguments are scanned as one.
const LAUNCHERS = /^(?:bash|sh|zsh|dash|env|exec|nohup|sudo|time|timeout|xargs|command)$/;
const SHELLS = /^(?:bash|sh|zsh|dash)$/;
const PLUGIN_ROOT = '${CLAUDE_PLUGIN_ROOT}/';

function readJson(files, relative) {
  const file = files.find(f => f.path === relative);
  if (!file) throw refuse('plugin-manifest-unreadable', `${relative} is not in the snapshot`);
  let value;
  try { value = JSON.parse(Buffer.from(file.bytes).toString('utf8')); } catch { throw refuse('plugin-manifest-unreadable', `${relative} is not valid JSON`); }
  if (!isObject(value)) throw refuse('plugin-manifest-unreadable', `${relative} is not a JSON object`);
  return value;
}

/**
 * What one host would run from outside the snapshot's own bytes.
 * @param {{ host: 'claude' | 'codex', files: { path: string, bytes: Uint8Array }[] }} input
 * @returns {{ host: string, sources: string[], entries: { source: string, where: string, program: string, kind: string, detail?: string }[], fetching: object[], toolchain: string[] }}
 */
export function inspectExternalRuntime({ host, files }) {
  const manifestPath = { claude: '.claude-plugin/plugin.json', codex: '.codex-plugin/plugin.json' }[host];
  if (!manifestPath) throw refuse('external-runtime-host-unsupported', String(host));
  const inventory = new Set(files.map(f => f.path));
  const sources = [manifestPath], entries = [];
  const add = entry => { if (!entries.some(e => e.source === entry.source && e.where === entry.where && e.program === entry.program)) entries.push(entry); };

  const scanServers = (servers, source) => {
    if (!isObject(servers)) throw refuse('plugin-manifest-unreadable', `${source}: mcpServers is not an object`);
    for (const [name, server] of Object.entries(servers)) {
      // A server with no command is remote (a URL); the host connects to it, nothing is executed here.
      if (!isObject(server) || typeof server.command !== 'string') continue;
      const where = `mcpServers.${name}`, program = basename(server.command), kind = classifyProgram(program);
      const args = Array.isArray(server.args) ? server.args.filter(a => typeof a === 'string') : [];
      const inline = SHELLS.test(program) && args.includes('-c');
      if (kind === 'admitted' && !inline) {
        const script = args.find(a => !a.startsWith('-'));
        // node and bash are trusted; what they run must be a file of the snapshot.
        if (script === undefined) add({ source, where, program, kind });
        else if (!script.startsWith(PLUGIN_ROOT)) add({ source, where, program, kind: 'unclassified', detail: 'outside-snapshot' });
        else if (!inventory.has(script.slice(PLUGIN_ROOT.length))) add({ source, where, program, kind: 'unclassified', detail: 'not-in-inventory' });
        else add({ source, where, program, kind });
      } else if (kind) add({ source, where, program, kind });
      else if (!LAUNCHERS.test(program)) add({ source, where, program, kind: 'unclassified', detail: 'unknown-program' });
      if (LAUNCHERS.test(program)) for (const found of programsIn(args.join(' '))) add({ source, where, program: found, kind: classifyProgram(found) });
    }
  };

  const scanHooks = (hooks, source) => {
    if (!isObject(hooks)) throw refuse('plugin-manifest-unreadable', `${source}: hooks is not an object`);
    for (const [event, groups] of Object.entries(hooks)) {
      for (const [g, group] of (Array.isArray(groups) ? groups : []).entries()) {
        for (const [h, hook] of (Array.isArray(group?.hooks) ? group.hooks : []).entries()) {
          if (typeof hook?.command !== 'string') continue;
          for (const program of programsIn(hook.command)) add({ source, where: `hooks.${event}[${g}].hooks[${h}]`, program, kind: classifyProgram(program) });
        }
      }
    }
  };

  const manifest = readJson(files, manifestPath);
  for (const [key, scan] of [['mcpServers', scanServers], ['hooks', scanHooks]]) {
    const declared = manifest[key];
    if (declared === undefined) continue;
    if (typeof declared !== 'string') { scan(declared, manifestPath); continue; }
    // The manifest points at a file: Codex does this for both, and Claude may. The file has to be there.
    const target = declared.replace(/^\.\//, '');
    sources.push(target);
    scan(readJson(files, target)[key], target);
  }

  return {
    host, sources, entries,
    fetching: entries.filter(e => e.kind === 'fetching'),
    toolchain: [...new Set(entries.filter(e => e.kind === 'host-toolchain').map(e => e.program))].sort(),
  };
}

/**
 * Refuse when the activated host's manifest declares a fetching entrypoint; otherwise return the
 * report so the caller can show what was classified as host toolchain.
 */
export function assertNoFetchingRuntime(files, { host = 'claude' } = {}) {
  const report = inspectExternalRuntime({ host, files });
  if (report.fetching.length) {
    throw refuse('external-runtime-fetching', `the ${host} manifest declares an entrypoint that fetches code at run time: `
      + report.fetching.map(e => `${e.source} ${e.where} runs ${e.program}`).join('; '));
  }
  return report;
}

// ---------------------------------------------------------------------------
// Marketplace divergence.
// ---------------------------------------------------------------------------

const text = value => typeof value === 'string' ? value : null;
const identity = entry => entry.gitCommitSha ? `commit ${entry.gitCommitSha}` : entry.localContentSha256 ? `inventory sha256 ${entry.localContentSha256}` : 'no commit or digest recorded';

/**
 * Other registrations of the same plugin, described for the person who ran `init`. Nothing is
 * modified: this takes the registry's bytes and returns data and sentences. The user may disable
 * another registration themselves; that is one `enabledPlugins` key and is theirs to set.
 * @param {Uint8Array | null} registryBytes installed_plugins.json, or null when the file is absent
 */
export function describeDivergence(registryBytes) {
  const none = { diverged: false, admitted: null, others: [], lines: [] };
  if (registryBytes === null) return none;
  let data;
  try { data = JSON.parse(Buffer.from(registryBytes).toString('utf8')); } catch { throw refuse('registry-unparseable'); }
  if (!isObject(data)) throw refuse('registry-not-an-object');
  if (data.version !== 2 || !isObject(data.plugins)) throw refuse('registry-schema-unsupported');
  const entriesOf = key => (Array.isArray(data.plugins[key]) ? data.plugins[key] : []).filter(isObject);

  const mine = entriesOf(ADMITTED_KEY).find(entry => entry.scope === 'user');
  const admitted = mine ? { key: ADMITTED_KEY, installPath: text(mine.installPath), version: text(mine.version), gitCommitSha: text(mine.gitCommitSha), localContentSha256: text(mine.localContentSha256) } : null;
  const others = Object.keys(data.plugins)
    .filter(key => key.startsWith('great_cto@') && key !== ADMITTED_KEY).sort()
    .map(key => ({ key, installs: entriesOf(key).map(entry => ({ scope: text(entry.scope), installPath: text(entry.installPath), version: text(entry.version), gitCommitSha: text(entry.gitCommitSha) })) }))
    .filter(other => other.installs.length > 0);
  if (!others.length) return { ...none, admitted };

  const lines = [
    admitted
      ? 'great_cto is also registered from another marketplace on this machine:'
      : 'great_cto is registered from another marketplace, and there is no admitted registration on this machine:',
  ];
  if (admitted) lines.push(`  admitted  ${admitted.key}  ${admitted.installPath ?? '(no path)'}  (version ${admitted.version ?? '?'}, ${identity(admitted)})`);
  for (const other of others) {
    for (const install of other.installs) {
      lines.push(`  other     ${other.key}  ${install.installPath ?? '(no path)'}  (version ${install.version ?? '?'}, ${identity(install)}${install.scope && install.scope !== 'user' ? `, ${install.scope} scope` : ''})`);
    }
  }
  lines.push(admitted
    ? 'This machine does not run the admitted bytes in every session: a session registered to the other copy runs that copy, and the host may refresh it from a mutable branch.'
    : 'Sessions run that copy, and the host may refresh it from a mutable branch.');
  lines.push(`great-cto left it unchanged. To stop using it, set ${others.map(o => `"${o.key}": false`).join(', ')} under enabledPlugins in ~/.claude/settings.json yourself.`);
  return { diverged: true, admitted, others, lines };
}
