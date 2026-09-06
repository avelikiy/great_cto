/**
 * agent-shield — the agent's own configuration, read as an attack surface.
 *
 * `agent-posture.mjs` answers what a grant PERMITS. This answers a different
 * question about the same files: what is actually IN them. A hook is a shell
 * command this plugin runs on every session of every user who installs it; an
 * MCP server is a binary it starts; an agent's frontmatter is text that reaches
 * the model. None of those were being read by anything.
 *
 * The shape is borrowed from ECC's AgentShield (MIT, like this); the rules are
 * ours, and each one exists because of something that happened here:
 *
 *   a key in preferences.md reached 605 transcripts, and revocation was the
 *   only fix — so frontmatter and hook bodies are scanned for secrets
 *
 *   a `hooks.json` Codex reads and rejects shipped to every user, printing a
 *   parse error on every turn — so a hook command that cannot be parsed is a
 *   finding, not a shrug
 *
 * THREE states per check, never two. `unscannable` is the one that earns its
 * keep: a file that could not be read or parsed must not report as clean.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PATTERNS } from './secret-patterns.mjs';

/** Severity of a finding. `block` fails a gate; `warn` is advisory. */
export const SEVERITIES = Object.freeze(['block', 'warn']);

/**
 * A hook command that fetches and executes is the supply-chain shape: whatever
 * that URL serves today runs on every session tomorrow. Matched as a pipeline
 * rather than by the presence of `curl`, because this repository legitimately
 * curls in tests and docs.
 */
const FETCH_EXEC = /\b(curl|wget)\b[^|;&]*\|[^|;&]*\b(sh|bash|zsh|node|python3?)\b/;

/** Interpreters and shells an MCP server may legitimately be. Anything else is
 *  not forbidden — it is UNRECOGNISED, which is a different word on purpose. */
const KNOWN_MCP_COMMANDS = Object.freeze(['node', 'npx', 'python', 'python3', 'uvx', 'deno', 'bun', 'sh', 'bash']);

/**
 * Does this string carry a literal secret?
 *
 * Reuses the shipped scanner rather than a second copy of the patterns — a
 * second list is a list that drifts, and this one already learned that `\b`
 * before `secret_access_key` cannot match `aws_secret_access_key`.
 */
export function secretsIn(text) {
  const out = [];
  for (const rule of PATTERNS) {
    if (rule.regex.test(String(text ?? ''))) out.push({ name: rule.name, severity: rule.severity });
    rule.regex.lastIndex = 0;
  }
  return out;
}

/**
 * Scan hook commands.
 *
 * @param {object|null} hooks the manifest's `hooks` object, or null if absent
 * @returns {{state:'ok'|'findings'|'unscannable', findings:object[], scanned:number, why:string}}
 */
export function scanHooks(hooks) {
  if (hooks == null) {
    return { state: 'unscannable', findings: [], scanned: 0, why: 'no hooks block was given — absent is not the same as empty' };
  }
  if (typeof hooks !== 'object') {
    return { state: 'unscannable', findings: [], scanned: 0, why: `hooks is ${typeof hooks}, not an object` };
  }
  const findings = [];
  let scanned = 0;
  const walk = (node, at) => {
    if (Array.isArray(node)) { node.forEach((n, i) => walk(n, `${at}[${i}]`)); return; }
    if (!node || typeof node !== 'object') return;
    if (typeof node.command === 'string') {
      scanned += 1;
      const cmd = node.command;
      if (FETCH_EXEC.test(cmd)) {
        findings.push({ severity: 'block', at, rule: 'fetch-exec', detail: 'downloads and pipes into an interpreter — whatever that URL serves runs on every session' });
      }
      for (const s of secretsIn(cmd)) {
        findings.push({ severity: 'block', at, rule: 'secret-in-hook', detail: `${s.name} appears literally in a hook command` });
      }
      // A hook that swallows its own exit code cannot block. Advisory, because
      // an advisory hook may legitimately do this — a formatter that dies must
      // not stop a write. The point is that it is VISIBLE.
      if (/\|\|\s*true\s*$/.test(cmd.trim())) {
        findings.push({ severity: 'warn', at, rule: 'cannot-fail', detail: 'ends in `|| true`, so a non-zero exit never reaches the host — this hook cannot block' });
      }
    }
    for (const [k, v] of Object.entries(node)) if (k !== 'command') walk(v, `${at}.${k}`);
  };
  walk(hooks, 'hooks');
  return { state: findings.length ? 'findings' : 'ok', findings, scanned, why: '' };
}

/**
 * Scan MCP server definitions: what binary starts, with what arguments, and
 * whether a secret is written into the config rather than referenced.
 */
