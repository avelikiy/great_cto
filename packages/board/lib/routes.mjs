import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getVapidKeys,
  addSubscription,
  removeSubscription,
} from '../push-adapter.mjs';
import { GREAT_CTO_DIR, VAPID_KEYS_FILE, PUSH_SUBS_FILE, BUILD_VERSION } from './config.mjs';
import { eventSurface, readFileSafe, originAllowed } from './util.mjs';
import { sseClients, notifHistory } from './state.mjs';
import { autoRegisterProject, listProjects, resolveProjectCwd, getChangeTier } from './projects.mjs';
import { broadcastTasks } from './sse.mjs';
import { saveNotifHistory } from './notifications.mjs';
import { getMemory, getPipeline, getCostHistory, getInbox } from './data-readers.mjs';
import { log } from './log.mjs';
import { bdCacheInvalidate, checkBeadsAvailable, bdWriteSerialised, bd, bdErr, getTasks, setTaskStatusInTasksMd, getReadDegradation } from './beads.mjs';
import { getMetrics } from './metrics.mjs';
import { readVerdicts } from './verdicts.mjs';
import { getAgentsFleet, getAgentProfile, retireAgent, restoreAgent, appendDecisionLog, readDecisionsLog } from './fleet.mjs';
import { getResume, getShareState, toggleShare } from './share.mjs';

