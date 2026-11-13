#!/usr/bin/env node
/**
 * Owner-run check for docs/rfc/RESEARCH-cli-subscription-launch.md.
 *
 * Run from a plain terminal, NOT from inside a Claude Code session:
 *
 *   node docs/rfc/research-cli-subscription-check.mjs
 *
 * What it does: starts the installed `claude` CLI in print mode a few times
 * inside a throwaway fixture folder under the system temp directory and prints
 * one result table. It reads nothing from any project and writes nothing
 * outside the fixture folder.
 *
 * What it never does: it never prints, copies or moves a credential. It reports
 * only the credential TYPE the CLI says it used (`apiKeySource`, `authMethod`).
 *
 * Money: every call uses the `haiku` alias and `--max-budget-usd 0.25`. Under a
 * subscription login the calls draw from plan limits, not API money. The only
 * call that can spend API money is T4, and it runs only when you export a real
 * key as GCTO_TEST_API_KEY before starting the script (expected: a few cents).
 *
 * Optional: GCTO_CLAUDE_BIN=/path/to/claude to test a specific binary.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = process.env.GREAT_CTO_CLAUDE_BIN || process.env.GCTO_CLAUDE_BIN || 'claude';
const CAP = '0.25';
const MODEL = 'haiku';

if (process.env.CLAUDECODE || process.env.CLAUDE_CODE_ENTRYPOINT) {
  console.error('Refusing to run inside a Claude Code session. Open a plain terminal and run it there.');
  process.exit(2);
}

const fixture = mkdtempSync(join(tmpdir(), 'gcto-cli-subscription-'));
const emptyConfig = join(fixture, 'empty-config');
mkdirSync(emptyConfig);
writeFileSync(join(fixture, 'README.md'), '# fixture\n\nThe secret word of this fixture is PINEAPPLE.\n');

const CREDENTIAL_VARS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN'];
const preset = CREDENTIAL_VARS.filter(name => process.env[name]);
const realKey = process.env.GCTO_TEST_API_KEY || '';
const DUMMY_KEY = 'sk-ant-dummy-not-a-real-key';

/** Environment with every credential variable removed, plus the given extras. */
function cleanEnv(extra = {}) {
  const env = { ...process.env };
  for (const name of [...CREDENTIAL_VARS, 'GCTO_TEST_API_KEY']) delete env[name];
  return { ...env, ...extra };
}

function claude(args, { env = cleanEnv(), input = '' } = {}) {
  const run = spawnSync(BIN, args, { cwd: fixture, env, input, encoding: 'utf8', timeout: 180000, maxBuffer: 32 * 1024 * 1024 });
  return { exit: run.error ? `spawn error: ${run.error.code || run.error.message}` : run.status, signal: run.signal, out: run.stdout || '', err: run.stderr || '' };
}

function parseJson(text) {
  try { const body = JSON.parse(text); return Array.isArray(body) ? body : [body]; } catch { /* fall through */ }
  const events = [];
  for (const line of text.split('\n')) { if (!line.trim()) continue; try { events.push(JSON.parse(line)); } catch { /* not an event */ } }
  return events;
}

/** Keep only fields that cannot hold a credential. */
function summarize(run) {
  const events = parseJson(run.out);
  const init = events.find(e => e.type === 'system' && e.subtype === 'init');
  const result = events.find(e => e.type === 'result');
  const limits = events.filter(e => e.type === 'rate_limit_event').map(e => e.rate_limit_info || {});
  const firstLine = text => String(text || '').trim().split('\n')[0].slice(0, 200);
  return {
    exit: run.exit,
    types: [...new Set(events.map(e => (e.subtype ? `${e.type}/${e.subtype}` : e.type)))].join(', ') || '(no JSON)',
    apiKeySource: init?.apiKeySource ?? '(not reported)',
    subtype: result?.subtype ?? '(no result event)',
    isError: result?.is_error ?? '(n/a)',
    turns: result?.num_turns ?? '(n/a)',
    cost: result?.total_cost_usd ?? '(n/a)',
    sessionId: result?.session_id || init?.session_id || '',
    text: firstLine(typeof result?.result === 'string' ? result.result : ''),
    denials: Array.isArray(result?.permission_denials) ? result.permission_denials.length : '(n/a)',
    limits: limits.map(l => `${l.rateLimitType || '?'}:${l.status || '?'}`).join(', ') || '(none)',
    limitFields: [...new Set(limits.flatMap(l => Object.keys(l)))].join(', ') || '(none)',
    stderr: firstLine(run.err),
    stdoutHead: events.length ? '' : firstLine(run.out),
  };
}

