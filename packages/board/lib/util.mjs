import fs from 'fs';
import path from 'path';
import { PORT } from './config.mjs';

/**
 * Escape a single value for inclusion in a CSV cell.
 * Quotes the value if it contains comma / quote / newline.
 */
function csvCell(v) {
  if (v == null) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// Only same-origin (the board's own page) may make a state-changing request — a malicious page must not.
function originAllowed(req) {
  const o = req.headers.origin || req.headers.referer || '';
  if (!o) return true; // same-origin fetch / curl with no Origin
  // True same-origin: the browser's Origin matches the host this request arrived on
  // (covers a tunnelled/hosted console at console.client.com, http or https).
  const self = req.headers.host ? [`http://${req.headers.host}`, `https://${req.headers.host}`] : [];
  return [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`, ...self].some((e) => o === e || o.startsWith(e + '/'));
}

// Which surface an alert belongs to. Operate-side events (autopilot runtime: dead-letters,
// connector health, case SLA, gate/safe-mode pushes) are the operator console's concern and
// must not clutter the builder board's notifications — the two surfaces are separated.
function eventSurface(event) {
  return /^(autopilot\.|dead-letter|connector\.|sla\.)/.test(String(event || '')) ? 'operate' : 'builder';
}

function readFileSafe(p) {
  try { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; } catch { return null; }
}

// Path-containment check used by any handler that joins user-controlled input
// onto a base directory (static file serving, doc reads, etc.). Resolves both
// sides and requires `target` to be exactly `base`, or a real descendant of
// it (base + path.sep prefix) — this is what actually blocks ".." escapes,
// since a naive startsWith(base) would wrongly allow a sibling directory
// like "/public-evil" when base is "/public".
function isInsideDir(base, target) {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);
  return resolvedTarget === resolvedBase || resolvedTarget.startsWith(resolvedBase + path.sep);
}

export { csvCell, originAllowed, eventSurface, readFileSafe, isInsideDir };
