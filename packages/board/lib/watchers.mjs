import fs from 'fs';
import path from 'path';
import { GREAT_CTO_DIR } from './config.mjs';
import { sseClients } from './state.mjs';
import { listProjects } from './projects.mjs';
import { bdCacheInvalidate, getTasks } from './beads.mjs';
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
