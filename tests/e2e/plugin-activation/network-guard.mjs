// Preloaded with `node --import` into the process under test. It makes the network unavailable and
// records every attempt to use it, in the file named by GCTO_E2E_NET_LOG, one JSON object per line:
//
//   fetch      global fetch()
//   socket     a TCP connection (local IPC sockets are not the network and pass through)
//   dns        a name lookup
//   spawn      a program that fetches by design (curl, wget, a package manager, ssh, gh, deno, docker run,
//              python -m pip...) or a git command that talks to a remote (clone, fetch, pull, push,
//              ls-remote, submodule), however it is started: as argv0, through a shell (`shell: true`,
//              `exec`, `sh -c`, `bash -lc`) or through a wrapper (`env`, `timeout`, `xargs`...)
//
// What counts as a fetching program is NOT decided here. fetchingInArgv and fetchingInLine come from
// plugin-runtime-boundary.mjs, the module that classifies a plugin manifest's commands, so this guard and
// the manifest check cannot disagree about what fetches (bug n4jt: they used to keep separate lists).
//
// A blocked call fails the way an unplugged cable would, so "a blocked network does not fail init" is
// observed, not assumed. Everything else — node itself, local git queries, a shell running `echo` — runs
// untouched. A child process that is allowed to run is not itself guarded: this records what THIS
// process asks for, and what it asks the operating system to start.
import fs from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { fetchingInArgv, fetchingInLine } from '../../../packages/cli/src/plugin-runtime-boundary.mjs';

const log = process.env.GCTO_E2E_NET_LOG;
if (!log) throw new Error('GCTO_E2E_NET_LOG must name the file that records network attempts');
const require = createRequire(import.meta.url);
const refused = (kind, detail) => {
  fs.appendFileSync(log, JSON.stringify({ kind, detail }) + '\n');
  return Object.assign(new Error(`network blocked by the E2E guard (${kind}: ${detail})`), { code: 'ENETUNREACH' });
};
// Announce yourself, so a test can tell "the guard saw nothing" from "the guard never ran".
fs.appendFileSync(log, JSON.stringify({ kind: 'loaded', detail: String(process.pid) }) + '\n');

globalThis.fetch = async (input) => { throw refused('fetch', String(input?.url ?? input)); };

const net = require('node:net');
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = args[0];
  const local = (first && typeof first === 'object' && first.path) || (typeof first === 'string' && Number.isNaN(Number(first)));
  if (local) return connect.apply(this, args);
  throw refused('socket', JSON.stringify(args.filter(a => typeof a !== 'function')).slice(0, 120));
};

const dns = require('node:dns');
for (const name of ['lookup', 'resolve', 'resolve4', 'resolve6', 'resolveAny']) {
  dns[name] = (...args) => {
    const error = refused('dns', `${name} ${String(args[0])}`), callback = args.at(-1);
    if (typeof callback === 'function') { process.nextTick(callback, error); return undefined; }
    throw error;
  };
}
dns.promises.lookup = async host => { throw refused('dns', `lookup ${String(host)}`); };

const childProcess = require('node:child_process');
const isOptions = value => value !== null && typeof value === 'object' && !Array.isArray(value);
for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync', 'fork']) {
  const original = childProcess[name];
  childProcess[name] = function (command, ...rest) {
    const args = Array.isArray(rest[0]) ? rest[0].map(String) : [];
    const options = rest.find(isOptions);
    // exec and execSync always run their first argument as a shell command line, and any of the others
    // does when it is given `shell: true`: then the "program" is a whole command line, not an argv0.
    const viaShell = name === 'exec' || name === 'execSync' || Boolean(options?.shell);
    const argv = [String(command), ...args];
    const found = viaShell ? fetchingInLine(argv.join(' ')) : fetchingInArgv(argv);
    if (found.length) throw refused('spawn', argv.join(' ').slice(0, 160));
    return original.call(this, command, ...rest);
  };
}
syncBuiltinESMExports();
