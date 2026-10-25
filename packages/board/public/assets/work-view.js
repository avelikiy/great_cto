/* Read-side work UI; injected callbacks retain existing board authority. */
(function () {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const quote = value => "'" + String(value).replace(/'/g, "'\\''") + "'";
  function commandFor(goal, host, allow) {
    if (!goal.trim()) throw Error('Describe the result first.');
    if (!['claude-code', 'codex'].includes(host)) throw Error('Choose a supported host.');
    if (host === 'codex' && (!allow.trim() || allow.split(',').some(p => !p.trim()))) throw Error('Codex requires an explicit comma-separated write scope.');
    return `great-cto run --host ${host}` + (host === 'codex' ? ` --allow ${quote(allow.trim())}` : '') + ` -- ${quote(goal.trim())}`;
  }
  const phaseLabel = e => e.outcome || ({ waiting: 'Waiting; acceptance is not confirmed', unknown: 'Execution state is unknown', verified: 'Verified outcome; explicit completion pending', completed: 'Requested outcome explicitly completed', publishing: 'Host publication in progress', cancelled: 'Cancelled', working: 'Host activity recorded; liveness is not measured', accepted: 'Ready for host execution', needs_decision: 'Needs a decision', blocked: 'Blocked' }[e.phase])
    || (e.kind === 'issue' ? `Issue: ${e.nativeState || 'unknown'}` : `Run: ${e.nativeState || 'unknown'}`);
  function render(snapshot, history = false, filter = '') {
    const warnings = snapshot.sources.filter(s => ['degraded', 'unavailable'].includes(s.health));
    const rows = snapshot.entries.filter(e => e.terminal === history && (!filter || `${e.title} ${e.key}`.toLowerCase().includes(filter.toLowerCase())));
    return `<p class="work-meta">Observed ${esc(snapshot.observedAt)} · ${snapshot.health === 'current' ? 'Sources read' : 'Sources incomplete'}</p>`
      + warnings.map(s => `<p class="work-warning">${esc(s.id)}: ${esc(s.reason || s.health)}</p>`).join('')
      + (rows.length ? rows.map(e => {
        const cap = e.capabilities.find(c => c.enabled);
        const action = cap ? `<button type="button" class="gate-btn" data-work-key="${esc(e.key)}" data-work-action="${esc(cap.action)}">${cap.action === 'copy_approve' ? 'Copy approval command' : cap.action === 'copy_resume' ? 'Copy resume command' : cap.action === 'review_decision' ? 'Review decision' : 'Open issue'}</button>` : '';
        return `<article class="work-card" data-entry-key="${esc(e.key)}"><h2>${esc(e.title)}</h2><p>${esc(phaseLabel(e))}</p>`
          + `<p>Stage: ${esc(e.stage || 'not recorded')}</p>`
          + `<p class="work-meta">${esc(e.host || 'Host not linked')} · ${e.updatedAt ? esc(e.updatedAt) : 'Update time not recorded'}</p>`
          + (e.acceptance.length ? `<p>Acceptance: ${esc(e.acceptance.join('; '))}</p>` : '')
          + `<p>${esc(e.reason || 'Execution observation is recorded; acceptance is not inferred.')}</p>`
          + e.decisions.map(d => `<p>${esc(d.label)}${d.engine === 'codex' ? ' · resolve in the host controller' : ''}</p>`).join('')
          + `<p>Next action: ${esc(cap ? cap.action === 'copy_approve' || cap.action === 'review_decision' ? 'Review the pending decision' : cap.action === 'copy_resume' ? 'Resume in the host controller' : 'Inspect the linked issue' : e.capabilities[0]?.reason || 'No supported action recorded')}</p>`
          + action + (e.command ? `<pre>${esc(e.command)}</pre>` : '')
          + (!cap && e.capabilities[0]?.reason ? `<p>${esc(e.capabilities[0].reason)}</p>` : '')
          + renderInspector(e.inspector)
          + renderEvidence(e.evidenceSections)
          + (e.publicationPreview ? `<label>Publication paths (comma-separated) <input data-publication-allow="${esc(e.key)}" value="${esc(e.publicationAllow || '')}" placeholder="src,tests"></label><button type="button" class="gate-btn" data-work-key="${esc(e.key)}" data-work-action="preview_publication">Preview draft PR publication</button><div data-publication-preview="${esc(e.key)}"></div>` : '')
          + (e.publication ? `<p>PR publication: ${esc(e.publication.state)} · ${esc(e.publication.head || '')}</p>`
            + (typeof e.publication.url === 'string' && /^https:\/\/github\.com\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9][0-9]*$/.test(e.publication.url) ? `<a href="${esc(e.publication.url)}" target="_blank" rel="noopener noreferrer">Open draft PR result</a>` : '')
            + (e.publication.lastError ? `<p>${esc(e.publication.lastError)}</p>` : '') : '')
          + (e.publication?.resumeCommand ? `<p>Reconcile the original publication in the selected project; do not create another PR blindly.</p><pre>${esc(e.publication.resumeCommand)}</pre>` : '')
          + `<details data-work-detail="technical"><summary>Technical details</summary><p>${esc(e.key)} · ${esc(e.nativeState || 'unknown')}</p>`
          + `<p>Task linkage: ${esc(e.taskId || 'not recorded')}</p>${e.revision ? `<p>Task revision: ${esc(e.revision)}</p>` : ''}`
          + (e.taskOutcome ? `<p>Outcome evidence: ${esc(e.taskOutcome.source || 'operator-attestation')} · ${esc(e.taskOutcome.state)}</p>` : '')
          + `<p>Recorded roles: ${esc(e.evidence.map(v => v.label).join(', ') || 'none recorded; verification is not inferred')}</p>`
          + (e.release ? `<p>Release: ${esc(e.release.status || 'unknown')} · verified ${esc(e.release.verifiedAt || 'not recorded')}</p>` + (typeof e.release.url === 'string' && /^https?:\/\//i.test(e.release.url) ? `<p><a href="${esc(e.release.url)}" target="_blank" rel="noopener noreferrer">Open release result</a></p>` : '') : '')
          + `</details></article>`;
      }).join('') : `<p>${warnings.length ? 'No readable entries match this view; sources are incomplete.' : filter ? 'No entries match the search.' : history ? 'No closed work records or terminal runs recorded.' : 'No active work records or runs recorded. Describe a result to prepare a host command.'}</p>`)
      + (!history && snapshot.sessions.length ? `<details><summary>Claude sessions (${snapshot.sessions.length}) · task linkage not recorded</summary>`
        + snapshot.sessions.map(s => `<p>${esc(s.session)} · ${esc(s.state)} · ${esc(s.reason || '')}</p>`).join('') + '</details>' : '');
  }
  function renderInspector(inspector) {
    if (!inspector) return '';
    return `<details data-work-detail="inspector"><summary>Live activity inspector · read-only</summary>`
      + `<p>Recent recorded events, refreshed with this view. Activity is not proof of liveness or acceptance. Prompts, raw output and terminal input are not exposed.</p>`
      + (inspector.reason ? `<p>${esc(inspector.reason)}</p>` : '')
      + (inspector.partial ? '<p class="work-warning">Activity window is incomplete.</p>' : '')
      + `<p>Last linked event: ${esc(inspector.lastEventAt || 'not recorded')}</p>`
      + (inspector.events?.length ? '<ol>' + inspector.events.map(e => `<li>${esc(e.ts || 'time unknown')} · ${esc(e.host || 'host unknown')} · ${esc(e.agent || 'agent unknown')} · ${esc(e.kind || 'event')}`
        + (e.tool ? ` · ${esc(e.tool)}` : '') + (e.outcome ? ` · outcome: ${esc(e.outcome)}` : '')
        + (e.verdict ? ` · verdict: ${esc(e.verdict)}` : '')
        + (e.durationMs !== null ? ` · ${esc(e.durationMs)} ms` : '') + '</li>').join('') + '</ol>' : '')
      + '</details>';
  }
  const categories = [['active', 'All active'], ['attention', 'Needs attention'], ['running', 'Running'], ['queued', 'Queued'], ['completed', 'Completed']];
  function inCategory(entry, category) {
    if (category === 'completed') return entry.terminal;
    if (entry.terminal) return false;
    if (category === 'attention') return (entry.decisions || []).length > 0 || entry.nativeState === 'blocked' || ['needs_decision', 'blocked', 'unknown'].includes(entry.phase);
    if (category === 'running') return ['working', 'publishing'].includes(entry.phase);
    if (category === 'queued') return entry.phase === 'accepted';
    return true;
  }
  function cockpitEntries(data, category, search) {
    return data.entries.filter(e => inCategory(e, category) && (!search || `${e.title} ${e.key}`.toLowerCase().includes(search.toLowerCase())));
  }
  function renderDeclaredWorkflow(graph) {
    if (!graph || graph.source === 'host-observation') return '';
    const snapshots = Array.isArray(graph.snapshots) ? graph.snapshots.slice(0, 64) : [];
    return '<details class="work-declared-workflow"><summary>Declared workflow' + (snapshots.length ? ` · ${snapshots.length} snapshots` : '') + '</summary>'
      + '<p>Declared possibilities only. These rules do not prove that a stage ran, a dependency was satisfied or a gate was approved.</p>'
      + (snapshots.length ? snapshots.map(snapshot => `<details><summary>Workflow snapshot ${esc(snapshot.digest || 'identity unavailable')}</summary>`
        + '<table><caption>Declared transition rules</caption><thead><tr><th>Role</th><th>On</th><th>Next</th><th>Join</th><th>Gates</th></tr></thead><tbody>'
        + (Array.isArray(snapshot.rules) ? snapshot.rules.slice(0, 256) : []).map(rule => '<tr>' + [rule.role, ...['on', 'next', 'join', 'gates'].map(key => Array.isArray(rule[key]) ? rule[key].slice(0, 16).join(', ') : '')].map(value => `<td>${esc(value || 'None declared')}</td>`).join('') + '</tr>').join('') + '</tbody></table></details>').join('')
        : '<p>No declared workflow snapshot is recorded.</p>') + '</details>';
  }
  function renderHostAttempt(graph, attempts, options) {
    const attemptId = graph.binding?.attemptId || graph.nodes?.find(node => node.attemptId)?.attemptId;
    const attempt = attempts.find(node => node.attemptId === attemptId);
    const hostKey = graph.binding?.host || graph.nodes?.[0]?.host;
    const host = hostKey === 'codex' ? 'Codex' : hostKey === 'claude-code' ? 'Claude Code' : 'Host unknown';
    const label = attempt ? `${attempt.role || 'Role unknown'} · attempt ${attempt.number || attemptId}` : attemptId ? `attempt ${attemptId}` : 'session observations';
    const key = JSON.stringify([graph.binding?.host || null, graph.binding?.runId || null, graph.binding?.sessionId || null, attemptId || null]);
    return `<details class="work-host-attempt" data-host-attempt="${esc(key)}" data-observation-key="${esc(key)}"><summary>Host observations · ${esc(host)} · ${esc(label)}</summary>${renderExecutionGraph(graph, options)}</details>`;
  }
  function renderExecution(entry, options = {}) {
    const roles = Array.isArray(entry.evidence) ? entry.evidence : [];
    const execution = entry.execution, nodes = Array.isArray(execution?.nodes) ? execution.nodes.slice(0, 200) : [];
    return (options.canvas ? '<section class="work-execution work-execution-flat">' : '<section class="work-execution"><h3>Recorded observations</h3>')
      + (execution?.observationHealth?.state === 'degraded' ? '<p class="work-warning">Host observation delivery is incomplete.</p>' : '')
      + (execution?.omittedObservationAttempts ? `<p class="work-warning">${esc(execution.omittedObservationAttempts)} earlier attempt observation journals are outside this bounded view.</p>` : '')
      + renderDeclaredWorkflow(execution?.graph)
      + renderExecutionGraph(execution?.graph, options)
      + (Array.isArray(execution?.observations) ? execution.observations.slice(0, 16).map(graph => renderHostAttempt(graph, nodes, options)).join('') : '')
      + (execution?.graph?.state === 'recorded' ? '' : '<p>Dependencies not recorded. This is an observation list, not an inferred execution graph. Event order does not establish dependencies.</p>')
      + `<p>Recorded stage: ${esc(entry.stage || 'not recorded')}</p>`
      + (execution?.reason ? `<p>${esc(execution.reason)}</p>` : '')
      + (execution?.truncated ? '<p class="work-warning">Showing the latest 200 recorded attempts; earlier observations are truncated.</p>' : execution?.partial ? '<p class="work-warning">Attempt observations are incomplete.</p>' : '')
      + (options.canvas && entry.inspector?.partial ? '<p class="work-warning">Activity window is incomplete.</p>' : '')
      + (options.canvas && entry.inspector?.reason ? `<p class="work-warning">${esc(entry.inspector.reason)}</p>` : '')
      + (options.canvas && !entry.inspector ? '<p class="work-meta">Linked activity unavailable. Absence of events is not proof of inactivity.</p>' : '')
      + (options.canvas ? '<details class="work-attempt-details"><summary>Recorded observations & technical details</summary>' : '')
      + (nodes.length ? '<ul class="work-observations" aria-label="Recorded execution attempts">' + nodes.map(n => `<li class="work-observation" data-attempt-id="${esc(n.attemptId)}"><strong>${esc(n.role)} · attempt ${esc(n.number || 'unknown')}</strong>`
        + `<p>${esc(n.host || 'Host not recorded')} · phase: ${esc(n.phase || 'not recorded')}</p><p>Controller recorded status: ${esc(n.status || 'unknown')}; not current verification or acceptance.</p>`
        + `<p>Run: ${esc(n.runId)} · Attempt: ${esc(n.attemptId)}</p><p>Started: ${esc(n.startedAt || 'not recorded')} · Finished: ${esc(n.finishedAt || 'not recorded')}</p></li>`).join('') + '</ul>' : '')
      + (roles.length ? '<ul class="work-observations">' + roles.map(role => `<li class="work-observation">${esc(role.label)} · recorded role observation; acceptance is not inferred</li>`).join('') + '</ul>' : '<p>No role observations recorded.</p>')
      + (entry.inspector ? renderInspector(entry.inspector).replace('<details ', '<details open ') : '<p>Linked activity unavailable. Absence of events is not proof of inactivity.</p>')
      + (options.canvas ? '</details>' : '')
      + '</section>';
  }
  function renderHostCoverage(graph) {
    const dimensions = [['lifecycle', 'Lifecycle'], ['parentChild', 'Parent / child'], ['tools', 'Tools'], ['verification', 'Verification'], ['gates', 'Gates'], ['artifacts', 'Artifacts']];
    const total = Number.isSafeInteger(graph.total) && graph.total >= 0 ? graph.total : 'unavailable';
    return `<div class="execution-host-coverage"><p class="work-meta">Source: host observation · Health: ${esc(graph.health || 'unknown')}. Observation metadata does not establish current liveness, controller transitions, gate approval or task acceptance.</p>`
      + (graph.observedInterval ? `<p>Observed interval · collector receipt times: ${esc(graph.observedInterval.from || 'Unavailable')} to ${esc(graph.observedInterval.to || 'Unavailable')}</p>` : '')
      + (Array.isArray(graph.diagnostics) && graph.diagnostics.length ? '<details class="work-observation-diagnostics"><summary>Observation diagnostics</summary><ul>' + graph.diagnostics.slice(0, 16).map(code => `<li><code>${esc(code)}</code></li>`).join('') + '</ul></details>' : '')
      + `<p>Showing ${Array.isArray(graph.nodes) ? graph.nodes.length : 0} of ${esc(total)} recorded observations.${graph.cursor ? ' More observations are available outside this page.' : ''}</p>`
      + (graph.cursor ? `<details><summary>Observation page cursor · read-only</summary><code>${esc(graph.cursor)}</code></details>` : '')
      + (graph.cursor && graph.binding?.host && graph.binding?.sessionId ? `<button type="button" data-host-graph-next="${esc(JSON.stringify({ ...graph.binding, cursor: graph.cursor }))}">Next observation page</button>` : '')
      + '<dl aria-label="Host observation coverage">' + dimensions.map(([key, label]) => {
        const dimension = graph.coverage?.[key];
        const support = dimension?.supported === true ? 'Supported' : dimension?.supported === false ? 'Unsupported' : 'Support unknown';
        const state = dimension?.supported === false ? 'Unavailable' : dimension?.state === 'partial' ? 'Partial'
          : dimension?.supported === true && dimension?.state === 'complete' ? 'Complete' : 'Unavailable';
        return `<dt>${label} · ${support} · ${state}</dt><dd>${esc(dimension?.reason || 'Coverage has not been established.')}</dd>`;
      }).join('') + '</dl></div>';
  }
  const controllerOwnedKinds = new Set(['transition', 'context', 'checks', 'gate', 'approval', 'rework', 'recovery', 'wave', 'manual', 'cancel', 'release', 'reuse']);
  const graphLane = node => ['codex', 'claude-code'].includes(node.host) ? node.host
    : !node.host && controllerOwnedKinds.has(node.kind) ? 'controller' : 'unknown';
  const graphHostLabel = node => node.host || (graphLane(node) === 'controller' ? 'controller' : 'Host not recorded');
  const graphRoleLabel = node => node.role || (graphLane(node) === 'controller' ? 'controller' : node.kind || 'Role not recorded');
  function renderExecutionGraph(graph, options = {}) {
    const hostObserved = graph?.source === 'host-observation';
    const coverage = hostObserved ? renderHostCoverage(graph) : '';
    if (graph?.state !== 'recorded' || !Array.isArray(graph.nodes) || !graph.nodes.length)
      return (hostObserved ? '<section class="execution-graph" aria-label="Host-observed execution graph"><h3>Host-observed graph</h3>' + coverage : '')
        + `<p class="work-meta">${esc(graph?.reason || 'Controller-recorded graph unavailable. Native and legacy observations remain partial.')}</p>` + (hostObserved ? '</section>' : '');
    if (graph.nodes.length > 512 || !Array.isArray(graph.edges) || graph.edges.length > 2048) return coverage + '<p>Graph exceeds the display limit.</p>';
    const horizontal = options.canvas && options.direction !== 'tb';
    let nodes = graph.nodes;
    const ids = new Map(nodes.map((n, i) => [n.id, i]));
    if (ids.size !== nodes.length || graph.edges.some(e => !ids.has(e.from) || !ids.has(e.to) || e.from === e.to || (!hostObserved && ids.get(e.from) >= ids.get(e.to))))
      return coverage + '<p>Graph dependencies cannot be displayed safely.</p>';
    if (hostObserved) {
      // Explicit parents may arrive late. Reorder for layout only; never add an edge.
      const indegree = new Map(nodes.map(n => [n.id, 0])), children = new Map(nodes.map(n => [n.id, []]));
      for (const edge of graph.edges) { indegree.set(edge.to, indegree.get(edge.to) + 1); children.get(edge.from).push(edge.to); }
      const pending = nodes.filter(n => indegree.get(n.id) === 0), ordered = [], byId = new Map(nodes.map(n => [n.id, n]));
      for (let index = 0; index < pending.length; index += 1) {
        const node = pending[index]; ordered.push(node);
        for (const child of children.get(node.id)) { indegree.set(child, indegree.get(child) - 1); if (indegree.get(child) === 0) pending.push(byId.get(child)); }
      }
      if (ordered.length !== nodes.length) return coverage + '<p>Graph dependencies cannot be displayed safely.</p>';
      nodes = ordered;
    }
    const levels = new Map(nodes.map(n => [n.id, 0]));
    const parents = new Map(nodes.map(n => [n.id, []]));
    for (const e of graph.edges) parents.get(e.to).push(e);
    const laneFor = graphLane;
    const lanes = ['controller', 'codex', 'claude-code', 'unknown'].filter(host => nodes.some(node => laneFor(node) === host)), laneLayout = lanes.length > 1;
    const rows = new Map(), positions = new Map(), nodeRows = new Map(), laneCounts = new Map();
    for (const n of nodes) {
      const level = Math.max(0, ...parents.get(n.id).map(e => levels.get(e.from) + 1));
      levels.set(n.id, level);
      const key = laneLayout ? `${laneFor(n)}:${level}` : level, row = rows.get(key) || 0;
      rows.set(key, row + 1); nodeRows.set(n.id, row);
      laneCounts.set(laneFor(n), Math.max(laneCounts.get(laneFor(n)) || 0, row + 1));
    }
    const offsets = new Map(), extents = new Map(); let extent = 0;
    if (laneLayout) for (const host of lanes) {
      const size = (laneCounts.get(host) || 1) * (horizontal ? 112 : 236) + 48;
      offsets.set(host, extent); extents.set(host, size); extent += size;
    }
    for (const n of nodes) {
      const level = levels.get(n.id), row = nodeRows.get(n.id), offset = laneLayout ? offsets.get(laneFor(n)) : 0;
      positions.set(n.id, horizontal ? { x: 24 + level * 272, y: (laneLayout ? offset + 48 : 24) + row * 112 }
        : { x: offset + 24 + row * 236, y: (laneLayout ? 48 : 24) + level * 112 });
    }
    const width = horizontal ? (Math.max(...levels.values()) + 1) * 272 : laneLayout ? Math.max(500, extent) : Math.max(500, Math.max(...rows.values()) * 236 + 24);
    const height = horizontal ? laneLayout ? extent : Math.max(240, Math.max(...rows.values()) * 112 + 24) : (Math.max(...levels.values()) + 1) * 112 + (laneLayout ? 48 : 24);
    const laneBoxes = laneLayout ? lanes.map(host => {
      const label = ({ controller: 'Controller', codex: 'Codex', 'claude-code': 'Claude Code', unknown: 'Host not recorded' })[host], offset = offsets.get(host);
      return `<g class="execution-host-lane" role="group" aria-label="Host lane: ${label}"><rect x="${horizontal ? 0 : offset}" y="${horizontal ? offset : 0}" width="${horizontal ? width : extents.get(host)}" height="${horizontal ? extents.get(host) : height}" fill="var(--bg-page)" stroke="var(--border-strong)"/><text x="${horizontal ? 12 : offset + 12}" y="${horizontal ? offset + 24 : 24}" fill="currentColor">${label}</text></g>`;
    }).join('') : '';
    const edges = graph.edges.map(e => {
      const a = positions.get(e.from), b = positions.get(e.to);
      if (horizontal) return `<path d="M${a.x + 208} ${a.y + 39} C${a.x + 240} ${a.y + 39},${b.x - 32} ${b.y + 39},${b.x} ${b.y + 39}" marker-end="url(#execution-arrow)"><title>${esc(e.kind)}: ${esc(e.from)} to ${esc(e.to)}</title></path>`;
      return `<path d="M${a.x + 104} ${a.y + 78} C${a.x + 104} ${a.y + 98},${b.x + 104} ${b.y - 20},${b.x + 104} ${b.y}" marker-end="url(#execution-arrow)"><title>${esc(e.kind)}: ${esc(e.from)} to ${esc(e.to)}</title></path>`;
    }).join('');
    const short = value => String(value || '').length > 27 ? String(value).slice(0, 26) + '…' : String(value || '');
    const boxes = nodes.map(n => {
      const p = positions.get(n.id);
      return `<g class="execution-node" role="button" tabindex="0" data-graph-node="${esc(n.id)}" data-graph-search-text="${esc([n.id, n.role || n.kind, graphHostLabel(n), n.attemptId || ''].join(' '))}" aria-label="${esc(n.kind)} ${esc(n.role || '')}: ${esc(n.status)}. Open recorded details." transform="translate(${p.x},${p.y})">${options.canvas ? `<title>${esc(n.kind)} · ${esc(graphRoleLabel(n))} · ${esc(n.status)}</title>` : ''}<rect width="208" height="78" rx="6"/><text x="12" y="23">${esc(short(n.role || n.kind))}</text><text x="12" y="45">${options.canvas ? esc(short(`${n.kind} · ${n.status}`)) : `${esc(n.kind)} · ${esc(n.status)}`}</text><text x="12" y="64">${esc(graphHostLabel(n))}</text></g>`;
    }).join('');
    const details = nodes.map(n => `<details class="execution-node-detail" data-graph-detail="${esc(n.id)}"><summary>${esc(n.id)} · ${esc(n.kind)} · ${esc(graphRoleLabel(n))} · ${esc(n.status)}</summary><dl>`
      + [['Attempt', n.attemptId], ['Host', n.host], ...(hostObserved ? [['Source', n.source || 'host-observation'], ['Source version', n.sourceVersion || 'unverified'], ['Phase', n.phase], ['Outcome', n.outcome]] : []), ['Recorded at', n.at], ['Verdict', n.verdict], ['Wave', n.waveId], ['Gates', (n.gates || []).join(', ')],
        ['Workflow snapshot SHA-256', n.graphDigest], ['Input receipt SHA-256', n.inputDigest], ['Output receipt SHA-256', n.outputDigest],
        [n.kind === 'reuse' ? 'Historical report SHA-256 (worker not invoked)' : 'Stage context SHA-256', n.contextDigest], ['Result SHA-256', n.resultDigest]]
        .map(([key, value]) => `<dt>${esc(key)}</dt><dd><code>${esc(value || 'Not recorded')}</code></dd>`).join('')
      + `<dt>Recorded predecessors</dt><dd>${parents.get(n.id).map(e => `${esc(e.from)} (${esc(e.kind)})`).join(', ') || 'None recorded; not proof of complete external inputs'}</dd></dl></details>`).join('');
    const latestAttempts = graph.nodes.filter(node => node.kind === 'attempt'), latestPool = latestAttempts.length ? latestAttempts : graph.nodes;
    const latest = [...latestPool].sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0)).at(-1);
    const navigation = `<div class="execution-graph-tools" role="group" aria-label="Graph node navigation"><label>Find graph node <input type="search" data-graph-find="query" maxlength="160" placeholder="Role, host or node ID"></label><button type="button" class="gate-btn" data-graph-search="find">Find node</button>${latest ? `<button type="button" class="gate-btn" data-graph-latest="${esc(latest.id)}">Latest recorded ${latestAttempts.length ? 'attempt' : 'observation'}</button>` : ''}<span data-graph-search-feedback role="status" aria-live="polite"></span></div>`;
    return `<section class="execution-graph" aria-label="${hostObserved ? 'Host-observed' : 'Controller-recorded'} execution graph"><h3>${hostObserved ? 'Host-observed graph' : 'Controller-recorded graph'}</h3><p>${nodes.length} nodes · ${graph.edges.length} recorded edges${hostObserved ? '. Partial history: host delivery completeness is not attested.' : ` · ${graph.snapshots?.length || 0} workflow snapshots. ${graph.complete ? 'Controller history recorded from run creation.' : 'Partial history: missing edges are not inferred.'}`}</p>`
      + (hostObserved ? coverage : `<p class="work-meta">Dispatch, input, verification, gate and join edges describe controller observations. Intent is not proof of a live worker; recorded approval is not deployment or task acceptance. Historical reuse does not invoke a worker. Stage context digests exclude separately admitted domain packets.</p>`)
      + (graph.reason ? `<p class="work-warning">${esc(graph.reason)}</p>` : '')
      + (laneLayout ? '<p class="work-meta">Visual grouping only; host lanes do not establish dependency or concurrency.</p>' : '') + navigation
      + `<div class="execution-graph-tools execution-graph-toolbar" role="group" aria-label="Graph zoom"><button type="button" class="gate-btn" data-graph-scale="0.75">Zoom out</button><button type="button" class="gate-btn" data-graph-scale="1.333333">Zoom in</button><button type="button" class="gate-btn" data-graph-scale="reset">Reset zoom</button>${options.canvas ? `<button type="button" class="gate-btn" data-graph-scale="fit">Fit graph</button><button type="button" class="gate-btn" data-graph-direction="lr" aria-pressed="${horizontal}">Left to right</button><button type="button" class="gate-btn" data-graph-direction="tb" aria-pressed="${!horizontal}">Top to bottom</button>` : ''}</div>`
      + `<div class="execution-graph-canvas" tabindex="0" aria-label="Scrollable graph. Tab to a node and press Enter for details."><svg data-graph-layout="${horizontal ? 'lr' : 'tb'}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="group" aria-label="Recorded execution dependencies"><defs><marker id="execution-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8"/></marker></defs>${laneBoxes}<g class="execution-edges" fill="none">${edges}</g>${boxes}</svg></div>`
      + (options.canvas ? '<details class="execution-node-list"><summary>Recorded node details · keyboard list</summary>' : '<h3>Recorded node details</h3>') + `<p class="work-meta">Use the graph or expand a node below. Digests bind recorded inputs, not correctness.</p>${details}${options.canvas ? '</details>' : ''}</section>`;
  }
  function focusGraphNode(node) {
    if (!node) return false;
    node.focus({ preventScroll: true }); node.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); return true;
  }
  function focusGraphMatch(graph, value) {
    if (!graph) return;
    const query = String(value || '').trim().slice(0, 160).toLowerCase();
    const matches = [...graph.querySelectorAll('[data-graph-node]')].filter(node => String(node.dataset.graphSearchText || '').toLowerCase().includes(query));
    const feedback = graph.querySelector('[data-graph-search-feedback]');
    if (!query) { if (feedback) feedback.textContent = 'Enter a role, host or node ID.'; return; }
    if (feedback) feedback.textContent = matches.length ? `Focused first of ${matches.length} matching nodes. All dependencies remain visible.` : 'No matching node on this page.';
    if (matches.length) focusGraphNode(matches[0]);
  }
  function graphInteraction(target) {
    const search = target.closest('[data-graph-search]');
    if (search?.dataset.graphSearch === 'find') { const graph = search.closest('.execution-graph'); focusGraphMatch(graph, graph?.querySelector('[data-graph-find]')?.value); return true; }
    const latest = target.closest('[data-graph-latest]');
    if (latest?.dataset.graphLatest) { const graph = latest.closest('.execution-graph'); focusGraphNode([...graph?.querySelectorAll('[data-graph-node]') || []].find(node => node.dataset.graphNode === latest.dataset.graphLatest)); return true; }

    const direction = target.closest('[data-graph-direction]');
    if (config?.canvas && ['lr', 'tb'].includes(direction?.dataset.graphDirection)) { graphDirection = direction.dataset.graphDirection; closeWorkDialog(false); paint(); document.querySelector?.('[data-graph-direction][aria-pressed="true"]')?.focus(); return true; }
    const node = target.closest('[data-graph-node]');
    if (node?.dataset.graphNode) {
      const detail = [...document.querySelectorAll('[data-graph-detail]')].find(el => el.dataset.graphDetail === node.dataset.graphNode);
      if (detail && config?.canvas) openNodeInspector(detail, node);
      else if (detail) { detail.open = true; detail.querySelector('summary')?.focus(); detail.scrollIntoView({ block: 'nearest' }); }
      return true;
    }
    const scale = target.closest('[data-graph-scale]');
    if (!scale?.dataset.graphScale) return false;
    const svg = scale.closest('.execution-graph').querySelector('svg'), bounds = svg.viewBox.baseVal;
    const fit = scale.dataset.graphScale === 'fit' ? Math.min(1, Math.max(0.05, (scale.closest('.execution-graph').querySelector('.execution-graph-canvas').clientWidth - 2) / bounds.width)) : null;
    const next = fit ?? (scale.dataset.graphScale === 'reset' ? 1 : Math.min(2, Math.max(0.25, Number(svg.dataset.zoom || 1) * Number(scale.dataset.graphScale))));
    svg.dataset.zoom = String(next); svg.setAttribute('width', String(bounds.width * next)); svg.setAttribute('height', String(bounds.height * next));
    return true;
  }
  function renderCockpit(data, options = {}) {
    if (options.canvas) return renderWorkspace(data, options);
    const category = categories.some(([key]) => key === options.category) ? options.category : 'active';
    const tab = ['overview', 'execution', 'evidence'].includes(options.tab) ? options.tab : 'overview';
    const rows = cockpitEntries(data, category, options.search || '');
    const selected = rows.find(e => e.key === options.selectedKey) || rows[0];
    const warnings = data.sources.filter(s => ['degraded', 'unavailable'].includes(s.health));
    const feedback = warnings.map(s => `<p class="work-warning">${esc(s.id)}: ${esc(s.reason || s.health)}</p>`).join('');
    const observed = `<p class="work-meta">Observed ${esc(data.observedAt)} · ${data.health === 'current' ? 'Sources read' : 'Sources incomplete'}</p>`;
    const toolbar = '<div class="work-filters" role="group" aria-label="Task status filters">' + categories.map(([key, label]) => `<button type="button" class="work-filter" data-work-filter="${key}" aria-pressed="${category === key}">${label} <span>${cockpitEntries(data, key, options.search || '').length}</span></button>`).join('') + '</div>';
    if (!selected) return toolbar + observed + feedback + `<p>${warnings.length || data.health !== 'current' ? 'No readable entries match this view; sources are incomplete.' : options.search ? 'No entries match the search.' : 'No work records match this filter.'}</p>`;
    const list = '<div class="work-task-list" role="group" aria-label="Project tasks">' + rows.map(e => `<button type="button" class="work-task-row" data-work-select="${esc(e.key)}" aria-current="${e.key === selected.key}"><strong>${esc(e.title)}</strong><span>${esc(phaseLabel(e))}</span><small>${esc(e.host || 'Host not linked')} · ${esc(e.stage || 'Stage not recorded')}</small></button>`).join('') + '</div>';
    const tabs = '<div class="work-tabs" role="tablist" aria-label="Selected task">' + ['overview', 'execution', 'evidence'].map(name => `<button type="button" class="work-tab" id="work-tab-${name}" data-work-tab="${name}" role="tab" aria-selected="${tab === name}" aria-controls="work-detail-panel" tabindex="${tab === name ? 0 : -1}">${name[0].toUpperCase() + name.slice(1)}</button>`).join('') + '</div>';
    // Only the selected Overview owns mutation controls; observation tabs cannot duplicate them.
    const detail = tab === 'execution' ? renderExecution(selected) : tab === 'evidence'
      ? (Array.isArray(selected.evidenceSections) && selected.evidenceSections.length ? renderEvidence(selected.evidenceSections).replace('<details ', '<details open ') : '<p>Evidence unavailable. No verification or acceptance is inferred.</p>')
      : render({ ...data, sources: [], sessions: [], entries: [{ ...selected, inspector: null, evidenceSections: null }] }, selected.terminal);
    return toolbar + (tab === 'overview' ? '' : observed) + feedback + '<p class="work-meta">Running means host activity was recorded; current liveness is not measured. Closed records do not by themselves prove acceptance.</p>'
      + `<div class="work-cockpit">${list}<section class="work-detail" aria-label="Selected task details">${tabs}<div id="work-detail-panel" role="tabpanel" aria-labelledby="work-tab-${tab}" tabindex="0">${detail}</div></section></div>`
      + (data.sessions.length ? `<details><summary>Claude sessions (${data.sessions.length}) · task linkage not recorded</summary>${data.sessions.map(s => `<p>${esc(s.session)} · ${esc(s.state)} · ${esc(s.reason || '')}</p>`).join('')}</details>` : '');
  }
  const taskTabs = ['overview', 'execution', 'evidence'];
  function parseRoute(input) {
    if (typeof input !== 'string' || input.length > 4096 || /[\u0000-\u001f\u007f]/.test(input)) return null;
    const [path, query, extra] = input.split('?');
    if (extra !== undefined) return null;
    const params = new URLSearchParams(query || '');
    if ([...params.keys()].some(key => !['category', 'search'].includes(key) || params.getAll(key).length !== 1)) return null;
    const category = params.get('category') || (path === 'work/completed' ? 'completed' : 'active'), search = params.get('search') || '';
    if (!categories.some(([key]) => key === category) || search.length > 1000 || /[\u0000-\u001f\u007f]/.test(search)) return null;
    let selectedKey = null, tab = 'overview';
    if (path !== 'work' && path !== 'work/completed') {
      const match = path.match(/^work\/task\/([^/]+)\/(overview|execution|evidence)$/);
      if (!match) return null;
      try { selectedKey = decodeURIComponent(match[1]); } catch { return null; }
      if (!selectedKey || selectedKey.length > 512 || /[\u0000-\u001f\u007f]/.test(selectedKey)) return null;
      tab = match[2];
    }
    return { canonical: workspaceRoute(selectedKey, tab, category, search), selectedKey, tab, category, search };
  }
  function workspaceRoute(key, selectedTab, selectedCategory, search) {
    const params = new URLSearchParams();
    if (selectedCategory !== 'active') params.set('category', selectedCategory);
    if (search) params.set('search', search);
    return (key ? `work/task/${encodeURIComponent(key)}/${selectedTab}` : 'work') + (params.size ? '?' + params : '');
  }
  function taskRows(rows, selected = null) {
    return rows.map(e => `<button type="button" class="work-task-row" data-work-select="${esc(e.key)}" aria-current="${e.key === selected}"><strong>${esc(e.title)}</strong><span>${esc(phaseLabel(e))}</span><small>${esc(e.host || 'Host not linked')} · ${esc(e.stage || 'Stage not recorded')}</small></button>`).join('');
  }
  function renderWorkspace(data, options) {
    const category = categories.some(([key]) => key === options.category) ? options.category : 'active';
    const tab = taskTabs.includes(options.tab) ? options.tab : 'overview';
    const rows = cockpitEntries(data, category, options.search || '');
    const feedback = data.sources.filter(s => ['degraded', 'unavailable'].includes(s.health)).map(s => `<p class="work-warning">${esc(s.id)}: ${esc(s.reason || s.health)}</p>`).join('');
    const observation = `<p class="work-meta">Observed ${esc(data.observedAt)} · ${data.health === 'current' ? 'Sources read' : 'Sources incomplete'}. Recorded activity is not proof of current liveness or task acceptance.</p>`;
    if (!options.selectedKey) {
      const toolbar = '<div class="work-filters" role="group" aria-label="Task status filters">' + categories.map(([key, label]) => `<button type="button" class="work-filter" data-work-filter="${key}" aria-pressed="${category === key}">${label} <span>${cockpitEntries(data, key, options.search || '').length}</span></button>`).join('') + '</div>';
      return `<section class="work-workspace work-list-only" aria-label="Project work list">${toolbar}${observation}${feedback}` + (rows.length ? `<div class="work-task-list" role="group" aria-label="Project tasks">${taskRows(rows)}</div>` : `<p>${data.health !== 'current' || feedback ? 'No readable entries match this view; sources are incomplete.' : options.search ? 'No entries match the search.' : 'No work records match this filter.'}</p>`) + '</section>';
    }
    const selected = data.entries.find(e => e.key === options.selectedKey);
    const back = '<button type="button" class="work-back" data-work-back>← Work</button>';
    if (!selected) return `<section class="work-workspace work-detail-only">${back}${observation}${feedback}<h2>Selected task is unavailable</h2><p>The requested task is not in the readable records for this project. Another task will not be substituted.</p></section>`;
    const tabs = '<div class="work-tabs" role="tablist" aria-label="Selected task">' + taskTabs.map(name => `<button type="button" class="work-tab" id="work-tab-${name}" data-work-tab="${name}" role="tab" aria-selected="${tab === name}" aria-controls="work-detail-panel" tabindex="${tab === name ? 0 : -1}">${name[0].toUpperCase() + name.slice(1)}</button>`).join('') + '</div>';
    const detail = tab === 'execution' ? renderExecution(selected, { canvas: true, direction: options.direction }) : tab === 'evidence'
      ? (Array.isArray(selected.evidenceSections) && selected.evidenceSections.length ? renderEvidence(selected.evidenceSections).replace('<details ', '<details open ') : '<p>Evidence unavailable. No verification or acceptance is inferred.</p>')
      : render({ ...data, sources: [], sessions: [], entries: [{ ...selected, inspector: null, evidenceSections: null }] }, selected.terminal);
    const runLabel = selected.title.match(/^Controlled run ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
    const title = runLabel ? `Controlled run <small class="work-meta work-run-identifier">${esc(runLabel[1].slice(0, 8))}</small>` : esc(selected.title);
    return `<section class="work-workspace work-detail-only" data-selected-work="${esc(selected.key)}" data-observation-scope="${esc(JSON.stringify([options.observationProject || data.projectId || null, selected.key]))}"><header class="work-task-header"><div class="work-task-navigation">${back}<span class="work-meta">${esc(selected.kind)} · ${esc(selected.host || 'Host not linked')}</span><button type="button" data-work-switch>Switch task</button><button type="button" data-work-previous${rows.findIndex(e => e.key === selected.key) > 0 ? '' : ' disabled'} aria-label="Previous task in current filter">Previous</button><button type="button" data-work-next${rows.findIndex(e => e.key === selected.key) >= 0 && rows.findIndex(e => e.key === selected.key) < rows.length - 1 ? '' : ' disabled'} aria-label="Next task in current filter">Next</button></div><h2>${title}</h2><p>${esc(phaseLabel(selected))}</p></header>${tabs}${feedback}${tab === 'overview' ? '' : observation}<div id="work-detail-panel" role="tabpanel" aria-labelledby="work-tab-${tab}" tabindex="0">${detail}</div></section>`;
  }
  function renderEvidence(sections) {
    if (!Array.isArray(sections)) return '';
    return '<details data-work-detail="evidence"><summary>Task evidence · read-only</summary>'
      + '<p>Recorded means an observation exists, not that the current code passed a gate. Unknown means evidence is unavailable, not zero or success.</p>'
      + '<dl>' + sections.map(s => `<dt>${esc(s.label)} · ${s.state === 'recorded' ? 'Recorded' : 'Unknown'}</dt><dd>${esc(s.detail)}</dd>`).join('') + '</dl></details>';
  }
  function publicationCommand(preview) {
    const confirmation = preview.confirmation || { expectedRevision: preview.revision, approval: preview.approval };
    if (!/^[0-9a-f-]{36}$/.test(preview.taskId || '') || !Number.isInteger(confirmation.expectedRevision) || confirmation.expectedRevision < 1
      || !/^[0-9a-f]{64}$/.test(confirmation.approval || '') || !Array.isArray(preview.allow) || preview.allow.some(p => typeof p !== 'string' || p.includes(','))) throw Error('Invalid publication preview. Use the host CLI.');
    return `great-cto task work publish --task ${preview.taskId} --revision ${confirmation.expectedRevision} --approval ${confirmation.approval} --base ${quote(preview.base)} --allow ${quote(preview.allow.join(','))} --confirm publish-draft-pr`;
  }
  async function previewPublication(entry) {
    const project = config.project(), seq = generation;
    const panel = [...document.querySelectorAll('[data-publication-preview]')].find(n => n.dataset.publicationPreview === entry.key);
    if (!panel) return;
    panel.textContent = 'Reading publication preview…';
    try {
      const allow = [...document.querySelectorAll('[data-publication-allow]')].find(n => n.dataset.publicationAllow === entry.key)?.value?.trim();
      if (!allow) throw Error('Enter an explicit publication path scope first.');
      const preview = await config.read(`/api/work/publication-preview?task=${encodeURIComponent(entry.taskId)}&allow=${encodeURIComponent(allow)}${project ? '&project=' + encodeURIComponent(project) : ''}`);
      if (project !== config.project() || seq !== generation || !panel.isConnected) return;
      if (!preview || preview.error || preview.taskId !== entry.taskId || preview.revision !== entry.revision) throw Error(preview?.error || 'Task changed; refresh before publication.');
      const command = publicationCommand(preview);
      previews.set(entry.key, { preview, project });
      panel.innerHTML = `<p>${esc(preview.repository)} · ${esc(preview.branch)} → ${esc(preview.base)} · SHA ${esc(preview.head)}</p>`
        + `<p>${esc(preview.scope)}</p><pre>${esc(preview.summary)}</pre><details><summary>Review every commit being published</summary><pre>${esc(preview.patch)}</pre></details>`
        + (preview.ticket && config.publish ? `<label>Type ${esc(preview.branch)} to confirm draft PR publication <input data-publication-confirm="${esc(entry.key)}" autocomplete="off"></label><button type="button" class="gate-btn" data-work-key="${esc(entry.key)}" data-work-action="publish_publication">Publish approved draft PR</button>` : '<p>Browser publication is unavailable on this connection. Confirm using the host CLI.</p>')
        + `<p>Only push and draft PR are authorized. No commit, merge, release or deploy.</p><pre>${esc(command)}</pre>`;
    } catch (error) {
      if (project === config.project() && seq === generation && panel.isConnected) panel.textContent = error.message;
    }
  }
  const previews = new Map();
  async function publish(entry, button) {
    const saved = previews.get(entry.key), project = config.project();
    if (!saved || saved.project !== project || !saved.preview.ticket || !config.publish) return;
    const branch = [...document.querySelectorAll('[data-publication-confirm]')].find(n => n.dataset.publicationConfirm === entry.key)?.value;
    if (branch !== saved.preview.branch) { status('Type the exact preview branch to authorize publication.'); return; }
    button.disabled = true; previews.delete(entry.key); status('Publishing the approved candidate; do not retry until its outcome is known.');
    try {
      const result = await config.publish(`/api/work/publication${project ? '?project=' + encodeURIComponent(project) : ''}`, { ticket: saved.preview.ticket, branch, confirm: 'publish-draft-pr' });
      if (project !== config.project()) return;
      if (!result || result.error || result.publication?.state !== 'pr-linked' || !/^https:\/\/github\.com\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9][0-9]*$/.test(result.publication?.url || ''))
        throw Error(result?.error || 'Publication result is not linked to a draft PR; reconcile task state.');
      status('Draft PR publication recorded. Merge and release remain separate decisions.'); await refresh();
    } catch (error) { if (project === config.project()) { status(error.message); await refresh(); } }
  }
  let config, snapshot, snapshotProject = null, generation = 0, filter = '', selectedKey = null, category = 'active', tab = 'overview';
  let graphDirection = 'lr';
  let activeDialog = null, dialogOpener = null, dialogReturn = null, dialogEscape = null, pendingPaint = false, listPosition = null;
  const status = message => { document.getElementById('work-feedback').textContent = message; };
  function notifyView() { config?.onViewChange?.({ detail: !!selectedKey, tab }); }
  function navigateRoute(input) {
    const route = parseRoute(input);
    if (!route) return false;
    closeWorkDialog(false);
    const wasDetail = !!selectedKey;
    if (selectedKey !== route.selectedKey) graphDirection = 'lr';
    selectedKey = route.selectedKey; tab = route.tab; category = route.category; filter = route.search;
    if (snapshot && snapshotProject !== config?.project()) { snapshot = null; previews.clear(); document.getElementById('work-list').innerHTML = ''; document.getElementById('work-list').textContent = 'Loading selected project…'; }
    notifyView(); paint();
    if (wasDetail && !selectedKey) restoreListPosition();
    return true;
  }
  function rememberListPosition() {
    const list = document.getElementById('work-list'), scroller = list.closest?.('.panel');
    listPosition = { project: config.project(), category, filter, key: selectedKey, top: scroller?.scrollTop || 0 };
  }
  function restoreListPosition() {
    if (!listPosition || listPosition.project !== config.project() || listPosition.category !== category || listPosition.filter !== filter) return;
    const list = document.getElementById('work-list'), scroller = list.closest?.('.panel');
    if (scroller) scroller.scrollTop = listPosition.top;
    [...document.querySelectorAll('[data-work-select]')].find(n => n.dataset.workSelect === listPosition.key)?.focus({ preventScroll: true });
  }
  function changeWorkspace() {
    closeWorkDialog(false); notifyView(); paint();
    config.navigate?.(workspaceRoute(selectedKey, tab, category, filter));
  }
  function closeWorkDialog(restore = true) {
    if (!activeDialog) return;
    const dialog = activeDialog, opener = dialogOpener, returnTo = dialogReturn;
    activeDialog = null; dialogOpener = null; dialogReturn = null;
    if (dialogEscape) { document.removeEventListener('keydown', dialogEscape, true); dialogEscape = null; }
    if (dialog.open) dialog.close();
    dialog.remove();
    if (pendingPaint) { pendingPaint = false; paint(); }
    if (!restore || !returnTo || returnTo.project !== config.project() || returnTo.task !== selectedKey) return;
    const replacement = returnTo.node
      ? [...document.querySelectorAll('[data-graph-node]')].find(node => node.dataset.graphNode === returnTo.node)
      : returnTo.switcher ? document.querySelectorAll('[data-work-switch]')[0] : null;
    if (opener?.isConnected) opener.focus();
    else replacement?.focus();
  }
  function leaveView() { pendingPaint = false; closeWorkDialog(false); }
  function makeWorkDialog(className, title, opener, content, modal) {
    closeWorkDialog(false);
    const dialog = document.createElement('dialog'); dialog.className = className;
    dialog.setAttribute('aria-label', title);
    dialog.innerHTML = `<header><h2>${esc(title)}</h2><button type="button" data-dialog-close aria-label="Close ${esc(title)}">Close</button></header>${content}`;
    document.body.append(dialog); activeDialog = dialog; dialogOpener = opener;
    dialogReturn = { project: config.project(), task: selectedKey, node: opener?.dataset?.graphNode || null, switcher: Object.prototype.hasOwnProperty.call(opener?.dataset || {}, 'workSwitch') };
    dialogEscape = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeWorkDialog(); } };
    document.addEventListener('keydown', dialogEscape, true);
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeWorkDialog(); });
    dialog.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeWorkDialog(); } });
    dialog.addEventListener('click', event => { if (event.target.closest('[data-dialog-close]')) closeWorkDialog(); });
    dialog.addEventListener('close', () => { if (activeDialog === dialog) closeWorkDialog(); });
    if (modal) dialog.showModal(); else dialog.show();
    return dialog;
  }
  function openTaskSwitcher(opener) {
    const rows = cockpitEntries(snapshot, category, filter);
    const dialog = makeWorkDialog('work-switcher', 'Switch task', opener, '<label>Find a task<input type="search" data-switch-search placeholder="Title or task ID"></label><p class="work-meta">Tasks in the current project and list filter.</p><div data-switch-rows>' + taskRows(rows, selectedKey) + '</div><p data-switch-empty hidden>No matching task.</p>', true);
    const input = dialog.querySelector('[data-switch-search]'); input.focus();
    input.addEventListener('input', () => { let count = 0; dialog.querySelectorAll('[data-work-select]').forEach(button => { const entry = rows.find(e => e.key === button.dataset.workSelect); button.hidden = !`${entry.title} ${entry.key}`.toLowerCase().includes(input.value.toLowerCase()); if (!button.hidden) count++; }); dialog.querySelector('[data-switch-empty]').hidden = count > 0; });
    dialog.addEventListener('click', event => { const button = event.target.closest('[data-work-select]'); if (button && snapshot?.entries.some(e => e.key === button.dataset.workSelect) && snapshotProject === config.project()) { selectedKey = button.dataset.workSelect; tab = 'overview'; changeWorkspace(); document.querySelector('[data-work-tab]')?.focus(); } });
  }
  function openNodeInspector(detail, opener) {
    document.querySelectorAll('[data-graph-detail][open]').forEach(node => { node.open = false; });
    const content = detail.outerHTML.replace('<details ', '<details open ');
    const dialog = makeWorkDialog('work-node-inspector', 'Recorded node details', opener, '<p class="work-meta">Recorded inputs, not proof of correctness, current activity or acceptance.</p>' + content, false);
    dialog.querySelector('summary')?.focus();
  }
  async function nextObservationPage(button) {
    const project = config.project(), entryKey = selectedKey, oldSnapshot = snapshot;
    try {
      const binding = JSON.parse(button.dataset.hostGraphNext), query = new URLSearchParams({ host: binding.host, session: binding.sessionId, run: binding.runId, cursor: binding.cursor });
      if (project) query.set('project', project);
      button.disabled = true;
      const page = await config.read('/api/host-graph?' + query.toString());
      if (project !== config.project() || entryKey !== selectedKey || snapshot !== oldSnapshot) return;
      if (!page || page.error || page.source !== 'host-observation') throw Error('unavailable');
      const entry = snapshot.entries.find(e => e.key === entryKey), graphs = [entry?.execution?.graph, ...(entry?.execution?.observations || [])];
      const graph = graphs.find(g => g?.binding?.sessionId === binding.sessionId && g?.binding?.host === binding.host && g?.binding?.runId === binding.runId);
      if (!graph) throw Error('unavailable');
      Object.assign(graph, page); paint();
      status(`Observation page loaded: ${page.nodes?.length || 0} recorded nodes.`);
      const first = page.nodes?.[0]?.id;
      if (first) [...document.querySelectorAll('[data-graph-node]')].find(node => node.dataset.graphNode === first)?.focus();
    } catch { status('Observation page is unavailable. Refresh the selected project and retry.'); }
    finally { if (button.isConnected) button.disabled = false; }
  }
  async function refresh() {
    const seq = ++generation, project = config.project();
    try {
      const data = await config.read(`/api/work${project ? '?project=' + encodeURIComponent(project) : ''}`);
      if (seq !== generation || project !== config.project()) return;
      if (!data || data.error || data.schemaVersion !== 1) throw Error(data?.error || 'Cannot read work state. Check the board connection and refresh.');
      if (snapshotProject === project && snapshot?.revision === data.revision) return;
      snapshot = data; snapshotProject = project;
      if (config.canvas && activeDialog?.open) { pendingPaint = true; previews.clear(); } else paint();
    } catch (error) {
      if (seq !== generation || project !== config.project()) return;
      snapshot = null; snapshotProject = null; pendingPaint = false; closeWorkDialog(false);
      for (const id of ['work-list', 'history-list']) document.getElementById(id).textContent = error.message;
    }
  }
  function paint() {
    if (!snapshot || (config?.canvas && snapshotProject !== config.project())) return;
    previews.clear(); // Repaint removes the reviewed diff and its confirmation controls.
    const oldWorkspace = document.querySelector?.('[data-observation-scope]');
    const sameObservationScope = oldWorkspace?.dataset.observationScope === JSON.stringify([snapshotProject, selectedKey]);
    const expandedHosts = sameObservationScope ? [...oldWorkspace.querySelectorAll('[data-observation-key][open]')].slice(0, 16).map(detail => detail.dataset.observationKey).filter(key => typeof key === 'string' && key.length <= 1024) : [];
    const expanded = [...document.querySelectorAll('.work-card details[open]')].map(d => `${d.closest('[data-entry-key]').dataset.entryKey}:${d.dataset.workDetail}`);
    const focused = document.activeElement;
    const focusKey = focused?.dataset?.workKey, focusAction = focused?.dataset?.workAction;
    const focusSelect = focused?.dataset?.workSelect, focusFilter = focused?.dataset?.workFilter, focusTab = focused?.dataset?.workTab;
    const focusNode = focused?.dataset?.graphNode;
    const oldCanvas = config.canvas ? document.querySelector?.('.execution-graph-canvas') : null;
    const oldSvg = oldCanvas?.querySelector('svg'), oldZoom = oldSvg ? Number(oldSvg.dataset.zoom || 1) : 1;
    const graphScroll = oldCanvas?.closest('[data-selected-work]')?.dataset.selectedWork === selectedKey && oldSvg?.dataset.graphLayout === graphDirection ? { left: oldCanvas.scrollLeft, top: oldCanvas.scrollTop } : null;
    document.getElementById('work-list').innerHTML = renderCockpit(snapshot, { search: filter, selectedKey, category, tab, canvas: !!config.canvas, direction: graphDirection, observationProject: snapshotProject });
    document.getElementById('history-list').innerHTML = render(snapshot, true, filter);
    if (graphScroll) {
      const canvas = document.querySelector?.('.execution-graph-canvas'), svg = canvas?.querySelector('svg');
      if (svg && Number.isFinite(oldZoom) && oldZoom > 0) { const bounds = svg.viewBox.baseVal; svg.dataset.zoom = String(oldZoom); svg.setAttribute('width', String(bounds.width * oldZoom)); svg.setAttribute('height', String(bounds.height * oldZoom)); canvas.scrollLeft = graphScroll.left; canvas.scrollTop = graphScroll.top; }
    }
    for (const detail of document.querySelectorAll('[data-observation-key]')) if (expandedHosts.includes(detail.dataset.observationKey)) detail.open = true;
    for (const card of document.querySelectorAll('[data-entry-key]')) for (const detail of card.querySelectorAll('details'))
      if (expanded.includes(`${card.dataset.entryKey}:${detail.dataset.workDetail}`)) detail.open = true;
    if (focusKey) [...document.querySelectorAll('[data-work-key]')].find(b => b.dataset.workKey === focusKey && b.dataset.workAction === focusAction)?.focus();
    else if (focusSelect) [...document.querySelectorAll('[data-work-select]')].find(b => b.dataset.workSelect === focusSelect)?.focus();
    else if (focusFilter) [...document.querySelectorAll('[data-work-filter]')].find(b => b.dataset.workFilter === focusFilter)?.focus();
    else if (focusTab) [...document.querySelectorAll('[data-work-tab]')].find(b => b.dataset.workTab === focusTab)?.focus();
    else if (focusNode) [...document.querySelectorAll('[data-graph-node]')].find(n => n.dataset.graphNode === focusNode)?.focus({ preventScroll: true });
  }
  function reset() {
    closeWorkDialog(false); pendingPaint = false; listPosition = null; graphDirection = 'lr';
    generation++; snapshotProject = null; snapshot = null; previews.clear(); selectedKey = null; category = 'active'; tab = 'overview'; filter = ''; status(''); notifyView();
    for (const id of ['work-list', 'history-list']) document.getElementById(id).textContent = 'Loading project work…';
    refresh();
  }
  async function copy(command) {
    try { await navigator.clipboard.writeText(command); status('Command copied. Run it in a terminal in the selected project; execution has not started here.'); }
    catch { status('Clipboard unavailable. Select and copy the displayed command.'); }
  }
  function bind(options) {
    config = options;
    document.getElementById('work-compose').addEventListener('submit', event => {
      event.preventDefault();
      try {
        const cmd = commandFor(document.getElementById('work-goal').value, document.getElementById('work-host').value, document.getElementById('work-allow').value);
        document.getElementById('work-command').textContent = cmd; copy(cmd);
      } catch (error) { document.getElementById('work-command').textContent = ''; status(error.message); }
    });
    document.getElementById('work-host').addEventListener('change', event => {
      document.getElementById('work-allow-row').hidden = event.target.value !== 'codex';
      document.getElementById('work-command').textContent = ''; status('');
    });
    for (const id of ['work-list', 'history-list']) document.getElementById(id).addEventListener('click', event => {
      if (config.canvas && snapshotProject !== config.project()) return;
      const pageButton = event.target.closest('[data-host-graph-next]');
      if (pageButton?.dataset.hostGraphNext) { nextObservationPage(pageButton); return; }
      if (graphInteraction(event.target)) return;
      if (!snapshot || (config.canvas && snapshotProject !== config.project())) return;
      if (config.canvas) {
        if (event.target.closest('[data-work-back]')) { selectedKey = null; tab = 'overview'; changeWorkspace(); restoreListPosition(); return; }
        const switcher = event.target.closest('[data-work-switch]');
        if (switcher) { openTaskSwitcher(switcher); return; }
        const direction = event.target.closest('[data-work-previous]') ? -1 : event.target.closest('[data-work-next]') ? 1 : 0;
        if (direction) { const rows = cockpitEntries(snapshot, category, filter), index = rows.findIndex(e => e.key === selectedKey), next = index >= 0 ? rows[index + direction] : null; if (next) { selectedKey = next.key; tab = 'overview'; changeWorkspace(); } return; }
      }
      const button = event.target.closest('[data-work-action]');
      if (!button?.dataset.workAction) {
        const selection = event.target.closest('[data-work-select]');
        const filterButton = event.target.closest('[data-work-filter]');
        const tabButton = event.target.closest('[data-work-tab]');
        if (selection?.dataset.workSelect && snapshot.entries.some(e => e.key === selection.dataset.workSelect)) { if (config.canvas) { rememberListPosition(); listPosition.key = selection.dataset.workSelect; } selectedKey = selection.dataset.workSelect; tab = 'overview'; if (config.canvas) changeWorkspace(); else paint(); }
        else if (categories.some(([key]) => key === filterButton?.dataset.workFilter)) { category = filterButton.dataset.workFilter; selectedKey = null; tab = 'overview'; if (config.canvas) changeWorkspace(); else paint(); }
        else if (['overview', 'execution', 'evidence'].includes(tabButton?.dataset.workTab)) { tab = tabButton.dataset.workTab; if (config.canvas) changeWorkspace(); else paint(); }
        return;
      }
      const entry = snapshot.entries.find(e => e.key === button.dataset.workKey);
      if (button.dataset.workAction === 'preview_publication' && entry?.publicationPreview) { previewPublication(entry); return; }
      if (button.dataset.workAction === 'publish_publication' && entry?.publicationPreview) { publish(entry, button); return; }
      const action = entry?.capabilities.find(c => c.action === button.dataset.workAction && c.enabled);
      if (!action) return;
      if (action.action === 'copy_resume' || action.action === 'copy_approve') copy(entry.command);
      else options.openIssue(entry.issueIds[0], action.action === 'review_decision');
    });
    document.getElementById('work-list').addEventListener('keydown', event => {
      if (config.canvas && snapshotProject !== config.project()) return;
      const graphFind = event.target.closest('[data-graph-find]');
      if (event.key === 'Enter' && graphFind?.dataset.graphFind === 'query') { event.preventDefault(); focusGraphMatch(graphFind.closest('.execution-graph'), graphFind.value); return; }
      if (['Enter', ' '].includes(event.key) && event.target.closest('[data-graph-node]')?.dataset.graphNode) { event.preventDefault(); graphInteraction(event.target); return; }
      const button = event.target.closest('[data-work-tab]');
      if (!button || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabs = ['overview', 'execution', 'evidence'], current = tabs.indexOf(button.dataset.workTab);
      if (current < 0) return;
      event.preventDefault();
      tab = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[2] : tabs[(current + (event.key === 'ArrowRight' ? 1 : 2)) % 3];
      if (config.canvas) changeWorkspace(); else paint();
      [...document.querySelectorAll('[data-work-tab]')].find(b => b.dataset.workTab === tab)?.focus();
    });
    setInterval(() => { if (!document.hidden && options.visible()) refresh(); }, 10000);
  }
  window.GctoWork = { bind, refresh, reset, leaveView, parseRoute, navigateRoute, render, renderCockpit, renderExecutionGraph, commandFor, publicationCommand, getSnapshot() { return snapshot; }, showCompleted() { category = 'completed'; selectedKey = null; tab = 'overview'; notifyView(); paint(); }, search(value) { filter = value; if (config?.canvas) { if (!selectedKey) changeWorkspace(); } else paint(); } };
})();
