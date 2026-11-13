// Runs the plugin activation exactly as `great-cto init` does — the same modules, resolved from the same
// package root, the same HOME-derived paths, the same production admission — and dies when a named
// boundary has been journalled. This is what a real crash leaves behind: a lock whose owner is dead, a
// pending-transaction pointer, a journal, and half-written host files.
//
//   node crash-child.mjs <package-root> [<phase-to-die-at>]
//
// With no phase it runs to the end and prints the boundaries it journalled, which is how the tests learn
// the boundary list instead of assuming it. With `--recover` it runs only the recovery that `init` runs
// when it finds a dead owner's lock, so a test can look at the host between the recovery and the retry.
// It refuses to run unless HOME is under the system temp directory: a crash harness pointed at a real
// home would be the incident it exists to prevent.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [packageRoot, dieAt = ''] = process.argv.slice(2);
const temp = fs.realpathSync(os.tmpdir()), home = fs.realpathSync(os.homedir()), rel = path.relative(temp, home);
if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
  console.error(`refusing to run: HOME ${home} is not under ${temp}`);
  process.exit(2);
}

const load = name => import(pathToFileURL(path.join(packageRoot, 'dist', name)).href);
const [{ admitEmbeddedRelease }, { activatePluginRelease, recoverPluginActivation }, { stateHome }] = await Promise.all([load('release-trust.mjs'), load('plugin-activation.mjs'), load('state-home.mjs')]);
const { version } = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const options = { claudeDir: path.join(os.homedir(), '.claude'), stateRoot: path.join(stateHome(), 'distribution-trust') };

if (dieAt === '--recover') {
  process.stdout.write(JSON.stringify({ result: recoverPluginActivation(options) }));
} else {
  const ticket = admitEmbeddedRelease({ dir: path.join(packageRoot, 'plugin'), version });
  const phases = [];
  const result = activatePluginRelease(ticket, { ...options, onPhase: phase => { phases.push(phase); if (phase === dieAt) process.exit(9); } });
  process.stdout.write(JSON.stringify({ result, phases }));
}