const rows = [];
const row = (id, question, observed) => { rows.push({ id, question, observed }); console.error(`done ${id}`); };
const base = ['--model', MODEL, '--safe-mode', '--max-budget-usd', CAP];

// T0 — versions and login state (no model call).
{
  const version = claude(['--version']);
  const auth = claude(['auth', 'status', '--json']);
  let status = {};
  try { status = JSON.parse(auth.out); } catch { /* reported below */ }
  row('T0', 'CLI version and login state', `version=${version.out.trim()}; auth status exit=${auth.exit}; loggedIn=${status.loggedIn}; authMethod=${status.authMethod}; subscriptionType=${status.subscriptionType ?? '(none)'}; credential variables present in your shell: ${preset.join(', ') || 'none'}`);
}

// T1 — subscription login only, JSON output.
let firstSession = '';
{
  const s = summarize(claude(['-p', 'Remember the word PINEAPPLE. Reply with the single word OK.', '--output-format', 'json', ...base]));
  firstSession = s.sessionId;
  row('T1', 'Login only, no key: does print mode work, and what does the result carry', `exit=${s.exit}; subtype=${s.subtype}; is_error=${s.isError}; turns=${s.turns}; total_cost_usd=${s.cost}; session_id present=${Boolean(s.sessionId)}; reply="${s.text}"`);
}

// T2 — stream-json: credential type and rate-limit events.
{
  const s = summarize(claude(['-p', 'Reply with the single word OK.', '--output-format', 'stream-json', '--verbose', '--no-session-persistence', ...base]));
  row('T2', 'stream-json under the login: event types, credential type, limit events', `exit=${s.exit}; events=[${s.types}]; init.apiKeySource=${s.apiKeySource}; rate_limit_event=[${s.limits}]; rate_limit_info fields=[${s.limitFields}]; total_cost_usd=${s.cost}`);
}

// T3 — login AND an invalid key in the environment. An auth error means the key won.
{
  const s = summarize(claude(['-p', 'Reply with the single word OK.', '--output-format', 'stream-json', '--verbose', '--no-session-persistence', ...base], { env: cleanEnv({ ANTHROPIC_API_KEY: DUMMY_KEY }) }));
  const verdict = s.isError === true || s.exit !== 0 ? 'the environment key was used (call failed with the invalid key)' : 'the subscription login was used (call succeeded despite the invalid key)';
  row('T3', 'Login + ANTHROPIC_API_KEY (invalid dummy): which credential wins', `${verdict}; exit=${s.exit}; init.apiKeySource=${s.apiKeySource}; subtype=${s.subtype}; is_error=${s.isError}; message="${s.text || s.stderr || s.stdoutHead}"`);
}

// T4 — login AND a real key (optional).
if (realKey) {
  const s = summarize(claude(['-p', 'Reply with the single word OK.', '--output-format', 'stream-json', '--verbose', '--no-session-persistence', ...base], { env: cleanEnv({ ANTHROPIC_API_KEY: realKey }) }));
  row('T4', 'Login + real ANTHROPIC_API_KEY: which credential wins', `exit=${s.exit}; init.apiKeySource=${s.apiKeySource}; rate_limit_event=[${s.limits}]; total_cost_usd=${s.cost}; is_error=${s.isError}`);
} else {
  row('T4', 'Login + real ANTHROPIC_API_KEY: which credential wins', 'skipped: export GCTO_TEST_API_KEY=<a real key> before running to include it');
}

// T5 — no login at all: what the caller sees.
{
  const env = cleanEnv({ CLAUDE_CONFIG_DIR: emptyConfig });
  const auth = claude(['auth', 'status', '--json'], { env });
  const s = summarize(claude(['-p', 'Reply with the single word OK.', '--output-format', 'json', ...base], { env }));
  row('T5', 'No login, no key (empty config directory): exit code and message', `auth status exit=${auth.exit}; print exit=${s.exit}; subtype=${s.subtype}; is_error=${s.isError}; message="${s.text || s.stderr || s.stdoutHead}"`);
}

