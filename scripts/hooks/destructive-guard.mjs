#!/usr/bin/env node
/**
 * destructive-guard — PreToolUse hook for Bash.
 *
 * Replaces the inline "Safety check" that plugin.json carried for months. That
 * check read a top-level `command` field; Claude Code sends
 * `{ tool_name, tool_input: { command } }`, so it saw an empty string and never
 * blocked anything. Had it worked, its regex would have refused every
 * `rm -rf node_modules`, every `--force-with-lease`, and any commit message that
 * mentioned DROP TABLE. This one parses the command and refuses only what cannot
 * be taken back:
 *
 *   rm -r  of `/`, `/*`, a system dir, the home dir (`~`, `$HOME`, `~/*`), the
 *          project itself (`.`, `*`) or any directory above it (`..`), a `.git`,
 *          or `$VAR/` / `$VAR/*` (an empty variable makes it `/`)
 *          — build output, relative paths inside the project and /tmp, $TMPDIR
 *          paths pass; `cd dir && rm -rf *` is judged in dir, `cd dir; …` in both
 *   git push --force / -f / +ref (any branch); any force, lease included, to
 *          main/master/production/release*; --mirror; deleting those branches
 *   DROP DATABASE|SCHEMA|TABLE, TRUNCATE, dropDatabase() fed to a DB client
 *          (psql, mysql, sqlite3, mongosh, clickhouse-client, prisma db execute,
 *          supabase db, …) by argument, heredoc or pipe
 *   dd of=/dev/…, mkfs*, diskutil erase*; chmod/chown -R of system or home dirs;
 *   curl|wget … | sh (also `sh -c "$(curl …)"`, `bash <(curl …)`); a fork bomb
 *
 * Mentions pass: quotes, commit messages, echo, grep patterns and heredocs fed
 * to anything but a DB client are words, not commands (scripts/lib/shell-commands.mjs).
 *
 * The sanctioned route past a refusal is a signed, expiring exception for gate
 * `destructive-command` (`/exception`, scripts/lib/exceptions.mjs). An env prefix
 * inside the agent's own command is not a way past — the hook reads its own env.
 *
 * I/O (Claude Code PreToolUse):
 *   stdin:  { tool_name, tool_input: { command }, cwd }   (also tolerates top-level command)
 *   stdout: silent on allow; on block, hookSpecificOutput JSON (permissionDecision="deny")
 *   exit:   0 = allow, 2 = block (fail-safe alongside the structured deny)
 *
 * Opt out for a whole session (operator's environment): GREAT_CTO_DISABLE_DESTRUCTIVE_GUARD=1
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { posix } from 'node:path';
import { simpleCommands, gitParts, base } from '../lib/shell-commands.mjs';
import { isCovered } from '../lib/exceptions.mjs';

const GATE = 'destructive-command';

// ── Paths ────────────────────────────────────────────────────────────────────

const SYSTEM_TOP = new Set([
  'bin', 'boot', 'dev', 'etc', 'lib', 'lib32', 'lib64', 'libx32', 'opt', 'proc', 'root', 'run',
  'sbin', 'srv', 'sys', 'usr', 'var', 'mnt', 'media', 'snap', 'nix', 'home',
  'System', 'Library', 'Applications', 'Users', 'Volumes', 'private', 'cores', 'Network',
]);
// Their direct children are system too (/usr/bin, /private/etc, /var/folders, …).
const SYSTEM_DEEP = new Set(['usr', 'System', 'private', 'var', 'etc', 'Library', 'boot', 'bin', 'sbin', 'lib']);
const HOMES = new Set(['Users', 'home']);
const GLOB = /[*?[]/;

const norm = (p) => posix.normalize(p).replace(/(.)\/+$/, '$1');
// macOS: /tmp, /var and /etc are symlinks into /private — compare without it.
const canon = (p) => p.replace(/^\/private(?=\/(tmp|var|etc)(\/|$))/, '');
const isUnder = (p, dir) => dir === '/' ? p !== '/' : p.startsWith(dir + '/');
const sameOrUnder = (p, dir) => p === dir || isUnder(p, dir);

/** Expand ~ and the variables we can know; an unknown `$X` becomes '' (what an unset X does). */
function expand(word, ctx, cwd) {
  let s = word;
  if (s === '~' || s.startsWith('~/')) s = ctx.home + s.slice(1);
  s = s.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*):\?[^}]*\}/g, '__$1__'); // ${X:?} aborts when empty: a real name
  s = s.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (_, v) => {
    if (v === 'HOME') return ctx.home;
    if (v === 'PWD') return cwd;
    if (v === 'TMPDIR' || v === 'TMP' || v === 'TEMP') return ctx.tmp;
    return '';
  });
  return s.replace(/\u0000/g, '');
}

