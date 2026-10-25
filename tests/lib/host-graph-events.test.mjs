import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHostEvent, hostGraphCapabilities } from '../../scripts/lib/host-graph-events.mjs';

const binding = { projectId: 'project:fixture', runId: 'run-1', sessionId: 'session-1', attemptId: 'attempt-1' };
const normalize = (host, event, extra = {}) => normalizeHostEvent({ host, mode: 'controlled', sourceVersion: '1.2.3', binding, event, ...extra });

test('normalizes Codex lifecycle without exposing raw session identifiers', () => {
  const started = normalize('codex', { type: 'thread.started', thread_id: 'private-thread' });
  assert.equal(started.event.kind, 'session'); assert.equal(started.event.phase, 'started');
  assert.equal(started.event.sessionId, binding.sessionId);
  assert.equal(started.event.projectId, binding.projectId);
  assert(!JSON.stringify(started).includes('private-thread'));
  assert.equal(normalize('codex', { type: 'turn.completed' }).event.outcome, 'succeeded');
  assert.equal(normalize('codex', { type: 'turn.failed', error: { message: 'secret' } }).event.outcome, 'failed');
});

test('tool identities deduplicate replay and distinguish calls and lifecycle phases', () => {
  const raw = { type: 'item.completed', item: { type: 'command_execution', id: 'call-1', status: 'completed', exit_code: 0 } };
  const first = normalize('codex', raw).event;
  assert.equal(first.id, normalize('codex', raw).event.id);
  assert.notEqual(first.id, normalize('codex', { ...raw, item: { ...raw.item, id: 'call-2' } }).event.id);
  assert.notEqual(first.id, normalize('codex', { ...raw, type: 'item.started' }).event.id);
  assert.equal(first.toolClass, 'shell'); assert.equal(first.outcome, 'succeeded');
});

test('unknown tool outcomes do not become success and nonzero exits remain failures', () => {
  const call = { type: 'item.completed', item: { id: 'call', type: 'command_execution', status: 'future-status' } };
  assert.equal(normalize('codex', call).event.outcome, 'unknown');
  assert.equal(normalize('codex', { ...call, item: { ...call.item, status: 'completed', exit_code: 7 } }).event.outcome, 'failed');
});

test('Claude hook lifecycle and tool failures preserve identity and uncertainty', () => {
  const native = { mode: 'native' };
  assert.equal(normalize('claude-code', { hook_event_name: 'SessionStart' }, native).event.kind, 'session');
  assert.equal(normalize('claude-code', { hook_event_name: 'Stop' }, native).event.outcome, 'unknown');
  const raw = { hook_event_name: 'PostToolUseFailure', tool_use_id: 'call-1', tool_name: 'Bash', tool_input: { command: 'SECRET' }, error: 'SECRET' };
  const result = normalize('claude-code', raw, native);
  assert.equal(result.event.outcome, 'failed'); assert.equal(result.event.toolClass, 'shell');
  assert.equal(result.event.id, normalize('claude-code', raw, native).event.id);
  assert(!JSON.stringify(result).includes('SECRET'));
});

test('Claude stream tool use and result normalize separately without arguments or result text', () => {
  const start = normalize('claude-code', { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: '/private/secret' } }] } });
  assert.equal(start.event.kind, 'tool'); assert.equal(start.event.toolClass, 'read');
  const finish = normalize('claude-code', { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tool-1', is_error: true, content: 'secret' }] } });
  assert.equal(finish.event.outcome, 'failed');
  assert(!JSON.stringify(start).includes('/private/secret')); assert(!JSON.stringify(finish).includes('secret'));
});

test('only trusted parents may establish ancestry; missing child parents stay explicit', () => {
  const raw = { hook_event_name: 'SubagentStart', agent_id: 'private-agent', parentIds: ['injected'] };
  const result = normalize('claude-code', raw, { mode: 'native' });
  assert.deepEqual(result.event.parentIds, []); assert(result.diagnostics.includes('missing-explicit-parent'));
  const linked = normalize('claude-code', raw, { mode: 'native', binding: { ...binding, parentIds: ['event-parent'] } });
  assert.deepEqual(linked.event.parentIds, ['event-parent']);
  assert(!JSON.stringify(linked).includes('injected'));
});

test('unknown formats and invalid trusted bindings refuse normalization', () => {
  assert.equal(normalize('codex', { type: 'future.event', text: 'secret' }).event, null);
  assert.equal(normalize('unknown', { type: 'turn.started' }).event, null);
  assert.equal(normalize('codex', { type: 'turn.started' }, { binding: { ...binding, projectId: '/private/path' } }).event, null);
  assert.equal(normalize('codex', null).event, null);
});

test('native events cannot claim controller gates verification or artifact completeness', () => {
  for (const host of ['codex', 'claude-code']) {
    const capabilities = hostGraphCapabilities({ host, mode: 'native', sourceVersion: '1.2.3' });
    assert.equal(capabilities.gates, 'unsupported'); assert.equal(capabilities.verification, 'unsupported');
    assert.equal(capabilities.artifacts, 'unsupported');
  }
});

