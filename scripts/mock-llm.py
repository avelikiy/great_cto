#!/usr/bin/env python3
"""Mock LLM endpoint for canary tests — speaks OpenAI + Anthropic protocols.

Usage:
    python3 scripts/mock-llm.py --port 8088

Why it exists: Phase 2.5 of the canary live-boots Aider and Codex CLI to
verify our generated configs (.aider.conf.yml, AGENTS.md) are actually
parseable by the real hosts. Pointing the hosts at a real LLM would burn
API tokens on every CI run. This server returns canned responses fast,
deterministically, for free.

Endpoints:
    POST /v1/chat/completions      — OpenAI Chat Completions
    POST /v1/messages              — Anthropic Messages
    POST /v1/models                — listing (returns one mock model)
    GET  /healthz                  — liveness probe (returns "ok")
    GET  /                         — root (returns help)

The body of POST endpoints is parsed only enough to extract the model
name and echo it back — we don't attempt to honor system prompts or
tool calls. Response always says "OK." so callers can verify a clean
round-trip without parsing AI output.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


CANNED_REPLY = "OK."


class Handler(BaseHTTPRequestHandler):
    # quiet logging — keep CI output clean
    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        return

    def _send(self, code: int, body: dict | str, ctype: str = "application/json") -> None:
        if isinstance(body, dict):
            payload = json.dumps(body).encode()
        else:
            payload = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)

    def _read_body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw)
        except Exception:
            return {}

    def do_GET(self) -> None:
        if self.path == "/healthz":
            self._send(200, "ok", ctype="text/plain")
            return
        if self.path == "/v1/models":
            self._send(200, {
                "object": "list",
                "data": [{"id": "mock-model", "object": "model"}],
            })
            return
        self._send(200, "mock-llm canary endpoint — POST /v1/chat/completions or /v1/messages\n", ctype="text/plain")

    def do_POST(self) -> None:
        body = self._read_body()
        model = body.get("model", "mock-model")

        # OpenAI Chat Completions
        if self.path.startswith("/v1/chat/completions"):
            self._send(200, {
                "id": f"chatcmpl-{uuid.uuid4().hex[:10]}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": model,
                "choices": [{
                    "index": 0,
                    "message": {"role": "assistant", "content": CANNED_REPLY},
                    "finish_reason": "stop",
                }],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            })
            return

        # Anthropic Messages
        if self.path.startswith("/v1/messages"):
            self._send(200, {
                "id": f"msg_{uuid.uuid4().hex[:24]}",
                "type": "message",
                "role": "assistant",
                "model": model,
                "content": [{"type": "text", "text": CANNED_REPLY}],
                "stop_reason": "end_turn",
                "stop_sequence": None,
                "usage": {"input_tokens": 1, "output_tokens": 1},
            })
            return

        # Anthropic streaming (legacy /v1/complete)
        if self.path.startswith("/v1/complete"):
            self._send(200, {
                "completion": CANNED_REPLY,
                "stop_reason": "stop_sequence",
                "model": model,
            })
            return

        self._send(404, {"error": f"no handler for {self.path}"})


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8088)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    # Print "ready: <port>" so canary can wait_ready by parsing stdout.
    print(f"ready: {args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