/** What an rm/chmod target resolves to: { path, whole } — whole = "every entry in path". */
function resolveTarget(word, ctx, cwd) {
  const s = expand(word, ctx, cwd);
  if (s === '') return null;
  const abs = s.startsWith('/') ? s : posix.join(cwd, s);
  const segs = abs.split('/');
  const g = segs.findIndex((x) => GLOB.test(x));
  if (g === -1) return { path: norm(abs), whole: false };
  const parent = norm(segs.slice(0, g).join('/') || '/');
  const lastAndAll = g === segs.length - 1 || (g === segs.length - 2 && segs[g + 1] === '');
  const all = /^\.?\*$|^\.\[!\.\]\*$/.test(segs[g]);
  if (parent === '/') return { path: '/', whole: true };        // /u*, /*/bin — root-level globs
  return { path: parent, whole: lastAndAll && all, partial: !(lastAndAll && all) };
}

/** Why deleting (or chmod -R-ing) `t` is catastrophic, or null. `forChmod` skips project rules. */
function pathDanger(t, word, ctx, forChmod = false) {
  const p = canon(t.path);
  const cwd = canon(ctx.cwd);
  const home = canon(norm(ctx.home));
  const tmpRoots = ['/tmp', '/var/tmp', canon(norm(ctx.tmp))];
  if (/\$\{?[A-Za-z_]|\u0000/.test(word) && (p === '/' || (t.whole && p === '/'))) return 'var';
  if (p === '/') return 'root';
  if (!forChmod && t.partial) return null;
  if (p === home) return 'home';
  if (!forChmod && sameOrUnder(cwd, p)) return p === cwd ? 'project' : 'ancestor';
  if (!forChmod && /(^|\/)\.git$/.test(p)) return 'git';
  if (tmpRoots.includes(p)) return 'system';
  if (tmpRoots.some((r) => isUnder(p, r))) return null;
  const segs = p.split('/').filter(Boolean);
  if (segs.length === 1 && SYSTEM_TOP.has(segs[0])) return 'system';
  if (segs.length === 2 && SYSTEM_DEEP.has(segs[0])) return 'system';
  if (segs.length === 2 && HOMES.has(segs[0])) return 'home';
  return null;
}

function rmTargets(args) {
  let recursive = false;
  const targets = [];
  let opts = true;
  for (const a of args) {
    if (opts && a === '--') { opts = false; continue; }
    if (opts && a.startsWith('--')) { if (a === '--recursive') recursive = true; continue; }
    if (opts && /^-[A-Za-z]+$/.test(a)) { if (/[rR]/.test(a)) recursive = true; continue; }
    targets.push(a);
  }
  return { recursive, targets };
}

// ── Rules ────────────────────────────────────────────────────────────────────

const PROTECTED = /^(main|master|production|release.*)$/;
const PUSH_VALUE_OPTS = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec']);

function pushRule(args, branch) {
  let force = false, lease = false, mirror = false, del = false, all = false;
  const pos = [];
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (PUSH_VALUE_OPTS.has(a)) { k += 1; continue; }
    if (a === '--force') force = true;
    else if (a === '--force-with-lease' || a.startsWith('--force-with-lease=')) lease = true;
    else if (a === '--mirror') mirror = true;
    else if (a === '--delete') del = true;
    else if (a === '--all' || a === '--branches') all = true;
    else if (/^-[A-Za-z]+$/.test(a)) {
      for (const ch of a.slice(1)) { if (ch === 'o') break; if (ch === 'f') force = true; if (ch === 'd') del = true; }
    } else if (!a.startsWith('-')) pos.push(a);
  }
  if (mirror) return { rule: 'push-mirror' };
  const refspecs = pos.slice(1);
  const dsts = refspecs.map((r) => {
    const plus = r.startsWith('+');
    const spec = plus ? r.slice(1) : r;
    const colon = spec.indexOf(':');
    const src = colon === -1 ? spec : spec.slice(0, colon);
    let dst = colon === -1 ? spec : spec.slice(colon + 1);
    if (dst === 'HEAD') dst = branch || 'HEAD';
    dst = dst.replace(/^refs\/heads\//, '');
    return { dst, plus, deletes: colon !== -1 && src === '' };
  });
  if (!refspecs.length && branch) dsts.push({ dst: branch, plus: false, deletes: false });
  const prot = dsts.find((d) => PROTECTED.test(d.dst));
  if (del && prot) return { rule: 'push-delete', ref: prot.dst };
  const delProt = dsts.find((d) => d.deletes && PROTECTED.test(d.dst));
  if (delProt) return { rule: 'push-delete', ref: delProt.dst };
  if (force || dsts.some((d) => d.plus)) return { rule: 'push-force' };
  if (lease && (prot || all)) return { rule: 'push-protected', ref: prot ? prot.dst : '--all' };
  return null;
}

const DB_CLIENTS = new Set([
  'psql', 'pgcli', 'mysql', 'mariadb', 'mycli', 'sqlite3', 'sqlite', 'litecli', 'duckdb', 'mongosh', 'mongo',
  'clickhouse-client', 'clickhouse-local', 'sqlcmd', 'cqlsh', 'usql',
]);
// Clients reached through a subcommand: `prisma db execute`, `supabase db …`, `clickhouse client`, …
const DB_SUBCLIENTS = { prisma: 'db', supabase: 'db', clickhouse: 'client', cockroach: 'sql', turso: 'db', wrangler: 'd1', heroku: 'pg:psql' };
const WRAPPERS = new Set(['docker', 'podman', 'kubectl', 'npx', 'pnpx', 'bunx', 'pnpm', 'yarn', 'npm', 'fly', 'flyctl', 'railway', 'heroku', 'time']);
const SQL_DESTROY = /\b(DROP\s+(DATABASE|SCHEMA|TABLE)\b|TRUNCATE\b(?!\s*\())|\.dropDatabase\s*\(/i;

/** Index of the DB client in `words`, or -1. */
function dbClientAt(words) {
  const at = (k) => {
    const b = base(words[k] || '');
    if (DB_CLIENTS.has(b)) return true;
    return DB_SUBCLIENTS[b] !== undefined && words[k + 1] === DB_SUBCLIENTS[b];
  };
  if (at(0)) return 0;
  if (WRAPPERS.has(base(words[0]))) for (let k = 1; k < words.length; k++) if (at(k)) return k;
  return -1;
}

/** Everything a DB client would execute: its args, heredocs, and what is piped into it. */
function sqlText(c, k) {
  const parts = [...c.words.slice(k + 1), ...c.heredocs];
  for (let p = c.pipeFrom; p; p = p.pipeFrom) parts.push(...p.words.slice(1), ...p.heredocs);
  return parts.join('\n');
}

const NET = new Set(['curl', 'wget']);
const FORK_BOMB = /([A-Za-z_:][A-Za-z0-9_:]*)\s*\(\)\s*\{\s*\1\s*\|\s*\1\s*&\s*\}\s*;?\s*\1/;
const SAFE_DEVS = /^\/dev\/(null|zero|stdout|stderr|fd\/\d+|tty)$/;

// ── Decision ─────────────────────────────────────────────────────────────────

function inspect(src, ctx) {
  if (FORK_BOMB.test(src.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, '""'))) return { rule: 'fork-bomb', command: src.trim().split('\n')[0] };
  // Working directory per lex group; a cd not followed by && leaves both dirs in play.
  const dirs = new Map();
  let pendingCd = null;
  for (const c of simpleCommands(src)) {
    const w = c.words;
    const command = w.join(' ').replace(/\u0000/g, '$(…)');
    const cur = dirs.get(c.group) || [ctx.cwd];
    if (pendingCd && pendingCd.group === c.group && c.after !== '&&') dirs.set(c.group, [...new Set([...pendingCd.before, ...cur])]);
    pendingCd = null;
    const here = dirs.get(c.group) || [ctx.cwd];
    const cmd = base(w[0]);

    if (c.shell) {
      if (c.script !== null && FORK_BOMB.test(c.script)) return { rule: 'fork-bomb', command };
      if (c.subs.some((s) => NET.has(base(s.words[0] || '')))) return { rule: 'net-shell', command };
      if (c.script === null) {
        for (let p = c.pipeFrom; p; p = p.pipeFrom) if (NET.has(base(p.words[0] || ''))) return { rule: 'net-shell', command: `${p.words.join(' ')} | ${command}` };
      }
      continue;
    }

    if (cmd === 'cd' || cmd === 'pushd') {
      const arg = w.slice(1).find((a) => !/^-[LPe@]+$/.test(a));
      const next = here.map((d) => {
        if (arg === undefined || arg === '~') return ctx.home;
        if (arg === '-') return ctx.cwd;
        const s = expand(arg, ctx, d);
        return norm(s.startsWith('/') ? s : posix.join(d, s));
      });
      pendingCd = { group: c.group, before: here };
      dirs.set(c.group, next);
      continue;
    }

    if (cmd === 'rm') {
      const { recursive, targets } = rmTargets(w.slice(1));
      if (!recursive) continue;
      for (const t of targets) for (const d of here) {
        const r = resolveTarget(t, ctx, d);
        const why = r && pathDanger(r, t, ctx, false);
        if (why) return { rule: `rm-${why}`, command, target: t };
      }
      continue;
    }

    if (cmd === 'chmod' || cmd === 'chown' || cmd === 'chgrp') {
      const args = w.slice(1);
      if (!args.some((a) => a === '--recursive' || /^-[A-Za-z]*R/.test(a))) continue;
      for (const t of args.filter((a) => !a.startsWith('-')).slice(1)) for (const d of here) {
        const r = resolveTarget(t, ctx, d);
        const why = r && pathDanger(r, t, ctx, true);
        if (why) return { rule: 'chmod', command, target: t };
      }
      continue;
    }

    if (cmd === 'dd') {
      const of = w.find((a) => a.startsWith('of='));
      if (of && of.slice(3).startsWith('/dev/') && !SAFE_DEVS.test(of.slice(3))) return { rule: 'disk', command };
      continue;
    }
    if (/^(mkfs|newfs)/.test(cmd) || (cmd === 'diskutil' && /^(erase|zero|secureErase|partitionDisk|reformat)/i.test(w[1] || ''))) {
      return { rule: 'disk', command };
    }

    const git = gitParts(w);
    if (git && git.sub === 'push') {
      const r = pushRule(git.args, ctx.branch);
      if (r) return { ...r, command };
      continue;
    }

    const k = dbClientAt(w);
    if (k !== -1 && SQL_DESTROY.test(sqlText(c, k))) return { rule: 'sql', command };
    if (base(w[0]) === 'ssh' && w.length > 2) {
      const inner = inspect(w.slice(2).join(' '), ctx);
      if (inner && inner.rule === 'sql') return { ...inner, command };
    }
  }
  return null;
}

/**
 * Pure decision: the first thing in `cmd` that cannot be taken back, as
 * { rule, command, target?, ref? }, or null. ctx: { cwd, home, tmp, branch }.
 */
export function findDestructive(cmd, ctx = {}) {
  if (typeof cmd !== 'string' || !cmd.trim()) return null;
  const full = {
    cwd: norm(ctx.cwd || process.cwd()),
    home: norm(ctx.home || homedir()),
    tmp: norm(ctx.tmp || process.env.TMPDIR || tmpdir()),
    branch: ctx.branch ?? null,
  };
  return inspect(cmd, full);
}

// ── Messages ─────────────────────────────────────────────────────────────────

function why(hit) {
  const t = hit.target ? `\`${hit.target}\`` : 'the target';
  switch (hit.rule) {
    case 'rm-root': return `deletes the whole filesystem. Safe instead: name the exact path inside the project or under $TMPDIR.`;
    case 'rm-system': return `${t} is a system directory; deleting it breaks the machine, not the project. Safe instead: name the exact path inside the project or under $TMPDIR.`;
    case 'rm-home': return `${t} is a home directory — every project, key and config in it. Safe instead: name the exact subdirectory (\`rm -rf ~/.cache/<tool>\`).`;
    case 'rm-project': return `${t} here is the whole project — sources, .git and other sessions' uncommitted work. Safe instead: name the outputs (\`rm -rf node_modules dist\`), or preview ignored files with \`git clean -ndX\`.`;
    case 'rm-ancestor': return `${t} resolves to a directory above the project — this project and its neighbours. Safe instead: name the exact path inside the project.`;
    case 'rm-git': return `${t} is a git repository's history. Safe instead: \`git worktree remove <path>\` for a worktree, \`git submodule deinit <path>\` for a submodule, or clone fresh into a new directory.`;
    case 'rm-var': return `${t} becomes \`/\` when the variable is empty or unset. Safe instead: \`\${X:?}/…\` (the shell aborts if X is empty), or check \`[ -n "$X" ]\` first.`;
    case 'push-force': return `rewrites remote history; commits others pushed there are lost. Safe instead: \`git push --force-with-lease\` (refuses if the remote moved) — on your own feature branch.`;
    case 'push-protected': return `force-pushes \`${hit.ref}\`, a shared branch; even with a lease it rewrites history everyone builds on. Safe instead: push a branch and open a PR; undo with \`git revert\`.`;
    case 'push-delete': return `deletes \`${hit.ref}\` on the remote. Safe instead: delete feature branches only; protected branches are removed by a human in the host's settings.`;
    case 'push-mirror': return `--mirror makes the remote match this clone exactly, deleting every remote branch and tag it lacks. Safe instead: push the branches you mean (\`git push origin <branch>\`).`;
    case 'sql': return `drops or truncates data through a live DB client. Safe instead: write it as a reviewed migration, take a backup first (\`pg_dump\` / \`mysqldump\`), and use a disposable local database for experiments.`;
    case 'disk': return `writes a filesystem or raw bytes onto a block device. Safe instead: work on an image file (\`of=disk.img\`) and let a human run the device write.`;
    case 'chmod': return `recursively changes ownership/permissions of ${t}, a system or home directory; it cannot be undone file by file. Safe instead: target the exact path inside the project.`;
    case 'net-shell': return `runs code fetched from the network without anyone reading it. Safe instead: download it to a file, read it, pin a checksum, then run it (\`curl -fsSLo install.sh URL && less install.sh && sh install.sh\`).`;
    case 'fork-bomb': return `is a fork bomb — it exhausts the process table and hangs the machine.`;
    default: return 'cannot be taken back.';
  }
}

export function blockReason(hit) {
  return (
    `\`${hit.command}\` ${why(hit)} If this really is intended, it is the operator's call: ` +
    `a signed, expiring exception for gate "${GATE}" (\`/exception\`, or ` +
    `\`node scripts/lib/exceptions.mjs create --gate ${GATE} --reason "…"\`).`
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

function currentBranch(cwd) {
  try {
    return execFileSync('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
      cwd, encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null;
  } catch { return null; }
}

function main() {
  if (process.env.GREAT_CTO_DISABLE_DESTRUCTIVE_GUARD === '1') return process.exit(0);
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { /* no stdin */ }
  let d;
  try { d = JSON.parse(raw || '{}'); } catch { return process.exit(0); }
  if (d.tool_name && d.tool_name !== 'Bash') return process.exit(0);
  const cmd = (d.tool_input || d.toolInput || {}).command || d.command;
  if (typeof cmd !== 'string' || !cmd.trim()) return process.exit(0);
  const cwd = typeof d.cwd === 'string' && d.cwd ? d.cwd : process.cwd();
  const needsBranch = /\bpush\b/.test(cmd);
  const hit = findDestructive(cmd, { cwd, branch: needsBranch ? currentBranch(cwd) : null });
  if (!hit) return process.exit(0);
  if (isCovered(GATE)) return process.exit(0);

  const reason = blockReason(hit);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `great_cto destructive-command guard blocked the command — ${reason}`,
    },
  }) + '\n');
  process.stderr.write(`[great_cto:destructive] BLOCKED — ${reason}\n`);
  return process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
