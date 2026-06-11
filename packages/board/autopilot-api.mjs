// packages/board/autopilot-api.mjs — the operator console's API (PLAN-ui-split P4).
//
// Every /api/autopilot/* route + its helpers (apAuth, ingest HMAC, invite email,
// run-change SSE) lives here, behind one entry point:
//
//   handleAutopilot(req, res, url, pathname, { firePushAlert }) → boolean (handled?)
//
// server.mjs delegates after its global guards (CSRF, surface boundary, invite-token
// guard, body-size cap). Pure motion from server.mjs — no behavior change. This file
// is the seam for the future package split (PLAN-ui-split P5): the console surface
// = this module + autopilot.html + the push routes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startRun as apStartRun, approve as apApprove, reject as apReject, escalate as apEscalate, sendBack as apSendBack, stats as apStats, listRuns as apListRuns, getRun as apGetRun, getConfig as apGetConfig, setConfig as apSetConfig, qaQueue as apQaQueue, qaScore as apQaScore, verifyAudit as apVerifyAudit, exportRecord as apExportRecord, autoEscalateStale as apAutoEscalateStale, calibration as apCalibration, suggestFloor as apSuggestFloor, stageProgress as apStageProgress, metering as apMetering, connectorHealth as apConnectorHealth, deadLetters as apDeadLetters, requeue as apRequeue } from '../../scripts/lib/run-store.mjs';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Verify a webhook's HMAC-SHA256 signature (the source system shares GREAT_CTO_INGEST_SECRET).
function verifyIngestSig(rawBody, sigHeader) {
  const secret = process.env.GREAT_CTO_INGEST_SECRET;
  if (!secret) return true;            // no secret configured → open (dev); set one to enforce
  if (!sigHeader) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  try { const a = Buffer.from(expected); const b = Buffer.from(String(sigHeader).replace(/^sha256=/, '')); return a.length === b.length && timingSafeEqual(a, b); } catch { return false; }
}
import { ROLES, getRole, roleAllows } from '../../scripts/lib/roles.mjs';
import { createInvite, listInvites, resolveInvite, acceptInvite, revokeInvite } from '../../scripts/lib/operators.mjs';

// Resolve the caller's authoritative role + tenant. An invite TOKEN (the operator's credential) wins
// over any client-supplied role — so an operator can't escalate by passing role=admin. No token =
// the local admin/CTO running the board.
function apAuth(token, fallbackRole, fallbackTenant) {
  const inv = token ? resolveInvite(token) : null;
  if (inv) return { role: inv.role, tenant: inv.tenant, name: inv.name, viaInvite: true };
  return { role: fallbackRole || 'admin', tenant: fallbackTenant, viaInvite: false };
}

// Best-effort: email the invite link to the operator via the notify relay. Returns true on a 2xx.
// The relay may only accept the board owner's verified address — if so this returns false and the
// admin falls back to copy-link. Set GREATCTO_NOTIFY_URL to point at a transactional relay.
async function sendInviteEmail(to, link, roleLabel, name) {
  try {
    const relay = process.env.GREATCTO_NOTIFY_URL || 'https://greatcto.systems';
    const res = await fetch(`${relay}/notify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        title: `You're invited to GreatCTO as ${roleLabel}`,
        body: `${name ? name + ', y' : 'Y'}ou've been added as ${roleLabel}. Open your autopilot work-queue:`,
        level: 'info', project: 'great_cto', link, action: 'Open my queue', event: 'autopilot.invite',
      }),
    });
    return res.ok;
  } catch { return false; }
}

// ── Autopilot console realtime (Phase 4): push a "change" the instant a run mutates ──
const apSseClients = new Set();
const AP_RUNS_DIR = process.env.GREAT_CTO_RUNS_DIR || path.join(os.homedir(), '.great_cto', 'autopilot-runs');
let _apBroadcastTimer = null;
function apBroadcast() {                       // debounced so a burst of file writes = one push
  clearTimeout(_apBroadcastTimer);
  _apBroadcastTimer = setTimeout(() => {
    const msg = 'event: change\ndata: {}\n\n';
    for (const res of apSseClients) { try { res.write(msg); } catch { apSseClients.delete(res); } }
  }, 120);
}
try {
  fs.mkdirSync(AP_RUNS_DIR, { recursive: true });
  fs.watch(AP_RUNS_DIR, { recursive: true }, () => apBroadcast());   // catches CLI + console + webhook writes
} catch (e) { console.warn('autopilot runs watch failed:', e.message); }

