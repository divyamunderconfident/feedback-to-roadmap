import pytest

from eval import llm

MSGS = [{"role": "user", "content": "hi"}]
REPLY = {"role": "assistant", "content": "hello"}


def test_second_identical_call_is_served_from_cache(fake_llm):
    fake_llm.replies = [REPLY]
    first = llm.complete(MSGS, model="groq/m")
    second = llm.complete(MSGS, model="groq/m")
    assert first["message"] == second["message"] == REPLY
    assert (first["cached"], second["cached"]) == (False, True)
    assert len(fake_llm.calls) == 1


def test_changed_input_misses_cache(fake_llm):
    fake_llm.replies = [REPLY, REPLY]
    llm.complete(MSGS, model="groq/m")
    llm.complete([{"role": "user", "content": "hi!"}], model="groq/m")
    assert len(fake_llm.calls) == 2


def test_tools_are_part_of_the_cache_key():
    tool = [{"type": "function", "function": {"name": "calc", "parameters": {}}}]
    assert llm.cache_key(MSGS, None, "groq/m") != llm.cache_key(MSGS, tool, "groq/m")


@pytest.mark.parametrize("model, url, auth", [
    ("groq/llama", "https://api.groq.com/openai/v1/chat/completions", "Bearer test-groq"),
    ("gemini/flash", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", "Bearer test-gemini"),
    ("ollama/qwen", "http://localhost:11434/v1/chat/completions", None),
])
def test_routes_to_provider(fake_llm, model, url, auth):
    fake_llm.replies = [REPLY]
    llm.complete(MSGS, model=model)
    call = fake_llm.calls[0]
    assert call["url"] == url
    assert call["headers"].get("Authorization") == auth
    assert call["body"]["model"] == model.split("/", 1)[1]
    assert call["body"]["temperature"] == 0


def test_missing_key_raises(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY")
    with pytest.raises(RuntimeError, match="GROQ_API_KEY"):
        llm.complete(MSGS, model="groq/m")


@pytest.mark.parametrize("model", ["openai/gpt", "groq", "groq/"])
def test_bad_model_string_raises(model):
    with pytest.raises(ValueError):
        llm.complete(MSGS, model=model)


def test_quota_error_is_not_cached(fake_llm):
    fake_llm.replies = [llm.QuotaExceeded("429"), REPLY]
    with pytest.raises(llm.QuotaExceeded):
        llm.complete(MSGS, model="groq/m")
    assert llm.complete(MSGS, model="groq/m")["cached"] is False


def test_post_maps_429_to_quota_exceeded(monkeypatch):
    class Resp:
        status_code = 429
        text = "rate limited"

    monkeypatch.undo()  # restore the real _post
    monkeypatch.setattr(llm.requests, "post", lambda *a, **k: Resp())
    with pytest.raises(llm.QuotaExceeded):
        llm._post("http://x", {}, {})


def test_post_error_includes_provider_message_without_keys(monkeypatch):
    class Resp:
        status_code = 404
        ok = False
        text = "model gone; sent Bearer abc123 via ?key=secret-gemini&x=1, also secret-groq"

    monkeypatch.undo()  # restore the real _post
    monkeypatch.setenv("GROQ_API_KEY", "secret-groq")
    monkeypatch.setattr(llm.requests, "post", lambda *a, **k: Resp())
    with pytest.raises(llm.requests.HTTPError) as err:
        llm._post("http://x", {}, {})
    msg = str(err.value)
    assert "404" in msg and "model gone" in msg
    assert not any(s in msg for s in ["abc123", "secret-gemini", "secret-groq"])
