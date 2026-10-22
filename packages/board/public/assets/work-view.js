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
  function renderExecution(entry) {
    const roles = Array.isArray(entry.evidence) ? entry.evidence : [];
    const execution = entry.execution, nodes = Array.isArray(execution?.nodes) ? execution.nodes.slice(0, 200) : [];
    return '<section class="work-execution"><h3>Recorded observations</h3>'
      + renderExecutionGraph(execution?.graph)
      + (execution?.graph?.state === 'recorded' ? '' : '<p>Dependencies not recorded. This is an observation list, not an inferred execution graph. Event order does not establish dependencies.</p>')
      + `<p>Recorded stage: ${esc(entry.stage || 'not recorded')}</p>`
      + (execution?.reason ? `<p>${esc(execution.reason)}</p>` : '')
      + (execution?.truncated ? '<p class="work-warning">Showing the latest 200 recorded attempts; earlier observations are truncated.</p>' : execution?.partial ? '<p class="work-warning">Attempt observations are incomplete.</p>' : '')
      + (nodes.length ? '<ul class="work-observations" aria-label="Recorded execution attempts">' + nodes.map(n => `<li class="work-observation" data-attempt-id="${esc(n.attemptId)}"><strong>${esc(n.role)} · attempt ${esc(n.number || 'unknown')}</strong>`
        + `<p>${esc(n.host || 'Host not recorded')} · phase: ${esc(n.phase || 'not recorded')}</p><p>Controller recorded status: ${esc(n.status || 'unknown')}; not current verification or acceptance.</p>`
        + `<p>Run: ${esc(n.runId)} · Attempt: ${esc(n.attemptId)}</p><p>Started: ${esc(n.startedAt || 'not recorded')} · Finished: ${esc(n.finishedAt || 'not recorded')}</p></li>`).join('') + '</ul>' : '')
      + (roles.length ? '<ul class="work-observations">' + roles.map(role => `<li class="work-observation">${esc(role.label)} · recorded role observation; acceptance is not inferred</li>`).join('') + '</ul>' : '<p>No role observations recorded.</p>')
      + (entry.inspector ? renderInspector(entry.inspector).replace('<details ', '<details open ') : '<p>Linked activity unavailable. Absence of events is not proof of inactivity.</p>')
      + '</section>';
  }
  function renderExecutionGraph(graph) {
    if (graph?.state !== 'recorded' || !Array.isArray(graph.nodes) || !graph.nodes.length)
      return `<p class="work-meta">${esc(graph?.reason || 'Controller-recorded graph unavailable. Native and legacy observations remain partial.')}</p>`;
    if (graph.nodes.length > 512 || !Array.isArray(graph.edges) || graph.edges.length > 2048) return '<p>Graph exceeds the display limit.</p>';
    const nodes = graph.nodes, ids = new Map(nodes.map((n, i) => [n.id, i]));
    if (ids.size !== nodes.length || graph.edges.some(e => !ids.has(e.from) || !ids.has(e.to) || ids.get(e.from) >= ids.get(e.to)))
      return '<p>Graph dependencies cannot be displayed safely.</p>';
    const levels = new Map(nodes.map(n => [n.id, 0]));
    const parents = new Map(nodes.map(n => [n.id, []]));
    for (const e of graph.edges) parents.get(e.to).push(e);
    const rows = new Map(), positions = new Map();
    for (const n of nodes) {
      const level = Math.max(0, ...parents.get(n.id).map(e => levels.get(e.from) + 1));
      levels.set(n.id, level);
      const row = rows.get(level) || 0; rows.set(level, row + 1);
      positions.set(n.id, { x: 24 + row * 236, y: 24 + level * 112 });
    }
    const width = Math.max(500, Math.max(...rows.values()) * 236 + 24), height = (Math.max(...levels.values()) + 1) * 112 + 24;
    const edges = graph.edges.map(e => {
      const a = positions.get(e.from), b = positions.get(e.to);
      return `<path d="M${a.x + 104} ${a.y + 78} C${a.x + 104} ${a.y + 98},${b.x + 104} ${b.y - 20},${b.x + 104} ${b.y}" marker-end="url(#execution-arrow)"><title>${esc(e.kind)}: ${esc(e.from)} to ${esc(e.to)}</title></path>`;
    }).join('');
    const short = value => String(value || '').length > 27 ? String(value).slice(0, 26) + '…' : String(value || '');
    const boxes = nodes.map(n => {
      const p = positions.get(n.id);
      return `<g class="execution-node" role="button" tabindex="0" data-graph-node="${esc(n.id)}" aria-label="${esc(n.kind)} ${esc(n.role || '')}: ${esc(n.status)}. Open recorded details." transform="translate(${p.x},${p.y})"><rect width="208" height="78" rx="6"/><text x="12" y="23">${esc(short(n.role || n.kind))}</text><text x="12" y="45">${esc(n.kind)} · ${esc(n.status)}</text><text x="12" y="64">${esc(n.host || 'controller')}</text></g>`;
    }).join('');
    const details = nodes.map(n => `<details class="execution-node-detail" data-graph-detail="${esc(n.id)}"><summary>${esc(n.id)} · ${esc(n.kind)} · ${esc(n.role || 'controller')} · ${esc(n.status)}</summary><dl>`
      + [['Attempt', n.attemptId], ['Host', n.host], ['Recorded at', n.at], ['Verdict', n.verdict], ['Wave', n.waveId], ['Gates', (n.gates || []).join(', ')],
        ['Workflow snapshot SHA-256', n.graphDigest], ['Input receipt SHA-256', n.inputDigest], ['Output receipt SHA-256', n.outputDigest],
        [n.kind === 'reuse' ? 'Historical report SHA-256 (worker not invoked)' : 'Stage context SHA-256', n.contextDigest], ['Result SHA-256', n.resultDigest]]
        .map(([key, value]) => `<dt>${esc(key)}</dt><dd><code>${esc(value || 'Not recorded')}</code></dd>`).join('')
      + `<dt>Recorded predecessors</dt><dd>${parents.get(n.id).map(e => `${esc(e.from)} (${esc(e.kind)})`).join(', ') || 'None recorded; not proof of complete external inputs'}</dd></dl></details>`).join('');
    return `<section class="execution-graph" aria-label="Controller-recorded execution graph"><h3>Controller-recorded graph</h3><p>${nodes.length} nodes · ${graph.edges.length} recorded edges · ${graph.snapshots?.length || 0} workflow snapshots. ${graph.complete ? 'Controller history recorded from run creation.' : 'Partial history: missing edges are not inferred.'}</p>`
      + `<p class="work-meta">Dispatch, input, verification, gate and join edges describe controller observations. Intent is not proof of a live worker; recorded approval is not deployment or task acceptance. Historical reuse does not invoke a worker. Stage context digests exclude separately admitted domain packets.</p>`
      + (graph.reason ? `<p class="work-warning">${esc(graph.reason)}</p>` : '')
      + `<div class="execution-graph-tools" role="group" aria-label="Graph zoom"><button type="button" class="gate-btn" data-graph-scale="0.75">Zoom out</button><button type="button" class="gate-btn" data-graph-scale="1.333333">Zoom in</button><button type="button" class="gate-btn" data-graph-scale="reset">Reset zoom</button></div>`
      + `<div class="execution-graph-canvas" tabindex="0" aria-label="Scrollable graph. Tab to a node and press Enter for details."><svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="group" aria-label="Recorded execution dependencies"><defs><marker id="execution-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8"/></marker></defs><g class="execution-edges" fill="none">${edges}</g>${boxes}</svg></div>`
      + `<h3>Recorded node details</h3><p class="work-meta">Use the graph or expand a node below. Digests bind recorded inputs, not correctness.</p>${details}</section>`;
  }
  function graphInteraction(target) {
    const node = target.closest('[data-graph-node]');
    if (node?.dataset.graphNode) {
      const detail = [...document.querySelectorAll('[data-graph-detail]')].find(el => el.dataset.graphDetail === node.dataset.graphNode);
      if (detail) { detail.open = true; detail.querySelector('summary')?.focus(); detail.scrollIntoView({ block: 'nearest' }); }
      return true;
    }
    const scale = target.closest('[data-graph-scale]');
    if (!scale?.dataset.graphScale) return false;
    const svg = scale.closest('.execution-graph').querySelector('svg'), bounds = svg.viewBox.baseVal;
    const next = scale.dataset.graphScale === 'reset' ? 1 : Math.min(2, Math.max(0.25, Number(svg.dataset.zoom || 1) * Number(scale.dataset.graphScale)));
    svg.dataset.zoom = String(next); svg.setAttribute('width', String(bounds.width * next)); svg.setAttribute('height', String(bounds.height * next));
    return true;
  }
  function renderCockpit(data, options = {}) {
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
  let config, snapshot, generation = 0, filter = '', selectedKey = null, category = 'active', tab = 'overview';
  const status = message => { document.getElementById('work-feedback').textContent = message; };
  async function refresh() {
    const seq = ++generation, project = config.project();
    try {
      const data = await config.read(`/api/work${project ? '?project=' + encodeURIComponent(project) : ''}`);
      if (seq !== generation || project !== config.project()) return;
      if (!data || data.error || data.schemaVersion !== 1) throw Error(data?.error || 'Cannot read work state. Check the board connection and refresh.');
      if (snapshot?.revision === data.revision) return;
      snapshot = data; paint();
    } catch (error) {
      if (seq !== generation || project !== config.project()) return;
      snapshot = null;
      for (const id of ['work-list', 'history-list']) document.getElementById(id).textContent = error.message;
    }
  }
  function paint() {
    if (!snapshot) return;
    previews.clear(); // Repaint removes the reviewed diff and its confirmation controls.
    const expanded = [...document.querySelectorAll('.work-card details[open]')].map(d => `${d.closest('[data-entry-key]').dataset.entryKey}:${d.dataset.workDetail}`);
    const focused = document.activeElement;
    const focusKey = focused?.dataset?.workKey, focusAction = focused?.dataset?.workAction;
    const focusSelect = focused?.dataset?.workSelect, focusFilter = focused?.dataset?.workFilter, focusTab = focused?.dataset?.workTab;
    document.getElementById('work-list').innerHTML = renderCockpit(snapshot, { search: filter, selectedKey, category, tab });
    document.getElementById('history-list').innerHTML = render(snapshot, true, filter);
    for (const card of document.querySelectorAll('[data-entry-key]')) for (const detail of card.querySelectorAll('details'))
      if (expanded.includes(`${card.dataset.entryKey}:${detail.dataset.workDetail}`)) detail.open = true;
    if (focusKey) [...document.querySelectorAll('[data-work-key]')].find(b => b.dataset.workKey === focusKey && b.dataset.workAction === focusAction)?.focus();
    else if (focusSelect) [...document.querySelectorAll('[data-work-select]')].find(b => b.dataset.workSelect === focusSelect)?.focus();
    else if (focusFilter) [...document.querySelectorAll('[data-work-filter]')].find(b => b.dataset.workFilter === focusFilter)?.focus();
    else if (focusTab) [...document.querySelectorAll('[data-work-tab]')].find(b => b.dataset.workTab === focusTab)?.focus();
  }
  function reset() {
    generation++; snapshot = null; previews.clear(); selectedKey = null; category = 'active'; tab = 'overview'; filter = ''; status('');
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
      if (graphInteraction(event.target)) return;
      if (!snapshot) return;
      const button = event.target.closest('[data-work-action]');
      if (!button?.dataset.workAction) {
        const selection = event.target.closest('[data-work-select]');
        const filterButton = event.target.closest('[data-work-filter]');
        const tabButton = event.target.closest('[data-work-tab]');
        if (selection?.dataset.workSelect && snapshot.entries.some(e => e.key === selection.dataset.workSelect)) { selectedKey = selection.dataset.workSelect; tab = 'overview'; paint(); }
        else if (categories.some(([key]) => key === filterButton?.dataset.workFilter)) { category = filterButton.dataset.workFilter; selectedKey = null; tab = 'overview'; paint(); }
        else if (['overview', 'execution', 'evidence'].includes(tabButton?.dataset.workTab)) { tab = tabButton.dataset.workTab; paint(); }
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
      if (['Enter', ' '].includes(event.key) && event.target.closest('[data-graph-node]')) { event.preventDefault(); graphInteraction(event.target); return; }
      const button = event.target.closest('[data-work-tab]');
      if (!button || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabs = ['overview', 'execution', 'evidence'], current = tabs.indexOf(button.dataset.workTab);
      if (current < 0) return;
      event.preventDefault();
      tab = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[2] : tabs[(current + (event.key === 'ArrowRight' ? 1 : 2)) % 3];
      paint();
      [...document.querySelectorAll('[data-work-tab]')].find(b => b.dataset.workTab === tab)?.focus();
    });
    setInterval(() => { if (!document.hidden && options.visible()) refresh(); }, 10000);
  }
  window.GctoWork = { bind, refresh, reset, render, renderCockpit, renderExecutionGraph, commandFor, publicationCommand, getSnapshot() { return snapshot; }, showCompleted() { category = 'completed'; selectedKey = null; tab = 'overview'; paint(); }, search(value) { filter = value; paint(); } };
})();
