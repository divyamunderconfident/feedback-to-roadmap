import pytest

from eval import llm


class FakeLLM:
    """Stands in for the HTTP call. Replies with scripted messages and records every request."""

    def __init__(self):
        self.replies = []
        self.calls = []

    def __call__(self, url, headers, body):
        self.calls.append({"url": url, "headers": headers, "body": body})
        if not self.replies:
            raise AssertionError("FakeLLM ran out of scripted replies")
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return {"choices": [{"message": reply}], "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}}


@pytest.fixture(autouse=True)
def fake_llm(monkeypatch, tmp_path):
    """Every test gets a fresh cache dir and can never reach a real model."""
    fake = FakeLLM()
    monkeypatch.setattr(llm, "_post", fake)
    monkeypatch.setattr(llm, "CACHE_DIR", tmp_path / "llm")
    monkeypatch.setenv("GROQ_API_KEY", "test-groq")
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini")
    return fake
