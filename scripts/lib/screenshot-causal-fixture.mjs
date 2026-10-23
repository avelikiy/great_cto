/** Actual offline controller history for isolated public captures, not a model benchmark. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { newRun, runStage, approve } from './codex-pipeline.mjs';

export async function seedRecordedCapture(root, home) {
  root = fs.realpathSync(root); home = fs.realpathSync(home);
  const relative = path.relative(root, home);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw Error('capture HOME must be outside the project');
  const temporary = fs.realpathSync(os.tmpdir());
  if (path.dirname(root) !== path.dirname(home) || !path.dirname(root).startsWith(temporary + path.sep)) throw Error('causal capture requires isolated temporary sibling directories');
  if (fs.lstatSync(path.join(root, '.git'), { throwIfNoEntry: false }) || fs.lstatSync(path.join(root, '.gitignore'), { throwIfNoEntry: false }) || fs.lstatSync(path.join(home, '.capture-plugin'), { throwIfNoEntry: false }) || JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).name !== 'acme-storefront') throw Error('causal capture requires a fresh synthetic fixture, not an existing repository');
  const git = args => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  fs.writeFileSync(path.join(root, '.gitignore'), '.great_cto/\n');
  git(['init', '-q']); git(['add', '.']);
  git(['-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'synthetic capture baseline']);
  const plugin = path.join(home, '.capture-plugin');
  fs.mkdirSync(path.join(plugin, 'shared'), { recursive: true });
  fs.writeFileSync(path.join(plugin, 'shared/pipeline.toml'), '[transitions.architect]\non=["DONE"]\ngate="gate:arch"\nnext=["code-reviewer"]\n[transitions.code-reviewer]\non=["PASS"]\ngate="gate:ship"\nnext=[]');
  const state = newRun({ root, pluginRoot: plugin, prompt: 'Synthetic offline graph capture; no live-model calls', allowed: ['src', 'docs'], entry: 'architect', hostRoutes: { 'code-reviewer': 'claude-code' } });
  const options = verdict => ({ execute: async () => ({ state: 'ok', code: 0, errors: [], text: JSON.stringify({ verdict, summary: 'Synthetic offline capture response', meta: {}, files: [] }) }), verify: async () => ({ state: 'verified', findings: [], checks: ['Synthetic offline capture; not independent production review'] }) });
  await runStage(state, options('DONE'));
  approve(state, state.pending.token); // Synthetic fixture only; not an operator authorization.
  await runStage(state, options('PASS'));
  if (state.status !== 'awaiting-gate') throw Error('offline capture did not reach the expected gate');
  delete state.pending.token; // Public fixtures must not offer executable approvals.
  state.reason = 'Sample project: synthetic offline controller history. No live models, human approval or deployment are certified.';
  const store = path.join(home, '.great_cto', 'codex-runs');
  fs.mkdirSync(store, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(store, state.id + '.json'), JSON.stringify(state), { mode: 0o600 });
  return state.id;
}