// T6 — no login, invalid key: the "bad key" signature.
{
  const env = cleanEnv({ CLAUDE_CONFIG_DIR: emptyConfig, ANTHROPIC_API_KEY: DUMMY_KEY });
  const auth = claude(['auth', 'status', '--json'], { env });
  const s = summarize(claude(['-p', 'Reply with the single word OK.', '--output-format', 'json', ...base], { env }));
  row('T6', 'No login + invalid key: exit code and message', `auth status exit=${auth.exit} (the probe does not validate the key); print exit=${s.exit}; subtype=${s.subtype}; is_error=${s.isError}; message="${s.text || s.stderr || s.stdoutHead}"`);
}

// T7 — --bare under a subscription login (documented: OAuth and keychain are never read).
{
  const s = summarize(claude(['-p', 'Reply with the single word OK.', '--bare', '--output-format', 'json', '--model', MODEL, '--max-budget-usd', CAP]));
  row('T7', '--bare with the login only: does it refuse the subscription', `exit=${s.exit}; subtype=${s.subtype}; is_error=${s.isError}; message="${s.text || s.stderr || s.stdoutHead}"`);
}

// T8 — turn cap.
{
  const s = summarize(claude(['-p', 'Read README.md with the Read tool, then tell me the secret word.', '--max-turns', '1', '--tools', 'Read', '--permission-mode', 'dontAsk', '--output-format', 'json', '--no-session-persistence', ...base]));
  row('T8', '--max-turns 1 on a task that needs a tool call', `exit=${s.exit}; subtype=${s.subtype}; is_error=${s.isError}; turns=${s.turns}; total_cost_usd=${s.cost}`);
}

// T9 — money cap under a subscription.
{
  const s = summarize(claude(['-p', 'Read README.md with the Read tool, then tell me the secret word.', '--model', MODEL, '--safe-mode', '--max-budget-usd', '0.0001', '--tools', 'Read', '--permission-mode', 'dontAsk', '--output-format', 'json', '--no-session-persistence']));
  row('T9', '--max-budget-usd 0.0001 under the login: is the cap enforced', `exit=${s.exit}; subtype=${s.subtype}; is_error=${s.isError}; turns=${s.turns}; total_cost_usd=${s.cost}; message="${s.text || s.stderr}"`);
}

// T10 — tool and permission limits: the agent must not be able to write.
{
  const target = join(fixture, 'must-not-exist.txt');
  const s = summarize(claude(['-p', 'Create the file must-not-exist.txt containing the word hello. Use any tool you have.', '--tools', 'Read,Glob,Grep', '--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--output-format', 'json', '--no-session-persistence', ...base]));
  row('T10', '--tools Read,Glob,Grep + dontAsk: can the run write a file', `file created=${existsSync(target)}; exit=${s.exit}; subtype=${s.subtype}; permission_denials=${s.denials}; turns=${s.turns}`);
}

// T11 — resume by session id.
if (firstSession) {
  const s = summarize(claude(['-p', 'Which word did I ask you to remember? Reply with that word only.', '--resume', firstSession, '--output-format', 'json', ...base]));
  row('T11', '--resume <session id from T1>: is the context kept', `exit=${s.exit}; subtype=${s.subtype}; same session id=${s.sessionId === firstSession}; remembered=${/PINEAPPLE/i.test(s.text)}; reply="${s.text}"`);
} else {
  row('T11', '--resume <session id from T1>: is the context kept', 'skipped: T1 returned no session id');
}

console.log(`\nFixture folder (safe to delete): ${fixture}\n`);
console.log('| Test | Question | Observed |');
console.log('|---|---|---|');
for (const r of rows) console.log(`| ${r.id} | ${r.question} | ${String(r.observed).replace(/\|/g, '\\|')} |`);
console.log('\nNot covered by this script: a real limit refusal (it cannot be produced cheaply). Compare `/usage` in an interactive `claude` before and after the run to see the plan usage move.');
