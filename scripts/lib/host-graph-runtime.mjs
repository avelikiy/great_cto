/** Provider-free CLI surface audit. Help text is not execution or hook-delivery proof. */
import { spawnSync } from 'node:child_process';
import { loadHostGraphAcceptance } from './host-graph-events.mjs';

const hosts = new Set(['codex', 'claude-code']);
const commandOptions = Object.freeze({ encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024, windowsHide: true });
const hasFlag = (text, flag) => new RegExp(`(?:^|[\\s,\\[|])${flag}(?=[\\s,=\\]|]|$)`).test(text);
const sourceVersion = result => {
  const text = String(result?.stdout || result?.stderr || '');
  return text.match(/\b(\d{1,5}\.\d{1,5}\.\d{1,5}(?:[-+][a-zA-Z0-9.-]{1,32})?)\b/)?.[1] || null;
};
function command(run, bin, args) {
  try { return run(bin, args, { ...commandOptions }); }
  catch { return { status: null, error: { code: 'AUDIT_COMMAND_FAILED' } }; }
}

export function auditHostGraphRuntime({ host, bin = host === 'claude-code' ? 'claude' : 'codex', run = spawnSync, acceptance = loadHostGraphAcceptance() } = {}) {
  if (!hosts.has(host)) throw Error('unsupported graph host');
  const result = { host, sourceVersion: null, state: 'unreadable', controlled: { streamEvents: null },
    native: { hookEvents: null }, liveAcceptance: 'not-checked' };
  const version = command(run, bin, ['--version']);
  if (version?.error || version?.status !== 0) {
    result.state = version?.error?.code === 'ENOENT' ? 'absent' : 'unreadable';
    return result;
  }
  result.sourceVersion = sourceVersion(version);
  // Which modes of this exact version passed live acceptance; an unreadable record is not "none".
  if (acceptance === null) result.liveAcceptance = 'unreadable';
  else {
    const modes = acceptance.filter(e => e?.host === host && e.version === result.sourceVersion).map(e => e.mode);
    if (modes.length) result.liveAcceptance = { state: 'accepted', modes: [...new Set(modes)].sort() };
  }
  const help = command(run, bin, host === 'codex' ? ['exec', '--help'] : ['--help']);
  if (help?.error || help?.status !== 0) return result;
  const text = String(help.stdout || '');
  const stream = host === 'codex' ? hasFlag(text, '--json')
    : hasFlag(text, '--output-format') && /\bstream-json\b/.test(text);
  result.controlled.streamEvents = stream;
  result.state = !result.sourceVersion ? 'unreadable' : stream ? 'available' : 'unsupported';
  return result;
}

export function auditHostGraphRuntimes({ run = spawnSync, binaries = {}, acceptance = loadHostGraphAcceptance() } = {}) {
  return ['codex', 'claude-code'].map(host => auditHostGraphRuntime({ host, run, acceptance, bin: binaries[host] || (host === 'codex' ? 'codex' : 'claude') }));
}
