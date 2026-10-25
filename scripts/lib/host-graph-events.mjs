/** Host observations are metadata, never controller approval or execution authority. */
import { createHash } from 'node:crypto';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value) ? value : null;
const version = value => typeof value === 'string' && /^\d{1,5}(?:\.\d{1,5}){0,3}(?:[-+][a-zA-Z0-9.-]{1,32})?$/.test(value) ? value : null;
const hosts = new Set(['codex', 'claude-code']);
const modes = new Set(['controlled', 'native']);
const timestamp = value => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

/** Supported event families do not attest that a particular run was fully observed. */
export function hostGraphCapabilities({ host, mode, sourceVersion } = {}) {
  const known = false; // Version compatibility is established by the collector's capability audit, never semver syntax alone.
  return { lifecycle: known ? 'supported' : 'unknown', tools: known ? 'supported' : 'unknown',
    parentChild: known ? 'supported' : 'unknown', verification: 'unsupported', gates: 'unsupported', artifacts: 'unsupported' };
}

function toolClass(name) {
  if (typeof name !== 'string') return 'other';
  if (/^(?:mcp__|mcp:)/.test(name)) return 'mcp';
  const classes = { Bash: 'shell', shell: 'shell', command_execution: 'shell', Read: 'read', read_file: 'read',
    Edit: 'write', Write: 'write', MultiEdit: 'write', apply_patch: 'write', file_change: 'write',
    Glob: 'search', Grep: 'search', WebSearch: 'search', web_search: 'search',
    Agent: 'agent', Task: 'agent', collab_tool_call: 'agent', mcp_tool_call: 'mcp' };
  return Object.hasOwn(classes, name) ? classes[name] : 'other';
}
const opaque = value => typeof value === 'string' && value.length > 0 && value.length <= 512 ? hash(value) : null;
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const codexTrackedItems = new Set(['command_execution', 'file_change', 'mcp_tool_call', 'web_search', 'collab_tool_call']);
function ignoredClaudeBlock(block) {
  if (!record(block)) return false;
  return (block.type === 'text' && typeof block.text === 'string')
    || (block.type === 'thinking' && typeof block.thinking === 'string')
    || (block.type === 'redacted_thinking' && typeof block.data === 'string');
}
function ignoredPayload(host, mode, raw) {
  if (host === 'codex' && !(mode === 'native' && raw.hook_event_name)) {
    if (!['item.started', 'item.updated', 'item.completed'].includes(raw.type) || !record(raw.item) || !opaque(raw.item.id)) return false;
    const item = raw.item;
    if (raw.type === 'item.updated' && codexTrackedItems.has(item.type)) return true;
    if (['agent_message', 'reasoning'].includes(item.type)) return typeof item.text === 'string';
    return item.type === 'todo_list' && Array.isArray(item.items)
      && item.items.every(value => record(value) && typeof value.text === 'string' && typeof value.completed === 'boolean');
  }
  if (host !== 'claude-code') return false;
  if (['assistant', 'user'].includes(raw.type)) {
    const content = raw.message?.content;
    return Array.isArray(content) && content.length > 0 && content.every(ignoredClaudeBlock);
  }
  // These advisory frames carry no graph lifecycle or causal relationship.
  if (raw.type === 'system' && raw.subtype === 'status') return raw.status === null || raw.status === 'compacting';
  if (raw.type === 'system' && raw.subtype === 'compact_boundary') return record(raw.compact_metadata)
    && ['manual', 'auto'].includes(raw.compact_metadata.trigger) && Number.isSafeInteger(raw.compact_metadata.pre_tokens) && raw.compact_metadata.pre_tokens >= 0;
  return raw.type === 'rate_limit_event' && record(raw.rate_limit_info)
    && ['allowed', 'allowed_warning', 'rejected'].includes(raw.rate_limit_info.status);
}
function codexEvent(raw) {
  if (raw.type === 'thread.started') return { kind: 'session', phase: 'started', source: raw.thread_id };
  if (raw.type === 'turn.started') return { kind: 'turn', phase: 'started' };
  if (raw.type === 'turn.completed') return { kind: 'turn', phase: 'completed', outcome: 'succeeded' };
  if (raw.type === 'turn.failed') return { kind: 'turn', phase: 'failed', outcome: 'failed' };
  if (raw.type === 'error') return { kind: 'error', phase: 'failed', outcome: 'failed' };
  if (!['item.started', 'item.completed'].includes(raw.type) || !raw.item || typeof raw.item !== 'object') return null;
  const item = raw.item;
  if (!codexTrackedItems.has(item.type)) return null;
  const status = String(item.status || '').toLowerCase();
  const started = raw.type === 'item.started';
  const outcome = started ? 'unknown' : ['failed', 'errored'].includes(status) || (Number.isInteger(item.exit_code) && item.exit_code !== 0) ? 'failed'
    : ['declined', 'cancelled', 'canceled', 'interrupted'].includes(status) ? 'cancelled' : status === 'completed' ? 'succeeded' : 'unknown';
  return { kind: item.type === 'collab_tool_call' ? 'child' : 'tool', phase: started ? 'started' : outcome === 'failed' ? 'failed' : 'completed',
    outcome, source: item.id, toolClass: toolClass(item.type) };
}
function claudeEvent(raw) {
  const hook = raw.hook_event_name;
  const hooks = {
    SessionStart: { kind: 'session', phase: 'started' }, SessionEnd: { kind: 'session', phase: 'stopped' },
    UserPromptSubmit: { kind: 'turn', phase: 'started' }, Stop: { kind: 'turn', phase: 'stopped' },
    PreToolUse: { kind: 'tool', phase: 'started' }, PostToolUse: { kind: 'tool', phase: 'completed', outcome: 'succeeded' },
    PostToolUseFailure: { kind: 'tool', phase: 'failed', outcome: 'failed' },
    SubagentStart: { kind: 'child', phase: 'started' }, SubagentStop: { kind: 'child', phase: 'stopped' },
  };
  if (Object.hasOwn(hooks, hook || '')) return { ...hooks[hook], source: raw.tool_use_id || raw.agent_id || raw.event_id,
    toolClass: hooks[hook].kind === 'tool' ? toolClass(raw.tool_name) : hooks[hook].kind === 'child' ? 'agent' : null };
  if (raw.type === 'system' && raw.subtype === 'init') return { kind: 'session', phase: 'started', source: raw.session_id };
  if (raw.type === 'result') return { kind: 'turn', phase: raw.is_error === true ? 'failed' : 'completed',
    outcome: raw.is_error === true ? 'failed' : raw.is_error === false || raw.subtype === 'success' ? 'succeeded' : 'unknown', source: raw.uuid };
  if (!['assistant', 'user'].includes(raw.type)) return null;
  const content = raw.message?.content;
  if (!Array.isArray(content) || content.length !== 1 || !record(content[0])) return null;
  const b = content[0];
  if (b.type === 'tool_use' ? !opaque(b.id) || typeof b.name !== 'string' || !b.name.length
    : b.type === 'tool_result' ? !opaque(b.tool_use_id) || (b.is_error !== undefined && typeof b.is_error !== 'boolean') : true) return null;
  return b.type === 'tool_use' ? { kind: 'tool', phase: 'started', source: b.id, toolClass: toolClass(b.name) }
    : { kind: 'tool', phase: b.is_error === true ? 'failed' : 'completed', outcome: b.is_error === true ? 'failed' : b.is_error === false ? 'succeeded' : 'unknown', source: b.tool_use_id, toolClass: 'other' };
}

