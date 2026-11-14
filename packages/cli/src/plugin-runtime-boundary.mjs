/**
 * The runtime a signed plugin snapshot calls out to, and who else has registered the plugin
 * (ADR-050 decisions 7 and 4.2; ARCH-plugin-activation Q5 and Q6).
 *
 * A signature covers the bytes of the snapshot. It does not cover `npx some-package`, which downloads
 * code when the host starts the plugin, nor the `python3` the host finds on PATH. The old guard
 * grepped one Codex-only file, so it refused a Claude activation over an `npx` entry Claude never
 * runs, and it never looked at the Claude manifest at all. Classification is therefore per host, and
 * it is an allow-list that fails closed:
 *
 *   admitted        node, bash, sh: the runtime the CLI already trusts, running files of the snapshot
 *   host-toolchain  python3, git (local commands), bd, go, docker (local commands), zsh, dash:
 *                   installed by the operator, recorded and reported, never refused
 *   system-utility  cat, grep, awk, ls, xargs and kin: local file and text tools; recorded, never refused
 *   fetching        npx, uvx, curl, pip, deno, gh, `git clone`, `docker run` and kin: they fetch and
 *                   run code at run time; these refuse
 *   unclassified    anything else, and anything this module cannot read (inline code, `eval`, a
 *                   variable used as a command): these refuse too, with their own reason, because a
 *                   program nobody listed is exactly what a signature does not vouch for
 *
 * Only the activated host's manifest decides that host's activation, together with the files that host
 * loads from the plugin root without the manifest naming them. Claude Code reads `.mcp.json` and
 * `hooks/hooks.json` that way and merges them with what the manifest declares, so a check that read
 * only the manifest could be bypassed by moving an `npx` entry into one of those files. Codex reads
 * only what its manifest points at, so nothing is read for it beyond that.
 *
 * A command is classified by its whole argv, not by argv0: `python3 -m pip install`, `git clone`,
 * `docker run`, `env npx x` and `sh -c 'curl ...'` are read through to what they run. Program names
 * are compared in lower case, because macOS volumes are case-insensitive and `NPX` runs npx.
 *
 * The scan of a shell command is a lint over the publisher's own manifest, not a parser and not a
 * sandbox. It does two things. A program from the list of unconditional fetchers (FETCHING_PROGRAMS)
 * counts wherever its name appears as a word, quoted or not: a false positive costs one edit before
 * release (the shipped-manifest test catches it) while a false negative would let a download
 * through. Everything else is decided where a command is actually run: the first word of each
 * simple command, after keywords, assignments and redirections, read through launchers (`env`,
 * `xargs`, `timeout`...), `bash -c` strings and `$( )` substitutions. That is why the word `git` or
 * `pull` inside text a hook prints is text, while `git pull` as a command is a fetch. It does not
 * defend against a publisher who obfuscates a command; that publisher holds the signing key.
 *
 * The network guard of the offline E2E (tests/e2e/plugin-activation/network-guard.mjs) classifies the
 * programs a process spawns with fetchingInArgv and fetchingInLine from this module, so the manifest
 * check and the guard cannot disagree about what fetches.
 *
 * This module imports nothing. It parses bytes it is handed and returns data, so it can neither
 * write a file nor reach the plugin cache, and the adapter that uses it keeps its rule of node
 * built-ins and sibling release modules only.
 */

/** The registration `great-cto init` writes; plugin-activation.mjs exports the same value as PLUGIN_KEY. */
export const ADMITTED_KEY = 'great_cto@local';

