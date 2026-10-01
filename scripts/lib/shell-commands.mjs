/**
 * shell-commands — shell text → the simple commands it runs, for PreToolUse
 * guards that must decide on a command, not on a string that mentions one.
 *
 * Quoting is honoured; `$(…)`, backticks and `( … )` are lexed recursively;
 * heredoc bodies and comments are skipped — so a commit message that MENTIONS
 * `git stash` is a word, while `a && git stash -u`, `(cd x && …)`, `$(…)`,
 * `bash -c '…'` and `eval …` are all seen. Extracted from shared-tree-guard so
 * every guard parses the same way.
 *
 * Each command's word array also carries, for guards that need more than words:
 *   .pipeFrom  the command piped into it (`a | b` → b.pipeFrom is a)
 *   .heredocs  the bodies of its heredocs (skipped as commands, kept as text)
 *   .subs      the commands of its `$(…)`, backtick and `<(…)` substitutions
 *   .after     the separator before it: '&&', '||', ';', '&', '|', '\n' or null
 *   .group     one id per lex call — commands in one `( … )`/`$(…)` share it
 */

let groupSeq = 0;

const SUBST = '\u0000'; // stands in for a $(…) inside a word; its body is lexed on its own

/**
 * Split `src` into simple commands. Quoting is honoured; `$(…)`, backticks and
 * `( … )` are lexed recursively and their commands returned alongside; heredoc
 * bodies and comments are skipped. `closer` ends a nested call at an unmatched
 * `)` or backtick.
 */
export function lex(src, start = 0, closer = null) {
  const commands = [];
  const group = ++groupSeq;
  let words = [];
  let word = null; // null = between words
  let pendingHeredocs = [];
  let prev = null;       // the last command at this level, for `|`
  let sep = null;        // the separator seen since it
  let i = start;

  const endWord = () => { if (word !== null) { words.push(word); word = null; } };
  const endCommand = (s) => {
    endWord();
    if (words.length) {
      words.after = sep;
      words.group = group;
      if (sep === '|' && prev) words.pipeFrom = prev;
      commands.push(words);
      prev = words;
      sep = null;
    }
    if (s) sep = s; else if (s === undefined && sep === null && prev) sep = '\n';
    words = [];
  };
  const append = (s) => { word = (word ?? '') + s; };
  const nested = (from, close, sub = false) => {
    const r = lex(src, from, close);
    commands.push(...r.commands);
    if (sub) (words.subs ??= []).push(...r.commands);
    return r.end;
  };
  const skipHeredocBodies = () => {
    for (const { delim, dash, owner } of pendingHeredocs) {
      const body = [];
      for (;;) {
        if (i >= src.length) break;
        let nl = src.indexOf('\n', i);
        if (nl === -1) nl = src.length;
        let line = src.slice(i, nl);
        if (dash) line = line.replace(/^\t+/, '');
        i = nl + 1;
        if (line === delim) break;
        body.push(line);
      }
      (owner.heredocs ??= []).push(body.join('\n'));
      if (i >= src.length) break;
    }
    pendingHeredocs = [];
  };

  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];

    if (closer === ')' && c === ')') { endCommand(); return { commands, end: i + 1 }; }
    if (closer === '`' && c === '`') { endCommand(); return { commands, end: i + 1 }; }

    if (c === '\\') {
      if (next === '\n') { i += 2; continue; } // line continuation
      append(next ?? ''); i += 2; continue;
    }
    if (c === "'") {
      const close = src.indexOf("'", i + 1);
      const end = close === -1 ? src.length : close;
      append(src.slice(i + 1, end)); i = end + 1; continue;
    }
    if (c === '"') {
      append('');
      i += 1;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < src.length) { append(src[i + 1]); i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '(') { append(SUBST); i = nested(i + 2, ')', true); continue; }
        if (src[i] === '`') { append(SUBST); i = nested(i + 1, '`', true); continue; }
        append(src[i]); i += 1;
      }
      i += 1; continue;
    }
    if (c === '$' && next === '(') { append(SUBST); i = nested(i + 2, ')', true); continue; }
    if (c === '`') { append(SUBST); i = nested(i + 1, '`', true); continue; }
    if (c === '(' && word !== null && /[<>]$/.test(word)) { append(SUBST); i = nested(i + 1, ')', true); continue; } // <(…) >(…)
    if (c === '#' && word === null) { // comment to end of line
      const nl = src.indexOf('\n', i);
      i = nl === -1 ? src.length : nl; continue;
    }
    if (c === '<' && next === '<' && src[i + 2] !== '<') { // heredoc: note delimiter, body skipped at newline
      endWord();
      i += 2;
      const dash = src[i] === '-';
      if (dash) i += 1;
      while (src[i] === ' ' || src[i] === '\t') i += 1;
      let delim = '';
      while (i < src.length && !/[\s;&|()<>]/.test(src[i])) {
        if (src[i] !== "'" && src[i] !== '"' && src[i] !== '\\') delim += src[i];
        i += 1;
      }
      if (delim) pendingHeredocs.push({ delim, dash, owner: words });
      continue;
    }
    if (c === '\n') { endCommand(); i += 1; skipHeredocBodies(); continue; }
    if (c === ' ' || c === '\t') { endWord(); i += 1; continue; }
    if (c === '&' && (src[i - 1] === '>' || src[i - 1] === '<' || next === '>')) { append(c); i += 1; continue; } // 2>&1, &>f
    if (c === '|' && next === '|') { endCommand('||'); i += 2; continue; }
    if (c === '&' && next === '&') { endCommand('&&'); i += 2; continue; }
    if (c === '|') { endCommand('|'); i += next === '&' ? 2 : 1; continue; } // | and |&
    if (c === ';' || c === '&') { endCommand(c); i += 1; continue; }
    if (c === '(') { endCommand('('); i = nested(i + 1, ')'); continue; }
    if (c === ')') { endCommand(')'); i += 1; continue; }
    append(c); i += 1;
  }
  endCommand();
  return { commands, end: i };
}


