#!/usr/bin/env node
/**
 * shared-tree-guard — PreToolUse hook for Bash.
 *
 * Several Claude Code sessions on one machine often work in ONE working tree.
 * Uncommitted edits there belong to whichever session made them, and they are
 * in neither the index nor the history — so a command that resets the tree
 * destroys another session's work with no way back. This hook refuses those
 * commands at the tool layer:
 *
 *   git stash …            (any form but `list` / `show` — pop and apply write
 *                           into the tree, drop and clear lose entries, and the
 *                           stash stack is shared by every worktree)
 *   git checkout -- <path> (also `<ref> -- <path>`, `.`, and `-f`)
 *   git restore <path>     (unless it is --staged only)
 *   git reset --hard
 *   git clean -f
 *
 * Bought by a measurement: in the S3 effort A/B
 * (docs/plans/PLAN-2026-09-23-agent-speed.md) senior-dev at effort MEDIUM ran
 * `git stash -u && npm test; git stash pop` in 2 of 3 runs to check its
 * baseline. A prompt rule did not move behaviour in S2; a hook does.
 *
 * The command is parsed, not grepped: quotes, comments and heredoc bodies are
 * words, so a commit message that MENTIONS `git stash` passes, while `a && git
 * stash -u`, `(cd x && git stash)`, `$(…)`, `bash -c '…'` and `eval` are all seen.
 *
 * I/O (Claude Code PreToolUse):
 *   stdin:  { tool_name, tool_input: { command } }  (also tolerates top-level command)
 *   stdout: silent on allow; on block, hookSpecificOutput JSON (permissionDecision="deny")
 *   exit:   0 = allow, 2 = block (fail-safe alongside the structured deny)
 *
 * Opt out (a tree nobody else works in): GREAT_CTO_DISABLE_SHARED_TREE_GUARD=1
 */

import { readFileSync } from 'node:fs';

// ── Lexer: shell text → simple commands (arrays of words) ────────────────────

const SUBST = '\u0000'; // stands in for a $(…) inside a word; its body is lexed on its own

/**
 * Split `src` into simple commands. Quoting is honoured; `$(…)`, backticks and
 * `( … )` are lexed recursively and their commands returned alongside; heredoc
 * bodies and comments are skipped. `closer` ends a nested call at an unmatched
 * `)` or backtick.
 */
