/**
 * shell-commands — shell text → the simple commands it runs, for PreToolUse
 * guards that must decide on a command, not on a string that mentions one.
 *
 * Quoting is honoured; `$(…)`, backticks and `( … )` are lexed recursively;
 * heredoc bodies and comments are skipped — so a commit message that MENTIONS
 * `git stash` is a word, while `a && git stash -u`, `(cd x && …)`, `$(…)`,
 * `bash -c '…'` and `eval …` are all seen. Extracted from shared-tree-guard so
 * every guard parses the same way.
 */

const SUBST = '\u0000'; // stands in for a $(…) inside a word; its body is lexed on its own

/**
 * Split `src` into simple commands. Quoting is honoured; `$(…)`, backticks and
 * `( … )` are lexed recursively and their commands returned alongside; heredoc
 * bodies and comments are skipped. `closer` ends a nested call at an unmatched
 * `)` or backtick.
 */
export function lex(src, start = 0, closer = null) {
  const commands = [];
  let words = [];
  let word = null; // null = between words
  let pendingHeredocs = [];
  let i = start;

  const endWord = () => { if (word !== null) { words.push(word); word = null; } };
  const endCommand = () => { endWord(); if (words.length) commands.push(words); words = []; };
  const append = (s) => { word = (word ?? '') + s; };
  const nested = (from, close) => {
    const r = lex(src, from, close);
    commands.push(...r.commands);
    return r.end;
  };
  const skipHeredocBodies = () => {
    for (const { delim, dash } of pendingHeredocs) {
      for (;;) {
        if (i >= src.length) return;
        let nl = src.indexOf('\n', i);
        if (nl === -1) nl = src.length;
        let line = src.slice(i, nl);
        if (dash) line = line.replace(/^\t+/, '');
        i = nl + 1;
        if (line === delim) break;
      }
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
        if (src[i] === '$' && src[i + 1] === '(') { append(SUBST); i = nested(i + 2, ')'); continue; }
        if (src[i] === '`') { append(SUBST); i = nested(i + 1, '`'); continue; }
        append(src[i]); i += 1;
      }
      i += 1; continue;
    }
    if (c === '$' && next === '(') { append(SUBST); i = nested(i + 2, ')'); continue; }
    if (c === '`') { append(SUBST); i = nested(i + 1, '`'); continue; }
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
      if (delim) pendingHeredocs.push({ delim, dash });
      continue;
    }
    if (c === '\n') { endCommand(); i += 1; skipHeredocBodies(); continue; }
    if (c === ' ' || c === '\t') { endWord(); i += 1; continue; }
    if (c === '&' && (src[i - 1] === '>' || src[i - 1] === '<' || next === '>')) { append(c); i += 1; continue; } // 2>&1, &>f
    if (c === ';' || c === '&' || c === '|') { endCommand(); i += 1; continue; }
    if (c === '(') { endCommand(); i = nested(i + 1, ')'); continue; }
    if (c === ')') { endCommand(); i += 1; continue; }
    append(c); i += 1;
  }
  endCommand();
  return { commands, end: i };
}


const PREFIX_WORDS = new Set(['!', '{', '}', 'then', 'do', 'else', 'elif', 'if', 'while', 'until', 'time', 'nohup', 'command', 'builtin', 'exec']);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
export const base = (w) => w.slice(w.lastIndexOf('/') + 1);

/**
 * The simple commands `src` runs, each as { words, env }: prefixes that run a
 * command rather than being one (`env`, `sudo`, `nohup`, `if`, …) are stripped,
 * `VAR=value` prefixes are collected into `env`, and `sh -c '…'` / `eval …` are
 * expanded into the commands they run (to a depth of 4).
 */
export function simpleCommands(src, depth = 0) {
  if (typeof src !== 'string' || depth > 4) return [];
  const out = [];
  for (const raw of lex(src).commands) {
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
    if (!w.length) continue;
    const cmd = base(w[0]);
    if (SHELLS.has(cmd)) {
      const c = w.findIndex((a, k) => k > 0 && /^-[A-Za-z]*c[A-Za-z]*$/.test(a));
      if (c !== -1 && w[c + 1] !== undefined) out.push(...simpleCommands(w[c + 1], depth + 1));
      continue;
    }
    if (cmd === 'eval') { out.push(...simpleCommands(w.slice(1).join(' '), depth + 1)); continue; }
    out.push({ words: w, env });
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
