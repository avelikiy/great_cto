// scripts/lib/connectors/threat-intel.mjs — threat-intel IOC enrichment (Phase 4 Wave 7, SOC).
//
// enrich-ioc classifies an indicator-of-compromise (IP / domain / URL / file hash) into a
// malicious / suspicious / clean verdict with a 0..100 score. It runs DETERMINISTIC and
// network-free by default: a curated slice of known-bad indicators (abuse.ch URLhaus / Feodo
// Tracker style C2 domains + malware sample hashes) and known-good infrastructure (major CDNs /
// resolvers), plus a feature heuristic (domain entropy, suspicious TLDs, reserved IPs) for
// everything else — so the SOC autopilot can triage offline and stay unit-testable.
//
// Set VIRUSTOTAL_API_KEY (or GREYNOISE_API_KEY) to enrich against a real reputation API; otherwise
// the deterministic verdict is returned with a `note`.

import { fileURLToPath } from 'node:url';

export const capabilities = ['enrich-ioc'];

// Curated known-bad indicators — abuse.ch URLhaus / Feodo Tracker style malware C2 + sample hashes.
const KNOWN_BAD = {
  domains: new Set([
    'paste.ee.malware-c2.ru',
    'a0698409.xsph.ru',
    'cdn-telegram.org',
    'fluxxset.com',
    'mokoaltocebu.com',
    'wesynctech.com',
  ]),
  ips: new Set([
    '185.215.113.66',   // Amadey / Lumma C2 (Feodo Tracker style)
    '193.42.32.118',    // botnet C2
    '45.95.147.236',    // malware distribution
  ]),
  // sha256 / md5 of known malware samples (illustrative public-feed style values).
  hashes: new Set([
    '275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f', // EICAR sha256
    '44d88612fea8a8f36de82e1278abb02f',                                 // EICAR md5
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855e7', // sample
  ]),
};

// Curated known-good infrastructure — major CDNs / public resolvers.
const KNOWN_GOOD = {
  domains: new Set([
    'google.com',
    'cloudflare.com',
    'cloudfront.net',
    'akamai.net',
    'fastly.net',
    'microsoft.com',
  ]),
  ips: new Set([
    '1.1.1.1',          // Cloudflare resolver
    '8.8.8.8',          // Google resolver
    '9.9.9.9',          // Quad9 resolver
  ]),
};

// Suspicious / abused TLDs frequently seen in malware feeds.
const SUSPICIOUS_TLDS = new Set([
  'zip', 'mov', 'xyz', 'top', 'tk', 'ml', 'ga', 'cf', 'gq', 'ru', 'su', 'cc', 'work', 'click', 'country',
]);

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const SHA256_RE = /^[a-f0-9]{64}$/i;
const MD5_RE = /^[a-f0-9]{32}$/i;
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

function detectType(ioc, hint) {
  const s = String(ioc || '').trim();
  if (hint) {
    const h = String(hint).toLowerCase();
    if (['ipv4', 'domain', 'url', 'sha256', 'md5'].includes(h)) return h;
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return 'url';
  if (IPV4_RE.test(s)) return 'ipv4';
  if (SHA256_RE.test(s)) return 'sha256';
  if (MD5_RE.test(s)) return 'md5';
  if (DOMAIN_RE.test(s)) return 'domain';
  return 'unknown';
}

// Extract the registrable host from a URL, or pass a bare host through.
function hostOf(ioc) {
  const s = String(ioc || '').trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    try { return new URL(s).hostname.toLowerCase(); } catch { return s.toLowerCase(); }
  }
  return s.toLowerCase();
}

function tldOf(host) {
  const parts = String(host || '').split('.').filter(Boolean);
  return parts.length ? parts[parts.length - 1].toLowerCase() : '';
}

// True if an IPv4 is private / reserved / loopback / link-local — treated as non-routable, clean.
function isPrivateIp(ip) {
  const m = IPV4_RE.exec(ip);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true;                          // multicast / reserved
  return false;
}

