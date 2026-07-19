#!/usr/bin/env python3
"""
great_cto LLM Router — MCP server.

Exposes `ask_kimi` tool to Claude Code agents so they can delegate
non-critical tasks (log triage, summarization, routine generation) to a
cheaper model via OpenRouter.

Zero external dependencies — uses stdlib only (json, sys, urllib, os).
Implements MCP 2024-11-05 protocol over stdio.

Config (env vars, with fallback to .env.local / ~/.great_cto/secrets.env):
  OPENROUTER_API_KEY    — required. Get at https://openrouter.ai/keys
  GREAT_CTO_ROUTER_MODEL — default: moonshotai/kimi-k2
  GREAT_CTO_ROUTER_MAX_TOKENS — default: 4096
  GREAT_CTO_ROUTER_TIMEOUT   — default: 60 (seconds)

Graceful degradation:
  If OPENROUTER_API_KEY is missing, the tool call returns a structured
  fallback error — agents are instructed in their frontmatter to handle
  this by doing the task natively.

Cost tracking:
  Every successful call appends a JSONL record to .great_cto/llm-router-usage.log
  for later aggregation by /digest and /doctor.
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path


# ---------- config loading ----------

def _load_env_file(path: Path) -> dict:
    """Minimal .env parser — no external dep on python-dotenv."""
    out = {}
    if not path.is_file():
        return out
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        v = v.strip().strip('"').strip("'")
        out[k.strip()] = v
    return out


def load_config() -> dict:
    """Layered config: env > .env.local > ~/.great_cto/secrets.env."""
    cwd_env = _load_env_file(Path(".env.local"))
    home_env = _load_env_file(Path.home() / ".great_cto" / "secrets.env")

    def get(key, default=None):
        return os.environ.get(key) or cwd_env.get(key) or home_env.get(key) or default

    return {
        "api_key": get("OPENROUTER_API_KEY"),
        # Default is the newest *cheap-lane* Kimi, not the oldest: k2-0905 doubles
        # the context window (262k vs 131k on the 0711 build) for +5%/+9% per
        # token. Pricier tiers (k2.6, k2.7-code, k3) are a deliberate opt-in via
        # GREAT_CTO_ROUTER_MODEL — this lane exists to be cheap.
        "model": get("GREAT_CTO_ROUTER_MODEL", "moonshotai/kimi-k2-0905"),
        "max_tokens": int(get("GREAT_CTO_ROUTER_MAX_TOKENS", "4096")),
        "timeout": int(get("GREAT_CTO_ROUTER_TIMEOUT", "60")),
    }


# ---------- OpenRouter call ----------

def call_openrouter(cfg: dict, system: str, user: str) -> dict:
    """Synchronous POST to OpenRouter. Returns {ok, text, usage, error}."""
    if not cfg["api_key"]:
        return {
            "ok": False,
            "error": "OPENROUTER_API_KEY not set",
            "fallback": "caller must use native Claude reasoning for this task",
            "setup_hint": "Add OPENROUTER_API_KEY=sk-or-v1-... to .env.local and restart session.",
        }

    body = {
        "model": cfg["model"],
        "max_tokens": cfg["max_tokens"],
        "messages": [
            {"role": "system", "content": system or "You are a helpful assistant."},
            {"role": "user", "content": user},
        ],
    }
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {cfg['api_key']}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/avelikiy/great_cto",
            "X-Title": "great_cto",
        },
        method="POST",
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=cfg["timeout"]) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="ignore")[:500]
        return {"ok": False, "error": f"HTTP {e.code}: {err_body}"}
    except (urllib.error.URLError, TimeoutError) as e:
        return {"ok": False, "error": f"network: {e}"}
    except Exception as e:  # noqa: BLE001 — want to report anything
        return {"ok": False, "error": f"unexpected: {type(e).__name__}: {e}"}

    elapsed = time.time() - t0
    choices = data.get("choices") or [{}]
    text = (choices[0].get("message") or {}).get("content", "")
    usage = data.get("usage", {})

    # Append usage log (best-effort, never crash tool call on IO error)
    try:
        log_dir = Path(".great_cto")
        if log_dir.is_dir():
            rec = {
                "ts": int(time.time()),
                "model": cfg["model"],
                "prompt_tokens": usage.get("prompt_tokens"),
                "completion_tokens": usage.get("completion_tokens"),
                "total_tokens": usage.get("total_tokens"),
                "elapsed_s": round(elapsed, 2),
            }
            with open(log_dir / "llm-router-usage.log", "a", encoding="utf-8") as f:
                f.write(json.dumps(rec) + "\n")
    except Exception:
        pass

    return {"ok": True, "text": text, "usage": usage, "elapsed_s": round(elapsed, 2)}


# ---------- MCP protocol (stdio JSON-RPC) ----------

PROTOCOL_VERSION = "2024-11-05"
SERVER_INFO = {"name": "great_cto-llm-router", "version": "1.0.0"}

TOOLS = [
    {
        "name": "ask_kimi",
        "description": (
            "Delegate a non-critical task to Kimi (or configured cheap model) "
            "via OpenRouter. Use for log triage, summarization, routine doc drafting, "
            "POC-mode smoke test generation, and similar tasks where speed and cost "
            "matter more than absolute quality. Do NOT use for: architecture decisions, "
            "security analysis, production code generation, threat modeling. "
            "If OPENROUTER_API_KEY is unset, returns a fallback signal — caller must "
            "then do the task natively."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "description": "The task / question to delegate. Be specific.",
                },
                "context": {
                    "type": "string",
                    "description": "Optional context (logs, code snippet, file content). Keep under ~20k chars.",
                },
                "system": {
                    "type": "string",
                    "description": "Optional system prompt override. Defaults to a pragmatic engineer persona.",
                },
            },
            "required": ["task"],
        },
    },
    {
        "name": "router_status",
        "description": "Check whether the LLM router is configured and healthy. Use in /doctor.",
        "inputSchema": {"type": "object", "properties": {}},
    },
]


def handle_request(msg):
    """Return a response dict, or None for notifications."""
    method = msg.get("method")
    msg_id = msg.get("id")
    params = msg.get("params") or {}

    # Notifications (no response expected)
    if msg_id is None:
        return None

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {"tools": {}},
                "serverInfo": SERVER_INFO,
            },
        }

    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": msg_id, "result": {"tools": TOOLS}}

    if method == "tools/call":
        name = params.get("name")
        args = params.get("arguments") or {}
        cfg = load_config()

        if name == "router_status":
            if cfg["api_key"]:
                return _ok(msg_id, json.dumps({
                    "configured": True,
                    "model": cfg["model"],
                    "key_tail": cfg["api_key"][-6:] if len(cfg["api_key"]) > 6 else "***",
                }, indent=2))
            return _ok(msg_id, json.dumps({
                "configured": False,
                "hint": "Set OPENROUTER_API_KEY in .env.local or ~/.great_cto/secrets.env",
            }, indent=2))

        if name == "ask_kimi":
            task = args.get("task", "").strip()
            context = args.get("context", "")
            system = args.get("system") or (
                "You are a pragmatic senior engineer. Be concise. "
                "Output plain text unless the task explicitly asks for structured format."
            )
            if not task:
                return _err(msg_id, "task is required and must be non-empty")

            user_msg = task if not context else f"{task}\n\n--- CONTEXT ---\n{context}"
            result = call_openrouter(cfg, system, user_msg)
            if not result["ok"]:
                payload = {
                    "error": result.get("error"),
                    "fallback": result.get("fallback", "use native reasoning"),
                    "setup_hint": result.get("setup_hint"),
                }
                return _ok(msg_id, json.dumps(payload, indent=2))
            # Success — return text directly so agents can use it
            header = f"[model={cfg['model']} tokens={result['usage'].get('total_tokens','?')} elapsed={result['elapsed_s']}s]\n\n"
            return _ok(msg_id, header + result["text"])

        return _err(msg_id, f"unknown tool: {name}")

    return _err(msg_id, f"unknown method: {method}")


def _ok(msg_id, text: str) -> dict:
    return {
        "jsonrpc": "2.0",
        "id": msg_id,
        "result": {"content": [{"type": "text", "text": text}]},
    }


def _err(msg_id, message: str) -> dict:
    return {
        "jsonrpc": "2.0",
        "id": msg_id,
        "error": {"code": -32000, "message": message},
    }


# ---------- main loop ----------

def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        resp = handle_request(msg)
        if resp is not None:
            sys.stdout.write(json.dumps(resp) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
