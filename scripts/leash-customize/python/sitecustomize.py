"""
great_cto leash sitecustomize — auto-installed by `great-cto leash wire`.

Patches Anthropic + OpenAI Python SDKs at import time so every constructed
client carries the leash identity headers without the app having to opt in.

Env vars consumed (set by ~/.great_cto/env.sh after wire):
  LEASH_TENANT_ID       → X-LLM-Leash-Tenant-Id
  LEASH_SESSION_PREFIX  → first segment of an auto-generated session id
  LEASH_SESSION_ID      → exact session id override (skips auto-gen)
  ANTHROPIC_BASE_URL    → SDK already picks this up; we never overwrite it

Design rules:
  • Never fail the app — every wrap is wrapped in try/except.
  • If the user already passed default_headers, we MERGE, not overwrite.
  • Each Python process gets one session id (memoised, monotonic short uuid)
    so a multi-call agent groups its spans together for the operator.
  • This file is intentionally dependency-free; only stdlib + the SDKs
    that the user already has on PYTHONPATH.
"""

from __future__ import annotations

import os
import secrets
import threading
from typing import Any


_LOCK = threading.Lock()
_CACHED_SESSION_ID: str | None = None


def _resolve_session_id() -> str:
    """Pick one session id per Python process (memoised)."""
    global _CACHED_SESSION_ID
    if _CACHED_SESSION_ID is not None:
        return _CACHED_SESSION_ID
    with _LOCK:
        if _CACHED_SESSION_ID is None:
            override = os.environ.get("LEASH_SESSION_ID")
            if override:
                _CACHED_SESSION_ID = override
            else:
                prefix = os.environ.get("LEASH_SESSION_PREFIX", "gcto")
                tenant = os.environ.get("LEASH_TENANT_ID", "default")
                _CACHED_SESSION_ID = f"{prefix}-{tenant}-{secrets.token_hex(4)}"
    return _CACHED_SESSION_ID


def _leash_headers() -> dict[str, str]:
    out: dict[str, str] = {}
    tenant = os.environ.get("LEASH_TENANT_ID")
    if tenant:
        out["X-LLM-Leash-Tenant-Id"] = tenant
    out["X-LLM-Leash-Session-Id"] = _resolve_session_id()
    return out


def _patch_anthropic() -> None:
    try:
        import anthropic  # type: ignore[import-not-found]
    except Exception:
        return
    try:
        original_init = anthropic.Anthropic.__init__  # type: ignore[attr-defined]
    except Exception:
        return

    def patched_init(self: Any, *args: Any, **kwargs: Any) -> None:
        try:
            extra = _leash_headers()
            existing = dict(kwargs.get("default_headers") or {})
            for k, v in extra.items():
                existing.setdefault(k, v)
            kwargs["default_headers"] = existing
        except Exception:
            pass
        return original_init(self, *args, **kwargs)

    try:
        anthropic.Anthropic.__init__ = patched_init  # type: ignore[attr-defined]
    except Exception:
        pass

    # Async client (anthropic >= 0.7 ships AsyncAnthropic too)
    try:
        original_async = anthropic.AsyncAnthropic.__init__  # type: ignore[attr-defined]

        def patched_async(self: Any, *args: Any, **kwargs: Any) -> None:
            try:
                extra = _leash_headers()
                existing = dict(kwargs.get("default_headers") or {})
                for k, v in extra.items():
                    existing.setdefault(k, v)
                kwargs["default_headers"] = existing
            except Exception:
                pass
            return original_async(self, *args, **kwargs)

        anthropic.AsyncAnthropic.__init__ = patched_async  # type: ignore[attr-defined]
    except Exception:
        pass


def _patch_openai() -> None:
    try:
        import openai  # type: ignore[import-not-found]
    except Exception:
        return
    for cls_name in ("OpenAI", "AsyncOpenAI"):
        try:
            cls = getattr(openai, cls_name)
            original = cls.__init__

            def make_patched(original_fn: Any) -> Any:
                def patched(self: Any, *args: Any, **kwargs: Any) -> None:
                    try:
                        extra = _leash_headers()
                        existing = dict(kwargs.get("default_headers") or {})
                        for k, v in extra.items():
                            existing.setdefault(k, v)
                        kwargs["default_headers"] = existing
                    except Exception:
                        pass
                    return original_fn(self, *args, **kwargs)
                return patched

            cls.__init__ = make_patched(original)
        except Exception:
            continue


# Patch eagerly — sitecustomize runs once before the app imports anything,
# but the SDK may not be available yet. We re-attempt lazily via a meta-path
# finder so the patch lands the first time `import anthropic` actually
# resolves the module.
import importlib.abc
import importlib.util
import sys


class _LeashImportHook(importlib.abc.MetaPathFinder):
    """Run our patcher right after `anthropic` or `openai` finishes importing."""

    _patched: set[str] = set()

    def find_spec(self, name: str, path: Any = None, target: Any = None) -> Any:
        if name in ("anthropic", "openai") and name not in self._patched:
            self._patched.add(name)
            # Defer so we don't reenter the loader. Schedule the patch via
            # importlib.import_module on next event-loop tick instead.
            sys.meta_path.append(_DelayedPatcher(name))
        return None  # never claim ownership, let normal loader handle it


class _DelayedPatcher(importlib.abc.MetaPathFinder):
    def __init__(self, name: str) -> None:
        self._target = name
        self._done = False

    def find_spec(self, name: str, path: Any = None, target: Any = None) -> Any:
        if self._done:
            return None
        # When ANY import happens after our target has loaded, run the patch
        if self._target in sys.modules and not self._done:
            self._done = True
            try:
                if self._target == "anthropic":
                    _patch_anthropic()
                elif self._target == "openai":
                    _patch_openai()
            except Exception:
                pass
        return None


# Install the hook + try eager patches (covers `import anthropic` already done
# by the parent process / interactive shell).
try:
    sys.meta_path.insert(0, _LeashImportHook())
    _patch_anthropic()
    _patch_openai()
except Exception:
    pass