/** Route an autopilot API request. Returns true when the request was handled. */
export function handleAutopilot(req, res, url, pathname, ctx = {}) {
  const firePushAlert = ctx.firePushAlert || (() => {});
  if (pathname === '/api/autopilot/stream' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    res.write('retry: 3000\n\n');
    res.write('event: change\ndata: {}\n\n');         // prompt an initial load
    apSseClients.add(res);
    const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch { /* closed */ } }, 25000);
    req.on('close', () => { clearInterval(hb); apSseClients.delete(res); });
    return true;
  }
  if (pathname === '/api/autopilot/roles' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ roles: ROLES }));
    return true;
  }
  if (pathname === '/api/autopilot/stats' && req.method === 'GET') {
    const auth = apAuth(url.searchParams.get('token'), url.searchParams.get('role'), url.searchParams.get('tenant') || undefined);
    const tenant = auth.viaInvite ? auth.tenant : (url.searchParams.get('tenant') || undefined);
    const by = url.searchParams.get('by') || undefined; // "my work" for an operator
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(apStats({ tenant, by })));
    return true;
  }
  if (pathname === '/api/autopilot/config' && req.method === 'GET') {
    const auth = apAuth(url.searchParams.get('token'), url.searchParams.get('role'), url.searchParams.get('tenant') || undefined);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(apGetConfig(auth.viaInvite ? auth.tenant : (url.searchParams.get('tenant') || 'default'))));
    return true;
  }
  if (pathname === '/api/autopilot/qa' && req.method === 'GET') {
    const auth = apAuth(url.searchParams.get('token'), url.searchParams.get('role'), url.searchParams.get('tenant') || undefined);
    const tenant = auth.viaInvite ? auth.tenant : (url.searchParams.get('tenant') || undefined);
    // QA queue is for admin / compliance-lead oversight
    if (!['admin', 'compliance-lead'].includes(auth.role)) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'QA is for admin / compliance-lead' })); return; }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ queue: apQaQueue({ tenant }) }));
    return true;
  }
  // Wave G #5 — confidence calibration: is the AI's recommendation confidence honest? (admin/compliance)
  if (pathname === '/api/autopilot/calibration' && req.method === 'GET') {
    const auth = apAuth(url.searchParams.get('token'), url.searchParams.get('role'), url.searchParams.get('tenant') || undefined);
    if (!['admin', 'compliance-lead'].includes(auth.role)) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'calibration is for admin / compliance-lead' })); return; }
    const tenant = auth.viaInvite ? auth.tenant : (url.searchParams.get('tenant') || undefined);
    const target = parseFloat(url.searchParams.get('target')) || 0.9;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ...apCalibration({ tenant }), suggestedFloor: apSuggestFloor({ tenant, target }) }));
    return true;
  }
  // Wave H — ops surfaces: metering (billing), connector health, dead-letter queue (admin/compliance).
  if ((pathname === '/api/autopilot/metering' || pathname === '/api/autopilot/health' || pathname === '/api/autopilot/dead-letters') && req.method === 'GET') {
    const auth = apAuth(url.searchParams.get('token'), url.searchParams.get('role'), url.searchParams.get('tenant') || undefined);
    if (!['admin', 'compliance-lead'].includes(auth.role)) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'ops views are for admin / compliance-lead' })); return; }
    const tenant = auth.viaInvite ? auth.tenant : (url.searchParams.get('tenant') || undefined);
    const body = pathname === '/api/autopilot/metering' ? apMetering({ tenant })
      : pathname === '/api/autopilot/health' ? { connectors: apConnectorHealth({ tenant }) }
      : { queue: apDeadLetters({ tenant }) };
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
    return true;
  }
  // Wave H #10 — requeue a dead-lettered run (admin/compliance ops action).
  if (pathname === '/api/autopilot/requeue' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      let p; try { p = JSON.parse(body || '{}'); } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"error":"invalid_json"}'); return; }
      const auth = apAuth(p.token, p.role, p.tenant);
      if (!['admin', 'compliance-lead'].includes(auth.role)) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'requeue is for admin / compliance-lead' })); return; }
      const rq = apGetRun(p.id);
      if (rq && auth.viaInvite && (rq.tenant || 'default') !== (auth.tenant || 'default')) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'this case belongs to another tenant' })); return; }
      try { const run = await apRequeue(p.id, p.by || auth.role); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ run })); }
      catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: String(e.message) })); }
    });
    return true;
  }
  // Operator onboarding: the admin mints invites; the operator resolves one to bootstrap, scoped.
  if (pathname === '/api/autopilot/invite-resolve' && req.method === 'GET') {
    const inv = acceptInvite(url.searchParams.get('token'));
    res.writeHead(inv ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(inv ? { role: inv.role, roleLabel: inv.roleLabel, tenant: inv.tenant, name: inv.name } : { error: 'invalid or revoked invite' }));
    return true;
  }
  if (pathname === '/api/autopilot/invites' && req.method === 'GET') {
    const auth = apAuth(url.searchParams.get('token'), url.searchParams.get('role'));
    if (auth.role !== 'admin') { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'admin only' })); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ invites: listInvites() }));
    return true;
  }
  if (pathname === '/api/autopilot/invite' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      let p; try { p = JSON.parse(body || '{}'); } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'invalid_json' })); return; }
      const auth = apAuth(p.token, p.role);
      if (auth.role !== 'admin') { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'only the admin can invite operators' })); return; }
      try {
        const invite = createInvite({ role: p.operatorRole, tenant: p.tenant || 'default', name: p.name || '', email: p.email || '', createdBy: 'admin' });
        const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0];
        const link = `${proto}://${req.headers.host}/autopilot.html?invite=${invite.token}`;
        let emailed = false;
        if (p.email) emailed = await sendInviteEmail(p.email, link, invite.roleLabel, invite.name).catch(() => false);
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ invite, link, emailed }));
      } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: String(e.message) })); }
    });
    return true;
  }
  if (pathname === '/api/autopilot/invite' && req.method === 'DELETE') {
    const auth = apAuth(url.searchParams.get('token'), url.searchParams.get('role'));
    if (auth.role !== 'admin') { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'admin only' })); return; }
    const ok = revokeInvite(url.searchParams.get('revoke'));
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok }));
    return true;
  }
  if (pathname === '/api/autopilot/runs' && req.method === 'GET') {
    const status = url.searchParams.get('status') || undefined;
    const auth = apAuth(url.searchParams.get('token'), url.searchParams.get('role'), url.searchParams.get('tenant') || undefined);
    const tenant = auth.viaInvite ? auth.tenant : (url.searchParams.get('tenant') || undefined);
    let runs = apListRuns({ status, tenant });
    // RBAC: an operator role only sees the cases for the vertical(s) it may sign.
    runs = runs.filter((r) => roleAllows(auth.role, r.vertical));
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ runs }));
    return true;
  }
  if (pathname === '/api/autopilot/verify' && req.method === 'GET') {
    const r = apGetRun(url.searchParams.get('id'));
    res.writeHead(r ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(r ? { id: r.id, auditIntact: apVerifyAudit(r) } : { error: 'not found' }));
    return true;
  }
  if (pathname === '/api/autopilot/export' && req.method === 'GET') {
    const txt = apExportRecord(url.searchParams.get('id'));
    res.writeHead(txt ? 200 : 404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(txt || 'not found');
    return true;
  }
  if (pathname === '/api/autopilot/run' && req.method === 'GET') {
    const r = apGetRun(url.searchParams.get('id'));
    // Wave G #8 — attach the sequential review pipeline view (gate stages + signer + status).
    res.writeHead(r ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(r ? { ...r, stages: apStageProgress(r) } : { error: 'not found' }));
    return true;
  }
  if (pathname === '/api/autopilot/ingest' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      if (!verifyIngestSig(body, req.headers['x-gcto-signature'])) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'invalid signature' })); return; }
      let p; try { p = JSON.parse(body || '{}'); } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"error":"invalid_json"}'); return; }
      if (!p.vertical) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"error":"vertical required"}'); return; }
      try {
        // A source system pushes a case → the autopilot runs it to the human gate automatically.
        const run = await apStartRun(p.vertical, { mode: p.mode === 'live' ? 'live' : 'stub', tenant: p.tenant || 'default', payload: p.payload || {}, source: 'webhook' });
        if (run.status === 'awaiting-approval') firePushAlert('autopilot.gate', `ap:${run.id}:${run.pausedAt}`, { title: '🛂 New case awaiting your signature', body: `${run.vertical} · ${run.signer || 'reviewer'}: ${run.gateDoes || run.pausedAt}`, url: '/autopilot.html' });
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id: run.id, status: run.status, recommendation: run.recommendation }));
      } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: String(e.message) })); }
    });
    return true;
  }
  if (pathname === '/api/autopilot/config' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let p; try { p = JSON.parse(body || '{}'); } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"error":"invalid_json"}'); return; }
      const auth = apAuth(p.token, p.role);
      if (auth.role !== 'admin') { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'admin only' })); return; }
      const patch = {};
      if (p.confidenceFloor != null) patch.confidenceFloor = Math.max(0, Math.min(1, Number(p.confidenceFloor)));
      if (p.autoEligible != null) patch.autoEligible = !!p.autoEligible;
      // white-label (Phase 7): a validated hex accent + a short tenant name
      if (p.brandAccent != null) patch.brandAccent = /^#[0-9a-fA-F]{6}$/.test(p.brandAccent) ? p.brandAccent : '';
      if (p.brandName != null) patch.brandName = String(p.brandName).slice(0, 40);
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(apSetConfig(p.tenant || 'default', patch)));
    });
    return true;
  }
  if (pathname === '/api/autopilot/qa-score' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let p; try { p = JSON.parse(body || '{}'); } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"error":"invalid_json"}'); return; }
      const auth = apAuth(p.token, p.role);
      if (!['admin', 'compliance-lead'].includes(auth.role)) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'QA is for admin / compliance-lead' })); return; }
      const qr = apGetRun(p.id);
      if (qr && auth.viaInvite && (qr.tenant || 'default') !== (auth.tenant || 'default')) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'this case belongs to another tenant' })); return; }
      try { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ run: apQaScore(p.id, p.score, p.by || 'reviewer', p.note || '') })); }
      catch (e) { res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: String(e.message) })); }
    });
    return true;
  }
  if (pathname === '/api/autopilot/bulk' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      let p; try { p = JSON.parse(body || '{}'); } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"error":"invalid_json"}'); return; }
      const auth = apAuth(p.token, p.role); const who = p.by || 'board user';
      const fn = { approve: apApprove, reject: apReject, escalate: apEscalate }[p.action];
      if (!fn) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'bad action' })); return; }
      let ok = 0, denied = 0, failed = 0;
      for (const id of (p.ids || [])) {
        const r = apGetRun(id);
        if (r && !roleAllows(auth.role, r.vertical)) { denied++; continue; }
        // Tenant boundary: an invited operator acts ONLY on their own tenant's cases.
        if (r && auth.viaInvite && (r.tenant || 'default') !== (auth.tenant || 'default')) { denied++; continue; }
        try { await fn(id, who, p.note || '', p.reason || ''); ok++; } catch { failed++; }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok, denied, failed }));
    });
    return true;
  }
  if (['/api/autopilot/start', '/api/autopilot/approve', '/api/autopilot/reject', '/api/autopilot/escalate', '/api/autopilot/send-back'].includes(pathname) && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      let p; try { p = JSON.parse(body || '{}'); } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'invalid_json', message: String(e.message) })); return;
      }
      try {
        // RBAC: the invite token (if any) is authoritative; else the client role (local admin).
        const auth = apAuth(p.token, p.role, p.tenant);
        const role = auth.role;
        if (pathname === '/api/autopilot/start') {
          if (!getRole(role).canStart) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: `role '${role}' can't start runs (operators sign; admin/compliance-lead start)` })); return; }
          if (!roleAllows(role, p.vertical)) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: `role '${role}' is not authorised for ${p.vertical}` })); return; }
        } else {
          const existing = apGetRun(p.id);
          if (existing && !roleAllows(role, existing.vertical)) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: `role '${role}' is not authorised to sign ${existing.vertical} cases` })); return; }
          // Tenant boundary: an invited operator signs ONLY their own tenant's cases.
          if (existing && auth.viaInvite && (existing.tenant || 'default') !== (auth.tenant || 'default')) {
            res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'this case belongs to another tenant' })); return;
          }
        }
        let run; const who = p.by || 'board user';
        if (pathname === '/api/autopilot/start') run = await apStartRun(p.vertical, { mode: p.mode === 'live' ? 'live' : 'stub', tenant: auth.viaInvite ? auth.tenant : (p.tenant || 'default') });
        else if (pathname === '/api/autopilot/approve') run = await apApprove(p.id, who, p.note || '', p.reason || '', p.license || '');
        else if (pathname === '/api/autopilot/reject') run = await apReject(p.id, who, p.note || '', p.reason || '');
        else if (pathname === '/api/autopilot/escalate') run = await apEscalate(p.id, who, p.note || '', p.reason || '');
        else run = await apSendBack(p.id, who, p.note || '', p.reason || '');
        // Push the signer: a new case (or the next gate of a multi-gate flow) is in their queue.
        if (run && run.status === 'awaiting-approval') {
          firePushAlert('autopilot.gate', `ap:${run.id}:${run.pausedAt}`, {
            title: `🛂 New case awaiting your signature`,
            body: `${run.vertical} · ${run.signer || 'reviewer'}: ${run.gateDoes || run.pausedAt}`,
            url: '/autopilot.html',
          });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ run }));
      } catch (e) {
        res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: String(e.message) }));
      }
    });
    return true;
  }
  return false;
}
