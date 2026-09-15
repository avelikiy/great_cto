// The project registry — ~/.great_cto/projects.json — is the only list the board's
// project switcher reads. A project that is not in it does not exist for the board,
// however complete its .great_cto/ is.
//
// Until this module, the only writer was `great-cto register`, a CLI command a user
// had to know about. `/start` wrote PROJECT.md and never registered, so a project
// initialised the normal way stayed invisible on the board until someone noticed.
// Registration is now a side effect of having a PROJECT.md: the SessionStart and Stop
// hooks call registerProject() for the directory the session runs in.
//
// Result states (never a bare boolean — "not registered" has several causes):
//   registered — an entry was added
//   already    — an entry for this path exists; nothing written
//   none       — no .great_cto/PROJECT.md here; not a project
//   skipped    — a scratch location (temp dir, agent worktree) or switched off
//   refused    — the registry exists but cannot be parsed; it is NOT overwritten
//   failed     — an unexpected error; `error` says what
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';

export function registryFile(env = process.env) {
  return env.GREAT_CTO_PROJECTS_FILE || join(homedir(), '.great_cto', 'projects.json');
}

function real(p) {
  try { return realpathSync(p); } catch { return resolve(p); }
}

function under(child, parent) {
  return child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);
}

// A scratch directory is not a project someone will look for on the board, and tests
// create hundreds of them. Registering those into the real registry is how the board
// ends up listing /private/tmp/gcto-probe. An explicit GREAT_CTO_PROJECTS_FILE means
// the caller chose the registry (tests do), so the location rule does not apply there.
function scratchReason(dir, env) {
  if (env.GREAT_CTO_PROJECTS_FILE) return null;
  const scratch = [tmpdir(), '/tmp', '/private/tmp', '/var/folders', '/private/var/folders'].map(real);
  if (scratch.some((s) => under(dir, s))) return 'temporary directory';
  if (dir.split(sep).join('/').includes('/.claude/worktrees/')) return 'agent worktree';
  return null;
}

function field(text, key) {
  const m = text.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return m ? m[1].trim() : '';
}

export function registerProject(cwd, { env = process.env, now = new Date() } = {}) {
  try {
    if (env.GREAT_CTO_NO_AUTO_REGISTER === '1') return { state: 'skipped', reason: 'GREAT_CTO_NO_AUTO_REGISTER=1' };
    if (!cwd) return { state: 'none' };
    const dir = real(cwd);
    const projectMd = join(dir, '.great_cto', 'PROJECT.md');
    if (!existsSync(projectMd)) return { state: 'none' };
    const why = scratchReason(dir, env);
    if (why) return { state: 'skipped', reason: why };

    const file = registryFile(env);
    let reg = { projects: [] };
    if (existsSync(file)) {
      let parsed;
      try { parsed = JSON.parse(readFileSync(file, 'utf8')); } catch (e) {
        return { state: 'refused', file, reason: `registry is not valid JSON: ${e.message}` };
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.projects)) {
        return { state: 'refused', file, reason: 'registry has no projects[] list' };
      }
      reg = parsed;
    }

    const existing = reg.projects.find((p) => p && p.path && real(p.path) === dir);
    if (existing) return { state: 'already', slug: existing.slug, path: dir };

    const text = readFileSync(projectMd, 'utf8');
    const entry = {
      slug: field(text, 'project') || basename(dir) || 'project',
      archetype: field(text, 'archetype') || field(text, 'primary') || 'web-service',
      description: field(text, 'description'),
      path: dir,
      added_at: now.toISOString(),
    };
    reg.projects.push(entry);

    // Write-then-rename: a crash mid-write must not leave the board with a truncated
    // registry, which it would render as "no projects".
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(reg, null, 2) + '\n');
    renameSync(tmp, file);
    return { state: 'registered', slug: entry.slug, path: dir, file };
  } catch (e) {
    return { state: 'failed', error: e.message };
  }
}
