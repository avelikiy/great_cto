/* Canonical role-group glyphs and classification. Pure classic script: loaded
 * by the browser and imported by the Node bridge; no DOM, fetch or dependencies.
 * The site vendors these exact bytes. Glyphs describe roles, never run status. */
(function (root) {
  'use strict';
  const groups = Object.freeze([
    { key: 'pm', label: 'Plan', svg: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>' },
    { key: 'arch', label: 'Architecture', svg: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>' },
    { key: 'build', label: 'Build', svg: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>' },
    { key: 'qa', label: 'Test & review', svg: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>' },
    { key: 'security', label: 'Security', svg: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>' },
    { key: 'domain', label: 'Domain reviewers', svg: '<path d="M12 4v16M8 20h8M5 8h14M5 8l-2 6h4zM19 8l-2 6h4z"/>' },
    { key: 'ops', label: 'Ops', svg: '<rect x="4" y="4" width="16" height="6" rx="1"/><rect x="4" y="14" width="16" height="6" rx="1"/><path d="M8 7h.01M8 17h.01"/>' },
    { key: 'memory', label: 'Memory', svg: '<path d="M6 3h12v18l-6-4-6 4z"/>' },
    { key: 'other', label: 'Other', svg: '<circle cx="12" cy="12" r="3"/>' },
  ].map(Object.freeze));
  // Order matters: test/eval before builders; domain reviewers before generic
  // engineers. These are display hints, not pipeline routing or permissions.
  const rules = [
    [/architect|adr|design|prompt|decision-scorer|project-auditor/, 'arch'],
    [/security|sec-|threat|pci|gdpr|hipaa|smart-contract/, 'security'],
    [/\bqa\b|test|eval|performance|^code-reviewer$/, 'qa'],
    [/devops|deploy|infra|l3|support|oncall/, 'ops'],
    [/reviewer$/, 'domain'],
    [/pm|plan|product|coordinator/, 'pm'],
    [/learn|memory|continuous|knowledge/, 'memory'],
    [/^senior-dev$|-engineer$|-builder$|scaffolder|ci-resolver/, 'build'],
  ];
  function classify(slug) {
    const value = typeof slug === 'string' ? slug.toLowerCase() : '';
    return rules.find(([pattern]) => pattern.test(value))?.[1] || 'other';
  }
  const group = key => groups.find(g => g.key === key) || groups[groups.length - 1];
  const label = key => group(key).label;
  function icon(key) {
    const g = group(key);
    // All markup and attributes below come from authored constants, never key.
    return `<svg class="grp-icon" data-agent-group="${g.key}" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${g.svg}</svg>`;
  }
  root.GctoAgentGroups = Object.freeze({ groups, classify, label, icon });
})(globalThis);
