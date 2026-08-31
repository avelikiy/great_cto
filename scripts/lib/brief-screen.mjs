/**
 * The one screen that stands where the `product` gate used to.
 *
 * At `approval-level: ship-only` there is a single gate — `ship` — because it is
 * the only stop whose consequence leaves the machine. But the decision about WHAT
 * to build is the most expensive one to get wrong: you learn it after architect,
 * pm, senior-dev, qa, security and devops have all run. Deleting its gate without
 * replacing it would trade a pause for a silence.
 *
 * So it becomes a briefing: printed once, non-blocking, and short. Say nothing
 * and the pipeline proceeds; say something and it stops. The operator is told
 * that explicitly, because a screen that does not say silence is consent has not
 * obtained consent.
 *
 * Returns `null` when it cannot produce a briefing — no recommendation, no text,
 * unreadable input. `gatesForApprovalLevel(level, { briefReadable: false })` then
 * restores the `product` gate. A briefing that briefs nothing is worse than the
 * gate it replaced, and "I could not show you" must never be delivered as "you
 * were shown and said nothing".
 */

/** Sections worth a person's attention before a build starts, in reading order. */
const WANTED = [
  ['Recommendation', 'What gets built'],
  ['The bet', 'Why'],
  ['Risks & kill-criteria', 'Stop if'],
  ['Open questions', 'Left open'],
];

/** The body of a `## Heading` section, flattened to one paragraph. */
function section(text, heading) {
  // No `m` flag: with it, `$` means end-of-LINE, so the lazy capture stopped at the
  // first newline and every multi-line section came back empty. The heading is
  // anchored on an explicit line start instead, and the terminator is either the
  // next `##` or the true end of the string.
  const re = new RegExp(`(?:^|\\n)##\\s+${heading}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i');
  const m = text.match(re);
  if (!m) return '';
  return m[1].split('\n')
    // A markdown table is information wearing punctuation. Its separator row says
    // nothing; its cells do, so they become a sentence rather than disappearing.
    .filter((l) => !/^\s*\|?\s*:?-{2,}/.test(l))
    .map((l) => (/^\s*\|/.test(l) ? l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim()).filter(Boolean).join(' — ') : l))
    // Emphasis first, THEN the list marker. The other order strips one asterisk of
    // `**BUILD**` as if it were a bullet, leaving `*BUILD` — a stray character that
    // reads as a typo in the one screen that is supposed to inspire confidence.
    .map((l) => l.replace(/\*\*|__|`/g, ''))
    .map((l) => l.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/** Wrap to width, capped at `maxLines`; a long section is trimmed, never dropped. */
function wrap(s, width, maxLines) {
  const out = [];
  let line = '';
  for (const w of s.split(' ')) {
    if ((line + ' ' + w).trim().length > width) { out.push(line.trim()); line = w; }
    else line += ' ' + w;
    if (out.length >= maxLines) break;
  }
  if (out.length < maxLines && line.trim()) out.push(line.trim());
  if (out.length === maxLines) out[maxLines - 1] = out[maxLines - 1].replace(/.{2}$/, '…');
  return out;
}

/**
 * @param {string|null} text  the BRIEF markdown
 * @param {{path: string, width?: number}} opts
 * @returns {string|null}
 */
export function briefScreen(text, { path, width = 76 } = {}) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const rec = section(text, 'Recommendation');
  // The recommendation is the briefing. Without it there is nothing to consent to.
  if (!rec) return null;

  const lines = ['', 'ABOUT TO BUILD — say nothing and this proceeds, say something and it stops.', ''];
  // The column is sized to the longest label that will actually be printed, so a
  // label can never run into the text beside it.
  const present = WANTED.filter(([h]) => section(text, h));
  const col = Math.max(...present.map(([, l]) => l.length + 1)) + 2;
  for (const [heading, label] of present) {
    const body = section(text, heading);
    const budget = heading === 'Recommendation' ? 4 : 2;
    const wrapped = wrap(body, width - col, budget);
    lines.push(`  ${(label + ':').padEnd(col)}${wrapped[0] || ''}`);
    for (const extra of wrapped.slice(1)) lines.push(`  ${' '.repeat(col)}${extra}`);
  }
  lines.push('', `  Full brief: ${path}`, '');
  return lines.join('\n');
}
