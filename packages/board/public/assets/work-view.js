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
  let config, snapshot, generation = 0, filter = '';
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
    document.getElementById('work-list').innerHTML = render(snapshot, false, filter);
    document.getElementById('history-list').innerHTML = render(snapshot, true, filter);
    for (const card of document.querySelectorAll('[data-entry-key]')) for (const detail of card.querySelectorAll('details'))
      if (expanded.includes(`${card.dataset.entryKey}:${detail.dataset.workDetail}`)) detail.open = true;
    if (focusKey) [...document.querySelectorAll('[data-work-key]')].find(b => b.dataset.workKey === focusKey && b.dataset.workAction === focusAction)?.focus();
  }
  function reset() {
    generation++; snapshot = null; previews.clear(); status('');
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
      const button = event.target.closest('[data-work-action]'); if (!button || !snapshot) return;
      const entry = snapshot.entries.find(e => e.key === button.dataset.workKey);
      if (button.dataset.workAction === 'preview_publication' && entry?.publicationPreview) { previewPublication(entry); return; }
      if (button.dataset.workAction === 'publish_publication' && entry?.publicationPreview) { publish(entry, button); return; }
      const action = entry?.capabilities.find(c => c.action === button.dataset.workAction && c.enabled);
      if (!action) return;
      if (action.action === 'copy_resume' || action.action === 'copy_approve') copy(entry.command);
      else options.openIssue(entry.issueIds[0], action.action === 'review_decision');
    });
    setInterval(() => { if (!document.hidden && options.visible()) refresh(); }, 10000);
  }
  window.GctoWork = { bind, refresh, reset, render, commandFor, publicationCommand, search(value) { filter = value; paint(); } };
})();