/** Bindings come from the operator-owned collector, not fields inside the host payload. */
export function normalizeHostEvent({ host, mode, sourceVersion, event: raw, binding } = {}) {
  const capabilities = hostGraphCapabilities({ host, mode, sourceVersion });
  const rejected = reason => ({ event: null, diagnostics: [reason], capabilities });
  if (!hosts.has(host) || !modes.has(mode)) return rejected('unsupported-host-or-mode');
  if (!binding || !safeId(binding.projectId) || !safeId(binding.runId) || !safeId(binding.sessionId)
    || (binding.attemptId != null && !safeId(binding.attemptId))) return rejected('invalid-trusted-binding');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return rejected('invalid-event');
  if (ignoredPayload(host, mode, raw)) return { event: null, diagnostics: [], capabilities };
  const hookShape = mode === 'native' && typeof raw.hook_event_name === 'string';
  const parsed = host === 'codex' && !hookShape ? codexEvent(raw) : claudeEvent(raw);
  if (!parsed) return rejected('unsupported-event-shape');
  const parents = binding.parentIds ?? [];
  if (!Array.isArray(parents) || parents.length > 16 || parents.some(p => !safeId(p))) return rejected('invalid-trusted-parents');
  const diagnostics = [];
  if (parsed.kind === 'child' && !parents.length) diagnostics.push('missing-explicit-parent');
  const sequence = Number.isSafeInteger(binding.sequence) && binding.sequence >= 0 ? binding.sequence : null;
  const rawSourceId = binding.sourceEventId ?? parsed.source ?? binding.turnId ?? null;
  const sourceEventId = opaque(rawSourceId);
  if (rawSourceId != null && !sourceEventId) diagnostics.push('missing-source-event-identity');
  if (!sourceEventId && sequence === null && (['tool', 'child'].includes(parsed.kind) || (parsed.kind === 'turn' && binding.attemptId == null))) diagnostics.push('missing-source-event-identity');
  if (!version(sourceVersion)) diagnostics.push('source-version-unverified');
  const event = { schemaVersion: 1, projectId: binding.projectId, runId: binding.runId, sessionId: binding.sessionId,
    attemptId: binding.attemptId ?? null, host, mode, sourceVersion: version(sourceVersion), sourceEventId, sequence,
    kind: parsed.kind, phase: parsed.phase, outcome: parsed.outcome || 'unknown', parentIds: [...new Set(parents)],
    occurredAt: timestamp(raw.timestamp ?? raw.at), toolClass: parsed.toolClass ?? null,
    callId: ['tool', 'child'].includes(parsed.kind) ? opaque(parsed.source ?? binding.sourceEventId ?? null) : null };
  // Collector wall clock is excluded: replaying an identical source event is idempotent.
  return { event: { ...event, id: hash(event), observedAt: new Date().toISOString() }, diagnostics: [...new Set(diagnostics)], capabilities };
}

/** A streamed Claude message may carry several independent tool blocks. */
export function normalizeHostEvents(input = {}) {
  const content = input.event?.message?.content;
  if (input.host !== 'claude-code' || !['assistant', 'user'].includes(input.event?.type) || !Array.isArray(content)) {
    const result = normalizeHostEvent(input);
    return { events: result.event ? [result.event] : [], diagnostics: result.diagnostics, capabilities: result.capabilities };
  }
  if (!content.length) return { events: [], diagnostics: ['unsupported-event-shape'], capabilities: hostGraphCapabilities(input) };
  const results = content.map(block => normalizeHostEvent({ ...input,
    event: { ...input.event, message: { content: [block] } } }));
  return { events: results.flatMap(r => r.event ? [r.event] : []),
    diagnostics: [...new Set(results.flatMap(r => r.diagnostics))], capabilities: hostGraphCapabilities(input) };
}
