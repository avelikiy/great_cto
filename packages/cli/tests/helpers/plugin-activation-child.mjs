// Runs one activation in its own process and dies at a named phase, so a test can observe what a
// real crash leaves behind: a held lock with a dead owner, a journal, and half-written host state.
import { activatePluginRelease } from '../../src/plugin-activation.mjs';
import { admitEmbeddedRelease } from '../../src/release-trust.mjs';

const [dir, version, fingerprint, claudeDir, stateRoot, crashAt] = process.argv.slice(2);
const ticket = admitEmbeddedRelease({ dir, version, expectedCommit: 'a'.repeat(40) }, { testOnlyKeyFingerprint: fingerprint });
const result = activatePluginRelease(ticket, {
  claudeDir, stateRoot, testing: true, smoke: () => {},
  onPhase: phase => { if (phase === crashAt) process.exit(9); },
});
process.stdout.write(JSON.stringify(result));
