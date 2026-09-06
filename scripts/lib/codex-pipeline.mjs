/** Controlled Codex host. The controller owns writes, gates and the run cursor. */
import { readFileSync, writeFileSync, mkdirSync, lstatSync, existsSync, realpathSync, readdirSync } from 'node:fs';
import { resolve, relative, dirname, join, isAbsolute, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parsePipelineToml } from '../hooks/pipeline-dispatcher.mjs';
import { scan } from './secret-patterns.mjs';
import { runCodexExec } from './codex-exec.mjs';
import { treeReceipt } from './receipt.mjs';

export const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const hash = text => createHash('sha256').update(text).digest('hex');
const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
const protectedPart = /^(?:\.git|\.codex|\.claude|\.agents|\.beads|\.great_cto|node_modules)$/i;
const protectedFile = /^(?:AGENTS\.md|CLAUDE\.md|SKILL\.md|\.env(?:\..*)?)$/i;
const externalRoles = new Set(['devops', 'infra-provisioner', 'migration-import-engineer']);
const workerArgs = ['--ignore-user-config', '--ignore-rules', '--disable', 'plugins', '--disable', 'apps', '--disable', 'multi_agent',
  '--enable', 'skip_host_skill_discovery', '-c', 'suppress_unstable_features_warning=true',
  '-c', 'approval_policy="never"', '-c', 'sandbox_read_only.network_access=false'];
function cleanResponse(response) {
  const errors = (response.errors || []).filter(e => !String(e).split('\n').every(line =>
    /WARN codex_rollout::list: state db discrepancy during find_thread_path_by_id_str_in_subdir: falling_back$/.test(line.trim())));
  if (response.code !== 0 || response.state !== 'ok' || errors.length) throw Error(`Codex stage did not complete cleanly: ${JSON.stringify(errors)}`);
  return JSON.parse(response.text);
}

export async function verifyStage(state, role, proposal, execute) {
  const result = cleanResponse(await execute({
    cwd: state.root, sandbox: 'read-only', ephemeral: true, extraArgs: workerArgs,
    bin: process.env.GREAT_CTO_CODEX_BIN || 'codex', timeoutMs: 300000,
    prompt: `You are an independent verifier for the ${role} stage. Read the ACTUAL files and assess whether they satisfy the task for this stage.\n` +
      `User task: ${state.prompt}\nStage contract: ${JSON.stringify(state.graph[role])}\n` +
      `Claimed metadata: ${JSON.stringify(proposal.meta || {})}\nChanged paths: ${JSON.stringify(proposal.files.map(f => f.path))}\n` +
      `You may inspect files and run tests that work in the read-only sandbox. Never modify files or call external services. ` +
      `Do not treat file existence, a previous agent's statement or tests that were not executed as evidence of correctness. ` +
      `Return ONLY JSON {"state":"verified|rework|unverifiable","findings":["..."],"checks":["what you actually inspected or ran"]}. ` +
      `Use unverifiable if unable to inspect the evidence. Use rework when you find defects. No gate approval or file proposals.`,
  }));
  if (!['verified', 'rework', 'unverifiable'].includes(result.state) || !Array.isArray(result.findings) || !Array.isArray(result.checks) || !result.checks.length) throw Error('invalid or empty verifier evidence');
  return result;
}