/** Programs that download and run code whatever their arguments are. Lower case; `pip3.11` and kin match too. */
export const FETCHING_PROGRAMS = Object.freeze([
  'npx', 'pnpx', 'npm', 'pnpm', 'yarn', 'corepack', 'bun', 'bunx', 'deno',
  'uv', 'uvx', 'pip', 'pip3', 'pipx', 'poetry', 'pdm', 'conda',
  'curl', 'wget', 'aria2c', 'ssh', 'scp', 'sftp', 'rsync', 'gh', 'cargo', 'gem', 'brew',
]);
const FETCHING = new Set(FETCHING_PROGRAMS);
const PIP_VERSIONED = /^pip[0-9.]*$/;
// Fetch only through some of their subcommands, so `git status` and `docker ps` are not fetches.
const GIT_REMOTE = new Set(['clone', 'fetch', 'pull', 'push', 'ls-remote', 'submodule', 'subtree', 'lfs', 'fetch-pack', 'send-pack', 'svn', 'imap-send', 'http-fetch', 'http-push']);
const GIT_VALUE_OPTIONS = new Set(['-c', '-C', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env']);
const GO_FETCHING = new Set(['get', 'install', 'mod', 'run', 'build', 'test', 'generate', 'work']);
const CONTAINER_FETCHING = new Set(['pull', 'run', 'build', 'buildx', 'create', 'compose', 'push', 'login', 'search', 'import']);
const PYTHON_FETCHING_MODULES = new Set(['pip', 'pipx', 'uv', 'easy_install']);

const TOOLCHAIN = /^(?:git|bd|go|docker|podman|zsh|dash|python[0-9.]*)$/;
const ADMITTED = /^(?:node|bash|sh)$/;
const PYTHON = /^python[0-9.]*$/;
const SHELL = /^(?:bash|sh|zsh|dash)$/;
const UTILITIES = new Set(('cat head tail grep egrep fgrep sed awk gawk sort uniq cut tr wc ls stat date mkdir cp mv rm rmdir touch find '
  + 'basename dirname readlink realpath tee sleep id whoami uname diff cmp chmod ln mktemp du df file hostname sha256sum shasum md5sum md5 '
  + 'od tput which expr seq nl paste comm rev tac').split(' '));
// Commands that run another command from their arguments: those arguments are read as a command.
const LAUNCHERS = new Set(['env', 'exec', 'nohup', 'sudo', 'time', 'timeout', 'xargs', 'command', 'nice', 'ionice', 'stdbuf', 'setsid']);
// Shell builtins and keywords: part of the shell, not programs of their own.
const BUILTINS = new Set(('echo printf cd pwd exit return export unset set shift read local declare typeset readonly true false : test wait trap '
  + 'umask break continue alias unalias type hash let getopts ulimit').split(' '));
const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'fi', 'do', 'done', 'while', 'until', 'esac', '!', '{', '}']);
// A segment that starts with one of these is a loop header, a case, or a test: nothing in it is a command position.
const WHOLE_SEGMENT = new Set(['for', 'case', 'select', 'function', '[', '[[']);
const PLUGIN_ROOT = '${CLAUDE_PLUGIN_ROOT}/';
const MAX_DEPTH = 5;

const basename = word => word.slice(word.lastIndexOf('/') + 1);
const nameOf = word => basename(String(word)).toLowerCase();
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const refuse = (reason, detail) => Object.assign(new Error(detail ? `${reason}: ${detail}` : reason), { activationReason: reason });
const isFetchingName = name => FETCHING.has(name) || PIP_VERSIONED.test(name);

/**
 * @param {string} name a program name, possibly with a path, in any case
 * @returns {'fetching' | 'host-toolchain' | 'admitted' | null} null for any name this function has no opinion on.
 * It looks at the name only; classifyCommand also reads the arguments (`git clone` fetches, `git status` does not).
 */
export function classifyProgram(name) {
  const program = nameOf(name);
  if (isFetchingName(program)) return 'fetching';
  if (TOOLCHAIN.test(program)) return 'host-toolchain';
  if (ADMITTED.test(program)) return 'admitted';
  return null;
}