// Shannon entropy (bits/char) of a string — high entropy hints at DGA / random subdomains.
function entropy(str) {
  const s = String(str || '');
  if (!s.length) return 0;
  const freq = {};
  for (const ch of s) freq[ch] = (freq[ch] || 0) + 1;
  let h = 0;
  for (const k in freq) {
    const p = freq[k] / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

// True if a host's apex (registrable) domain is in a known-good set.
function matchesGoodDomain(host) {
  for (const g of KNOWN_GOOD.domains) {
    if (host === g || host.endsWith('.' + g)) return true;
  }
  return false;
}
function matchesBadDomain(host) {
  for (const b of KNOWN_BAD.domains) {
    if (host === b || host.endsWith('.' + b)) return true;
  }
  return false;
}

function classify(ioc, iocType) {
  const reasons = [];
  const sources = ['curated-feed'];

  // File hashes — only the curated list can convict deterministically.
  if (iocType === 'sha256' || iocType === 'md5') {
    if (KNOWN_BAD.hashes.has(String(ioc).toLowerCase())) {
      reasons.push('file hash matches a known-malware sample in the curated feed');
      return { malicious: true, score: 92, verdict: 'malicious', sources, reasons };
    }
    reasons.push('file hash not present in the curated known-bad list (unknown — submit to sandbox)');
    return { malicious: false, score: 10, verdict: 'clean', sources, reasons };
  }

  if (iocType === 'ipv4') {
    if (KNOWN_BAD.ips.has(ioc)) {
      reasons.push('IP matches a known C2 / malware host in the curated feed');
      return { malicious: true, score: 90, verdict: 'malicious', sources, reasons };
    }
    if (isPrivateIp(ioc)) {
      reasons.push('private / reserved / non-routable IP — not externally attributable');
      return { malicious: false, score: 0, verdict: 'clean', sources, reasons };
    }
    if (KNOWN_GOOD.ips.has(ioc)) {
      reasons.push('IP belongs to known-good resolver / CDN infrastructure');
      return { malicious: false, score: 5, verdict: 'clean', sources, reasons };
    }
    reasons.push('public IP with no curated reputation — neutral baseline');
    return { malicious: false, score: 25, verdict: 'clean', sources, reasons: [...reasons, 'no reputation signal'] };
  }

  // domain / url — resolve to a host and run curated + heuristic checks.
  const host = hostOf(ioc);
  if (matchesGoodDomain(host)) {
    reasons.push('host is (a subdomain of) known-good CDN / infrastructure');
    return { malicious: false, score: 3, verdict: 'clean', sources, reasons };
  }
  if (matchesBadDomain(host)) {
    reasons.push('host matches a known malware C2 domain in the curated feed (URLhaus/Feodo style)');
    return { malicious: true, score: 90, verdict: 'malicious', sources, reasons };
  }

  // Heuristic scoring for unknown hosts.
  let score = 20;
  const tld = tldOf(host);
  const labels = host.split('.').filter(Boolean);
  const longest = labels.reduce((m, l) => Math.max(m, l.length), 0);
  const e = entropy(host);

  if (SUSPICIOUS_TLDS.has(tld)) { score += 30; reasons.push(`suspicious / abused TLD .${tld}`); }
  if (e >= 4.0) { score += 25; reasons.push(`high hostname entropy (${e.toFixed(2)} bits/char) — possible DGA`); }
  else if (e >= 3.5) { score += 12; reasons.push(`elevated hostname entropy (${e.toFixed(2)} bits/char)`); }
  if (longest >= 20) { score += 15; reasons.push(`very long label (${longest} chars) — algorithmically generated?`); }
  if (labels.length >= 5) { score += 10; reasons.push(`deep subdomain nesting (${labels.length} labels)`); }
  if (/\d/.test(host) && /[a-z]/.test(host) && (host.match(/\d/g) || []).length >= 4) {
    score += 8; reasons.push('digit-heavy hostname');
  }
  if (iocType === 'url' && /[?&](cmd|exec|payload|shell|download)=/i.test(String(ioc))) {
    score += 12; reasons.push('URL query contains suspicious parameter');
  }

  score = Math.max(0, Math.min(100, score));
  if (!reasons.length) reasons.push('no curated hit and no heuristic flags');

  let verdict;
  if (score >= 70) verdict = 'malicious';
  else if (score >= 40) verdict = 'suspicious';
  else verdict = 'clean';

  return { malicious: verdict === 'malicious', score, verdict, sources: ['heuristic'], reasons };
}

// Optional real-API enrichment (VirusTotal / GreyNoise) when a key is present.
async function enrichLive(ioc, iocType) {
  const vt = process.env.VIRUSTOTAL_API_KEY;
  const gn = process.env.GREYNOISE_API_KEY;
  try {
    if (vt) {
      const path = iocType === 'ipv4' ? `ip_addresses/${ioc}`
        : iocType === 'domain' ? `domains/${hostOf(ioc)}`
        : iocType === 'url' ? `urls/${Buffer.from(String(ioc)).toString('base64').replace(/=+$/, '')}`
        : `files/${ioc}`;
      const res = await fetch(`https://www.virustotal.com/api/v3/${path}`, {
        headers: { 'x-apikey': vt },
      });
      if (res.ok) {
        const json = await res.json();
        const stats = json?.data?.attributes?.last_analysis_stats || {};
        const mal = Number(stats.malicious || 0);
        const susp = Number(stats.suspicious || 0);
        const total = Object.values(stats).reduce((a, b) => a + Number(b || 0), 0) || 1;
        const score = Math.min(100, Math.round(((mal * 1 + susp * 0.5) / total) * 100));
        return { provider: 'virustotal', stats, score, malicious: mal > 0 };
      }
    }
    if (gn) {
      const res = await fetch(`https://api.greynoise.io/v3/community/${ioc}`, {
        headers: { key: gn },
      });
      if (res.ok) {
        const json = await res.json();
        return { provider: 'greynoise', classification: json?.classification, raw: json };
      }
    }
  } catch (e) {
    return { error: String(e?.message || e) };
  }
  return null;
}

export async function call(op, payload = {}) {
  if (op === 'enrich-ioc') {
    const ioc = payload.ioc || payload.indicator;
    if (!ioc) return { ok: false, error: 'enrich-ioc needs { ioc }' };
    const iocType = detectType(ioc, payload.type);
    if (iocType === 'unknown') {
      return { ok: false, error: `could not classify IOC shape: '${ioc}' (expected ipv4 / domain / url / sha256 / md5)` };
    }

    const det = classify(ioc, iocType);
    const data = { ioc, iocType, ...det };

    const live = await enrichLive(ioc, iocType);
    if (live && !live.error) {
      data.live = live;
      data.sources = [...new Set([...data.sources, live.provider])];
      // Let a real provider override an unconvinced deterministic verdict.
      if (typeof live.score === 'number') {
        data.score = Math.max(data.score, live.score);
        if (live.malicious || data.score >= 70) { data.malicious = true; data.verdict = 'malicious'; }
        else if (data.score >= 40) data.verdict = 'suspicious';
        data.reasons = [...data.reasons, `live ${live.provider} score ${live.score}`];
      }
      return { ok: true, mode: 'live', data };
    }

    data.note = live?.error
      ? `live lookup failed (${live.error}); returned deterministic verdict`
      : 'deterministic verdict — set VIRUSTOTAL_API_KEY or GREYNOISE_API_KEY for live reputation enrichment';
    return { ok: true, mode: 'deterministic', data };
  }

  return { ok: false, error: `threat-intel adapter has no op '${op}'` };
}

// CLI smoke: `node threat-intel.mjs <ioc> [type]`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , ioc, type] = process.argv;
  const targets = ioc ? [[ioc, type]] : [
    ['fluxxset.com'],
    ['1.1.1.1'],
  ];
  for (const [t, ty] of targets) {
    const r = await call('enrich-ioc', { ioc: t, type: ty });
    console.log(JSON.stringify(r, null, 2));
  }
}
