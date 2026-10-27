/** Inactive ADR-046 native entrypoint. Env-only config; no implicit file authority. */
import { performance } from 'node:perf_hooks';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const MAX_WIRE_BYTES = 1048576;
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
export const ROUTER_TOOLS = freeze([
  {
    "name": "ask_kimi",
    "description": "Delegate a non-critical task to Kimi (or configured cheap model) via OpenRouter. Use for log triage, summarization, routine doc drafting, POC-mode smoke test generation, and similar tasks where speed and cost matter more than absolute quality. Do NOT use for: architecture decisions, security analysis, production code generation, threat modeling. If OPENROUTER_API_KEY is unset, returns a fallback signal \u2014 caller must then do the task natively.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "task": {
          "type": "string",
          "description": "The task / question to delegate. Be specific."
        },
        "context": {
          "type": "string",
          "description": "Optional context (logs, code snippet, file content). Keep under ~20k chars."
        },
        "system": {
          "type": "string",
          "description": "Optional system prompt override. Defaults to a pragmatic engineer persona."
        }
      },
      "required": [
        "task"
      ]
    }
  },
  {
    "name": "router_status",
    "description": "Report native router configuration without contacting a provider; this does not measure provider health.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    }
  }
]);
export const ROUTER_INFO = Object.freeze({ name: 'great_cto-llm-router', version: '1.0.0' });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const failure = error => ({ error, fallback: 'caller must use native reasoning for this non-critical task' });
const envKeys = ['OPENROUTER_API_KEY', 'GREAT_CTO_ROUTER_MODEL', 'GREAT_CTO_ROUTER_MAX_TOKENS', 'GREAT_CTO_ROUTER_TIMEOUT', 'GREAT_CTO_ROUTER_TEMPERATURE'];
const integer = (value, fallback, max) => {
  if (value === undefined || value === '') return fallback;
  if (typeof value !== 'string' || !/^[+]?\d+$/.test(value.trim())) throw Error('router configuration refused');
  const n = Number(value); if (!Number.isSafeInteger(n) || n < 1 || n > max) throw Error('router configuration refused'); return n;
};
export function nativeRouterConfig(env = {}) {
  const key = env.OPENROUTER_API_KEY || '';
  const model = env.GREAT_CTO_ROUTER_MODEL || 'moonshotai/kimi-k2-0905';
  const temperature = Number(env.GREAT_CTO_ROUTER_TEMPERATURE || '0');
  if (typeof key !== 'string' || (key && (key.length < 8 || key.length > 8192 || /[^\x21-\x7e]/.test(key))) ||
      typeof model !== 'string' || model.length > 256 || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.:/-]+$/.test(model) ||
      (key && model.includes(key)) || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw Error('router configuration refused');
  return { key, model, temperature, maxTokens: integer(env.GREAT_CTO_ROUTER_MAX_TOKENS, 4096, 1048576), timeoutMs: integer(env.GREAT_CTO_ROUTER_TIMEOUT, 60, 180) * 1000 };
}
const redact = (text, key) => key ? text.split(key).join('[redacted]') : text;
function usageOf(value) {
  if (value === undefined || value === null) return { prompt_tokens: null, completion_tokens: null, total_tokens: null };
  if (!object(value)) throw Error('invalid provider usage');
  const result = {};
  for (const name of ['prompt_tokens', 'completion_tokens', 'total_tokens']) {
    const n = value[name]; if (n !== undefined && n !== null && (!Number.isSafeInteger(n) || n < 0)) throw Error('invalid provider usage'); result[name] = n ?? null;
  }
  if (Object.values(result).every(n => n !== null) && result.prompt_tokens + result.completion_tokens !== result.total_tokens) throw Error('invalid provider usage');
  return result;
}
function abortable(promise, signal) {
  return new Promise((yes, no) => {
    const abort = () => { clean(); no(Error('aborted')); }, clean = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(value => { clean(); yes(value); }, error => { clean(); no(error); });
    if (signal.aborted) abort();
  });
}
async function boundedJson(response, signal) {
  if (!response.body || typeof response.body.getReader !== 'function') throw Error('invalid provider response');
  const reader = response.body.getReader(), chunks = []; let size = 0, completed = false;
  try {
    while (true) {
      const part = await abortable(reader.read(), signal); if (part.done) { completed = true; break; }
      const bytes = Buffer.from(part.value); size += bytes.length;
      if (size > MAX_WIRE_BYTES) throw Error('provider response too large'); chunks.push(bytes);
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } finally { try { if (!completed) await abortable(reader.cancel(), signal); } finally { reader.releaseLock(); } }
}
export function createNativeRouter({ environment = {}, fetchImpl = globalThis.fetch, recordUsage = null, now = () => performance.now() } = {}) {
  const env = Object.fromEntries(envKeys.filter(key => Object.hasOwn(environment, key)).map(key => [key, environment[key]]));
  if (typeof fetchImpl !== 'function' || (recordUsage !== null && typeof recordUsage !== 'function') || typeof now !== 'function') throw Error('invalid native router constructor');
  async function ask(args, cfg, external) {
    const task = args.task;
    if (typeof task !== 'string' || !task.trim() || (args.context !== undefined && typeof args.context !== 'string') || (args.system !== undefined && typeof args.system !== 'string')) return { payload: failure('task must be non-empty and context/system must be strings') };
    if (!cfg.key) return { payload: { ...failure('OPENROUTER_API_KEY not set'), setup_hint: 'Provide OPENROUTER_API_KEY through the explicitly selected operator environment.' } };
    const start = now(), deadline = start + cfg.timeoutMs, control = new AbortController();
    const abort = () => control.abort(); if (external?.aborted) abort(); else external?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, cfg.timeoutMs);
    let usage = null, callbackCompleted = false;
    const meta = () => ({ authority: 'NONE', requestedModel: cfg.model, usage, usageAccounting: recordUsage ? (callbackCompleted ? 'callback-completed-not-attested' : 'callback-not-completed') : 'not-configured' });
    const late = () => control.signal.aborted || now() >= deadline;
    const refused = reason => { control.abort(); return { payload: failure(reason), meta: meta() }; };
    try {
      if (late()) return refused(external?.aborted ? 'router request aborted' : 'router deadline exceeded');
      const body = JSON.stringify({ model: cfg.model, max_tokens: cfg.maxTokens, temperature: cfg.temperature, messages: [
        { role: 'system', content: args.system || 'You are a pragmatic senior engineer. Be concise. Output plain text unless the task explicitly asks for structured format.' },
        { role: 'user', content: args.context ? task.trim() + '\n\n--- CONTEXT ---\n' + args.context : task.trim() },
      ] });
      if (Buffer.byteLength(body) > MAX_WIRE_BYTES) return refused('router request too large');
      if (late()) return refused(external?.aborted ? 'router request aborted' : 'router deadline exceeded');
      const response = await abortable(fetchImpl('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: {
        Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://github.com/avelikiy/great_cto', 'X-Title': 'great_cto',
      }, body, signal: control.signal }), control.signal);
      if (late()) return refused('router deadline exceeded');
      if (!response.ok) return refused('provider HTTP ' + (Number.isInteger(response.status) ? response.status : 'refused'));
      const data = await boundedJson(response, control.signal);
      if (!object(data)) return refused('invalid provider content');
      usage = usageOf(data.usage);
      if (recordUsage) {
        try { await recordUsage({ ts: Math.floor(Date.now() / 1000), model: cfg.model, ...usage, elapsed_s: Math.round((now() - start) / 10) / 100 }); callbackCompleted = true; }
        catch { return refused('usage evidence callback failed'); }
      }
      if (late()) return refused(external?.aborted ? 'router request aborted' : 'router deadline exceeded');
      if (!Array.isArray(data.choices) || !object(data.choices[0]?.message) || typeof data.choices[0].message.content !== 'string' || !data.choices[0].message.content.trim()) return refused('invalid provider content');
      const seconds = Math.round((now() - start) / 10) / 100;
      return { text: '[model=' + cfg.model + ' tokens=' + (usage.total_tokens ?? '?') + ' elapsed=' + seconds + 's]\n\n' + redact(data.choices[0].message.content, cfg.key), meta: meta() };
    } catch {
      return refused(late() ? (external?.aborted ? 'router request aborted' : 'router deadline exceeded') : 'provider response refused');
    } finally { clearTimeout(timer); external?.removeEventListener('abort', abort); }
  }
  return Object.freeze({
    async handle(request, { signal } = {}) {
      if (!object(request) || request.id === undefined || request.id === null) return null;
      const id = request.id;
      if (!['string', 'number'].includes(typeof id) || (typeof id === 'number' && !Number.isFinite(id))) return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'invalid request id' } };
      const reply = result => ({ jsonrpc: '2.0', id, result });
      const error = message => ({ jsonrpc: '2.0', id, error: { code: -32000, message } });
      if (request.method === 'initialize') return reply({ protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: ROUTER_INFO });
      if (request.method === 'tools/list') return reply({ tools: ROUTER_TOOLS });
      if (request.method === 'ping') return reply({});
      if (request.method !== 'tools/call') return error('unknown method');
      const params = request.params; if (!object(params)) return error('invalid tool request');
      let cfg; try { cfg = nativeRouterConfig(env); } catch { return error('router configuration refused'); }
      if (params.name === 'router_status') return reply({ content: [{ type: 'text', text: JSON.stringify({ configured: !!cfg.key, model: cfg.model, mode: 'native-env-only' }) }] });
      if (params.name !== 'ask_kimi') return error('unknown tool');
      if (params.arguments !== undefined && !object(params.arguments)) return error('invalid tool arguments');
      const result = await ask(params.arguments || {}, cfg, signal);
      return reply({ content: [{ type: 'text', text: result.text ?? JSON.stringify(result.payload) }], ...(result.meta ? { _meta: result.meta } : {}) });
    },
  });
}
export async function writeRouterReply(output, reply) {
  if (reply === null) return;
  if (!output.write(JSON.stringify(reply) + '\n')) await once(output, 'drain');
}
export async function serveNativeRouter({ input = process.stdin, output = process.stdout, environment = {}, signal } = {}) {
  const router = createNativeRouter({ environment }); let bytes = Buffer.alloc(0);
  const decode = chunk => { try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(chunk)); } catch { return null; } };
  const line = async chunk => { const request = decode(chunk); if (request) await writeRouterReply(output, await router.handle(request, { signal })); };
  for await (const chunk of input) {
    bytes = Buffer.concat([bytes, Buffer.from(chunk)]);
    let at;
    while ((at = bytes.indexOf(10)) !== -1) {
      const next = bytes.subarray(0, at); if (next.length > MAX_WIRE_BYTES) throw Error('router input too large');
      bytes = bytes.subarray(at + 1); if (signal?.aborted) return; await line(next);
    }
    if (bytes.length > MAX_WIRE_BYTES) throw Error('router input too large');
  }
  if (bytes.length && !signal?.aborted) await line(bytes);
}
async function main() {
  const controller = new AbortController(); let stopped = false;
  const stop = code => { stopped = true; process.exitCode = code; controller.abort(); process.stdin.destroy(); };
  const interrupt = () => stop(130), terminate = () => stop(143);
  process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
  try { await serveNativeRouter({ environment: process.env, signal: controller.signal }); }
  catch { if (!stopped) { process.exitCode = 1; process.stderr.write('native router input or transport refused\n'); } }
  finally { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', terminate); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