test('privacy allowlist rejects arbitrary labels while supporting MCP and call classification', () => {
  const raw = { type: 'item.completed', projectId: 'private-project', parent_id: 'injected', prompt: 'TOKEN', item: { id: '/private/name', type: 'mcp_tool_call', server: 'private-server', tool: 'private-tool', arguments: 'TOKEN', result: 'TOKEN', status: 'failed' } };
  const result = normalize('codex', raw);
  assert.equal(result.event.toolClass, 'mcp');
  for (const secret of ['private-project', '/private/name', 'private-server', 'private-tool', 'TOKEN', 'injected']) assert(!JSON.stringify(result).includes(secret));
});

test('batch normalization retains every Claude tool block and correlation identities', async () => {
  const { normalizeHostEvents } = await import('../../scripts/lib/host-graph-events.mjs');
  const result = normalizeHostEvents({ host: 'claude-code', mode: 'controlled', sourceVersion: '1.2.3', binding,
    event: { type: 'assistant', message: { content: [{ type: 'text', text: 'secret' }, { type: 'tool_use', id: 'one', name: 'Read' }, { type: 'tool_use', id: 'two', name: 'Grep' }] } } });
  assert.equal(result.events.length, 2); assert.notEqual(result.events[0].callId, result.events[1].callId);
  const finish = normalize('claude-code', { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'one', is_error: false }] } }).event;
  assert.equal(finish.callId, result.events[0].callId);
  assert(!JSON.stringify(result).includes('secret'));
});

test('batch does not collapse repeated turn events into claimed complete identity', () => {
  const raw = { hook_event_name: 'UserPromptSubmit' };
  const result = normalize('claude-code', raw, { mode: 'native', binding: { ...binding, attemptId: null } });
  assert(result.diagnostics.includes('missing-source-event-identity'));
  const first = normalize('claude-code', raw, { mode: 'native', binding: { ...binding, sequence: 1 } }).event;
  const next = normalize('claude-code', raw, { mode: 'native', binding: { ...binding, sequence: 2 } }).event;
  assert.notEqual(first.id, next.id);
});

test('tool classification never resolves inherited object properties', () => {
  const result = normalize('claude-code', { hook_event_name: 'PreToolUse', tool_use_id: 'call', tool_name: 'constructor' });
  assert.equal(result.event.toolClass, 'other');
});

test('syntactically numeric versions alone do not attest supported capabilities', () => {
  const result = normalize('codex', { type: 'turn.started' });
  assert.equal(result.capabilities.lifecycle, 'unknown');
  const missingVersion = normalize('codex', { type: 'turn.started' }, { sourceVersion: null });
  assert.equal(missingVersion.event.phase, 'started');
  assert(missingVersion.diagnostics.includes('source-version-unverified'));
});

test('native Codex hook observations preserve host and correlate tool lifecycle', () => {
  const native = { mode: 'native' };
  const start = normalize('codex', { hook_event_name: 'PreToolUse', tool_use_id: 'same-call', tool_name: 'Bash' }, native);
  const finish = normalize('codex', { hook_event_name: 'PostToolUseFailure', tool_use_id: 'same-call', tool_name: 'Bash' }, native);
  assert.equal(start.event.host, 'codex'); assert.equal(start.event.phase, 'started');
  assert.equal(finish.event.phase, 'failed'); assert.equal(finish.event.outcome, 'failed');
  assert.equal(start.event.callId, finish.event.callId);
  assert.equal(normalize('codex', { hook_event_name: 'SessionStart' }, native).event.kind, 'session');
  assert.equal(normalize('codex', { hook_event_name: 'SessionEnd' }, native).event.phase, 'stopped');
  assert.equal(normalize('codex', { hook_event_name: 'PreToolUse', tool_use_id: 'same-call' }).event, null, 'controlled Codex expects its JSON stream');
});

test('malformed source identities cannot collide through object string coercion', () => {
  for (const id of [{ first: 1 }, { second: 2 }, 42, '', 'x'.repeat(513)]) {
    const result = normalize('codex', { type: 'item.started', item: { type: 'command_execution', id } });
    assert.equal(result.event.sourceEventId, null); assert.equal(result.event.callId, null);
    assert(result.diagnostics.includes('missing-source-event-identity'));
  }
});

