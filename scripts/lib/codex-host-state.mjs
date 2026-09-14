/** Read-only, secret-free projections and preflight for the controlled Codex host. */
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { detectCodex } from './codex-exec.mjs';

export const codexRunStore = ({ home = homedir(), env = process.env } = {}) =>
  env.GREAT_CTO_CODEX_RUNS_DIR || join(home, '.great_cto', 'codex-runs');

export function projectCodexState(state) {
  return {
    id: state.id,
    version: state.version,
    project: basename(state.root),
    status: state.status,
    reason: state.reason ?? null,
    active: state.active,
    queue: state.queue || [],
    rolesCompleted: Object.keys(state.results || {}),
    attempts: (state.attempts || []).map(({ id, role, number, phase, status, startedAt, finishedAt }) =>
      ({ id, role, number, phase, status, startedAt, finishedAt })),
    pending: state.pending ? { role: state.pending.role, gates: state.pending.gates || [], createdAt: state.pending.createdAt } : null,
    release: state.release ? {
      adapter: state.release.adapter,
      status: state.release.status,
      artifactDigest: state.release.artifactDigest,
      target: state.release.adapter === 'github-release'
        ? {
            repository: state.release.target?.repository,
            tag: state.release.target?.tag,
            targetCommitish: state.release.target?.targetCommitish,
          }
        : { kind: 'designated-local-root' },
      url: state.release.url,
      activation: state.release.activation,
      rollback: state.release.rollback,
      preparedAt: state.release.preparedAt,
      publishedAt: state.release.publishedAt,
      verifiedAt: state.release.verifiedAt,
      smoke: state.release.smoke ? { state: state.release.smoke.state, code: state.release.smoke.code } : null,
    } : null,
  };
}

export function listCodexRuns({ root = null, store = codexRunStore() } = {}) {
  let canonicalRoot = null;
  if (root) canonicalRoot = realpathSync(root);
  if (!existsSync(store)) return { state: 'absent', runs: [], unreadable: 0 };
  const runs = []; let unreadable = 0;
  for (const name of readdirSync(store).filter(name => /^[0-9a-f-]{36}\.json$/.test(name)).sort()) {
    try {
      const state = JSON.parse(readFileSync(join(store, name), 'utf8'));
      if (state.id !== name.slice(0, -5) || state.version !== 1 || typeof state.root !== 'string') { unreadable += 1; continue; }
      if (canonicalRoot && realpathSync(state.root) !== canonicalRoot) continue;
      runs.push(projectCodexState(state));
    } catch { unreadable += 1; }
  }
  return { state: unreadable ? 'degraded' : 'ok', runs: runs.reverse(), unreadable };
}

const commandStatus = (bin, args, run = spawnSync) => {
  try {
    const result = run(bin, args, { encoding: 'utf8', timeout: 10000, env: { ...process.env, GH_PROMPT_DISABLED: '1' } });
    return { state: result.status === 0 ? 'available' : 'unavailable', detail: String(result.stdout || result.stderr || '').trim().slice(-500) };
  } catch (error) { return { state: 'absent', detail: String(error.message || error) }; }
};

export function codexHostDoctor({ pluginRoot, store = codexRunStore(), run = spawnSync, codex = detectCodex() } = {}) {
  const graph = pluginRoot && existsSync(join(pluginRoot, 'shared', 'pipeline.toml'))
    ? { state: 'available', detail: join(pluginRoot, 'shared', 'pipeline.toml') }
    : { state: 'absent', detail: 'shared/pipeline.toml is missing' };
  let stateStore = { state: 'absent', detail: store };
  if (existsSync(store)) {
    const mode = statSync(store).mode & 0o777;
    const unsafeFiles = readdirSync(store)
      .filter(name => name.endsWith('.json'))
      .filter(name => (statSync(join(store, name)).mode & 0o077) !== 0);
    const safe = (mode & 0o077) === 0 && unsafeFiles.length === 0;
    stateStore = {
      state: safe ? 'available' : 'unsafe',
      detail: `${store} mode=${mode.toString(8)} unsafe_files=${unsafeFiles.length}`,
    };
  }
  const checks = {
    codex,
    graph,
    stateStore,
    docker: commandStatus('docker', ['version', '--format', '{{.Server.Version}}'], run),
    github: commandStatus('gh', ['auth', 'status'], run),
  };
  return { state: codex.state === 'available' && graph.state === 'available' && stateStore.state !== 'unsafe' ? 'ready' : 'blocked', checks };
}