// ── HTTP router ────────────────────────────────────────────────────────────────
// dispatch(req, res, url, cwd, projInfo) handles every /api/* route plus /api/sse.
// Returns true if the request was handled (response already sent or streaming),
// false if the caller (server.mjs) should fall through to static file serving.
async function dispatch(req, res, url, cwd) {
  const pathname = url.pathname;

  // SSE
  if (pathname === '/api/sse') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res._gctoCwd = cwd;  // remember which project this client wants
    sseClients.add(res);
    res.write(`event: tasks\ndata: ${JSON.stringify(getTasks(cwd))}\n\n`);
    req.on('close', () => sseClients.delete(res));
    return true;
  }

  // API
  if (pathname === '/api/projects') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(listProjects()));
    return true;
  }

  // Manually register a project at an arbitrary path (e.g. /tmp/...).
  // Body: { path: "/tmp/neobank-test" }
  //
  // BH-23 (Security): this endpoint creates files + registers projects, so
  // it MUST reject cross-origin requests. The board listens on 127.0.0.1
  // but a malicious page the user visits can still issue text/plain POSTs
  // (simple CORS request — no preflight) to localhost. Two gates:
  //   1) Origin / Referer must be same-origin (originAllowed() in lib/util.mjs —
  //      also enforced as the top-level CSRF guard in server.mjs before dispatch()
  //      is ever called, so this is defense-in-depth, not the only check).
  //   2) Resolved target path must live inside HOME — no /tmp, no /etc.
  if (pathname === '/api/projects/register' && req.method === 'POST') {
    if (!originAllowed(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'origin not allowed' }));
      return true;
    }
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { path: projPath } = JSON.parse(body || '{}');
        if (!projPath || typeof projPath !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'path missing' }));
        }
        const resolved = path.resolve(projPath);
        const home = os.homedir();
        if (!resolved.startsWith(home + path.sep) && resolved !== home) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'path must live inside HOME' }));
        }
        if (!fs.existsSync(resolved)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'path does not exist' }));
        }
        const greatCtoDir = path.join(resolved, '.great_cto');
        const projectMd = path.join(greatCtoDir, 'PROJECT.md');
        if (!fs.existsSync(projectMd)) {
          fs.mkdirSync(greatCtoDir, { recursive: true });
          fs.writeFileSync(projectMd, `# PROJECT — ${path.basename(resolved)}\n\nname: ${path.basename(resolved)}\narchetype: unknown\nphase: discovery\n`);
        }
        autoRegisterProject(resolved);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, path: resolved, slug: path.basename(resolved) }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return true;
  }

  if (pathname === '/api/tasks' && req.method === 'GET') {
    const tasks = getTasks(cwd);
    // An empty list has two very different meanings: "no tasks" and "we could
    // not read them". Carry the second in a header so the UI can render an
    // error state instead of a clean-looking empty board. A header keeps the
    // array body shape, so existing consumers are unaffected.
    const degraded = getReadDegradation(cwd);
    const headers = { 'Content-Type': 'application/json' };
    if (degraded) headers['X-Board-Degraded'] = encodeURIComponent(degraded);
    res.writeHead(200, headers);
    res.end(JSON.stringify(tasks));
    return true;
  }

  if (pathname === '/api/metrics') {
    let days = parseInt(url.searchParams.get('days') || '30', 10);
    if (!Number.isFinite(days) || days < 1) days = 30;
    if (days > 365) days = 365;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(getMetrics(cwd, days)));
    return true;
  }

  // ── /api/notifications — email alerts via greatcto.systems/notify relay ──
  // No API keys to manage — user enters only their email + verifies via
  // 6-digit code sent by our Cloudflare Worker. The Worker rate-limits to
  // 100 emails/24h per verified email.
  //
  // Local state in ~/.great_cto/notifications.json:
  //   { "to": "user@example.com", "verified": true, "enabled": true,
  //     "triggers": ["incident.p0", ...] }
  if (pathname === '/api/notifications') {
    const NOTIFY_RELAY = process.env.GREATCTO_NOTIFY_URL || 'https://greatcto.systems';
    const stateFile = path.join(GREAT_CTO_DIR, 'notifications.json');
    const KNOWN_TRIGGERS = ['incident.p0', 'gate.stale', 'gate.blocked', 'cost.threshold', 'digest.weekly'];
    let state = { to: '', verified: false, enabled: false, triggers: [] };
    try { Object.assign(state, JSON.parse(fs.readFileSync(stateFile, 'utf8'))); } catch {}

    function saveState() {
      if (!fs.existsSync(GREAT_CTO_DIR)) fs.mkdirSync(GREAT_CTO_DIR, { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    }

    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        to: state.to || '',
        verified: !!state.verified,
        enabled: !!state.enabled,
        triggers: state.triggers || [],
        known_triggers: KNOWN_TRIGGERS,
        relay: NOTIFY_RELAY,
      }));
      return true;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        let parsed;
        try { parsed = JSON.parse(body || '{}'); }
        catch {
          res.writeHead(400); return res.end(JSON.stringify({ error: 'invalid_json' }));
        }
        const action = parsed.action || 'save';

        // ── verify: ask the worker to send a 6-digit code to <to> ──
        if (action === 'verify') {
          const to = String(parsed.to || '').trim().toLowerCase();
          if (!to) { res.writeHead(400); return res.end(JSON.stringify({ error: 'to_required' })); }
          try {
            const r = await fetch(`${NOTIFY_RELAY}/notify/verify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ to }),
            });
            const j = await r.json().catch(() => null);
            // Persist email (still unverified) so the UI can show the pending state
            state.to = to;
            state.verified = false;
            saveState();
            res.writeHead(r.ok ? 200 : (r.status || 502), { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(j || { error: 'relay_unreachable' }));
          } catch (e) {
            res.writeHead(502); return res.end(JSON.stringify({ error: e.message }));
          }
        }

        // ── confirm: send the user-typed code to the worker, mark verified on 200 ──
        if (action === 'confirm') {
          const to = String(parsed.to || state.to || '').trim().toLowerCase();
          const code = String(parsed.code || '').trim();
          if (!to)   { res.writeHead(400); return res.end(JSON.stringify({ error: 'to_required' })); }
          if (!code) { res.writeHead(400); return res.end(JSON.stringify({ error: 'code_required' })); }
          try {
            const r = await fetch(`${NOTIFY_RELAY}/notify/confirm`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ to, code }),
            });
            const j = await r.json().catch(() => null);
            if (r.ok) {
              state.to = to;
              state.verified = true;
              saveState();
            }
            res.writeHead(r.ok ? 200 : (r.status || 502), { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(j || { error: 'relay_unreachable' }));
          } catch (e) {
            res.writeHead(502); return res.end(JSON.stringify({ error: e.message }));
          }
        }

        // ── save: persist triggers + enabled flag locally ──
        if (action === 'save') {
          const triggers = Array.isArray(parsed.triggers)
            ? parsed.triggers.filter(t => KNOWN_TRIGGERS.includes(t))
            : (state.triggers || []);
          state.triggers = triggers;
          if (parsed.enabled != null) state.enabled = !!parsed.enabled;
          saveState();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, verified: state.verified, enabled: state.enabled }));
        }

        // ── test: fire a synthetic alert through the relay ──
        if (action === 'test') {
          if (!state.verified || !state.to) {
            res.writeHead(400); return res.end(JSON.stringify({ error: 'verify_first' }));
          }
          try {
            const r = await fetch(`${NOTIFY_RELAY}/notify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: state.to,
                title: '🧪 GreatCTO test alert',
                body: 'If you see this, the email alert pipeline is working end-to-end (board → Cloudflare worker → Resend → inbox).',
                level: 'info',
                project: 'great_cto',
                link: 'http://localhost:3141/#notifications',
                action: 'Open Notifications tab',
                kv: { test: 'ok', sent_at: new Date().toISOString() },
                event: 'test',
              }),
            });
            const j = await r.json().catch(() => null);
            res.writeHead(r.ok ? 200 : (r.status || 502), { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: r.ok, response: j }));
          } catch (e) {
            res.writeHead(502); return res.end(JSON.stringify({ error: e.message }));
          }
        }

        res.writeHead(400); return res.end(JSON.stringify({ error: 'unknown_action' }));
      });
      return true;
    }
  }

  if (pathname === '/api/share') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getShareState(cwd)));
      return true;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        // BH-24: malformed JSON used to throw inside the async handler,
        // turning into an unhandled rejection and hanging the request.
        // Sibling endpoints (/status, /priority, /gates) were fixed in
        // PR #40 (BH-14); /api/share was missed.
        let parsed;
        try { parsed = JSON.parse(body || '{}'); }
        catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'invalid_json' }));
        }
        try {
          const state = await toggleShare(parsed.enabled, cwd, !!parsed.force);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(state));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return true;
    }
  }

  // ── Read a project doc (markdown) referenced from a task — for the side-panel viewer.
  // Path-traversal-safe: the resolved path must stay inside the project cwd; .md only.
  if (pathname === '/api/doc' && req.method === 'GET') {
    const c = url.searchParams.get('project') ? resolveProjectCwd(url.searchParams.get('project')) : cwd;
    const rel = String(url.searchParams.get('path') || '');
    const abs = path.resolve(c, rel);
    if (!rel || !abs.startsWith(path.resolve(c) + path.sep) || !abs.toLowerCase().endsWith('.md')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'path must be a .md file inside the project' }));
      return true;
    }
    try {
      const st = fs.statSync(abs);
      if (!st.isFile() || st.size > 1024 * 1024) throw new Error('not a readable doc');
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ name: path.basename(abs), path: rel, content: fs.readFileSync(abs, 'utf8') }));
    } catch {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'doc not found: ' + rel }));
    }
    return true;
  }
  // (board-triggered agent launch removed — the board no longer spawns coding agents)

  // Gate approval / rejection
  if (pathname.startsWith('/api/gates/') && req.method === 'POST') {
    const id = pathname.replace('/api/gates/', '');
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      // BH-14a: catch JSON parse error explicitly → 400 (was 500/uncaught)
      let parsed;
      try {
        parsed = JSON.parse(body || '{}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_json', message: String(e.message || e) }));
        return;
      }
      const { action, reason } = parsed;
      const gateCwd = parsed.project ? resolveProjectCwd(parsed.project) : cwd;
      if (!['approve', 'reject'].includes(action)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid action' }));
        return;
      }
      // A project can be tasks.md-backed (no working beads — e.g. its path
      // contains a space, which embedded-dolt can't open). Only 409 when there
      // is neither a beads store NOR a tasks.md to record the decision in.
      const beadsErr = checkBeadsAvailable(gateCwd);
      const tasksMdPath = path.join(gateCwd, '.great_cto', 'tasks.md');
      const hasTasksMd = fs.existsSync(tasksMdPath);
      if (beadsErr && !hasTasksMd) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(beadsErr));
        return;
      }
      // BH-16 fix: serialise gate writes through bd-write queue.
      // Without this, concurrent approve+reject on the same gate produced
      // TWO appendDecisionLog entries (one wrong) — log says approved AND
      // rejected. bdWriteSerialised guarantees one-at-a-time semantics.
      const result = await bdWriteSerialised(() => {
        const status = action === 'approve' ? 'closed' : 'blocked';
        let via = 'beads';
        // Try beads first (unless there's no store at all); on any bd failure
        // fall back to rewriting the tasks.md status cell so the gate still lands.
        const r = beadsErr
          ? { status: 1, error: { code: 'NO_BEADS' } }
          : bd(['update', id, '--status', status, ...(reason ? ['--notes', `[${action}] ${reason}`] : [])],
              { cwd: gateCwd, timeout: 5000 });
        if (r.status !== 0) {
          if (!setTaskStatusInTasksMd(gateCwd, id, status)) {
            return { error: (beadsErr ? 'beads unavailable' : bdErr(r, 'bd update failed'))
              + ` — and no matching '${id}' row in tasks.md to update` };
          }
          via = 'tasks.md';
        }
        bdCacheInvalidate(gateCwd);
        // Append to global decisions log — still inside the lock window
        try {
          const projectSlug = parsed.project || path.basename(gateCwd);
          const allTasks = getTasks(gateCwd);
          const gateTask = allTasks.find(t => t.id === id);
          const title = gateTask?.title || id;
          appendDecisionLog({
            ts: new Date().toISOString(),
            project: projectSlug,
            action,
            id,
            title,
            reason: reason || '',
            cwd: gateCwd,   // project-scoped (ADR-008) — never the global log
          });
        } catch { /* best-effort */ }
        return { ok: true, via };
      });
      if (!result || result.error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (result && result.error) || 'bd update failed' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, id, action, via: result.via }));
      broadcastTasks(gateCwd);
      // Auto-republish share report when a gate is approved (fire-and-forget)
      if (action === 'approve') {
        const shareState = getShareState(gateCwd);
        if (shareState.enabled) {
          toggleShare(true, gateCwd, true)
            .then(() => log.info(`report: auto-republished after gate approve (${id})`))
            .catch(e => log.warn(`report: republish after gate failed: ${e.message}`));
        }
      }
    });
    return true;
  }

  // Inbox — what needs your attention right now
  if (pathname === '/api/inbox') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getInbox(cwd)));
    return true;
  }

  // Resume — pick up where you left off (last verdicts + WIP + recent decisions)
  if (pathname === '/api/resume') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getResume(cwd)));
    return true;
  }

  // Decisions log — global ADR-style log across all projects
  if (pathname === '/api/decisions') {
    // Clamp `limit` to [1, 200]. Same defensive pattern as /api/cost?days
    // — handle ?limit=abc / ?limit=0 / ?limit=-5 / ?limit=999 deterministically.
    const rawLimit = url.searchParams.get('limit');
    const parsed = rawLimit != null ? parseInt(rawLimit, 10) : 20;
    const limit = Number.isFinite(parsed) && parsed > 0
      ? Math.min(parsed, 200)
      : 20;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readDecisionsLog(limit, cwd)));
    return true;
  }

  // Memory — 4-layer memory file contents
  if (pathname === '/api/memory') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getMemory(cwd)));
    return true;
  }

  // Pipeline — current stage states (idle / active / done / failed)
  if (pathname === '/api/pipeline') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getPipeline(cwd)));
    return true;
  }

  // change_tier for the current working-tree diff — the gate + judge plan (ADR-003/004).
  if (pathname === '/api/change-tier') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getChangeTier(cwd)));
    return true;
  }

  // Cost history — daily LLM burn over N days.
  // Clamp `days` to [1, 365] to defend against:
  //   ?days=abc       → NaN → default 30 (parseInt fallback to 30)
  //   ?days=999       → 1000-bucket response (memory + payload bloat)
  //   ?days=-5        → empty series, daily_avg = null in UI
  //   ?days=0         → division-by-zero in daily_avg calc
  // 365 is enough for "last year" views; anything bigger should use
  // a different endpoint / batch query path.
  if (pathname === '/api/cost') {
    const rawDays = url.searchParams.get('days');
    const parsed = rawDays != null ? parseInt(rawDays, 10) : 30;
    const days = Number.isFinite(parsed) && parsed > 0
      ? Math.min(parsed, 365)
      : 30;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(getCostHistory(cwd, days)));
    return true;
  }


  // Create new task
  if (pathname === '/api/tasks' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      // Validation hardening (2026-05-15): bug-hunt found 3 ways to crash this
      // endpoint or silently drop bad input:
      //   - invalid JSON body → 500 (parser exception in catch → 500)
      //   - 10K-char title → 500 (bd argv too long)
      //   - priority=99 → 200 (silently ignored, user thinks it worked)
      // Each is now an explicit 400 with structured error.
      let parsed;
      try {
        parsed = JSON.parse(body || '{}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_json', message: String(e.message || e) }));
        return;
      }
      try {
        const { title, description, priority, agent, labels } = parsed;
        if (!title || typeof title !== 'string' || !title.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'title required' }));
          return;
        }
        // Title length bound: bd issue titles practically cap around 200 chars;
        // 500 is a safe ceiling that catches obvious junk while allowing
        // long-form summaries when warranted.
        if (title.length > 500) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'title_too_long',
            message: `Title is ${title.length} chars; max 500 allowed.`,
            length: title.length,
          }));
          return;
        }
        // Priority must be in P0–P3 if specified. Silent ignore was hiding
        // typos like priority=11 (probably meant P1).
        if (priority != null && (typeof priority !== 'number' || priority < 0 || priority > 3)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'invalid_priority',
            message: 'priority must be an integer in [0, 3] (P0–P3).',
            received: priority,
          }));
          return;
        }
        const beadsErr = checkBeadsAvailable(cwd);
        if (beadsErr) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(beadsErr));
          return;
        }
        // Build bd create args
        const args = ['create', title.trim()];
        if (description) args.push('-d', description);
        if (priority != null && priority >= 0 && priority <= 3) args.push('--priority', `P${priority}`);

        // BH-12 fix: serialise bd writes through global write chain.
        // Concurrent POST /api/tasks calls used to race on bd's file lock —
        // one crash would leave a stale .beads/.lock that froze ALL writes.
        const result = await bdWriteSerialised(() => {
          const r = bd(args, { cwd, timeout: 5000 });
          if (r.status !== 0) return { error: bdErr(r, 'bd create failed') };
          const idMatch = (r.stdout || '').match(/Created issue:\s*(\S+)/);
          const id = idMatch ? idMatch[1] : null;

          // Apply optional labels + agent within the same lock window
          if (id) {
            const updateArgs = ['update', id];
            let needUpdate = false;
            if (agent) { updateArgs.push('--assignee', agent); needUpdate = true; }
            const lbls = Array.isArray(labels) ? labels : (labels ? [labels] : []);
            for (const lbl of lbls) {
              if (lbl) { updateArgs.push('--add-label', lbl); needUpdate = true; }
            }
            if (agent && !lbls.includes(agent)) { updateArgs.push('--add-label', agent); needUpdate = true; }
            if (needUpdate) bd(updateArgs, { cwd, timeout: 5000 });
          }
          return { id };
        });

        if (!result || result.error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: (result && result.error) || 'bd create failed' }));
          return;
        }

        bdCacheInvalidate(cwd);
        broadcastTasks(cwd);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id: result.id }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e.message || e) }));
      }
    });
    return true;
  }

  // Task status update — BH-14/BH-16 fixes: JSON parse 400, write serialisation
  if (pathname.match(/^\/api\/tasks\/[^/]+\/status$/) && req.method === 'POST') {
    const id = pathname.split('/')[3];
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      let parsed;
      try {
        parsed = JSON.parse(body || '{}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_json', message: String(e.message || e) }));
        return;
      }
      const { status } = parsed;
      const validStatuses = ['open', 'in_progress', 'blocked', 'closed'];
      if (!validStatuses.includes(status)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_status', message: `status must be one of: ${validStatuses.join(', ')}`, received: status }));
        return;
      }
      const result = await bdWriteSerialised(() => {
        const r = bd(['update', id, '--status', status], { cwd, timeout: 5000 });
        if (r.status !== 0) return { error: bdErr(r, 'bd update failed') };
        bdCacheInvalidate(cwd);
        return { ok: true };
      });
      if (!result || result.error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (result && result.error) || 'bd update failed' }));
        return;
      }
      broadcastTasks(cwd);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    return true;
  }

  // Task priority update
  if (pathname.match(/^\/api\/tasks\/[^/]+\/priority$/) && req.method === 'POST') {
    const id = pathname.split('/')[3];
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      let parsed;
      try {
        parsed = JSON.parse(body || '{}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_json', message: String(e.message || e) }));
        return;
      }
      const { priority } = parsed;
      if (priority == null || typeof priority !== 'number' || priority < 0 || priority > 3) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_priority', message: 'priority must be an integer in [0, 3]', received: priority }));
        return;
      }
      const result = await bdWriteSerialised(() => {
        const r = bd(['update', id, '--priority', String(priority)], { cwd, timeout: 5000 });
        if (r.status !== 0) return { error: bdErr(r, 'bd update failed') };
        bdCacheInvalidate(cwd);
        return { ok: true };
      });
      if (!result || result.error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (result && result.error) || 'bd update failed' }));
        return;
      }
      broadcastTasks(cwd);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    return true;
  }

  // Task history / timeline from interactions.jsonl
  if (pathname.match(/^\/api\/tasks\/[^/]+\/history$/) && req.method === 'GET') {
    const taskId = pathname.split('/')[3];
    // 404 for unknown task IDs so the UI can distinguish "task does not exist"
    // from "task exists but has no history yet".
    const allTasks = getTasks(cwd);
    if (!allTasks.some(t => t.id === taskId)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'task_not_found', id: taskId }));
      return true;
    }
    const interactionsFile = path.join(cwd, '.beads', 'interactions.jsonl');
    if (!fs.existsSync(interactionsFile)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ events: [] }));
      return true;
    }
    try {
      const lines = fs.readFileSync(interactionsFile, 'utf8').split('\n').filter(Boolean);
      const events = [];
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj.id === taskId) {
            events.push({
              ts: obj.ts || obj.created_at || null,
              actor: obj.actor || obj.agent || null,
              action: obj.action || obj.type || 'updated',
              from: obj.from || null,
              to: obj.to || null,
              notes: obj.notes || null,
            });
          }
        } catch {}
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ events }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e.message || e) }));
    }
    return true;
  }

  // Memory — single global pattern content
  if (pathname === '/api/memory-pattern') {
    const id = url.searchParams.get('id') || '';
    if (!/^GP-[A-Za-z0-9_-]+$/.test(id)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid id' }));
      return true;
    }
    const fp = path.join(GREAT_CTO_DIR, 'global-patterns', id + '.md');
    const content = readFileSafe(fp);
    res.writeHead(content == null ? 404 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ content: content || null }));
    return true;
  }

  // Session logs — list .great_cto/logs/session-*.md for the current project.
  // When no /save logs exist, synthesize day-grouped entries from verdicts so
  // the panel is useful immediately — every project with agent activity gets
  // a meaningful log even before the first /save.
  if (pathname === '/api/logs') {
    const logsDir = path.join(cwd, '.great_cto', 'logs');
    let logs = [];
    try {
      const files = fs.readdirSync(logsDir)
        .filter(f => f.startsWith('session-') && f.endsWith('.md'))
        .sort().reverse().slice(0, 30);
      logs = files.map(f => {
        const fp = path.join(logsDir, f);
        const raw = readFileSafe(fp) || '';
        const dateM = raw.match(/^date:\s*(.+)$/m);
        const timeM = raw.match(/^time:\s*(.+)$/m);
        const durM  = raw.match(/^duration:\s*(.+)$/m);
        const titleM = raw.match(/^#\s+Session:\s*(.+)$/m) || raw.match(/^#\s+(Session[^\n]*)$/m);
        // Headings vary across /save versions and hand-written logs: "## Done",
        // "## Done today", "## Pending", "## Next", "## TODO". Match the keyword
        // and ignore any trailing words on the heading line; bullets may be - or *.
        // Accept "- ", "* ", and "1." / "2)" numbered list items.
        const bulletsFrom = (m) => m
          ? m[1].trim().split('\n').filter(l => /^(?:[-*]|\d+[.)])\s+/.test(l)).map(l => l.replace(/^(?:[-*]|\d+[.)])\s+/, ''))
          : [];
        const doneM = raw.match(/##\s+Done[^\n]*\n([\s\S]*?)(?=\n##|$)/i);
        let done = bulletsFrom(doneM);
        const pendM = raw.match(/##\s+(?:Pending|Next(?:\s+steps?)?|To\s?do|Blocked)[^\n]*\n([\s\S]*?)(?=\n##|$)/i);
        let pending = bulletsFrom(pendM);

        // v2.7.0: SessionEnd hook auto-captures use a different schema
        // (## Git / ## Beads / ## Cost). When no /save format found,
        // synthesise done/pending bullets from those sections so the
        // panel still has content.
        let source = 'save';
        if (!done.length && !pending.length) {
          source = 'auto';
          const gitM   = raw.match(/## Git\n([\s\S]*?)(?=\n##|$)/);
          const beadsM = raw.match(/## Beads\n([\s\S]*?)(?=\n##|$)/);
          const costM  = raw.match(/## Cost[^\n]*\n([\s\S]*?)(?=\n##|$)/);
          const bullets = (sec) => sec ? sec[1].trim().split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2)) : [];
          // Done = factual snapshot (Git + Cost)
          done = [...bullets(gitM)];
          if (costM) {
            const costLines = costM[1].trim().split('\n').filter(l => l && !l.startsWith('```') && !l.includes('(no cost log)'));
            if (costLines.length) done.push(`Cost: ${costLines.join(' · ')}`);
          }
          // Pending = open work (Beads)
          pending = [...bullets(beadsM)];
        }
        return {
          file: f,
          source,
          date: dateM?.[1]?.trim() || f.slice(8, 18),
          time: timeM?.[1]?.trim() || '',
          duration: durM?.[1]?.trim() || '',
          title: titleM?.[1]?.trim() || f.replace(/^session-\d{4}-\d{2}-\d{2}-/, '').replace('.md', ''),
          done,
          pending,
          raw,
        };
      });
    } catch {}

    // Fallback: synthesize from verdicts grouped by day
    if (!logs.length) {
      try {
        // Scope to THIS project: readVerdicts(cwd) returns project-local verdicts
        // plus global lines tagged `project=<slug>`. Without the cwd every project
        // showed the same unfiltered global verdict feed (another project's work).
        const verdicts = readVerdicts(cwd);
        const byDay = new Map();
        for (const v of verdicts) {
          const day = (v.ts || '').slice(0, 10);
          if (!day) continue;
          if (!byDay.has(day)) byDay.set(day, { ok: [], fail: [], earliest: v.ts, latest: v.ts });
          const b = byDay.get(day);
          const verdictUp = (v.verdict || '').toUpperCase();
          const isOk = ['OK','APPROVED','DONE','PASS','PASSED'].includes(verdictUp);
          const isFail = ['FAIL','FAILED','BLOCKED','REJECTED'].includes(verdictUp);
          const summary = `${v.agent}: ${v.verdict || 'event'}${v.raw ? ` — ${v.raw.replace(/\s+/g,' ').slice(0,140)}` : ''}`;
          if (isFail) b.fail.push(summary);
          else b.ok.push(summary);
          if (v.ts < b.earliest) b.earliest = v.ts;
          if (v.ts > b.latest)   b.latest   = v.ts;
        }
        logs = Array.from(byDay.entries())
          .sort(([a],[b]) => b.localeCompare(a))
          .slice(0, 30)
          .map(([day, b]) => ({
            file: `auto-${day}`,
            source: 'verdicts',
            date: day,
            time: (b.earliest || '').slice(11, 16),
            duration: '',
            title: `Auto-log · ${b.ok.length + b.fail.length} agent run${(b.ok.length+b.fail.length)===1?'':'s'}`,
            done: b.ok.slice(0, 50),
            pending: b.fail.slice(0, 50),
            raw: '_Auto-generated from ~/.great_cto/verdicts/. Run `/save` to create a curated session log._',
          }));
      } catch {}
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ logs }));
    return true;
  }

  // Installed agents — fleet view (DESIGN-agents-fleet-view §3.1).
  //
  // Extended in 2026-05-15 from a flat list to a faceted-fleet payload:
  // each row carries domain (slug-derived), runs_30d, success_rate, last_run,
  // retired (sidecar file marker), and savings_x. The board's /agents tab
  // renders these into the .agent-row list with no further server round-trips.
  if (pathname === '/api/agents-installed') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getAgentsFleet(cwd)));
    return true;
  }

  // Build version — so the board shows which great_cto version it's running.
  if (pathname === '/api/version') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ version: BUILD_VERSION, surface: 'builder', node: process.version.replace(/^v/, '') }));
    return true;
  }

  // Per-agent profile drawer (DESIGN-agents-fleet-view §3.2).
  // GET /api/agents/<slug> → { slug, description, model, applies_to,
  //                            runs_30d, success_rate, last_run, savings_x,
  //                            retired, runs[20], failure_modes[N] }
  if (pathname.startsWith('/api/agents/') && req.method === 'GET') {
    const rest = pathname.slice('/api/agents/'.length);
    const [slug, sub] = rest.split('/');
    if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_slug' }));
      return true;
    }
    if (!sub) {
      const profile = getAgentProfile(slug);
      if (!profile) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'agent_not_found', slug }));
        return true;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(profile));
      return true;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'unknown_subpath', sub }));
    return true;
  }

  // POST /api/agents/<slug>/retire | restore — sidecar marker
  // (DESIGN-agents-fleet-view §9 Top-2 #2: reversible sidecar chosen over
  // filesystem move; founder may revise.)
  if (pathname.startsWith('/api/agents/') && req.method === 'POST') {
    // Cross-origin guard — same helper as BH-23 on /api/projects/register
    // (originAllowed() in lib/util.mjs; also enforced as the top-level CSRF
    // guard in server.mjs before dispatch() is ever called).
    if (!originAllowed(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'origin_not_allowed' }));
      return true;
    }
    const rest = pathname.slice('/api/agents/'.length);
    const [slug, action] = rest.split('/');
    if (!slug || !/^[a-z0-9-]+$/i.test(slug) || !['retire', 'restore'].includes(action)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_request' }));
      return true;
    }
    try {
      const result = action === 'retire' ? retireAgent(slug) : restoreAgent(slug);
      res.writeHead(result.ok ? 200 : 404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return true;
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
      return true;
    }
  }

  // ── /api/push — Web Push subscription management ────────────────────────
  // GET  /api/push/vapid-key → { publicKey } (base64url, for browser subscribe)
  // POST /api/push/subscribe → body: { endpoint, keys: { p256dh, auth } }
  // DELETE /api/push/subscribe → body: { endpoint }
  if (pathname === '/api/push/vapid-key' && req.method === 'GET') {
    const keys = getVapidKeys(VAPID_KEYS_FILE);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ publicKey: keys.publicKey }));
    return true;
  }

  if (pathname === '/api/push/subscribe' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const sub = JSON.parse(body || '{}');
        if (!sub.endpoint) { res.writeHead(400); return res.end(JSON.stringify({ error: 'endpoint_required' })); }
        addSubscription(PUSH_SUBS_FILE, sub);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400); return res.end(JSON.stringify({ error: 'invalid_json' }));
      }
    });
    return true;
  }

  if (pathname === '/api/push/subscribe' && req.method === 'DELETE') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { endpoint } = JSON.parse(body || '{}');
        if (!endpoint) { res.writeHead(400); return res.end(JSON.stringify({ error: 'endpoint_required' })); }
        removeSubscription(PUSH_SUBS_FILE, endpoint);
        res.writeHead(204);
        return res.end();
      } catch {
        res.writeHead(400); return res.end(JSON.stringify({ error: 'invalid_json' }));
      }
    });
    return true;
  }

  // ── /api/notif-history — in-app notification history ─────────────────────
  // GET  /api/notif-history?unread=1&limit=N → JSON array (newest first)
  // POST /api/notif-history/read → body: { id? } (omit id = mark all read)
  if (pathname === '/api/notif-history' && req.method === 'GET') {
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
    const unreadOnly = url.searchParams.get('unread') === '1';
    // Surface filter: the builder board must not see operate-side alerts (autopilot dead-letters,
    // connector health, case SLA). Default to the builder surface; `?scope=operate|all` opts in.
    // Classify by event name too, so entries written before the surface tag existed are filtered.
    const scope = url.searchParams.get('scope') || 'builder';
    const surfaceOf = (n) => n.surface || eventSurface(n.event);
    let items = notifHistory;
    if (scope === 'builder') items = items.filter(n => surfaceOf(n) !== 'operate');
    else if (scope === 'operate') items = items.filter(n => surfaceOf(n) === 'operate');
    items = items.slice(0, limit);
    if (unreadOnly) items = items.filter(n => !n.read);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(items));
    return true;
  }

  if (pathname === '/api/notif-history/read' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { id } = JSON.parse(body || '{}');
        if (id) {
          const n = notifHistory.find(n => n.id === id);
          if (n) n.read = true;
        } else {
          // Mark all read
          for (const n of notifHistory) n.read = true;
        }
        saveNotifHistory();
        res.writeHead(204);
        return res.end();
      } catch {
        res.writeHead(400); return res.end(JSON.stringify({ error: 'invalid_json' }));
      }
    });
    return true;
  }

  // ── Heartbeat watchdog (Paperclip pattern) ──────────────────────────────
  // GET /api/heartbeat → { stuck: [{id,title,agent,age_h}], budgets: {agent→cap},
  //                        goal_ancestry: string, tool_failure_rate_1h: number }
  if (pathname === '/api/heartbeat') {
    const tasks = getTasks(cwd);
    const nowMs = Date.now();
    const STUCK_H = 48;
    const stuck = tasks
      .filter(t => t.status === 'in_progress')
      .map(t => {
        const startedAt = t.startedAt ? new Date(t.startedAt).getTime() : null;
        const ageH = startedAt ? (nowMs - startedAt) / 3600000 : null;
        return { id: t.id, title: t.title, agent: t.agent, age_h: ageH ? Math.round(ageH) : null };
      })
      .filter(t => t.age_h !== null && t.age_h > STUCK_H);

    // Per-agent budgets from PROJECT.md
    const projectMdPath = path.join(cwd, '.great_cto', 'PROJECT.md');
    let budgets = {};
    let goalAncestry = null;
    try {
      const projectTxt = fs.readFileSync(projectMdPath, 'utf8');
      const sectionMatch = projectTxt.match(/^agent-budget:\s*\n((?:[ \t]+\S[^\n]*\n?)*)/m);
      if (sectionMatch) {
        for (const line of sectionMatch[1].split('\n')) {
          const m = line.match(/^\s+([a-z][a-z0-9-]*):\s*(\d+(?:\.\d+)?)/);
          if (m) budgets[m[1]] = parseFloat(m[2]);
        }
      }
      // Goal ancestry
      const archetype = (projectTxt.match(/^(?:archetype|primary):\s*(\S+)/m) || [])[1] || null;
      const compliance = (projectTxt.match(/^compliance:\s*(.+)$/m) || [])[1] || null;
      const phase = (projectTxt.match(/^phase:\s*(\S+)/m) || [])[1] || null;
      const complianceClean = compliance && !/^\[?none\]?$/i.test(compliance.trim()) ? compliance.trim() : null;
      if (archetype) goalAncestry = `[archetype:${archetype}]${complianceClean ? ` [compliance:${complianceClean}]` : ''}${phase ? ` [phase:${phase}]` : ''}`;
    } catch { /* project not found */ }

    // Tool failure rate in last hour
    let toolFailureRate1h = 0;
    try {
      const failLog = fs.readFileSync(path.join(cwd, '.great_cto', 'tool-failures.log'), 'utf8');
      const cutoff = new Date(nowMs - 3600000).toISOString();
      toolFailureRate1h = failLog.split('\n').filter(l => l > cutoff && l.trim()).length;
    } catch { /* no log */ }

    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ stuck, budgets, goal_ancestry: goalAncestry, tool_failure_rate_1h: toolFailureRate1h }));
    return true;
  }

  // API requests get a JSON 404 so frontends can JSON.parse() the response
  // without crashing. Static-file 404s stay plain text.
  if (pathname.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found', path: pathname, hint: 'Endpoint missing — restart the board after a great-cto update.' }));
    return true;
  }

  return false;
}

export { dispatch };