test('known excluded Codex prose reasoning and progress do not create loss diagnostics', async () => {
  const { normalizeHostEvents } = await import('../../scripts/lib/host-graph-events.mjs');
  const items = [{ id: 'message-1', type: 'agent_message', text: 'PRIVATE-PROSE' },
    { id: 'reason-1', type: 'reasoning', text: 'PRIVATE-REASONING' },
    { id: 'list-1', type: 'todo_list', items: [{ text: 'PRIVATE-TASK', completed: false }] }];
  for (const item of items) for (const type of ['item.started', 'item.updated', 'item.completed']) {
    const r = normalizeHostEvents({ host: 'codex', mode: 'controlled', sourceVersion: null, binding, event: { type, item } });
    assert.deepEqual(r.events, []); assert.deepEqual(r.diagnostics, []);
    assert(!JSON.stringify(r).includes('PRIVATE-'));
  }
  const progress = normalizeHostEvents({ host: 'codex', mode: 'controlled', binding, event: { type: 'item.updated', item: { id: 'call', type: 'command_execution' } } });
  assert.deepEqual(progress.events, []); assert.deepEqual(progress.diagnostics, []);
  const unknown = normalizeHostEvents({ host: 'codex', mode: 'controlled', binding, event: { type: 'item.updated', item: { id: 'call', type: 'future_execution' } } });
  assert(unknown.diagnostics.includes('unsupported-event-shape'));
});

test('Claude known excluded content is ignored but unknown mixed content records a gap', async () => {
  const { normalizeHostEvents } = await import('../../scripts/lib/host-graph-events.mjs');
  const known = [{ type: 'text', text: 'PRIVATE-TEXT' }, { type: 'thinking', thinking: 'PRIVATE-THOUGHT' }, { type: 'redacted_thinking', data: 'PRIVATE-DATA' }];
  for (const type of ['assistant', 'user']) {
    const r = normalizeHostEvents({ host: 'claude-code', mode: 'controlled', binding, event: { type, message: { content: known } } });
    assert.deepEqual(r.events, []); assert.deepEqual(r.diagnostics, []); assert(!JSON.stringify(r).includes('PRIVATE-'));
  }
  const r = normalizeHostEvents({ host: 'claude-code', mode: 'controlled', sourceVersion: '2.1.292', binding,
    event: { type: 'assistant', message: { content: [known[0], { type: 'tool_use', id: 'call', name: 'Read' }, { type: 'future_tool', id: 'lost' }] } } });
  assert.equal(r.events.length, 1); assert(r.diagnostics.includes('unsupported-event-shape'));
});

test('malformed Claude content never becomes ignored prose or silently vanishes', async () => {
  const { normalizeHostEvents } = await import('../../scripts/lib/host-graph-events.mjs');
  for (const content of [null, {}, 'text', [], [null], [[]], [{ type: 'text', text: 1 }], [{ type: 'thinking' }], [{ type: 'redacted_thinking', data: {} }], [{ type: 'tool_use', id: 'call', name: 4 }]]) {
    const r = normalizeHostEvents({ host: 'claude-code', mode: 'controlled', binding, event: { type: 'assistant', message: { content } } });
    assert.deepEqual(r.events, []); assert(r.diagnostics.includes('unsupported-event-shape'));
  }
});

test('only explicit valid advisory frames are excluded, never arbitrary system messages', async () => {
  const { normalizeHostEvents } = await import('../../scripts/lib/host-graph-events.mjs');
  const events = [{ type: 'system', subtype: 'status', status: 'compacting' },
    { type: 'system', subtype: 'status', status: null },
    { type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'auto', pre_tokens: 100 } },
    { type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning' } }];
  for (const event of events) {
    const r = normalizeHostEvents({ host: 'claude-code', mode: 'controlled', binding, event });
    assert.deepEqual(r.events, []); assert.deepEqual(r.diagnostics, []);
  }
  for (const event of [{ type: 'system', subtype: 'future-status' }, { type: 'system', subtype: 'status', status: 'unknown-future' },
    { type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'auto', pre_tokens: -1 } }]) {
    const r = normalizeHostEvents({ host: 'claude-code', mode: 'controlled', binding, event });
    assert(r.diagnostics.includes('unsupported-event-shape'));
  }
});

test('only the audited Claude 2.1.292 UI render invalidation is excluded from graph capture', () => {
  const raw = { type: 'system', subtype: 'ui_invalidate', event: 'ui.render', uuid: '11111111-1111-4111-8111-111111111111', session_id: '22222222-2222-4222-8222-222222222222' };
  const call = (event = raw, sourceVersion = '2.1.292') => normalize('claude-code', event, { sourceVersion });
  assert.deepEqual(call().diagnostics, []);
  assert.equal(call().event, null);
  for (const event of [
    { ...raw, event: 'future.render' }, { ...raw, event: null },
    { ...raw, uuid: null }, { ...raw, session_id: '' }, { ...raw, uuid: 'not-a-uuid' },
    { ...raw, tool_use_id: 'call-1' }, { ...raw, error: 'unclassified' },
    { ...raw, parent_ids: ['parent'] }, { ...raw, instances: [] },
  ]) assert.deepEqual(call(event).diagnostics, ['unsupported-event-shape']);
  assert.deepEqual(call(raw, '2.1.293').diagnostics, ['unsupported-event-shape']);
  assert.deepEqual(call(raw, null).diagnostics, ['unsupported-event-shape']);
  assert.deepEqual(call(Object.create(raw)).diagnostics, ['unsupported-event-shape']);
  assert.deepEqual(normalize('claude-code', raw, { sourceVersion: '2.1.292', mode: 'native' }).diagnostics, ['unsupported-event-shape']);
});
