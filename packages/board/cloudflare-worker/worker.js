// great_cto Cloudflare Worker
// =============================
// Handles two product surfaces:
//
//   /r/<hash>     Public share reports (HTML snapshots from `great-cto board`)
//   /notify       Email alerts via Resend (5 trigger types, see board UI)
//
// Bindings required (set in wrangler.toml or Cloudflare Dashboard):
//   KV namespace: STATE       (binding name in code)
//   Secret:       RESEND_API_KEY
//   Var:          RESEND_FROM  (e.g. "GreatCTO <onboarding@resend.dev>")
//
// KV schema:
//   report:<hash>     {"html":"...","paused":false,"published_at":"ISO"}    TTL 30d
//   verified:<email>  {"verified_at":N,"last_send_at":N,"count_24h":N}      no TTL
//   code:<email>      "<6-digit>"                                            TTL 10min
//
// Rate limit: 100 emails / 24h per verified email.

const SHARE_TTL_SEC = 30 * 24 * 60 * 60;       // 30 days
const VERIFY_CODE_TTL_SEC = 10 * 60;            // 10 minutes
const RATE_LIMIT_24H = 100;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// ── helpers ─────────────────────────────────────────────────────────────────

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
      ...extraHeaders,
    },
  });
}

function html(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
      ...extraHeaders,
    },
  });
}

function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-max-age": "86400",
    },
  });
}

function randomHash(len = 16) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}

function randomCode() {
  // 6 digits, leading-zero-padded
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

function isValidEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ── Resend sender ───────────────────────────────────────────────────────────

async function sendResend(env, { to, subject, html: body }) {
  if (!env.RESEND_API_KEY) {
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }
  const from = env.RESEND_FROM || "GreatCTO <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html: body }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, status: res.status, error: data?.message || `HTTP ${res.status}` };
  }
  return { ok: true, id: data?.id };
}

// ── /r/<hash> share reports ────────────────────────────────────────────────

async function publishShareReport(req, env) {
  let body;
  try { body = await req.json(); }
  catch { return json({ error: "invalid_json" }, 400); }

  const htmlBody = String(body?.html || "");
  if (!htmlBody || htmlBody.length < 100) {
    return json({ error: "html_required" }, 400);
  }
  if (htmlBody.length > 2_000_000) {
    return json({ error: "html_too_large", limit: 2_000_000 }, 413);
  }

  // Generate hash, avoid collision (1 retry should be enough; 62^16 collisions are astronomic)
  let hash = randomHash(16);
  if (await env.STATE.get(`report:${hash}`)) hash = randomHash(16);

  const ttl = Math.min(parseInt(body?.ttl) || SHARE_TTL_SEC, SHARE_TTL_SEC);
  const record = {
    html: htmlBody,
    paused: false,
    published_at: new Date().toISOString(),
  };
  await env.STATE.put(`report:${hash}`, JSON.stringify(record), { expirationTtl: ttl });

  return json({ ok: true, hash, url: `https://greatcto.systems/r/${hash}` });
}

async function updateShareReport(hash, req, env) {
  let body;
  try { body = await req.json(); }
  catch { return json({ error: "invalid_json" }, 400); }

  const raw = await env.STATE.get(`report:${hash}`);
  if (!raw) return json({ error: "not_found" }, 404);
  const record = JSON.parse(raw);

  if (typeof body.enabled === "boolean") {
    record.paused = !body.enabled;
  }
  // Preserve original TTL — we can't read it back exactly, so use rolling 30d
  await env.STATE.put(`report:${hash}`, JSON.stringify(record), { expirationTtl: SHARE_TTL_SEC });
  return json({ ok: true, paused: record.paused });
}

async function serveShareReport(hash, env) {
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(hash)) {
    return html("<h1>404</h1>", 404);
  }
  const raw = await env.STATE.get(`report:${hash}`);
  if (!raw) {
    return html(`<!doctype html><html><body style="font-family:system-ui;max-width:560px;margin:80px auto;padding:24px;text-align:center;color:#666">
<h2 style="color:#222">Report not found</h2>
<p>This share link has expired or was revoked.</p>
<p><a href="https://greatcto.systems">greatcto.systems →</a></p>
</body></html>`, 404);
  }
  const record = JSON.parse(raw);
  if (record.paused) {
    return html(`<!doctype html><html><body style="font-family:system-ui;max-width:560px;margin:80px auto;padding:24px;text-align:center;color:#666">
<h2 style="color:#222">Report paused</h2>
<p>The owner has temporarily disabled this share link.</p>
<p><a href="https://greatcto.systems">greatcto.systems →</a></p>
</body></html>`, 410);
  }
  return html(record.html);
}

