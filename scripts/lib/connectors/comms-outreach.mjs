// scripts/lib/connectors/comms-outreach.mjs — collections outreach adapter (Phase 4, collections).
//
// send-outreach is a COMPLIANCE GUARDRAIL ENGINE. Before the collections autopilot places any
// call / SMS / email to a consumer, this decides whether the attempt is ALLOWED under FDCPA,
// CFPB Reg F, and the TCPA — and returns an explicit ALLOW/BLOCK decision with the rule(s) cited.
// It is deterministic and network-free by default: it NEVER sends. It only actually dials/texts
// (via Twilio) when TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN are set AND the decision is ALLOW;
// otherwise it returns the decision with a `note`. A BLOCK is never sent regardless of keys.
//
// No external deps in default mode. Figures/rules are the published federal standards.

export const capabilities = ['send-outreach'];

// CFPB Reg F call-frequency cap (12 CFR 1006.14(b)): no more than 7 call attempts within 7 days,
// and no call within 7 days of a telephone conversation with the consumer about the debt.
const REG_F_CALL_CAP = 7;
const REG_F_WINDOW_DAYS = 7;
// FDCPA convenient-time window (15 U.S.C. 1692c(a)(1)): 8:00 a.m. – 9:00 p.m. consumer local time.
const ALLOWED_START_MIN = 8 * 60; // 08:00
const ALLOWED_END_MIN = 21 * 60; // 21:00

// Parse a consumer-local time from either an ISO timestamp or a bare 'HH:MM' into minutes-of-day.
function localMinutes(t) {
  if (t == null) return null;
  const s = String(t).trim();
  let m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = s.match(/T(\d{2}):(\d{2})/); // ISO — take the local wall-clock fields as given.
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes();
  return null;
}

// Count call attempts inside the trailing 7-day window. priorContacts7d may be a count or an
// array of ISO timestamps; if timestamps are given we count those within REG_F_WINDOW_DAYS of now.
function countRecentContacts(priorContacts7d, nowMs) {
  if (priorContacts7d == null) return 0;
  if (typeof priorContacts7d === 'number') return Math.max(0, Math.floor(priorContacts7d));
  if (!Array.isArray(priorContacts7d)) return 0;
  const windowMs = REG_F_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  let n = 0;
  for (const ts of priorContacts7d) {
    const d = new Date(ts);
    if (isNaN(d.getTime())) { n++; continue; } // unparseable → count conservatively
    if (nowMs - d.getTime() <= windowMs && nowMs - d.getTime() >= 0) n++;
  }
  return n;
}

