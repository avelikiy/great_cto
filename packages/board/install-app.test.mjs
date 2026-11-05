// The board can be installed as an app (PWA): a valid manifest, real PNG icons
// served as images, and an "Install app" button that stays hidden until the
// browser offers installation. Before this change the server had no PNG MIME
// type (icons went out as text/plain, which Chrome rejects for a manifest icon)
// and sw.js pointed at an icon that did not exist.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, 'server.mjs');
const PUBLIC = path.join(HERE, 'public');
const INDEX = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'manifest.webmanifest'), 'utf8'));
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
    srv.on('error', reject);
  });
}

function get(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: pathname, timeout: 5000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body: Buffer.concat(chunks) }));
    });
    req.on('timeout', () => req.destroy(new Error(`timeout ${pathname}`)));
    req.on('error', reject);
  });
}

test('manifest declares a standalone app with any-purpose and maskable icons', () => {
  assert.equal(MANIFEST.display, 'standalone');
  assert.equal(MANIFEST.start_url, '/');
  assert.ok(MANIFEST.name && MANIFEST.short_name);
  const sizes = MANIFEST.icons.filter((i) => i.purpose !== 'maskable').map((i) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'), 'Chrome needs 192 and 512 icons to offer install');
  assert.ok(MANIFEST.icons.some((i) => i.purpose === 'maskable'), 'a maskable icon keeps the Dock icon from being boxed');
  for (const icon of MANIFEST.icons) {
    const file = path.join(PUBLIC, icon.src);
    assert.ok(fs.existsSync(file), `${icon.src} exists`);
    assert.ok(fs.readFileSync(file).subarray(0, 8).equals(PNG_MAGIC), `${icon.src} is a real PNG`);
  }
});

test('index links the manifest and carries a hidden install button wired to the browser prompt', () => {
  assert.match(INDEX, /<link rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(INDEX, /id="install-app-btn"[^>]*onclick="installBoardApp\(\)"/);
  // hidden by default: only the .on class (set on beforeinstallprompt) shows it
  assert.match(INDEX, /\.btn-install\s*\{[^}]*display:\s*none/);
  assert.match(INDEX, /addEventListener\('beforeinstallprompt'/);
  assert.match(INDEX, /addEventListener\('appinstalled'/);
  assert.match(INDEX, /display-mode: standalone/);
  assert.match(INDEX, /^initInstallApp\(\);$/m);
});

test('service worker notification icon points at a file that exists', () => {
  const sw = fs.readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8');
  const icon = sw.match(/icon:\s*`\$\{BOARD_ORIGIN\}(\/assets\/[^`]+)`/);
  assert.ok(icon, 'sw.js sets a notification icon');
  assert.ok(fs.existsSync(path.join(PUBLIC, icon[1])), `${icon[1]} exists`);
});

let child;
let port;
before(async () => {
  port = await freePort();
  child = spawn(process.execPath, [SERVER, '--no-open'], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try { await get(port, '/manifest.webmanifest'); return; } catch { await new Promise((r) => setTimeout(r, 150)); }
  }
  throw new Error('board did not start');
});
after(() => { child?.kill('SIGKILL'); });

test('server serves the manifest and icons with the types a browser accepts', async () => {
  const m = await get(port, '/manifest.webmanifest');
  assert.equal(m.status, 200);
  assert.equal(m.type, 'application/manifest+json');
  assert.equal(JSON.parse(m.body.toString()).display, 'standalone');
  for (const p of ['/assets/icon-192.png', '/assets/icon-512.png', '/assets/icon-maskable-512.png', '/assets/apple-touch-icon.png']) {
    const r = await get(port, p);
    assert.equal(r.status, 200, p);
    assert.equal(r.type, 'image/png', p);
    assert.ok(r.body.subarray(0, 8).equals(PNG_MAGIC), `${p} body is a PNG`);
  }
});