// ── /notify email alerts ────────────────────────────────────────────────────

async function startVerify(req, env) {
  let body;
  try { body = await req.json(); }
  catch { return json({ error: "invalid_json" }, 400); }

  const to = String(body?.to || "").trim().toLowerCase();
  if (!isValidEmail(to)) return json({ error: "invalid_email" }, 400);

  // Throttle: 1 code per 60s
  const last = await env.STATE.get(`code_sent:${to}`);
  if (last) return json({ error: "code_recently_sent", retry_after_s: 60 }, 429);

  const code = randomCode();
  await env.STATE.put(`code:${to}`, code, { expirationTtl: VERIFY_CODE_TTL_SEC });
  await env.STATE.put(`code_sent:${to}`, "1", { expirationTtl: 60 });

  const r = await sendResend(env, {
    to,
    subject: `🔐 GreatCTO — your verification code: ${code}`,
    html: `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
</head><body style="margin:0;background:#0a0c14;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,sans-serif;color:#e5e7eb">
<div style="max-width:480px;margin:48px auto;background:#0f1419;border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:36px 32px;text-align:center">
  <div style="display:inline-flex;align-items:center;gap:8px;font-size:10px;font-family:'Geist Mono','JetBrains Mono',ui-monospace,monospace;letter-spacing:.14em;color:#9ca3af;text-transform:uppercase">
    <span style="display:inline-block;width:6px;height:6px;background:#00d97e;border-radius:50%;box-shadow:0 0 6px rgba(0,217,126,0.6)"></span>
    GREATCTO · EMAIL ALERTS
  </div>
  <h1 style="font-size:22px;margin:18px 0 8px;color:#ffffff;font-weight:600;letter-spacing:-0.01em">Verify your email</h1>
  <p style="color:#9aa0a6;font-size:13.5px;line-height:1.6;margin:0 0 24px">Enter this 6-digit code in the GreatCTO board's <strong style="color:#e5e7eb">Notifications</strong> tab to start receiving alerts.</p>
  <div style="font-family:'Geist Mono','JetBrains Mono',ui-monospace,monospace;font-size:38px;font-weight:700;letter-spacing:.22em;color:#00d97e;margin:24px 0;padding:22px;background:rgba(0,217,126,0.06);border:1px solid rgba(0,217,126,0.25);border-radius:10px">${code}</div>
  <p style="color:#6b7280;font-size:11.5px;font-family:'Geist Mono',ui-monospace,monospace;letter-spacing:.04em;margin:0">Code expires in 10 minutes · If you didn't request this, ignore this email.</p>
</div>
<div style="text-align:center;padding:16px;font-size:11px;color:#4b5563;font-family:'Geist Mono',ui-monospace,monospace">greatcto.systems</div>
</body></html>`,
  });
  if (!r.ok) return json({ error: "send_failed", detail: r.error }, 502);
  return json({ ok: true });
}

async function confirmVerify(req, env) {
  let body;
  try { body = await req.json(); }
  catch { return json({ error: "invalid_json" }, 400); }

  const to = String(body?.to || "").trim().toLowerCase();
  const code = String(body?.code || "").trim();
  if (!isValidEmail(to)) return json({ error: "invalid_email" }, 400);
  if (!/^\d{6}$/.test(code)) return json({ error: "invalid_code" }, 400);

  const stored = await env.STATE.get(`code:${to}`);
  if (!stored) return json({ error: "code_expired" }, 410);
  if (stored !== code) return json({ error: "bad_code" }, 400);

  const record = {
    verified_at: Date.now(),
    last_send_at: 0,
    count_24h: 0,
  };
  await env.STATE.put(`verified:${to}`, JSON.stringify(record));
  await env.STATE.delete(`code:${to}`);
  return json({ ok: true });
}