export function scanMcpServers(servers) {
  if (servers == null) {
    return { state: 'unscannable', findings: [], scanned: 0, why: 'no mcpServers block was given' };
  }
  const findings = [];
  let scanned = 0;
  for (const [name, def] of Object.entries(servers)) {
    scanned += 1;
    const at = `mcpServers.${name}`;
    if (!def || typeof def !== 'object') {
      findings.push({ severity: 'warn', at, rule: 'unreadable-server', detail: 'the definition is not an object' });
      continue;
    }
    const cmd = String(def.command ?? '');
    if (!cmd) {
      findings.push({ severity: 'warn', at, rule: 'no-command', detail: 'declares no command' });
    } else if (!KNOWN_MCP_COMMANDS.includes(path.basename(cmd))) {
      findings.push({ severity: 'warn', at, rule: 'unrecognised-command', detail: `starts \`${cmd}\`, which is not one of ${KNOWN_MCP_COMMANDS.join(', ')} — unrecognised, not forbidden: judge it` });
    }
    const argv = Array.isArray(def.args) ? def.args.join(' ') : '';
    if (FETCH_EXEC.test(`${cmd} ${argv}`)) {
      findings.push({ severity: 'block', at, rule: 'fetch-exec', detail: 'the server command downloads and executes' });
    }
    // `${VAR}` is a reference. A value that is not a reference and looks like a
    // key is the incident this repository has already had.
    for (const [k, v] of Object.entries(def.env ?? {})) {
      const val = String(v ?? '');
      if (/^\$\{[^}]+\}$/.test(val)) continue;
      for (const s of secretsIn(val)) {
        findings.push({ severity: 'block', at: `${at}.env.${k}`, rule: 'secret-in-config', detail: `${s.name} is written literally instead of referenced as \${${k}}` });
      }
    }
  }
  return { state: findings.length ? 'findings' : 'ok', findings, scanned, why: '' };
}

/** Scan agent frontmatter for secrets written into a file the model reads. */
export function scanAgentFiles(dir, { read = readFileSync, list = readdirSync } = {}) {
  let names;
  try { names = list(dir).filter((f) => f.endsWith('.md')); }
  catch (e) { return { state: 'unscannable', findings: [], scanned: 0, why: `cannot list ${dir}: ${e.message}` }; }

  const findings = [];
  let scanned = 0;
  for (const f of names.sort()) {
    let src;
    try { src = String(read(path.join(dir, f), 'utf8')); }
    catch (e) { findings.push({ severity: 'warn', at: f, rule: 'unreadable', detail: e.message }); continue; }
    scanned += 1;
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src);
    if (!fm) { findings.push({ severity: 'warn', at: f, rule: 'no-frontmatter', detail: 'no frontmatter block' }); continue; }
    for (const s of secretsIn(fm[1])) {
      findings.push({ severity: 'block', at: `${f} (frontmatter)`, rule: 'secret-in-agent', detail: `${s.name} — a key here reaches every transcript that loads this agent, and revocation is the only fix` });
    }
  }
  return { state: findings.length ? 'findings' : 'ok', findings, scanned, why: '' };
}

/**
 * The whole surface. Each section keeps its own state, so one unscannable file
 * cannot make the rest report clean and cannot make them report broken.
 */
export function shieldReport({ manifestPath, agentsDir }) {
  const sections = {};
  let manifest = null;
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); }
  catch (e) {
    sections.manifest = { state: 'unscannable', findings: [], scanned: 0, why: `cannot read ${manifestPath}: ${e.message}` };
  }
  if (manifest) {
    sections.hooks = scanHooks(manifest.hooks ?? null);
    sections.mcp = scanMcpServers(manifest.mcpServers ?? null);
  }
  sections.agents = existsSync(agentsDir)
    ? scanAgentFiles(agentsDir)
    : { state: 'unscannable', findings: [], scanned: 0, why: `${agentsDir} does not exist` };

  const all = Object.values(sections).flatMap((s) => s.findings);
  const blocking = all.filter((f) => f.severity === 'block');
  const unscannable = Object.entries(sections).filter(([, s]) => s.state === 'unscannable').map(([k]) => k);

  return {
    // THREE states for the whole report, and `unscannable` is not `ok`: a scan
    // that could not look must not be reported as a scan that looked and found
    // nothing.
    state: blocking.length ? 'blocked' : unscannable.length ? 'unscannable' : 'ok',
    sections, findings: all, blocking, unscannable,
  };
}

/** One line per finding, for a human or a gate log. */
export function formatShield(r) {
  const lines = [];
  for (const f of r.findings) lines.push(`  ${f.severity.toUpperCase()} ${f.at} [${f.rule}] ${f.detail}`);
  for (const s of r.unscannable) lines.push(`  UNSCANNABLE ${s} — ${r.sections[s].why}`);
  const counts = Object.entries(r.sections).map(([k, s]) => `${k}:${s.scanned}`).join(' ');
  lines.push(`agent-shield: ${r.state} — ${r.findings.length} finding(s), ${r.blocking.length} blocking (scanned ${counts})`);
  return lines.join('\n');
}
