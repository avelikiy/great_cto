import fs from 'fs';
import path from 'path';
import { GREAT_CTO_DIR } from './config.mjs';
import { sseClients } from './state.mjs';
import { listProjects } from './projects.mjs';
import { bdCacheInvalidate, getTasks, isSelfInflictedTouch } from './beads.mjs';
import { getPipeline, getInbox } from './data-readers.mjs';

// ── File watcher ───────────────────────────────────────────────────────────────
function watchBeads() {
  // Watch every registered project's beads files.
  // Note: bd create only writes to dolt DB, NOT interactions.jsonl. So we must
  // watch BOTH: (a) interactions.jsonl for status/priority changes (from bd
  // update/close), and (b) the dolt manifest/journal for new-issue detection.
  const projects = listProjects();
  const dirs = projects.map(p => p.path);
  if (!dirs.includes(process.cwd())) dirs.push(process.cwd());

  const broadcast = (dir) => {
    // Invalidate ONLY for a project somebody is looking at.
    //
    // This ran unconditionally, for all sixteen registered projects, on every
    // file event in any of them — and an invalidated entry is deleted, so no
    // later read can be served from cache no matter how stale it is willing to
    // accept. The alert crons then re-ran `bd list` for all sixteen every five
    // minutes, at 2-6 s each, synchronously. That is the pair that made the
    // board unanswerable: watchers emptying the cache as fast as sweeps filled
    // it, with the event loop held by `spawnSync` throughout.
    //
    // A project nobody is watching serves data up to BD_CACHE_TTL_MS old, which
    // is the freshness contract everywhere else, and the read that refreshes it
    // happens when someone actually opens it.
    const watched = [...sseClients].some((r) => r._gctoCwd === dir);
    if (!watched) return;
    // Do not react at all to the echo of our own read. `bd list` touches the dolt
    // journal this watcher watches, so every read was dropping the entry it had
    // just filled — a loop that made the cache useless at any TTL.
    //
    // Return, rather than merely skipping the invalidation. I tried the narrower
    // version — suppress the cache drop, still broadcast — reasoning that a
    // watcher event is still an event. It is not: the broadcast reads
    // getTasks(dir), and on a self-touch the entry was deliberately NOT
    // invalidated, so the event carries the cache's older answer. Clients were
    // pushed stale tasks, and `gate: SSE broadcasts updated tasks after
    // approval` failed on exactly that.
    //
    // Nothing is lost by staying silent here. A write through the board calls
    // broadcastTasks itself; a write from outside is not a self-touch and lands
    // in the branch below.
    if (isSelfInflictedTouch(dir)) return;
    bdCacheInvalidate(dir);
    for (const res of sseClients) {
      if (res._gctoCwd === dir) {
        try {
          res.write(`event: tasks\ndata: ${JSON.stringify(getTasks(dir))}\n\n`);
          res.write(`event: pipeline\ndata: ${JSON.stringify(getPipeline(dir))}\n\n`);
          res.write(`event: inbox\ndata: ${JSON.stringify(getInbox(dir))}\n\n`);
        } catch {}
      }
    }
  };

  // Debounce per-dir: dolt writes can fire 3-5 events in <50ms during a single
  // bd command. Collapse them into one broadcast 200ms after the last event.
  const debouncers = new Map();
  const schedule = (dir) => {
    if (debouncers.has(dir)) clearTimeout(debouncers.get(dir));
    debouncers.set(dir, setTimeout(() => {
      debouncers.delete(dir);
      broadcast(dir);
    }, 200));
  };

  // Tracks dirs whose interactions.jsonl file watch is already registered,
  // so the late-registration path (b) below doesn't double-watch a file
  // that was already picked up at startup by (a).
  const interactionsWatched = new Set();

  const watchInteractionsFile = (dir) => {
    if (interactionsWatched.has(dir)) return;
    const interactionsFile = path.join(dir, '.beads', 'interactions.jsonl');
    try {
      fs.watch(interactionsFile, () => schedule(dir));
      interactionsWatched.add(dir);
    } catch {}
  };

  for (const dir of dirs) {
    // (a) interactions.jsonl — captures bd update/close
    const interactionsFile = path.join(dir, '.beads', 'interactions.jsonl');
    if (fs.existsSync(interactionsFile)) {
      watchInteractionsFile(dir);
    }
    // (b) dolt embeddeddolt directory (recursive) — captures bd create
    const doltDir = path.join(dir, '.beads', 'embeddeddolt');
    if (fs.existsSync(doltDir)) {
      try { fs.watch(doltDir, { recursive: true }, () => schedule(dir)); } catch {}
    }
    // (c) .beads dir itself — interactions.jsonl is only registered above if
    // it already exists at startup; if bd creates it later (first `bd
    // update`/`close` on a project with no prior interaction log), that
    // event was previously missed entirely (great_cto-lvai). Watch the
    // .beads dir (non-recursive) and register the file watch as soon as it
    // appears, guarded against double-registration via interactionsWatched.
    const beadsDir = path.join(dir, '.beads');
    if (fs.existsSync(beadsDir)) {
      try {
        fs.watch(beadsDir, (eventType, filename) => {
          if (filename === 'interactions.jsonl') watchInteractionsFile(dir);
          schedule(dir);
        });
      } catch {}
    }
  }
}

// Watch ~/.great_cto/verdicts/ — push pipeline updates whenever an agent
// emits a verdict (any project gets the broadcast for its own cwd).
function watchVerdicts() {
  const verdictDir = path.join(GREAT_CTO_DIR, 'verdicts');
  if (!fs.existsSync(verdictDir)) {
    try { fs.mkdirSync(verdictDir, { recursive: true }); } catch { return; }
  }
  let pushTimer = null;
  const broadcastPipeline = () => {
    if (pushTimer) clearTimeout(pushTimer);
    // debounce: collapse a burst of writes (multiple agents finishing within ~150ms)
    pushTimer = setTimeout(() => {
      for (const res of sseClients) {
        const dir = res._gctoCwd || process.cwd();
        try {
          res.write(`event: pipeline\ndata: ${JSON.stringify(getPipeline(dir))}\n\n`);
          res.write(`event: inbox\ndata: ${JSON.stringify(getInbox(dir))}\n\n`);
        } catch { sseClients.delete(res); }
      }
    }, 150);
  };
  try {
    fs.watch(verdictDir, () => broadcastPipeline());
    // Also watch each existing log file (some agents append to existing)
    for (const f of fs.readdirSync(verdictDir).filter(x => x.endsWith('.log'))) {
      try { fs.watch(path.join(verdictDir, f), () => broadcastPipeline()); } catch {}
    }
  } catch {}
}

export { watchBeads, watchVerdicts };