async function notifyStatus(url, env) {
  const to = String(url.searchParams.get("to") || "").trim().toLowerCase();
  if (!isValidEmail(to)) return json({ verified: false });
  const raw = await env.STATE.get(`verified:${to}`);
  if (!raw) return json({ verified: false });
  const record = JSON.parse(raw);
  return json({
    verified: true,
    count_24h: record.count_24h || 0,
    last_send_at: record.last_send_at || null,
    limit: RATE_LIMIT_24H,
  });
}

function renderAlertHtml(payload) {
  const { event, level, title, body, project, link, action, kv } = payload;
  const accent = level === "critical" ? "#f87171"
               : level === "error"    ? "#fb923c"
               : level === "warning"  ? "#fbbf24"
               : "#00d97e";
  const accentBg = level === "critical" ? "rgba(248,113,113,0.10)"
                 : level === "error"    ? "rgba(251,146,60,0.10)"
                 : level === "warning"  ? "rgba(251,191,36,0.10)"
                 : "rgba(0,217,126,0.10)";
  const accentBorder = level === "critical" ? "rgba(248,113,113,0.30)"
                     : level === "error"    ? "rgba(251,146,60,0.30)"
                     : level === "warning"  ? "rgba(251,191,36,0.30)"
                     : "rgba(0,217,126,0.30)";
  const dot = level === "critical" ? "#f87171"
            : level === "error"    ? "#fb923c"
            : level === "warning"  ? "#fbbf24"
            : "#00d97e";
  const emoji = level === "critical" ? "🚨"
              : level === "error"    ? "❌"
              : level === "warning"  ? "⏸️"
              : "ℹ️";

  // Render kv as horizontal "tiles" matching the board's metric cards.
  const tiles = Object.entries(kv || {})
    .map(([k, v]) => `<tr><td style="padding:14px 24px;border-bottom:1px solid rgba(255,255,255,0.06)"><div style="font-size:10px;font-family:'Geist Mono','JetBrains Mono',ui-monospace,monospace;text-transform:uppercase;letter-spacing:.12em;color:#6b7280;margin-bottom:4px">${escapeHtml(k)}</div><div style="font-size:14px;font-weight:500;color:#e5e7eb;font-family:'Geist Mono','JetBrains Mono',ui-monospace,monospace">${escapeHtml(v)}</div></td></tr>`)
    .join("");

  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(title || "GreatCTO alert")}</title>
