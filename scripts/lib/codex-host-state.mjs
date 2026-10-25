/** Read-only, secret-free projections and preflight for the controlled Codex host. */
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { detectCodex } from './codex-exec.mjs';
import { detectClaude } from './claude-exec.mjs';
import { dispatchEvidenceSummary } from './controller-dispatch-evidence.mjs';
import { projectExecutionTrace } from './execution-trace.mjs';
import { graphBinding, projectHostObservations } from './host-graph-observer.mjs';

export const codexRunStore = ({ home = homedir(), env = process.env } = {}) =>
  env.GREAT_CTO_CODEX_RUNS_DIR || join(home, '.great_cto', 'codex-runs');

export function projectCodexState(state) {
  const observationInvocations = (state.attempts || []).flatMap(a => [{ ...a, observationHost: a.host || 'codex', observationId: a.invocationId }, ...(a.verifierInvocationId ? [{ ...a, observationHost: 'codex', observationId: a.verifierInvocationId }] : [])]).filter(a => a.observationId);
  return {
    id: state.id,
    version: state.version,
    project: basename(state.root),
    status: state.status,
    reason: state.reason ?? null,
    active: state.active,
    queue: state.queue || [],
    hostRoutes: state.hostRoutes || {},
    controllerDispatch: dispatchEvidenceSummary(state),
    executionGraph: projectExecutionTrace(state),
    hostObservationHealth: state.hostObservationHealth || null,
    hostObservationOmittedAttempts: Math.max(0, observationInvocations.length - 8),
    hostObservations: state.observeHostGraph === true ? observationInvocations.slice(-8).map(a =>
      projectHostObservations(graphBinding({ root: state.root, runId: state.id, sessionId: a.observationId, attemptId: a.id, host: a.observationHost }))) : [],
    wave: state.wave ? { id: state.wave.id, roles: state.wave.roles, hosts: state.wave.hosts, status: state.wave.status } : null,
    rolesCompleted: Object.keys(state.results || {}),
    attempts: (state.attempts || []).map(({ id, role, host, number, phase, status, startedAt, finishedAt, invocationId, verifierInvocationId }) =>
      ({ id, role, host: host || 'codex', number, phase, status, startedAt, finishedAt,
        ...(invocationId ? { invocationId } : {}), ...(verifierInvocationId ? { verifierInvocationId } : {}) })),
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
  if (!existsSync(store)) return { state: 'absent', runs: [], unreadable: 0, orphaned: 0 };
  const runs = []; let unreadable = 0; let orphaned = 0;
  for (const name of readdirSync(store).filter(name => /^[0-9a-f-]{36}\.json$/.test(name)).sort()) {
    try {
      const state = JSON.parse(readFileSync(join(store, name), 'utf8'));
      if (state.id !== name.slice(0, -5) || state.version !== 1 || typeof state.root !== 'string') { unreadable += 1; continue; }
      if (canonicalRoot) {
        // A run whose project directory was deleted was read fine — it belongs
        // to no project that exists, so it is not this one. Calling it
        // unreadable told every board "membership is unknown" for test runs
        // from /tmp removed weeks earlier.
        let runRoot;
        try { runRoot = realpathSync(state.root); }
        catch (error) { if (error.code === 'ENOENT') { orphaned += 1; continue; } throw error; }
        if (runRoot !== canonicalRoot) continue;
      }
      runs.push(projectCodexState(state));
    } catch { unreadable += 1; }
  }
  return { state: unreadable ? 'degraded' : 'ok', runs: runs.reverse(), unreadable, orphaned };
}

const commandStatus = (bin, args, run = spawnSync) => {
  try {
    const result = run(bin, args, { encoding: 'utf8', timeout: 10000, env: { ...process.env, GH_PROMPT_DISABLED: '1' } });
    return { state: result.status === 0 ? 'available' : 'unavailable', detail: String(result.stdout || result.stderr || '').trim().slice(-500) };
  } catch (error) { return { state: 'absent', detail: String(error.message || error) }; }
};

export function codexHostDoctor({ pluginRoot, store = codexRunStore(), run = spawnSync,
  codex = detectCodex(), claude = detectClaude() } = {}) {
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
    claude,
    graph,
    stateStore,
    docker: commandStatus('docker', ['version', '--format', '{{.Server.Version}}'], run),
    github: commandStatus('gh', ['auth', 'status'], run),
  };
  return { state: codex.state === 'available' && graph.state === 'available' && stateStore.state !== 'unsafe' ? 'ready' : 'blocked', checks };
}
