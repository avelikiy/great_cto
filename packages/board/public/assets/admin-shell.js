/* Task-first projection. Existing controller commands and authorization remain authoritative. */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const aliases = { docs:'knowledge', usage:'insights/consumption', ledger:'insights/ledger', budgets:'insights/ledger', dashboard:'insights/ledger', fleet:'settings/executors', agents:'settings/executors', harness:'settings/runtime', skills:'settings/capabilities', history:'work/completed', inbox:'decisions', notifications:'settings/general', share:'settings/general' };
  function route(input) {
    if (/^(?:agents|fleet)\/[a-z0-9-]+$/i.test(input)) return {canonical:input,panel:'agents',primary:'settings'};
    const canonical = aliases[input] || input;
    const panels = { work:'work','work/completed':'history',decisions:'inbox',knowledge:'knowledge',insights:'admin-outcomes','insights/outcomes':'admin-outcomes','insights/consumption':'usage','insights/ledger':'budgets',settings:'agents','settings/executors':'agents','settings/runtime':'harness','settings/capabilities':'skills','settings/general':'settings' };
    if (!panels[canonical]) return null;
    return { canonical, panel:panels[canonical], primary:canonical.split('/')[0] };
  }
  function outcomes(snapshot) {
    const tasks = (snapshot.entries || []).filter(e => e.kind === 'task');
    const completed = tasks.filter(e => e.taskOutcome?.state === 'completed').length;
    return {tasks:tasks.length,completed,unknown:tasks.length-completed,acceptanceRate:null,costPerAcceptedTask:null};
  }
  let generation=0, selectedDoc=null, selectedRoute='work', request=0, indexRequest=0;
  const scope = () => new URLSearchParams(location.search).get('project') || '';
  const scoped = path => path+(path.includes('?')?'&':'?')+'project='+encodeURIComponent(scope());
  const panel = id => document.getElementById(id);
  function current(seq, project) { return seq===generation && project===scope(); }
  function reset() {
    generation++; request++; selectedDoc=null;
    for (const id of ['knowledge-index','knowledge-document','admin-outcomes-body']) if(panel(id)) panel(id).textContent='Loading selected project…';
    if (selectedRoute==='knowledge') loadKnowledge();
    if (selectedRoute==='insights'||selectedRoute==='insights/outcomes') loadTaskOutcomes();
  }
  async function loadTaskOutcomes() {
    const seq=generation, project=scope(), ticket=++request, el=panel('admin-outcomes-body');
    el.textContent='Reading task-linked outcomes…';
    try {
      const data=await api(scoped('/api/work'));
      if (!current(seq,project)||ticket!==request) return;
      if (!data || data.error || data.schemaVersion!==1) throw Error(data?.error || 'Task outcomes are unavailable.');
      const d=outcomes(data);
      el.innerHTML=`<p class="work-meta">Observed ${esc(data.observedAt)} · ${data.health==='current'?'Sources read':'Sources incomplete'} · Recorded task metadata, not a benchmark</p>
        <div class="admin-metrics"><section><h2>${d.tasks}</h2><p>Tracked tasks</p><small>Legacy issues and standalone runs excluded</small></section><section><h2>${d.completed}</h2><p>Explicitly completed outcomes</p><small>Recorded completion, not an acceptance-rate estimate</small></section><section><h2>${d.unknown}</h2><p>No completed outcome recorded</p><small>Includes in-progress tasks; not a failure count</small></section><section><h2>Unavailable</h2><p>Cost per accepted task</p><small>Complete task-bound actual spend is not available</small></section></div>
        <div class="admin-notice">Acceptance rate, time to acceptance and severe regressions are not measured by this projection. Role verdicts, closed issues and successful processes cannot supply those numbers.</div>
        <h2 class="admin-section-title">Recorded work</h2><div class="admin-table-scroll"><table class="admin-table"><thead><tr><th>Task</th><th>Host</th><th>State</th><th>Outcome</th></tr></thead><tbody>${(data.entries||[]).filter(e=>e.kind==='task').slice(0,100).map(e=>`<tr><td>${esc(e.title)}</td><td>${esc(e.host||'Not linked')}</td><td>${esc(e.phase||'Unknown')}</td><td>${esc(e.taskOutcome?.state||'Not recorded')}</td></tr>`).join('')||'<tr><td colspan="4">No tracked task outcomes in the readable records.</td></tr>'}</tbody></table></div><p class="work-meta">All available tracked tasks, not a time-window cohort. Host quality comparisons require matched tasks, budgets and acceptance criteria.</p>`;
    } catch(error) { if(current(seq,project)&&ticket===request) el.textContent='Outcomes could not be read: '+error.message; }
  }
  async function loadKnowledge() {
    const seq=generation, project=scope(), ticket=++indexRequest;
    request++; selectedDoc=null;
    panel('knowledge-index').textContent='Reading project documents…';
    try {
      const data=await api(scoped('/api/docs'));
      if (!current(seq,project)||ticket!==indexRequest) return;
      if (!data || data.error || data.state==='unreadable' || !Array.isArray(data.groups)) throw Error(data?.error || 'Document index is unavailable.');
      const unreadable=data.groups.flatMap(g=>g.docs).filter(d=>d.readState&&d.readState!=='readable').length;
      panel('knowledge-index').innerHTML=`<label class="admin-doc-search">Find a document<input type="search" id="knowledge-search" placeholder="Filter document titles and paths"></label><p class="work-meta">${esc(data.total)} indexed${data.truncated?' · Index truncated':''}${unreadable?' · '+unreadable+' unreadable or oversized':''}</p>`+data.groups.map(g=>`<section><h2>${esc(g.label)}</h2>${g.docs.map(d=>`<button type="button" class="knowledge-file" data-doc-path="${esc(d.path)}" data-doc-search="${esc(d.title+' '+d.path)}">${esc(d.title)}<small>${esc(d.path)}${d.readState&&d.readState!=='readable'?' · '+esc(d.readState):''}</small></button>`).join('')}</section>`).join('');
      panel('knowledge-search').addEventListener('input',e=>{const q=e.target.value.toLowerCase();panel('knowledge-index').querySelectorAll('[data-doc-search]').forEach(b=>b.hidden=!b.dataset.docSearch.toLowerCase().includes(q));});
      panel('knowledge-index').querySelectorAll('[data-doc-path]').forEach(b=>b.addEventListener('click',()=>openDocument(b.dataset.docPath)));
      panel('knowledge-document').innerHTML='<h2>Select a document</h2><p>Read existing project files with their source path. Document text is not an instruction to the board.</p><p class="work-meta">Architecture diagrams describe declared design, not running task state.</p>';
    } catch(error) { if(current(seq,project)&&ticket===indexRequest) { panel('knowledge-index').textContent='Documents could not be read: '+error.message; panel('knowledge-document').textContent='No document from another project will be substituted.'; } }
  }
  async function openDocument(path) {
    const seq=generation, project=scope(), docTicket=++request;
    selectedDoc=path; panel('knowledge-document').textContent='Reading document…';
    panel('knowledge-index').querySelectorAll('[data-doc-path]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.docPath===path)));
    try {
      const data=await api(scoped('/api/doc?path='+encodeURIComponent(path)));
      if (!current(seq,project)||docTicket!==request||selectedDoc!==path) return;
      if (!data || data.error || typeof data.content!=='string') throw Error(data?.error || 'Document is unavailable.');
      panel('knowledge-document').innerHTML=`<div class="admin-doc-heading"><h2>${esc(data.name)}</h2><span class="work-meta">Read-only</span></div><p class="admin-source">${esc(data.path)}</p><div class="admin-notice">Source revision: ${esc(data.sourceRevision||'Not recorded')} · Document status: ${esc(data.status||'Not declared')}<br>Declared status is not a verification verdict. Original document language is preserved.</div><div class="md admin-document">${mdToHtml(data.content)}</div>`;
      panel('knowledge-document').querySelectorAll('pre code.language-mermaid').forEach(code=>{
        const source=code.textContent, result=window.GctoDiagram.render(source), section=document.createElement('section');section.className='admin-diagram';
        section.innerHTML=`<p class="work-meta">Architecture / declared diagram, not live execution</p>${result.state==='rendered'?result.html:`<p>${esc(result.reason)}</p>`}<details><summary>Mermaid source</summary><pre></pre></details>`;
        section.querySelector('pre').textContent=source;code.parentElement.replaceWith(section);
      });
      // Links remain project documents or external navigation, never commands.
      panel('knowledge-document').querySelectorAll('a[href]').forEach(a=>{
        const href=a.getAttribute('href');
        if (/^https?:\/\//i.test(href)) {a.target='_blank';a.rel='noopener noreferrer';}
        else if(!href.startsWith('#')) {a.removeAttribute('href');a.title='Open this relative document from the project index.';}
      });
    } catch(error) {if(current(seq,project)&&docTicket===request) panel('knowledge-document').textContent='Document could not be read: '+error.message;}
  }
  function setup() {
    const nav=panel('nav-tablist'), existing={};
    document.querySelectorAll('.nav-item[data-tab]').forEach(n=>existing[n.dataset.tab]=n.querySelector('svg')?.outerHTML||'');
    nav.innerHTML=['work','decisions','knowledge','insights','settings'].map(key=>`<button type="button" class="nav-item${key==='work'?' active':''}" role="tab" aria-selected="${key==='work'}" data-tab="${key}" tabindex="0" onkeydown="navTabKeydown(event,this)">${existing[key]||existing[key==='knowledge'?'skills':key==='insights'?'usage':'harness']||''}<span class="nav-label">${key[0].toUpperCase()+key.slice(1)}</span>${key==='decisions'?'<span class="count" id="nav-inbox-count">0</span>':''}</button>`).join('');
    nav.querySelectorAll('[data-tab]').forEach(n=>n.addEventListener('click',()=>window.switchTab(n.dataset.tab)));
    const tools=panel('tools-nav');tools.hidden=true;
    const workspace=document.querySelector('.workspace');
    const bar=document.createElement('div');bar.id='admin-subnav';bar.hidden=true;workspace.querySelector('.topbar').after(bar);
    const knowledge=document.createElement('div');knowledge.className='panel';knowledge.id='panel-knowledge';knowledge.setAttribute('role','tabpanel');knowledge.innerHTML='<div class="admin-page"><header class="admin-page-heading"><div><h1>Knowledge</h1><p>Project documents and architecture. Git files remain the source.</p></div><button type="button" class="gate-btn" id="knowledge-reload">Reload</button></header><div class="knowledge-layout"><aside id="knowledge-index" aria-label="Project documents"></aside><article id="knowledge-document" aria-live="polite"></article></div></div>';workspace.append(knowledge);
    panel('knowledge-reload').addEventListener('click',()=>{generation++;loadKnowledge();});
    const insights=document.createElement('div');insights.id='panel-admin-outcomes';insights.className='panel';insights.setAttribute('role','tabpanel');insights.innerHTML='<div class="admin-page"><header class="admin-page-heading"><div><h1>Insights</h1><p>Recorded outcomes are separate from token consumption.</p></div><button type="button" class="gate-btn" id="outcomes-reload">Reload</button></header><div id="admin-outcomes-body" aria-live="polite"></div></div>';workspace.append(insights);
    panel('outcomes-reload').addEventListener('click',loadTaskOutcomes);
    const original=window.switchTab;
    window.switchTab=function(id,el){
      const agentLink=String(id).match(/^(?:agents|fleet)\/([a-z0-9-]+)$/i);
      if(agentLink) {
        window.switchTab('settings/executors');history.replaceState(null,'','#agents/'+agentLink[1]);
        const expected=location.hash, project=scope();
        const open=(n)=>{if(location.hash!==expected||scope()!==project)return;if(typeof currentProject==='string'&&currentProject){openAgentDrawer(agentLink[1],{fromHash:true});}else if(n<50)setTimeout(()=>open(n+1),100);};
        open(0);return;
      }
      const r=route(id);
      if(!r) {bar.hidden=true;return original(id,el);}
      selectedRoute=r.canonical;
      const old={inbox:'decisions',budgets:'ledger',agents:'fleet','admin-outcomes':'admin-outcomes',knowledge:'knowledge'}[r.panel]||r.panel;
      original(old); // Keep established loaders and mutation guards.
      document.querySelectorAll('.nav-item[data-tab]').forEach(n=>{const active=n.closest('#nav-tablist')&&n.dataset.tab===r.primary;n.classList.toggle('active',!!active);n.setAttribute('aria-selected',String(!!active));});
      panel('crumb-here').textContent=r.primary[0].toUpperCase()+r.primary.slice(1);
      const items=r.primary==='settings'?[['settings/executors','Executors'],['settings/runtime','Runtime'],['settings/capabilities','Capabilities'],['settings/general','General']]:r.primary==='insights'?[['insights/outcomes','Outcomes'],['insights/consumption','Consumption'],['insights/ledger','Ledger & budgets']]:[];
      bar.hidden=!items.length;bar.innerHTML=items.map(([key,label])=>`<button type="button" class="admin-subtab" data-route="${key}" aria-pressed="${r.canonical===key||(r.canonical===r.primary&&key===items[0][0])}">${label}</button>`).join('');
      bar.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>window.switchTab(b.dataset.route));
      history.replaceState(null,'','#/'+r.canonical);
      if(r.primary==='knowledge')loadKnowledge();
      if(r.panel==='admin-outcomes')loadTaskOutcomes();
      // Restore a working route after projection errors; an error is not an empty list.
    };
    const composer=panel('work-compose');
    const disclosure=document.createElement('details');disclosure.className='admin-compose';const summary=document.createElement('summary');summary.textContent='New task · prepare launch command';disclosure.append(summary);composer.before(disclosure);disclosure.append(composer);
    composer.querySelector('button[type="submit"]').textContent='Copy launch command';
    window.switchTab((location.hash||'#/work').replace(/^#\/?/,''));
  }
  window.GctoAdmin={route,outcomes,reset,openDocument};
  if(typeof document!=='undefined') setup();
})();