/** The module after `-m` (or attached: `-mpip`) in the options that precede a python script, or null. */
function pythonModule(args) {
  for (let i = 0; i < args.length; i++) {
    const word = args[i];
    if (word === '-m' || /^-[A-Za-z]+m$/.test(word)) return args[i + 1] ?? null;
    if (/^-m./.test(word)) return word.slice(2);
    if (!word.startsWith('-')) return null;
  }
  return null;
}

function gitFetches(args) {
  for (let i = 0; i < args.length; i++) {
    const word = args[i];
    if (word.startsWith('-')) { if (GIT_VALUE_OPTIONS.has(word)) i += 1; continue; }
    const sub = word.toLowerCase(), after = args.slice(i + 1).map(arg => arg.toLowerCase());
    if (GIT_REMOTE.has(sub)) return sub;
    if (sub === 'remote' && after.includes('update')) return 'remote update';
    if (sub === 'archive' && after.some(arg => arg.startsWith('--remote'))) return 'archive --remote';
    return null;
  }
  return null;
}

/** What one command is: the kind, the program that earns it, and what made it so. */
function inspectCommand(argv) {
  const name = nameOf(argv[0] ?? ''), args = argv.slice(1).map(String);
  if (isFetchingName(name)) return { program: name, kind: 'fetching' };
  if (name === 'git') {
    const sub = gitFetches(args);
    return sub ? { program: 'git', kind: 'fetching', detail: `git ${sub}` } : { program: 'git', kind: 'host-toolchain' };
  }
  if (name === 'go') {
    const sub = args.map(arg => arg.toLowerCase()).find(arg => GO_FETCHING.has(arg));
    return sub ? { program: 'go', kind: 'fetching', detail: `go ${sub}` } : { program: 'go', kind: 'host-toolchain' };
  }
  if (name === 'docker' || name === 'podman') {
    const sub = args.map(arg => arg.toLowerCase()).find(arg => CONTAINER_FETCHING.has(arg));
    return sub ? { program: name, kind: 'fetching', detail: `${name} ${sub}` } : { program: name, kind: 'host-toolchain' };
  }
  if (PYTHON.test(name)) {
    const module = pythonModule(args)?.toLowerCase();
    if (module && PYTHON_FETCHING_MODULES.has(module)) return { program: module, kind: 'fetching', detail: `${name} -m ${module}` };
    return { program: name, kind: 'host-toolchain' };
  }
  if (TOOLCHAIN.test(name)) return { program: name, kind: 'host-toolchain' };
  if (ADMITTED.test(name)) return { program: name, kind: 'admitted' };
  if (UTILITIES.has(name) || LAUNCHERS.has(name) || BUILTINS.has(name)) return { program: name, kind: 'system-utility' };
  return { program: name, kind: null };
}

/**
 * The kind of one command, read from its whole argv.
 * @param {string[]} argv program first
 * @returns {'fetching' | 'host-toolchain' | 'admitted' | 'system-utility' | null} null when nobody listed the program
 */
export function classifyCommand(argv) {
  return inspectCommand(argv.map(String)).kind;
}

// ---------------------------------------------------------------------------
// Reading a shell command line.
// ---------------------------------------------------------------------------

