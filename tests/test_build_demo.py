import pytest

from eval import build_demo as bd

# Tiny fake runs; no model is involved.
SENTENCES = [
    {"row": 0, "review": "a", "text": "Calls drop."},
    {"row": 0, "review": "a", "text": "Calls drop again."},
    {"row": 1, "review": "b", "text": "Audio is quiet."},
    {"row": 2, "review": "c", "text": "Love it."},
]
CALLS = {"name": "Calls (full run)", "problem": "Calls fail.", "actionable": True, "members": [1, 0, 2], "sims": [0.6, 0.5, 0.4]}
PRAISE = {"name": "Praise", "problem": "none", "actionable": False, "members": [3], "sims": [0.1]}
FULL = {"model": "fake", "sentences": SENTENCES, "themes": {"1,2": CALLS, "3": PRAISE}, "counts": {"1": ["1,2,3"], "2": ["1,2", "3"]}}
EVALUATED = {
    "model": "fake",
    "sentences": SENTENCES,
    "counts": {"2": [dict(CALLS, name="Calls (evaluated run)", key="gemini:m:1,2"), dict(PRAISE, key="gemini:m:3")]},
}
REVIEWS = [{"text": "x", "rating": "1", "app": "a"}, {"text": "y", "rating": "", "app": "b"}, {"text": " ", "rating": "5", "app": "c"}]


def test_merge_prefers_the_evaluated_run_and_needs_every_theme_named():
    full = dict(FULL, themes=dict(FULL["themes"], **{"1,2,3": dict(CALLS, members=[0, 1, 2, 3], sims=[0.5] * 4)}))
    merged = bd.merge(EVALUATED, full)
    assert merged["themes"]["1,2"]["name"] == "Calls (evaluated run)"
    with pytest.raises(ValueError, match="1 themes are not named"):
        bd.merge(EVALUATED, FULL)  # "1,2,3" (the single theme at count 1) has no name


def test_merge_refuses_runs_that_grouped_differently():
    other = dict(FULL, counts={"2": ["1", "2,3"]})
    with pytest.raises(ValueError, match="differ between the runs"):
        bd.merge(EVALUATED, other)
    with pytest.raises(ValueError, match="different sentences"):
        bd.merge(EVALUATED, dict(FULL, sentences=SENTENCES[:3]))


def test_build_keeps_matching_rows_loose_count_and_one_example_per_review():
    run = {"model": "fake", "sentences": SENTENCES, "themes": {"1,2": CALLS, "3": PRAISE}, "counts": {"2": ["1,2", "3"]}}
    demo = bd.build(run, REVIEWS, 0.3)
    theme = demo["themes"]["1,2"]
    assert theme["rows"] == [0, 0, 1]
    assert theme["loose"] == 0
    assert theme["examples"] == [{"row": 0, "text": "Calls drop again."}, {"row": 1, "text": "Audio is quiet."}]
    assert demo["themes"]["3"]["loose"] == 1  # below the threshold
    assert demo["counts"] == {"2": ["1,2", "3"]}
    assert (demo["hasText"], demo["ratings"], demo["segments"]) == ([True, True, False], [1.0, None, 5.0], ["a", "b", "c"])


def test_reads_the_threshold_from_the_site(tmp_path):
    ts = tmp_path / "match.ts"
    ts.write_text("export const MATCH_THRESHOLD: number | null = 0.3;\n", encoding="utf-8")
    assert bd.read_threshold(ts) == 0.3