export function safePath(root, name, allowed) {
  if (typeof name !== 'string' || !name || isAbsolute(name) || name.includes('\\') || name.includes('\0')) throw Error('invalid relative path');
  const parts = name.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || protectedPart.test(p) || protectedFile.test(p))) throw Error(`protected path: ${name}`);
  if (!allowed.some(p => name === p || name.startsWith(`${p}/`))) throw Error(`outside allowed paths: ${name}`);
  const target = resolve(root, name);
  if (relative(root, target).startsWith(`..${sep}`)) throw Error('path escapes root');
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) throw Error(`symlink: ${name}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return target;
}

export function newRun({ root, prompt, allowed, entry = 'product-owner', pluginRoot = PLUGIN_ROOT }) {
  root = realpathSync(root);
  pluginRoot = realpathSync(pluginRoot);
  if (root === pluginRoot) throw Error('run from a target project, not the controller installation');
  if (!prompt?.trim() || !Array.isArray(allowed) || !allowed.length) throw Error('prompt and explicit allowed paths are required');
  for (const p of allowed) safePath(root, p, allowed);
  const graphText = readFileSync(join(pluginRoot, 'shared/pipeline.toml'), 'utf8');
  const graph = parsePipelineToml(graphText);
  if (!graph[entry] || entry.includes('.')) throw Error(`unknown entry role: ${entry}`);
  return { version: 1, id: randomUUID(), root, prompt, allowed, pluginRoot, graph, graphHash: hash(graphText),
    queue: [entry], results: {}, released: [], pending: null, approvals: [], active: null, status: 'ready', writes: {}, steps: 0 };
}

/** Preflight the WHOLE proposal before writing a single byte. A hash binds replacement to what the worker read. */
export function validateProposal(state, proposal) {
  if (!proposal || typeof proposal.verdict !== 'string' || !Array.isArray(proposal.files) || typeof proposal.summary !== 'string') throw Error('invalid stage response');
  if (proposal.files.length > 50) throw Error('too many proposed files');
  const seen = new Set();
  let bytes = 0;
  return proposal.files.map(file => {
    const path = safePath(state.root, file.path, state.allowed);
    if (seen.has(path)) throw Error('duplicate file');
    seen.add(path);
    if (typeof file.content !== 'string') throw Error('content must be text');
    bytes += Buffer.byteLength(file.content);
    if (bytes > 1024 * 1024) throw Error('proposal exceeds 1 MiB');
    const findings = scan(file.content).filter(f => f.severity === 'block');
    if (findings.length) throw Error(`secret blocked in ${file.path}: ${findings.map(f => f.name).join(', ')}`);
    const before = existsSync(path) ? hash(readFileSync(path)) : null;
    if (file.before !== before) throw Error(`stale file: ${file.path}`);
    return { ...file, target: path, after: hash(file.content) };
  });
}

/** All declared gates are enforced, including terminal edges. Approval never comes from model output. */
export function advance(state) {
  if (state.pending) { state.status = 'awaiting-gate'; return; }
  for (const [role, result] of Object.entries(state.results)) {
    if (state.released.includes(role)) continue;
    const rule = state.graph[`${role}.${result.verdict}`] || state.graph[role];
    if (!rule?.on?.includes(result.verdict)) { state.status = 'blocked'; state.reason = `${role}: ${result.verdict}`; return; }
    const joined = list(rule.join);
    if (joined.some(partner => !state.results[partner])) continue;
    if (joined.some(partner => !(state.graph[partner]?.on || []).includes(state.results[partner].verdict))) {
      state.status = 'blocked'; state.reason = 'join contains unsuccessful role'; return;
    }
    const gates = list(rule.gate).filter(gate => !state.approvals.some(a => a.role === role && a.gate === gate && a.result === result.digest));
    if (gates.length) {
      // The receipt the gate is guarded by is taken HERE, at the moment the gate is
      // raised — not reused from the end of the role's own stage. Those are
      // different moments, and on a join they diverge: qa-engineer finishes,
      // its gate waits for security-officer, security-officer legitimately
      // writes its report, and only then is qa-engineer's gate raised. Compared
      // against the stage-end snapshot, the partner's own artifact read as
      // tampering, and gate:ship could never be approved on the shipped graph.
      // Found by walking shared/pipeline.toml end to end; the two-role fixture
      // has no join and could not see it.
      state.pending = { token: randomUUID(), role, gates, result: result.digest, receipt: treeReceipt(state.root) };
      state.status = 'awaiting-gate'; return;
    }
    state.released.push(role);
    for (const next of list(rule.next)) {
      if (!state.results[next] && !state.queue.includes(next)) state.queue.push(next);
    }
  }
  if (state.queue.length) state.status = 'ready';
  else state.status = Object.keys(state.results).every(role => state.released.includes(role)) ? 'done' : 'join-wait';
}

export function approve(state, token) {
  if (state.status !== 'awaiting-gate' || !state.pending || token !== state.pending.token) throw Error('approval token does not match this pending gate');
  for (const [name, expected] of Object.entries(state.writes)) {
    const path = safePath(state.root, name, state.allowed);
    if (!existsSync(path) || hash(readFileSync(path)) !== expected) throw Error(`artifact changed since gate was raised: ${name}`);
  }
  const { role, gates, result } = state.pending;
  // Compared against the receipt taken when THIS gate was raised, so the check
  // means what its message says. A pending record without one is from before
  // this fix and must not be approved on a guess.
  if (!('receipt' in state.pending)) throw Error('gate was raised without a receipt — re-raise it');
  if (state.pending.receipt && JSON.stringify(treeReceipt(state.root)) !== JSON.stringify(state.pending.receipt)) throw Error('working tree changed since gate was raised');
  for (const gate of gates) state.approvals.push({ role, gate, result, at: new Date().toISOString() });
  state.pending = null;
  advance(state);
}

export async function runStage(state, { execute = runCodexExec, verify = verifyStage, save = () => {} } = {}) {
  if (state.active) throw Error('interrupted stage: inspect state and files before starting a new run');
  if (state.status !== 'ready') return state;
  if (state.steps >= 32) throw Error('32-stage run limit reached');
  const role = state.queue[0];
  if (!/^[a-z][a-z0-9-]*$/.test(role)) throw Error('invalid role');
  if (externalRoles.has(role)) {
    state.status = 'manual-action'; state.reason = `${role} requires execution outside the file-proposal controller`; save(state); return state;
  }
  // Project MCP/config can restore side-effecting tools even for a read-only shell.
  for (let p = state.root; ; p = dirname(p)) {
    if (existsSync(join(p, '.codex/config.toml'))) throw Error('project Codex config present; use a clean fixture/project for the controlled host');
    if (dirname(p) === p) break;
  }
  const roleText = readFileSync(join(state.pluginRoot, 'agents', `${role}.md`), 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  const prompt = `You are the ${role} specialist in a controlled Codex pipeline.\n${roleText}\n\nCONTROLLER CONTRACT (overrides host-specific role instructions):\n` +
    `Use read-only shell inspection only. Do not write files, run other agents, close Beads, publish, deploy or invoke external services. The controller owns stage transitions and approvals.\n` +
    `Return ONLY JSON: {"verdict":"TOKEN","summary":"...","meta":{},"files":[{"path":"relative/path","before":null,"content":"full file text"}]}.\n` +
    `before must be SHA256 of the current file bytes or null for a new file. No deletion, symlink or binary proposals. Allowed paths: ${JSON.stringify(state.allowed)}.\n` +
    `Successful tokens: ${JSON.stringify(state.graph[role]?.on)}. Required artifact keys in meta: ${JSON.stringify(state.graph[role]?.produces || [])}. Use BLOCKED if the task requires unsupported execution.\n` +
    `User task: ${state.prompt}\nPrevious results: ${JSON.stringify(state.results)}\n`;
  state.active = role; state.steps++; save(state);
  try {
    const response = await execute({ prompt, cwd: state.root, sandbox: 'read-only', ephemeral: true,
      bin: process.env.GREAT_CTO_CODEX_BIN || 'codex', timeoutMs: 300000,
      extraArgs: workerArgs });
    // Codex can recover its session-index lookup without degrading the worker.
    // Keep the diagnostic in the receipt; every other warning/error blocks.
    const proposal = cleanResponse(response);
    const files = validateProposal(state, proposal);
    const rule = state.graph[`${role}.${proposal.verdict}`] || state.graph[role];
    if (!rule.on.includes(proposal.verdict)) throw Error(`${role} returned ${proposal.verdict}: ${proposal.summary}`);
    const evidence = new Set();
    for (const key of list(rule.produces)) {
      if (key === 'receipt') {
        if (!treeReceipt(state.root)) throw Error('receipt requires a Git repository with a commit');
        continue;
      }
      const name = proposal.meta?.[key];
      if (typeof name !== 'string') throw Error(`missing artifact: ${key}`);
      if (name.endsWith('/')) {
        const dir = name.slice(0, -1);
        const target = safePath(state.root, dir, state.allowed);
        const paths = files.filter(f => f.path.startsWith(name) && f.content.trim()).map(f => f.path);
        const walk = base => {
          if (!existsSync(base)) return;
          if (!lstatSync(base).isDirectory()) throw Error('directory artifact is not a directory');
          for (const entry of readdirSync(base)) {
            const full = join(base, entry), rel = relative(state.root, full).split(sep).join('/');
            safePath(state.root, rel, state.allowed);
            if (lstatSync(full).isDirectory()) walk(full);
            else if (lstatSync(full).isFile() && readFileSync(full).length) paths.push(rel);
            if (paths.length > 200) throw Error('directory artifact exceeds 200 files');
          }
        };
        walk(target);
        if (!paths.length) throw Error(`empty/missing directory artifact: ${name}`);
        for (const p of paths) evidence.add(p);
        continue;
      }
      const path = safePath(state.root, name, state.allowed);
      const proposed = files.find(f => f.target === path);
      if (!(proposed ? proposed.content.trim() : existsSync(path) && lstatSync(path).isFile() && readFileSync(path, 'utf8').trim())) throw Error(`empty/missing artifact: ${name}`);
      evidence.add(name);
    }
    for (const file of files) {
      mkdirSync(dirname(file.target), { recursive: true });
      writeFileSync(file.target, file.content);
      state.writes[file.path] = file.after;
    }
    for (const name of evidence) {
      state.writes[name] = hash(readFileSync(safePath(state.root, name, state.allowed)));
    }
    const receipt = treeReceipt(state.root);
    if (list(rule.produces).includes('receipt') && !Object.keys(receipt?.files || {}).length) throw Error('receipt has no changed files');
    const verification = await verify(state, role, proposal, execute);
    state.verification = verification;
    if (verification.state !== 'verified') throw Error(`stage verification ${verification.state}: ${JSON.stringify(verification.findings)}`);
    state.results[role] = { verdict: proposal.verdict, summary: proposal.summary, meta: proposal.meta || {},
      receipt, verification, digest: hash(JSON.stringify(proposal)), usage: response.usage ?? null, diagnostics: response.errors || [], at: new Date().toISOString() };
    state.queue.shift(); state.active = null;
    advance(state); save(state);
  } catch (error) {
    state.status = 'blocked'; state.reason = error.message;
    // Keep active set: a partial write or interrupted process must not be replayed.
    save(state);
  }
  return state;
}