function lex(src, start = 0, closer = null) {
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

// ── Classifier: one simple command → the rule it breaks, if any ──────────────

const PREFIX_WORDS = new Set(['!', '{', '}', 'then', 'do', 'else', 'elif', 'if', 'while', 'until', 'time', 'nohup', 'command', 'builtin', 'exec']);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const GIT_OPTS_WITH_ARG = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env']);
const base = (w) => w.slice(w.lastIndexOf('/') + 1);

/** Returns a rule name if `args` (after `git <sub>`) destroy uncommitted work. */
function gitRule(sub, args) {
  const short = (letter) => args.some((a) => /^-[A-Za-z]+$/.test(a) && a.includes(letter));
  const has = (...flags) => args.some((a) => flags.includes(a) || flags.some((f) => f.startsWith('--') && a.startsWith(`${f}=`)));
  switch (sub) {
    case 'stash':
      return ['list', 'show'].includes(args[0]) ? null : 'stash';
    case 'checkout': {
      const dd = args.indexOf('--');
      if (dd !== -1 && dd < args.length - 1) return 'checkout';
      if (args.includes('.') || has('--force') || short('f')) return 'checkout';
      return null;
    }
    case 'restore': {
      const staged = has('--staged') || short('S');
      const worktree = has('--worktree') || short('W');
      return staged && !worktree ? null : 'restore';
    }
    case 'reset':
      return has('--hard') ? 'reset' : null;
    case 'clean':
      if (has('--dry-run') || short('n')) return null;
      return has('--force') || short('f') ? 'clean' : null;
    default:
      return null;
  }
}

function classify(words, depth) {
  let w = words.filter((x) => x !== SUBST);
  for (;;) { // strip what runs a command rather than being one
    if (!w.length) return null;
    if (PREFIX_WORDS.has(w[0]) || ASSIGNMENT.test(w[0])) { w = w.slice(1); continue; }
    if (w[0] === 'env' || w[0] === 'sudo') {
      w = w.slice(1);
      while (w.length && (w[0].startsWith('-') || ASSIGNMENT.test(w[0]))) w = w.slice(1);
      continue;
    }
    break;
  }
  const cmd = base(w[0]);
  if (SHELLS.has(cmd)) {
    const c = w.findIndex((a, k) => k > 0 && /^-[A-Za-z]*c[A-Za-z]*$/.test(a));
    return c !== -1 && w[c + 1] !== undefined ? inspect(w[c + 1], depth + 1) : null;
  }
  if (cmd === 'eval') return inspect(w.slice(1).join(' '), depth + 1);
  if (cmd !== 'git') return null;

  let k = 1;
  while (k < w.length && w[k].startsWith('-')) {
    k += GIT_OPTS_WITH_ARG.has(w[k]) ? 2 : 1;
  }
  const rule = k < w.length ? gitRule(w[k], w.slice(k + 1)) : null;
  return rule ? { rule, command: w.join(' ') } : null;
}

function inspect(src, depth) {
  if (depth > 4) return null;
  for (const words of lex(src).commands) {
    const hit = classify(words, depth);
    if (hit) return hit;
  }
  return null;
}

/** Pure decision: the first simple command in `cmd` that destroys uncommitted work, or null. */
export function findDestructive(cmd) {
  if (typeof cmd !== 'string' || !cmd.trim()) return null;
  return inspect(cmd, 0);
}

// ── Hook ─────────────────────────────────────────────────────────────────────

const WHY = {
  stash: 'stashes (or pops into) the WHOLE tree, including edits another session has not committed; the stash stack is shared by every worktree',
  checkout: 'overwrites files in the tree with the committed version — another session\'s uncommitted edits in them are gone',
  restore: 'overwrites files in the tree with the committed version — another session\'s uncommitted edits in them are gone',
  reset: 'discards every uncommitted change in the tree, not only yours',
  clean: 'deletes untracked files, including ones another session just created',
};

export function blockReason(hit) {
  return (
    `\`${hit.command}\` ${WHY[hit.rule]}. Several sessions share this working tree, and ` +
    `uncommitted work is in neither the index nor the history — it cannot be recovered. ` +
    `Safe instead: to set aside or undo only YOUR edits, save a patch first ` +
    `(\`git diff > /tmp/x.patch\`, restore with \`git apply /tmp/x.patch\`, undo with ` +
    `\`git apply -R /tmp/x.patch\`); to test the baseline, use a separate tree ` +
    `(\`git worktree add "$(mktemp -d)" HEAD\`, run the tests there, then \`git worktree remove\`); ` +
    `to unstage, \`git restore --staged <path>\` is allowed. ` +
    `(Override for a tree nobody else uses: GREAT_CTO_DISABLE_SHARED_TREE_GUARD=1.)`
  );
}

function commandFrom(raw) {
  let d;
  try { d = JSON.parse(raw); } catch { return null; }
  if (d.tool_name && d.tool_name !== 'Bash') return null;
  const ti = d.tool_input || d.toolInput || {};
  return ti.command || d.command || null;
}

function main() {
  if (process.env.GREAT_CTO_DISABLE_SHARED_TREE_GUARD === '1') return process.exit(0);
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { /* no stdin */ }
  const cmd = raw ? commandFrom(raw) : null;
  const hit = cmd ? findDestructive(cmd) : null;
  if (!hit) return process.exit(0);

  const reason = blockReason(hit);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `great_cto shared-tree guard blocked the command — ${reason}`,
    },
  }) + '\n');
  process.stderr.write(`[great_cto:shared-tree] BLOCKED — ${reason}\n`);
  return process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
