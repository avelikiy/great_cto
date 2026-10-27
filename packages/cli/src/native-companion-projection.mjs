/** Fixed, reversible public-source derivation. No generic patching or authority. */
export const VERBATIM_NATIVE_PROJECTION = 'verbatim-runtime-allowlist-v1';
export const BEADS_GUIDANCE_PROJECTION = 'beads-runtime-guidance-v1';
const skill = 'skills/beads/SKILL.md', maintenance = 'skills/beads/CLAUDE.md';
const originalGuide = 'skills/beads/resources/AGENTS.md', projectedGuide = 'skills/beads/resources/AGENT_TRACKING.md';
const oldLink = Buffer.from('resources/AGENTS.md'), newLink = Buffer.from('resources/AGENT_TRACKING.md');
const replacementToken = Buffer.from('AGENT_TRACKING.md');
const fail = () => { throw Error('native-companion-projection-refused'); };

export function assertNativeCompanionProjection(component) {
  if (component?.projection === VERBATIM_NATIVE_PROJECTION) {
    if (component.id === 'beads@local' && component.source?.commit === '43f41374a34d82ecf40903451eea277fbb4f1e75') fail();
    return;
  }
  if (component?.projection !== BEADS_GUIDANCE_PROJECTION || component.id !== 'beads@local' || component.name !== 'beads' || component.version !== '1.3.2' ||
    component.source?.repository !== 'https://github.com/gastownhall/beads' || component.source.commit !== '43f41374a34d82ecf40903451eea277fbb4f1e75' ||
    component.source.tree !== '28f79ffc36555222f62fe82410410e69e60d8b79' || component.source.subdirectory !== 'plugins/beads') fail();
}
function occurrences(bytes, token) {
  let count = 0, at = 0;
  while ((at = bytes.indexOf(token, at)) !== -1) { count++; at += token.length; }
  return count;
}
function replaceTwice(bytes, from, to) {
  if (!Buffer.isBuffer(bytes) || occurrences(bytes, from) !== 2) fail();
  const chunks = []; let at = 0;
  for (let i = 0; i < 2; i++) { const next = bytes.indexOf(from, at); chunks.push(bytes.subarray(at, next), to); at = next + from.length; }
  chunks.push(bytes.subarray(at)); return Buffer.concat(chunks);
}
export function projectNativeCompanionPath(component, sourceRelative) {
  assertNativeCompanionProjection(component);
  if (typeof sourceRelative !== 'string') fail();
  if (component.projection === BEADS_GUIDANCE_PROJECTION) {
    if (sourceRelative.normalize('NFC').toLowerCase() === projectedGuide.toLowerCase()) fail();
    if (sourceRelative === maintenance) return null;
    if (sourceRelative === originalGuide) return projectedGuide;
  }
  if (/^(?:skills|agents|commands|hooks|lib|scripts|assets|types)\//.test(sourceRelative) && /(?:^|\/)(?:AGENTS|CLAUDE)\.md$/i.test(sourceRelative)) fail();
  return sourceRelative;
}
export function projectNativeCompanionBytes(component, sourceRelative, bytes) {
  assertNativeCompanionProjection(component);
  if (!Buffer.isBuffer(bytes)) fail();
  if (component.projection !== BEADS_GUIDANCE_PROJECTION || sourceRelative !== skill) return bytes;
  if (bytes.includes(replacementToken)) fail();
  return replaceTwice(bytes, oldLink, newLink);
}
export function originalNativeCompanionMember(component, projectedPath, bytes) {
  assertNativeCompanionProjection(component);
  if (!Buffer.isBuffer(bytes)) fail();
  if (component.projection !== BEADS_GUIDANCE_PROJECTION) return { path: projectedPath, bytes };
  if (projectedPath === maintenance || projectedPath === originalGuide) fail();
  if (projectedPath === projectedGuide) return { path: originalGuide, bytes };
  if (projectedPath !== skill) return { path: projectedPath, bytes };
  if (bytes.includes(oldLink) || occurrences(bytes, replacementToken) !== 2) fail();
  return { path: projectedPath, bytes: replaceTwice(bytes, newLink, oldLink) };
}