export async function call(op, payload = {}) {
  if (op === 'send-outreach') {
    const channel = String(payload.channel || 'call').toLowerCase();
    if (!['call', 'sms', 'email'].includes(channel)) {
      return { ok: false, error: `send-outreach: channel must be call|sms|email (got '${channel}')` };
    }

    const reasons = [];
    let allowed = true;
    const cite = (rule, reason) => { allowed = false; reasons.push({ rule, reason }); };

    const nowMs = Date.now();
    const minutes = localMinutes(payload.consumerLocalTime);
    const recent = countRecentContacts(payload.priorContacts7d, nowMs);

    // --- FDCPA cease-communication (15 U.S.C. 1692c(c)) — hard stop on all channels. ---
    if (payload.ceaseRequested) {
      cite('FDCPA 1692c(c) cease-communication',
        'consumer requested that communication cease — block all contact except permitted notices');
    }

    // --- Consumer opted this channel out — block that channel. ---
    if (payload.optedOut) {
      cite('opt-out', `consumer opted out of ${channel} — this channel is blocked`);
    }

    // --- FDCPA convenient-time / place (1692c(a)(1)): 8:00–21:00 consumer local time. ---
    if (minutes == null) {
      cite('FDCPA 1692c(a)(1) time/place',
        'consumerLocalTime missing or unparseable — cannot prove the 8:00–21:00 window');
    } else if (minutes < ALLOWED_START_MIN || minutes >= ALLOWED_END_MIN) {
      const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
      const mm = String(minutes % 60).padStart(2, '0');
      cite('FDCPA 1692c(a)(1) time/place',
        `consumer local time ${hh}:${mm} is outside the permitted 08:00–21:00 window`);
    }

    // --- TCPA: autodialed call / SMS requires prior express consent. ---
    if ((channel === 'call' || channel === 'sms') && !payload.hasPriorExpressConsent) {
      cite('TCPA 227(b) prior express consent',
        `autodialed ${channel} requires hasPriorExpressConsent — none on file`);
    }

    // --- CFPB Reg F 7-in-7 call-frequency cap (12 CFR 1006.14(b)) — calls only. ---
    if (channel === 'call' && recent >= REG_F_CALL_CAP) {
      cite('Reg F 1006.14(b) 7-in-7',
        `${recent} call attempts in the trailing ${REG_F_WINDOW_DAYS} days meets/exceeds the ${REG_F_CALL_CAP}-call cap; no further call within 7 days of a prior conversation`);
    }

    const decision = allowed ? 'ALLOW' : 'BLOCK';
    const rule = reasons.length ? reasons.map((r) => r.rule).join('; ') : 'all checks passed';

    const data = {
      channel,
      allowed,
      decision,
      reasons,
      rule,
      checks: {
        consumerLocalMinutes: minutes,
        priorContacts7d: recent,
        regFCap: REG_F_CALL_CAP,
        debtValidated: !!payload.debtValidated,
      },
    };

    // Default (network-free) mode: return the decision, never send.
    const haveTwilio = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
    if (!haveTwilio) {
      data.sent = false;
      data.note = allowed
        ? 'compliance decision = ALLOW; not sent (Twilio not configured — set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN to actually send)'
        : 'compliance decision = BLOCK; not sent (and would never send while blocked)';
      return { ok: true, mode: 'decision', data };
    }

    // Live mode: only send when ALLOWED. A BLOCK never reaches the wire.
    if (!allowed) {
      data.sent = false;
      data.note = 'compliance decision = BLOCK — suppressed; Twilio not invoked';
      return { ok: true, mode: 'live', data };
    }

    try {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      const auth = Buffer.from(`${sid}:${token}`).toString('base64');
      const to = payload.to || payload.consumerPhone;
      const from = payload.from || process.env.TWILIO_FROM;
      if (channel === 'sms') {
        const body = new URLSearchParams({ To: to, From: from, Body: payload.body || '' });
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: 'POST',
          headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        });
        const json = await res.json();
        if (!res.ok) return { ok: false, error: `Twilio: ${json.message || res.status}`, data };
        data.sent = true; data.providerSid = json.sid; data.note = 'sent via Twilio (SMS)';
        return { ok: true, mode: 'live', data };
      }
      // call / email live-send is not wired here — return the ALLOW decision instead of sending.
      data.sent = false;
      data.note = `compliance decision = ALLOW; live ${channel} send not implemented in this adapter`;
      return { ok: true, mode: 'live', data };
    } catch (err) {
      return { ok: false, error: `Twilio send failed: ${err.message}`, data };
    }
  }

  return { ok: false, error: `comms-outreach adapter has no op '${op}'` };
}

// --- CLI: node comms-outreach.mjs <op> '<json-payload>' ----------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , op = 'send-outreach', raw = '{}'] = process.argv;
  let payload = {};
  try { payload = JSON.parse(raw); } catch { console.error('payload must be JSON'); process.exit(2); }

  if (op === 'smoke') {
    const allowedSms = await call('send-outreach', {
      channel: 'sms',
      consumerLocalTime: '13:30',
      priorContacts7d: 2,
      hasPriorExpressConsent: true,
      debtValidated: true,
    });
    const blockedCall = await call('send-outreach', {
      channel: 'call',
      consumerLocalTime: '07:00',
      priorContacts7d: 7,
      ceaseRequested: true,
    });
    console.log(JSON.stringify({ smoke: { allowedSms, blockedCall } }, null, 2));
  } else {
    console.log(JSON.stringify(await call(op, payload), null, 2));
  }
}
