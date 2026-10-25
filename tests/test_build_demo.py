from eval import build_demo as bd

# A tiny fake run; no model is involved.
EXPORT = {
    "model": "fake",
    "sentences": [
        {"row": 0, "review": "a", "text": "Calls drop."},
        {"row": 0, "review": "a", "text": "Calls drop again."},
        {"row": 1, "review": "b", "text": "Audio is quiet."},
        {"row": 2, "review": "c", "text": "Love it."},
    ],
    "counts": {
        "12": [
            {"name": "Calls", "problem": "Calls fail.", "actionable": True, "members": [1, 0, 2, 3], "sims": [0.6, 0.5, 0.4, 0.1]},
        ]
    },
}
REVIEWS = [{"text": "x", "rating": "1", "app": "a"}, {"text": "y", "rating": "", "app": "b"}, {"text": " ", "rating": "5", "app": "c"}]


def test_build_keeps_matching_rows_loose_count_and_one_example_per_review():
    demo = bd.build(EXPORT, REVIEWS, 0.3)
    theme = demo["counts"]["12"][0]
    assert theme["rows"] == [0, 0, 1]  # sentence 3 is below the threshold
    assert theme["loose"] == 1
    assert theme["examples"] == [{"row": 0, "text": "Calls drop again."}, {"row": 1, "text": "Audio is quiet."}]
    assert (demo["hasText"], demo["ratings"], demo["segments"]) == ([True, True, False], [1.0, None, 5.0], ["a", "b", "c"])


def test_reads_the_threshold_from_the_site(tmp_path):
    ts = tmp_path / "match.ts"
    ts.write_text("export const MATCH_THRESHOLD: number | null = 0.3;\n", encoding="utf-8")
    assert bd.read_threshold(ts) == 0.3
