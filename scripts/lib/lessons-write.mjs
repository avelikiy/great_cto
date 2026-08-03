#!/usr/bin/env node
/**
 * lessons-write — add a lesson to `.great_cto/lessons.md` by MERGING it into the
 * entry that already covers that pattern, instead of appending a new one.
 *
 * Why this exists
 * ---------------
 * `lessons.md` is append-only, and de-duplication is a line in the
 * continuous-learner prompt: "reject if the same pattern is already in
 * lessons.md (de-dupe by `pattern:` field)". That is a Haiku agent being asked
 * to read a file that grows every session and notice a slug it wrote weeks ago.
 * It is the same shape as everything else this repo keeps rediscovering — a
 * check that is declared and never executed — and the failure is quiet: the
 * file just gets longer, the same lesson appears three times with three
 * different wordings, and nobody re-reads it because it is not worth re-reading.
 *
 * A file that only ever grows is a log. What we want is a set of articles, each
 * of which gets rewritten when new evidence arrives — so a second sighting makes
 * an entry STRONGER rather than making the file LONGER.
 *
 * Merging is therefore mechanical here, not a matter of the agent noticing:
 *
 *   - same `pattern:` slug        → merge into the existing entry
 *   - evidence lines              → union, de-duplicated, newest last
 *   - `occurrences:`              → incremented (the count that promotion reads)
 *   - `confidence:`               → may only rise; a repeat never weakens a lesson
 *   - Context / Decision / Outcome→ kept from the existing entry unless it is
 *                                   empty, because the first careful write is
 *                                   usually better than a later hurried one
 *
 * The one thing it will not do is silently drop a contradiction: if the incoming
 * Decision differs from the stored one, both are kept under a `**Superseded:**`
 * line with dates. A lesson that reversed is the most valuable kind, and
 * overwriting it would erase the reversal.
 *
 * CLI:
 *   node scripts/lib/lessons-write.mjs <lessons.md> <entry.md>
 *   node scripts/lib/lessons-write.mjs <lessons.md> --stdin
 *   node scripts/lib/lessons-write.mjs <lessons.md> --stdin --dry-run
 */

const FIELD_ORDER = ['date', 'session-id', 'archetype', 'project', 'confidence', 'shape', 'occurrences'];
const CONFIDENCE_RANK = { low: 1, medium: 2, high: 3 };

/**
 * Split a lessons.md into entries. An entry is a `---` frontmatter block plus
 * everything up to the next one.
 *
 * Anything before the first entry (a title, a header comment) is preamble and is
 * preserved untouched — losing a file's header on every write is how a tool
 * earns a reputation for eating files.
 */
export function parseLessons(text) {
  const src = String(text ?? '');
  const lines = src.split('\n');
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== '---') continue;
    // A frontmatter opener is followed by `key: value` and a later `---`.
    if (!/^[a-z][\w-]*:/i.test(lines[i + 1] || '')) continue;
    let close = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === '---') { close = j; break; }
      if (!/^[a-z][\w-]*:/i.test(lines[j]) && lines[j].trim() !== '') { break; }
    }
    if (close !== -1) { starts.push(i); i = close; }
  }

  const preamble = starts.length ? lines.slice(0, starts[0]).join('\n') : src;
  const entries = starts.map((start, idx) => {
    const end = idx + 1 < starts.length ? starts[idx + 1] : lines.length;
    return parseEntry(lines.slice(start, end).join('\n'));
  });
  return { preamble, entries };
}

/** One entry's text → { meta, slug, body, raw }. */
export function parseEntry(text) {
  const src = String(text ?? '').replace(/\s+$/, '');
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta = {};
  let body = src;
  if (m) {
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^([a-z][\w-]*):\s*(.*)$/i);
      if (kv) meta[kv[1].toLowerCase()] = kv[2].trim();
    }
    body = m[2];
  }
  const slug = (body.match(/^##\s*pattern:\s*(.+)$/mi) || [])[1]?.trim().toLowerCase() || null;
  return { meta, slug, body: body.replace(/\s+$/, ''), raw: src };
}

/**
 * A `**Label:**` section's value, or ''.
 *
 * Deliberately NOT multiline. With the `m` flag `$` matches an end of LINE, so a
 * lazy match terminated by `(?=…|$)` stops at the first newline and every
 * multi-line section — Evidence above all — reads as empty. The section then
 * looks absent, gets "filled" by a rewrite that lands beside the old lines, and
 * the file grows a second copy instead of merging.
 */
function section(body, label) {
  const rx = new RegExp(`(?:^|\\n)\\*\\*${label}:\\*\\*[ \\t]*([\\s\\S]*?)(?=\\n\\*\\*|\\n##|$)`, 'i');
  return (body.match(rx) || [])[1]?.trim() || '';
}

/** Evidence bullets under `**Evidence:**`, trimmed. */
function evidenceLines(body) {
  return section(body, 'Evidence')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('-'))
    .map((l) => l.replace(/^-\s*/, '').trim())
    .filter(Boolean);
}

