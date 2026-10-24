"""The one place Feedback to Roadmap calls a model offline. Every call is cached on disk by a hash of its input."""

import hashlib
import json
import os
import re
import time
from pathlib import Path

import requests

# Groq: https://console.groq.com/docs/models. Providers retire models often; a 404 usually means one is gone.
DEFAULT_MODEL = "groq/openai/gpt-oss-20b"

CACHE_DIR = Path(".cache/llm")

# All three speak the OpenAI chat-completions format: (base URL, env var holding the key).
PROVIDERS = {
    "groq": ("https://api.groq.com/openai/v1", "GROQ_API_KEY"),
    "gemini": ("https://generativelanguage.googleapis.com/v1beta/openai", "GEMINI_API_KEY"),
    "ollama": ("http://localhost:11434/v1", None),
}


class QuotaExceeded(Exception):
    """The provider returned 429. Stop the run; re-running resumes from the cache."""


def load_env(path=".env"):
    """Load KEY=value lines into the environment without overriding what is already set. Never prints values."""
    if Path(path).exists():
        for line in Path(path).read_text(encoding="utf-8").splitlines():
            name, sep, value = line.partition("=")
            if sep and not line.lstrip().startswith("#"):
                os.environ.setdefault(name.strip(), value.strip().strip("'\""))


def _redact(text):
    """Remove API keys from text that may be shown or logged; the repo and its logs are public."""
    for _, key_var in PROVIDERS.values():
        if key_var and os.environ.get(key_var):
            text = text.replace(os.environ[key_var], "[REDACTED]")
    text = re.sub(r"([?&]key=)[^&\s\"']+", r"\1[REDACTED]", text)
    return re.sub(r"(Bearer\s+)\S+", r"\1[REDACTED]", text)


def _post(url, headers, body):
    resp = requests.post(url, headers=headers, json=body, timeout=120)
    if resp.status_code == 429:
        raise QuotaExceeded(_redact(resp.text[:500]))
    if not resp.ok:
        raise requests.HTTPError(_redact(f"{resp.status_code} from {url}: {resp.text[:500]}"), response=resp)
    return resp.json()


def cache_key(messages, tools, model):
    payload = json.dumps({"model": model, "messages": messages, "tools": tools}, sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()


def complete(messages, tools=None, model=DEFAULT_MODEL):
    """Return {"message", "usage", "latency_ms", "cached"} for one chat-completion call."""
    path = CACHE_DIR / f"{cache_key(messages, tools, model)}.json"
    if path.exists():
        return {**json.loads(path.read_text(encoding="utf-8")), "cached": True}

    provider, _, name = model.partition("/")
    if provider not in PROVIDERS or not name:
        raise ValueError(f"model must look like 'groq/<name>', 'gemini/<name>' or 'ollama/<name>', got {model!r}")
    base_url, key_var = PROVIDERS[provider]
    headers = {}
    if key_var:
        key = os.environ.get(key_var)
        if not key:
            raise RuntimeError(f"{key_var} is not set")
        headers["Authorization"] = f"Bearer {key}"

    body = {"model": name, "messages": messages, "temperature": 0}
    if tools:
        body["tools"] = tools
    start = time.perf_counter()
    data = _post(f"{base_url}/chat/completions", headers, body)
    result = {
        "message": data["choices"][0]["message"],
        "usage": data.get("usage", {}),
        "latency_ms": round((time.perf_counter() - start) * 1000),
    }

    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")  # write-then-rename so a killed run never leaves a half-written cache file
    tmp.write_text(json.dumps(result), encoding="utf-8")
    os.replace(tmp, path)
    return {**result, "cached": False}
