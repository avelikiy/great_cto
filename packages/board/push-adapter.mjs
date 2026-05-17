/**
 * push-adapter.mjs — zero-dependency VAPID Web Push helper
 *
 * Uses only Node.js built-in modules: node:crypto, node:https, node:http, node:fs, node:url
 *
 * Why zero-dep: server.mjs is intentionally dependency-free so the board
 * starts with just `node server.mjs` — no npm install required.
 */
import crypto from 'node:crypto';
import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';

// ── Helpers: base64url ────────────────────────────────────────────────────

function toBase64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function fromBase64url(str) {
  return Buffer.from(str, 'base64url');
}

// ── DER → raw R||S (64 bytes) ─────────────────────────────────────────────
/**
 * Convert DER-encoded ECDSA signature to raw R||S (64 bytes).
 * DER structure: 30 [total_len] 02 [r_len] [r_bytes] 02 [s_len] [s_bytes]
 * Handles both short (1-byte) and long-form (multi-byte) length encodings.
 */
export function derToRaw(der) {
  let offset = 0;
  // Skip 0x30 (SEQUENCE tag)
  if (der[offset++] !== 0x30) throw new Error('DER: expected SEQUENCE tag 0x30');
  // Skip total length (may be long form)
  if (der[offset] & 0x80) {
    offset += (der[offset] & 0x7f) + 1;
  } else {
    offset++;
  }
  // Read r
  if (der[offset++] !== 0x02) throw new Error('DER: expected INTEGER tag 0x02 for r');
  const rLen = der[offset++];
  const r = der.slice(offset, offset + rLen);
  offset += rLen;
  // Read s
  if (der[offset++] !== 0x02) throw new Error('DER: expected INTEGER tag 0x02 for s');
  const sLen = der[offset++];
  const s = der.slice(offset, offset + sLen);

  // Pad r and s to 32 bytes each (DER may prepend 0x00 for sign, or be shorter)
  const result = Buffer.alloc(64, 0);
  // r: right-align, ignore leading 0x00 padding
  const rStart = Math.max(0, r.length - 32);
  const rDest = 32 - Math.min(r.length, 32);
  r.copy(result, rDest, rStart);
  // s: right-align
  const sStart = Math.max(0, s.length - 32);
  const sDest = 64 - Math.min(s.length, 32);
  s.copy(result, sDest, sStart);

  return result;
}

// ── VAPID key management ───────────────────────────────────────────────────

/**
 * Generate or load VAPID key pair.
 * Persists as JWK JSON at keyPath. Returns { publicKey: base64url, privateKey: JWK }.
 * The publicKey is the uncompressed P-256 point: 0x04 || x || y (65 bytes, base64url).
 */
export function getVapidKeys(keyPath) {
  // Load existing keys from disk
  if (fs.existsSync(keyPath)) {
    try {
      const stored = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      if (stored.publicKey && stored.privateKey) return stored;
    } catch { /* regenerate if corrupt */ }
  }

  // Generate new P-256 key pair
  const { privateKey: privObj } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privObj.export({ format: 'jwk' });
  // jwk = { kty: 'EC', crv: 'P-256', x, y, d }

  // Build uncompressed public key: 0x04 || x || y
  const xBuf = fromBase64url(jwk.x);
  const yBuf = fromBase64url(jwk.y);
  const pubRaw = Buffer.concat([Buffer.from([0x04]), xBuf, yBuf]);
  const publicKey = toBase64url(pubRaw);

  const keys = { publicKey, privateKey: jwk };

  // Persist — best effort
  try { fs.mkdirSync(path.dirname(keyPath), { recursive: true }); } catch { /* ignore */ }
  try { fs.writeFileSync(keyPath, JSON.stringify(keys, null, 2)); } catch { /* best-effort */ }

  return keys;
}

// ── VAPID JWT ─────────────────────────────────────────────────────────────

/**
 * Build an ES256 JWT for VAPID authorization.
 *
 * @param {string} endpoint - push service endpoint URL
 * @param {object} privateKeyJwk - JWK { kty, crv, x, y, d }
 * @param {string} subject - mailto: or https: contact URI
 * @returns {string} compact JWT (header.payload.signature)
 */
export function createVapidJwt(endpoint, privateKeyJwk, subject) {
  // aud = origin of the push endpoint
  const url = new URL(endpoint);
  const aud = `${url.protocol}//${url.host}`;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600; // 12h

  const header = toBase64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = toBase64url(JSON.stringify({ aud, exp, sub: subject }));
  const signingInput = `${header}.${payload}`;

  // Re-import JWK as crypto private key for signing
  const privKey = crypto.createPrivateKey({ key: privateKeyJwk, format: 'jwk' });

  // Sign with ECDSA SHA-256 → DER output
  const sign = crypto.createSign('SHA256');
  sign.update(signingInput);
  const derSig = sign.sign(privKey);

  // Convert DER → raw R||S (64 bytes)
  const rawSig = derToRaw(derSig);
  const signature = toBase64url(rawSig);

  return `${signingInput}.${signature}`;
}

// ── HTTP POST to push service ─────────────────────────────────────────────

/**
 * Send a Web Push notification (empty body — SW fetches content from server).
 *
 * @param {object} subscription - { endpoint, keys: { p256dh, auth } }
 * @param {object} vapidKeys - { publicKey, privateKey }
 * @param {string} subject - VAPID contact URI
 * @returns {Promise<void>}
 * @throws on non-2xx (except 201). 410 = subscription expired — caller removes it.
 */
export function sendWebPush(subscription, vapidKeys, subject) {
  return new Promise((resolve, reject) => {
    const endpoint = subscription.endpoint;
    const jwt = createVapidJwt(endpoint, vapidKeys.privateKey, subject);
    const authorization = `vapid t=${jwt},k=${vapidKeys.publicKey}`;

    let parsedUrl;
    try { parsedUrl = new URL(endpoint); }
    catch (e) { return reject(new Error(`Invalid push endpoint URL: ${endpoint}`)); }

    const options = {
      method: 'POST',
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'Authorization': authorization,
        'TTL': '86400',
        'Content-Length': '0',
        'Content-Type': 'application/octet-stream',
      },
    };

    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const req = lib.request(options, (res) => {
      // Drain response body
      res.resume();
      res.on('end', () => {
        const sc = res.statusCode;
        if (sc === 201 || (sc >= 200 && sc < 300)) {
          resolve();
        } else {
          const err = new Error(`Push service returned ${sc}`);
          err.statusCode = sc;
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// ── Subscription persistence ──────────────────────────────────────────────

export function loadSubscriptions(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSubscriptions(filePath, subs) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(subs, null, 2));
  } catch { /* best-effort */ }
}

export function addSubscription(filePath, sub) {
  const subs = loadSubscriptions(filePath);
  if (subs.some(s => s.endpoint === sub.endpoint)) return; // dedupe
  subs.push(sub);
  saveSubscriptions(filePath, subs);
}

export function removeSubscription(filePath, endpoint) {
  const subs = loadSubscriptions(filePath);
  const filtered = subs.filter(s => s.endpoint !== endpoint);
  saveSubscriptions(filePath, filtered);
}