function replaceSection(body, label, value) {
  const rx = new RegExp(`(^|\\n)\\*\\*${label}:\\*\\*[ \\t]*[\\s\\S]*?(?=\\n\\*\\*|\\n##|$)`, 'i');
  const m = body.match(rx);
  if (!m) return body;
  const clean = label.replace(/\\/g, '');
  // A multi-line value starts on its own line; a one-liner stays on the label's.
  // Without this the file grows `**Evidence:** ` with a trailing space before the
  // list — the kind of detail that makes a generated file look unmaintained.
  const sep = String(value).startsWith('\n') ? '' : ' ';
  return body.replace(rx, `${m[1]}**${clean}:**${sep}${String(value).replace(/^\n+/, '\n')}`);
}

/**
 * Merge an incoming entry into a stored one.
 *
 * @returns {{ entry: object, changed: string[] }} changed = what the merge did,
 *   so the caller can report it rather than claiming a write it did not make.
 */
export function mergeEntry(existing, incoming) {
  const changed = [];
  let conflict = null;
  const meta = { ...existing.meta };

  const prior = Number(meta.occurrences || 1);
  meta.occurrences = String((Number.isFinite(prior) ? prior : 1) + 1);
  changed.push(`occurrences ${prior} → ${meta.occurrences}`);

  // Confidence may only rise. A second sighting is evidence FOR a pattern; a
  // hurried later write reporting "medium" must not undo an earlier "high".
  const was = CONFIDENCE_RANK[(meta.confidence || '').toLowerCase()] || 0;
  const now = CONFIDENCE_RANK[(incoming.meta.confidence || '').toLowerCase()] || 0;
  if (now > was) { meta.confidence = incoming.meta.confidence.toLowerCase(); changed.push(`confidence → ${meta.confidence}`); }

  // `last-seen` is what makes a stale lesson visible. `date` stays the first
  // sighting, because when a pattern STARTED is a different fact from when it
  // was last true, and collapsing them loses the age of the pattern.
  if (incoming.meta.date && incoming.meta.date !== meta['last-seen']) {
    meta['last-seen'] = incoming.meta.date;
    changed.push(`last-seen ${meta['last-seen']}`);
  }

  let body = existing.body;

  // Fill a section that was left empty; never overwrite one that has content.
  for (const label of ['Context', 'Decision/Pattern', 'Outcome', 'Applies-to-archetypes']) {
    const have = section(body, label.replace('/', '\\/'));
    const add = section(incoming.body, label.replace('/', '\\/'));
    if (!have && add) { body = replaceSection(body, label.replace('/', '\\/'), add); changed.push(`filled ${label}`); }
  }

  // A changed Decision is the interesting case: the lesson reversed. Keep both.
  const oldDecision = section(body, 'Decision\\/Pattern');
  const newDecision = section(incoming.body, 'Decision\\/Pattern');
  if (oldDecision && newDecision && normalise(oldDecision) !== normalise(newDecision)) {
    const when = incoming.meta.date || meta['last-seen'] || 'later';
    if (!body.includes('**Superseded:**')) {
      body += `\n\n**Superseded:** as of ${when} — ${newDecision}`;
    } else {
      body = body.replace(/\*\*Superseded:\*\*[\s\S]*?(?=\n\*\*|\n##|$)/,
        `**Superseded:** as of ${when} — ${newDecision}`);
    }
    changed.push('recorded a superseding decision');
    // Surfaced, not just stored. A reversal written silently into a file nobody
    // re-reads is the same as not recording it: the next reader inherits the new
    // decision with no idea one was overturned, and the reason it was overturned
    // is the most valuable thing in the entry.
    conflict = { slug: existing.slug, was: oldDecision, now: newDecision, when };
  }

  // Evidence accumulates: it is the reason to believe the entry, and each
  // sighting adds one. De-duplicated, order preserved, newest last.
  const have = evidenceLines(body);
  const add = evidenceLines(incoming.body).filter((e) => !have.includes(e));
  if (add.length) {
    const all = [...have, ...add].map((e) => `- ${e}`).join('\n');
    body = replaceSection(body, 'Evidence', `\n${all}\n`);
    changed.push(`+${add.length} evidence`);
  }

  return { entry: { ...existing, meta, body: body.replace(/\s+$/, '') }, changed, conflict };
}

const normalise = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();

/** Render one entry back to markdown. */
export function renderEntry(entry) {
  const keys = [...FIELD_ORDER.filter((k) => k in entry.meta), 'last-seen']
    .filter((k, i, a) => k in entry.meta && a.indexOf(k) === i);
  const extra = Object.keys(entry.meta).filter((k) => !keys.includes(k));
  const front = [...keys, ...extra].map((k) => `${k}: ${entry.meta[k]}`).join('\n');
  return `---\n${front}\n---\n\n${entry.body.replace(/^\s+/, '')}`;
}

/**
 * Add `incomingText` to `lessonsText`, merging when the pattern slug already
 * exists.
 *
 * @returns {{ text: string, action: 'merged'|'appended'|'skipped', slug: string|null, changed: string[] }}
 */
export function addLesson(lessonsText, incomingText) {
  const incoming = parseEntry(incomingText);
  if (!incoming.slug) {
    // No `## pattern:` line means nothing to merge ON. Appending it anyway is
    // how the file fills with entries the de-dup can never see again.
    return { text: String(lessonsText ?? ''), action: 'skipped', slug: null, conflict: null, changed: ['no `## pattern:` slug — refusing to add an unmergeable entry'] };
  }

  const { preamble, entries } = parseLessons(lessonsText);
  const idx = entries.findIndex((e) => e.slug === incoming.slug);

  if (idx === -1) {
    if (!('occurrences' in incoming.meta)) incoming.meta.occurrences = '1';
    const next = [...entries, incoming];
    return { text: render(preamble, next), action: 'appended', slug: incoming.slug, conflict: null, changed: ['new pattern'] };
  }

  const { entry, changed, conflict } = mergeEntry(entries[idx], incoming);
  const next = entries.slice();
  next[idx] = entry;
  return { text: render(preamble, next), action: 'merged', slug: incoming.slug, changed, conflict };
}

function render(preamble, entries) {
  const head = preamble.replace(/\s+$/, '');
  return [head, ...entries.map(renderEntry)].filter(Boolean).join('\n\n') + '\n';
}

// ── CLI ─────────────────────────────────────────────────────────────────────

async function main(argv) {
  const { readFileSync, writeFileSync, existsSync } = await import('node:fs');
  const files = argv.filter((a) => !a.startsWith('--'));
  const target = files[0];
  if (!target) {
    console.error('usage: lessons-write.mjs <lessons.md> (<entry.md> | --stdin) [--dry-run]');
    return 2;
  }

  let incoming;
  if (argv.includes('--stdin')) {
    try { incoming = readFileSync(0, 'utf8'); } catch { incoming = ''; }
  } else {
    if (!files[1]) { console.error('lessons-write: give an entry file or --stdin'); return 2; }
    incoming = readFileSync(files[1], 'utf8');
  }

  const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
  const r = addLesson(current, incoming);

  console.log(`[lessons-write] ${r.action}${r.slug ? ` \`${r.slug}\`` : ''}: ${r.changed.join(', ')}`);
  if (r.conflict) {
    // On stderr and unmissable: this is the one outcome that needs a human.
    console.error('');
    console.error(`⚠ CONFLICT — the lesson \`${r.conflict.slug}\` reverses a recorded decision.`);
    console.error(`  was: ${r.conflict.was}`);
    console.error(`  now: ${r.conflict.now}   (${r.conflict.when})`);
    console.error('  Both are kept. Surface this to the CTO — a decision that reversed is the');
    console.error('  most valuable thing in the file, and it is worthless if nobody is told.');
  }
  if (r.action === 'skipped') return 1;
  if (argv.includes('--dry-run')) { console.log('[lessons-write] --dry-run: not writing'); return 0; }
  writeFileSync(target, r.text);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}