const WORD = /[\s;&|(){}<>"'`$=\\]+/;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]]*\])?\+?=/;
const REDIRECT = /^(?:\d*|&)(?:>>?|<)/;
const REDIRECT_BARE = /^(?:\d*|&)(?:>>?|<)$/;

/**
 * Splits a command line into simple commands, each a list of words with their quotes removed.
 * `;`, `&`, `|`, parentheses, backticks and newlines end a command; `>&2` and `&>` do not; a `#`
 * that starts a word is a comment to the end of the line; `$(( ))` is kept as one word.
 * `substitutions` are the command lines inside `$( )` and backticks that the shell would expand
 * inside double quotes and arithmetic; inside single quotes they are text, and are not collected.
 */
function lex(source) {
  const text = String(source), segments = [], substitutions = [];
  let segment = [], token = '', live = false, quote = null, quoteStart = 0;
  const endWord = () => { if (live) segment.push(token); token = ''; live = false; };
  const endSegment = () => { endWord(); if (segment.length) segments.push(segment); segment = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote === "'") { if (c === "'") quote = null; else token += c; continue; }
    if (quote === '"') {
      if (c === '"') { quote = null; substitutions.push(...substitutionsIn(text.slice(quoteStart, i))); }
      else if (c === '\\' && i + 1 < text.length) token += text[++i];
      else token += c;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; quoteStart = i + 1; live = true; continue; }
    if (c === '\\') {
      if (text[i + 1] === '\n') i += 1;
      else if (i + 1 < text.length) { token += text[++i]; live = true; }
      continue;
    }
    if (c === '#' && !live) { while (i + 1 < text.length && text[i + 1] !== '\n') i += 1; continue; }
    if (c === ' ' || c === '\t') { endWord(); continue; }
    if (c === '$' && text[i + 1] === '(' && text[i + 2] === '(') {
      let depth = 0, j = i + 1;
      for (; j < text.length; j++) { if (text[j] === '(') depth += 1; else if (text[j] === ')' && --depth === 0) break; }
      const raw = text.slice(i, j + 1);
      token += raw; live = true; i = j;
      substitutions.push(...substitutionsIn(raw));
      continue;
    }
    if (c === '&' && (text[i - 1] === '>' || text[i - 1] === '<' || text[i + 1] === '>')) { token += c; live = true; continue; }
    if (c === '(' && token.endsWith('$')) { token = token.slice(0, -1); live = token.length > 0; endSegment(); continue; }
    if ('\n;&|()`'.includes(c)) { endSegment(); continue; }
    token += c; live = true;
  }
  endSegment();
  return { segments, substitutions };
}

/** The command lines inside `$( )` and backticks in a piece of text the shell would expand. */
function substitutionsIn(text) {
  const found = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end < 0) break;
      found.push(text.slice(i + 1, end)); i = end;
    } else if (text[i] === '$' && text[i + 1] === '(' && text[i + 2] !== '(') {
      let depth = 0, j = i + 1;
      for (; j < text.length; j++) { if (text[j] === '(') depth += 1; else if (text[j] === ')' && --depth === 0) break; }
      found.push(text.slice(i + 2, j)); i = j;
    }
  }
  return found;
}

/** The command a simple command runs: its first word after keywords, assignments and redirections. */
function commandOf(words) {
  let i = 0;
  while (i < words.length) {
    const word = words[i];
    if (KEYWORDS.has(word) || ASSIGNMENT.test(word) || (REDIRECT.test(word) && !REDIRECT_BARE.test(word))) i += 1;
    else if (REDIRECT_BARE.test(word)) i += 2;
    else break;
  }
  if (i >= words.length || WHOLE_SEGMENT.has(words[i])) return null;
  return { program: words[i], rest: words.slice(i + 1) };
}

/** What follows a launcher's own options (`-n`, `-u`, `5`), which is the command it runs. */
const afterOptions = rest => { let i = 0; while (i < rest.length && (rest[i].startsWith('-') || /^\d+(?:\.\d+)?[smhd]?$/.test(rest[i]))) i += 1; return rest.slice(i); };
const NODE_INLINE = /^(?:-e|-p|-pe|-ep|--eval|--print|--eval=.*|--print=.*)$/;
const PYTHON_INLINE = /^-[A-Za-z]*c$/;
const SHELL_COMMAND_FLAG = /^-[A-Za-z]*c[A-Za-z]*$/;

const withoutDuplicates = entries => {
  const seen = new Set();
  return entries.filter(entry => { const key = `${entry.program}\0${entry.kind}\0${entry.detail ?? ''}`; if (seen.has(key)) return false; seen.add(key); return true; });
};

