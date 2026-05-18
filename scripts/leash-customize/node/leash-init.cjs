/**
 * great_cto leash node-init — auto-installed by `great-cto leash wire`.
 *
 * Used via NODE_OPTIONS="--require <this-file>" so every Node process inherits
 * the leash identity headers without any app changes.
 *
 * Patches @anthropic-ai/sdk and openai clients at module-load time so newly
 * constructed clients carry X-LLM-Leash-Tenant-Id + X-LLM-Leash-Session-Id.
 *
 * Env vars consumed (set by ~/.great_cto/env.sh after wire):
 *   LEASH_TENANT_ID       → X-LLM-Leash-Tenant-Id
 *   LEASH_SESSION_PREFIX  → first segment of an auto-generated session id
 *   LEASH_SESSION_ID      → exact session id override
 *   ANTHROPIC_BASE_URL    → SDK already picks this up; we never overwrite it
 *
 * Design rules:
 *   • Never crash the host process — every patch is wrapped in try/catch.
 *   • Merge default headers, never overwrite caller-supplied values.
 *   • One memoised session id per Node process (groups multi-call spans).
 *   • Zero npm deps; only Node stdlib + monkey-patch via Module._load.
 */

'use strict';

const Module = require('node:module');
const crypto = require('node:crypto');

let cachedSessionId = null;

function resolveSessionId() {
  if (cachedSessionId) return cachedSessionId;
  const override = process.env.LEASH_SESSION_ID;
  if (override) {
    cachedSessionId = override;
    return cachedSessionId;
  }
  const prefix = process.env.LEASH_SESSION_PREFIX || 'gcto';
  const tenant = process.env.LEASH_TENANT_ID || 'default';
  cachedSessionId = `${prefix}-${tenant}-${crypto.randomBytes(4).toString('hex')}`;
  return cachedSessionId;
}

function leashHeaders() {
  const out = {};
  const tenant = process.env.LEASH_TENANT_ID;
  if (tenant) out['X-LLM-Leash-Tenant-Id'] = tenant;
  out['X-LLM-Leash-Session-Id'] = resolveSessionId();
  return out;
}

function mergeHeaders(existing, extra) {
  // Never overwrite caller-supplied keys; existing wins.
  const out = { ...extra, ...(existing || {}) };
  return out;
}

function wrapClass(ClassRef) {
  if (!ClassRef || typeof ClassRef !== 'function') return ClassRef;
  if (ClassRef.__leashWrapped) return ClassRef;

  function WrappedClient(opts, ...rest) {
    try {
      const config = (typeof opts === 'object' && opts !== null) ? opts : {};
      config.defaultHeaders = mergeHeaders(config.defaultHeaders, leashHeaders());
      return Reflect.construct(ClassRef, [config, ...rest], new.target || WrappedClient);
    } catch (_e) {
      // Fall back to original behaviour
      return Reflect.construct(ClassRef, [opts, ...rest], new.target || WrappedClient);
    }
  }

  // Preserve prototype chain + static fields
  WrappedClient.prototype = ClassRef.prototype;
  WrappedClient.__leashWrapped = true;
  Object.setPrototypeOf(WrappedClient, ClassRef);
  return WrappedClient;
}

function patchModule(mod, exportName) {
  try {
    if (mod && mod[exportName]) {
      mod[exportName] = wrapClass(mod[exportName]);
    }
    if (mod && mod.default && mod.default[exportName]) {
      mod.default[exportName] = wrapClass(mod.default[exportName]);
    }
    // CJS default export pattern: module.exports = Anthropic
    if (mod && typeof mod === 'function' && mod.name === exportName) {
      // Caller will destructure; can't easily replace, skip.
    }
  } catch (_e) { /* ignore */ }
}

// Hook into Module._load so we patch as soon as the SDK is required.
const originalLoad = Module._load;
Module._load = function leashLoad(request, parent, isMain) {
  const exported = originalLoad.apply(this, arguments);
  try {
    if (request === '@anthropic-ai/sdk' || request.startsWith('@anthropic-ai/sdk/')) {
      patchModule(exported, 'Anthropic');
      // Also patch named "default" if user imports it ESM-style via interop.
      if (exported && exported.default) {
        exported.default = wrapClass(exported.default);
      }
    } else if (request === 'openai' || request.startsWith('openai/')) {
      patchModule(exported, 'OpenAI');
      patchModule(exported, 'AsyncOpenAI');
      if (exported && exported.default) {
        exported.default = wrapClass(exported.default);
      }
    }
  } catch (_e) { /* never throw from loader */ }
  return exported;
};
