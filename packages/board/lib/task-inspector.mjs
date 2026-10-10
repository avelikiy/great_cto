/** Read-only activity projection. Session identity, never title/role, owns linkage. */
export function taskInspector(sessions, activity = { state: 'none', events: [] }) {
  const linked = new Set(sessions.filter(s => typeof s === 'string' && s));
  const events = (activity.events || []).filter(e => linked.has(e.session)).slice(-20)
    .map(e => ({ ts: typeof e.ts === 'string' ? e.ts : null,
      kind: typeof e.kind === 'string' ? e.kind : null,
      agent: typeof e.agent === 'string' ? e.agent.slice(0, 80) : null,
      host: ['claude', 'codex'].includes(e.host) ? e.host : null,
      tool: typeof e.tool === 'string' ? e.tool.slice(0, 80) : null,
      outcome: typeof e.outcome === 'string' ? e.outcome.slice(0, 80) : null,
      verdict: typeof e.verdict === 'string' ? e.verdict.slice(0, 80) : null,
      ok: typeof e.ok === 'boolean' ? e.ok : null,
      durationMs: Number.isFinite(e.duration_ms) && e.duration_ms >= 0 ? e.duration_ms : null }));
  return { state: !linked.size ? 'unlinked' : activity.state === 'unreadable' ? 'unreadable'
    : events.length ? 'recorded' : 'none', events,
    partial: (activity.bad || 0) > 0 || activity.gap === true,
    lastEventAt: events.at(-1)?.ts || null,
    reason: !linked.size ? 'No explicit execution session link'
      : activity.state === 'unreadable' ? 'Project activity could not be read'
      : !events.length ? 'No linked events in the bounded project journal window' : null };
}