/** Fetching programs named anywhere in a piece of text, as words. */
const namedFetchers = text => String(text).split(WORD).filter(word => word && isFetchingName(nameOf(word))).map(word => ({ program: nameOf(word), kind: 'fetching' }));

/**
 * One simple command, as a list of words, appended to `found`. `mcp` is set for an MCP server's argv:
 * there inline code is refused and a node or shell script has to be a file of the snapshot. In a hook
 * the same words are a shell command line, where `node -p '...'` is how the generated bootstrap works.
 */
function scanWords(words, depth, found, mcp) {
  let command = commandOf(words);
  while (command && LAUNCHERS.has(nameOf(command.program))) {
    const launcher = nameOf(command.program);
    found.push({ program: launcher, kind: 'system-utility' });
    if (launcher === 'command' && /^-[vV]$/.test(command.rest[0] ?? '')) return;
    command = commandOf(afterOptions(command.rest));
  }
  if (!command) return;
  const name = nameOf(command.program);
  if (!name || (BUILTINS.has(name) && !mcp)) return;

  const inspected = inspectCommand([command.program, ...command.rest]);
  const inline = mcp && ((name === 'node' && command.rest.some(arg => NODE_INLINE.test(arg))) || (PYTHON.test(name) && command.rest.some(arg => PYTHON_INLINE.test(arg))));
  const shellAt = SHELL.test(name) ? command.rest.findIndex(arg => SHELL_COMMAND_FLAG.test(arg)) : -1;
  if (inline) found.push({ program: name, kind: 'unclassified', detail: 'inline-code' });
  else if (inspected.kind === null) found.push({ program: basename(command.program), kind: 'unclassified', detail: 'unknown-program' });
  else if (inspected.kind === 'admitted' && mcp && shellAt < 0) {
    const detail = mcp.scriptProblem(command.rest);
    found.push(detail ? { program: name, kind: 'unclassified', detail } : inspected);
  } else found.push(inspected);

  // A shell given a command string: that string is a command line, and its inner commands decide.
  if (shellAt >= 0) {
    const inner = command.rest[shellAt + 1];
    if (inner === undefined) found.push({ program: name, kind: 'unclassified', detail: 'inline-code' });
    else found.push(...scanLine(inner, depth + 1));
  }
}

/** A shell command line: the unconditional fetchers anywhere in it, and every command that is run. */
function scanLine(line, depth = 0, mcp = null) {
  const found = namedFetchers(line);
  if (depth < MAX_DEPTH) {
    const { segments, substitutions } = lex(line);
    for (const words of segments) scanWords(words, depth, found, mcp);
    for (const inner of substitutions) found.push(...scanLine(inner, depth + 1));
  }
  return withoutDuplicates(found);
}

/** The fetching programs a process would run, given its argv. Wrappers are read through. */
export function fetchingInArgv(argv) {
  const found = [];
  scanWords(argv.map(String), 0, found, null);
  return withoutDuplicates(found).filter(entry => entry.kind === 'fetching');
}

/** The fetching programs a shell would run, given a command line. */
export function fetchingInLine(line) {
  return scanLine(line).filter(entry => entry.kind === 'fetching');
}

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
 * @returns {{ host: string, sources: string[], entries: { source: string, where: string, program: string, kind: string, detail?: string }[], fetching: object[], unclassified: object[], toolchain: string[] }}
 */