</head><body style="margin:0;padding:0;background:#0a0c14;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,sans-serif;color:#e5e7eb;-webkit-font-smoothing:antialiased">
<div style="max-width:560px;margin:32px auto;background:#0f1419;border:1px solid rgba(255,255,255,0.08);border-radius:14px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.4)">

  <!-- Header: eyebrow + title (matches board's section header style) -->
  <div style="padding:24px 28px;border-bottom:1px solid rgba(255,255,255,0.08);background:linear-gradient(180deg,rgba(255,255,255,0.02) 0%,transparent 100%)">
    <div style="display:flex;align-items:center;gap:8px;font-size:10px;font-family:'Geist Mono','JetBrains Mono',ui-monospace,monospace;letter-spacing:.14em;color:#6b7280;text-transform:uppercase;margin-bottom:10px">
      <span style="display:inline-block;width:6px;height:6px;background:${dot};border-radius:50%;box-shadow:0 0 8px ${dot}"></span>
      <span>${escapeHtml(project || "great_cto")}</span>
      <span style="color:#374151">·</span>
      <span>${escapeHtml((event || "alert").toUpperCase())}</span>
    </div>
    <h1 style="font-size:21px;font-weight:600;letter-spacing:-0.01em;margin:0;color:#ffffff;line-height:1.3">${emoji} ${escapeHtml(title || "")}</h1>
  </div>

  ${body ? `<div style="padding:22px 28px;font-size:14px;line-height:1.65;color:#9aa0a6">${escapeHtml(body).replace(/\n/g, "<br>")}</div>` : ""}

  ${tiles ? `<table style="width:100%;border-collapse:collapse;border-top:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.01)">${tiles}</table>` : ""}

  ${link ? `<div style="padding:28px;text-align:center;border-top:1px solid rgba(255,255,255,0.06)">
    <a href="${escapeHtml(link)}" style="display:inline-block;background:${accent};color:#0a0c14;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;letter-spacing:-0.005em;box-shadow:0 4px 16px ${accentBg}">${escapeHtml(action || "View in board")}</a>
  </div>` : ""}

  <!-- Footer: meta line, like board's status bar -->
  <div style="padding:14px 28px;background:rgba(255,255,255,0.02);border-top:1px solid rgba(255,255,255,0.06);font-size:11px;font-family:'Geist Mono','JetBrains Mono',ui-monospace,monospace;color:#4b5563;letter-spacing:.02em">
    <div style="margin-bottom:4px">Sent ${escapeHtml(new Date().toISOString().replace("T", " ").slice(0, 19))} UTC</div>
    <div>Manage alerts in <a href="http://localhost:3141/#notifications" style="color:#6b7280;text-decoration:underline">board → Notifications</a></div>
  </div>

</div>

<!-- Brand row, matches landing footer -->
<div style="text-align:center;padding:18px 0 32px;font-size:11px;font-family:'Geist Mono','JetBrains Mono',ui-monospace,monospace;color:#374151;letter-spacing:.04em">
  GREATCTO · the engineering OS for Claude Code
</div>

</body></html>`;
}

async function sendAlert(req, env) {
  let payload;
  try { payload = await req.json(); }
  catch { return json({ error: "invalid_json" }, 400); }

  const to = String(payload?.to || "").trim().toLowerCase();
  if (!isValidEmail(to)) return json({ error: "invalid_email" }, 400);
  if (!payload.title) return json({ error: "title_required" }, 400);

  // Verify email registered + rate-limit
  const raw = await env.STATE.get(`verified:${to}`);
  if (!raw) return json({ error: "email_not_verified" }, 403);
  const record = JSON.parse(raw);

  const now = Date.now();
  // Reset counter if last send was >24h ago
  if (record.last_send_at && now - record.last_send_at > ONE_DAY_MS) {
    record.count_24h = 0;
  }
  if (record.count_24h >= RATE_LIMIT_24H) {
    const retry_after_s = Math.ceil((record.last_send_at + ONE_DAY_MS - now) / 1000);
    return json({ error: "rate_limited", limit: RATE_LIMIT_24H, retry_after_s }, 429);
  }

  // Send
  const r = await sendResend(env, {
    to,
    subject: `${(payload.level === "critical") ? "🚨" : (payload.level === "error" ? "❌" : payload.level === "warning" ? "⏸️" : "ℹ️")} ${payload.title}`,
    html: renderAlertHtml(payload),
  });
  if (!r.ok) return json({ error: "send_failed", detail: r.error }, 502);

  // Update counters
  record.last_send_at = now;
  record.count_24h = (record.count_24h || 0) + 1;
  await env.STATE.put(`verified:${to}`, JSON.stringify(record));

  return json({ ok: true, id: r.id, count_24h: record.count_24h, limit: RATE_LIMIT_24H });
}

// ── Router ──────────────────────────────────────────────────────────────────

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const { pathname } = url;

    if (req.method === "OPTIONS") return corsPreflight();

    // /r/  publish share report
    if (pathname === "/r/" && req.method === "POST") {
      return publishShareReport(req, env);
    }

    // /r/<hash>
    const reportMatch = pathname.match(/^\/r\/([A-Za-z0-9_-]+)\/?$/);
    if (reportMatch) {
      const hash = reportMatch[1];
      if (req.method === "POST") return updateShareReport(hash, req, env);
      if (req.method === "GET")  return serveShareReport(hash, env);
    }

    // /notify endpoints
    if (pathname === "/notify/verify" && req.method === "POST") {
      return startVerify(req, env);
    }
    if (pathname === "/notify/confirm" && req.method === "POST") {
      return confirmVerify(req, env);
    }
    if (pathname === "/notify/status" && req.method === "GET") {
      return notifyStatus(url, env);
    }
    if (pathname === "/notify" && req.method === "POST") {
      return sendAlert(req, env);
    }

    // Health
    if (pathname === "/healthz") {
      return json({ ok: true, ts: new Date().toISOString() });
    }

    return new Response("404 Not Found", { status: 404 });
  },
};