const PREFIX_WORDS = new Set(['!', '{', '}', 'then', 'do', 'else', 'elif', 'if', 'while', 'until', 'time', 'nohup', 'command', 'builtin', 'exec']);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
export const base = (w) => w.slice(w.lastIndexOf('/') + 1);

/** Strip the prefixes of one lexed command: → { words, env }. */
function strip(raw) {
  let w = raw.filter((x) => x !== SUBST);
  const env = {};
  for (;;) {
    if (!w.length) break;
    if (PREFIX_WORDS.has(w[0])) { w = w.slice(1); continue; }
    if (ASSIGNMENT.test(w[0])) { const i = w[0].indexOf('='); env[w[0].slice(0, i)] = w[0].slice(i + 1); w = w.slice(1); continue; }
    if (w[0] === 'env' || w[0] === 'sudo') {
      w = w.slice(1);
      while (w.length && (w[0].startsWith('-') || ASSIGNMENT.test(w[0]))) {
        if (ASSIGNMENT.test(w[0])) { const i = w[0].indexOf('='); env[w[0].slice(0, i)] = w[0].slice(i + 1); }
        w = w.slice(1);
      }
      continue;
    }
    break;
  }
  return { words: w, env };
}

/** A lexed command as a guard sees it — stripped, with its pipe producer chain and heredocs. */
function describe(raw, hops = 0) {
  const { words, env } = strip(raw);
  return {
    words, env,
    heredocs: raw.heredocs || [],
    pipeFrom: raw.pipeFrom && hops < 8 ? describe(raw.pipeFrom, hops + 1) : null,
    subs: (raw.subs || []).map((r) => strip(r)).filter((d) => d.words.length),
    after: raw.after ?? null,
    group: raw.group ?? 0,
  };
}

/**
 * The simple commands `src` runs, each as { words, env, heredocs, pipeFrom,
 * subs, after, group }: prefixes that run a command rather than being one
 * (`env`, `sudo`, `nohup`, `if`, …) are stripped, `VAR=value` prefixes are
 * collected into `env`, and `sh -c '…'` / `eval …` are expanded into the
 * commands they run (to a depth of 4). A shell itself (`sh`, `bash -c …`,
 * `bash <(…)`) is reported too, with `shell: true`, after what it expands to —
 * a shell reading a pipe runs whatever the producer printed.
 */
export function simpleCommands(src, depth = 0) {
  if (typeof src !== 'string' || depth > 4) return [];
  const out = [];
  for (const raw of lex(src).commands) {
    const d = describe(raw);
    const w = d.words;
    if (!w.length) continue;
    const cmd = base(w[0]);
    if (SHELLS.has(cmd)) {
      const c = w.findIndex((a, k) => k > 0 && /^-[A-Za-z]*c[A-Za-z]*$/.test(a));
      if (c !== -1 && w[c + 1] !== undefined) out.push(...simpleCommands(w[c + 1], depth + 1));
      out.push({ ...d, shell: true, script: c === -1 ? null : (w[c + 1] ?? '') });
      continue;
    }
    if (cmd === 'eval') { out.push(...simpleCommands(w.slice(1).join(' '), depth + 1)); continue; }
    out.push(d);
  }
  return out;
}

const GIT_OPTS_WITH_ARG = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env']);

/** For a `git …` command: { globals, sub, args } — global options before the subcommand kept apart. Else null. */
export function gitParts(words) {
  if (!words.length || base(words[0]) !== 'git') return null;
  const globals = [];
  let k = 1;
  while (k < words.length && words[k].startsWith('-')) {
    if (GIT_OPTS_WITH_ARG.has(words[k])) { globals.push(words[k], words[k + 1]); k += 2; } else { globals.push(words[k]); k += 1; }
  }
  return { globals, sub: words[k] ?? null, args: words.slice(k + 1) };
}