export function inspectExternalRuntime({ host, files }) {
  const manifestPath = { claude: '.claude-plugin/plugin.json', codex: '.codex-plugin/plugin.json' }[host];
  if (!manifestPath) throw refuse('external-runtime-host-unsupported', String(host));
  const inventory = new Set(files.map(f => f.path));
  const sources = [manifestPath], entries = [];
  const add = entry => { if (!entries.some(e => e.source === entry.source && e.where === entry.where && e.program === entry.program && e.kind === entry.kind && e.detail === entry.detail)) entries.push(entry); };

  // A node or shell script an MCP server runs has to be a file of the snapshot: the signature covers it.
  const scriptProblem = args => {
    const script = args.find(a => !a.startsWith('-'));
    if (script === undefined) return null;
    if (!script.startsWith(PLUGIN_ROOT)) return 'outside-snapshot';
    return inventory.has(script.slice(PLUGIN_ROOT.length)) ? null : 'not-in-inventory';
  };

  const scanServers = (servers, source) => {
    if (!isObject(servers)) throw refuse('plugin-manifest-unreadable', `${source}: mcpServers is not an object`);
    for (const [name, server] of Object.entries(servers)) {
      // A server with no command is remote (a URL); the host connects to it, nothing is executed here.
      if (!isObject(server) || typeof server.command !== 'string') continue;
      const where = `mcpServers.${name}`;
      const argv = [server.command, ...(Array.isArray(server.args) ? server.args.filter(a => typeof a === 'string') : [])];
      const found = namedFetchers(argv.join(' '));
      scanWords(argv, 0, found, { scriptProblem });
      for (const entry of withoutDuplicates(found)) add({ source, where, ...entry });
    }
  };

  const scanHooks = (hooks, source) => {
    if (!isObject(hooks)) throw refuse('plugin-manifest-unreadable', `${source}: hooks is not an object`);
    for (const [event, groups] of Object.entries(hooks)) {
      for (const [g, group] of (Array.isArray(groups) ? groups : []).entries()) {
        for (const [h, hook] of (Array.isArray(group?.hooks) ? group.hooks : []).entries()) {
          if (typeof hook?.command !== 'string') continue;
          for (const entry of scanLine(hook.command)) add({ source, where: `hooks.${event}[${g}].hooks[${h}]`, ...entry });
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

  // The files Claude Code loads from the plugin root whether or not the manifest names them. Names are
  // compared in lower case, like program names: a case-insensitive volume opens `.MCP.JSON` as `.mcp.json`.
  const standardLocations = {
    claude: [
      ['.mcp.json', (content, source) => {
        // Claude Code accepts the file with or without the `mcpServers` wrapper, so both readings run.
        scanServers(content, source);
        if (content.mcpServers !== undefined) scanServers(content.mcpServers, source);
      }],
      // A hooks file with no `hooks` key declares no command: the one this repository ships holds modules only.
      ['hooks/hooks.json', (content, source) => { if (content.hooks !== undefined) scanHooks(content.hooks, source); }],
    ],
  }[host] ?? [];
  for (const [standard, scan] of standardLocations) {
    for (const { path: present } of files.filter(f => f.path.toLowerCase() === standard)) {
      // The manifest may point at the same file; it is then read twice, listed once, and its entries are not doubled.
      if (!sources.includes(present)) sources.push(present);
      scan(readJson(files, present), present);
    }
  }

  return {
    host, sources, entries,
    fetching: entries.filter(e => e.kind === 'fetching'),
    unclassified: entries.filter(e => e.kind === 'unclassified'),
    toolchain: [...new Set(entries.filter(e => e.kind === 'host-toolchain').map(e => e.program))].sort(),
  };
}

const describeEntry = e => `${e.source} ${e.where} runs ${e.program}${e.detail ? ` (${e.detail})` : ''}`;

/**
 * Refuse when the activated host's manifest declares a fetching entrypoint, or one this check cannot
 * classify (fail closed); otherwise return the report so the caller can show what was classified.
 */
export function assertNoFetchingRuntime(files, { host = 'claude' } = {}) {
  const report = inspectExternalRuntime({ host, files });
  if (report.fetching.length) {
    throw refuse('external-runtime-fetching', `the ${host} manifest declares an entrypoint that fetches code at run time: ${report.fetching.map(describeEntry).join('; ')}`);
  }
  if (report.unclassified.length) {
    throw refuse('external-runtime-unclassified', `the ${host} manifest runs something this check cannot classify as safe: ${report.unclassified.map(describeEntry).join('; ')}`);
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
