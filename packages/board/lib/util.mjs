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

/**
 * Read a file while keeping the three outcomes a caller must treat differently
 * apart: the file is absent, the file exists but could not be read, or here are
 * its contents.
 *
 * `readFileSafe` collapses the middle case into the first — it returns null for
 * both — so every caller downstream renders "no data". That is how a permission
 * error, a truncated file, or a parse failure became indistinguishable from an
 * empty project, and it is the shared root of five separate board bugs: tasks
 * that silently listed nothing, a metrics panel showing "—" while the API had
 * real counts, and session logs reporting "nothing recorded" over a file full of
 * entries. Emptiness must be a finding, not a fallback.
 *
 * @returns {{ok:true,text:string}
 *          |{ok:false,reason:'missing'}
 *          |{ok:false,reason:'unreadable',error:string}}
 */
function readSafe(p) {
  let exists;
  try {
    exists = fs.existsSync(p);
  } catch (e) {
    // existsSync itself throws on some permission/loop conditions.
    return { ok: false, reason: 'unreadable', error: e?.message || String(e) };
  }
  if (!exists) return { ok: false, reason: 'missing' };
  try {
    return { ok: true, text: fs.readFileSync(p, 'utf8') };
  } catch (e) {
    return { ok: false, reason: 'unreadable', error: e?.message || String(e) };
  }
}

/**
 * Wrap a parse step so a malformed payload is reported rather than swallowed.
 * Callers that used `try { JSON.parse(x) } catch { return [] }` cannot tell a
 * genuinely empty list from a corrupt file; this keeps that distinction.
 * @returns {{ok:true,value:any}|{ok:false,reason:'unparsable',error:string}}
 */
function parseSafe(text, parser = JSON.parse) {
  try {
    return { ok: true, value: parser(text) };
  } catch (e) {
    return { ok: false, reason: 'unparsable', error: e?.message || String(e) };
  }
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

export { csvCell, originAllowed, eventSurface, readFileSafe, readSafe, parseSafe, isInsideDir };
