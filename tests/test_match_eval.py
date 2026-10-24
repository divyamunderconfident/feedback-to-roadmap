import csv

import pytest

from eval import match_eval as me

# A tiny fake run and fake labels; no model is involved.
SENTENCES = [
    {"row": 0, "review": "a", "text": "Calls drop all the time."},  # 0: reliability
    {"row": 0, "review": "a", "text": "The audio is far too quiet."},  # 1: usability
    {"row": 1, "review": "b", "text": "It costs way  too much."},  # 2: cost (extra space on purpose)
    {"row": 1, "review": "b", "text": "No label for this one."},  # 3: unlabelled
    {"row": 2, "review": "c", "text": "Calls keep dropping on wifi, sadly."},  # 4: reliability (AWARE text is shorter)
]


@pytest.fixture
def labels(tmp_path):
    path = tmp_path / "labels.csv"
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["review_id", "sentence", "category"])
        w.writeheader()
        w.writerows([
            {"review_id": "a", "sentence": "Calls drop all the time.", "category": "reliability"},
            {"review_id": "a", "sentence": "The audio is far too QUIET.", "category": "usability"},
            {"review_id": "b", "sentence": "It costs way too much.", "category": "cost"},
            {"review_id": "c", "sentence": "Calls keep dropping on wifi", "category": "reliability"},
            {"review_id": "z", "sentence": "Calls drop all the time.", "category": "security"},  # other review
        ])
    return me.load_labels(path)


def test_link_matches_within_the_same_review_ignoring_case_spacing_and_partial_splits(labels):
    assert me.link(SENTENCES, labels) == [{"reliability"}, {"usability"}, {"cost"}, None, {"reliability"}]


def test_score_picks_the_top_category_and_computes_precision_and_recall(labels):
    cats = me.link(SENTENCES, labels)
    theme = {"name": "Dropped calls", "actionable": True, "members": [0, 1, 3, 4], "sims": [0.6, 0.5, 0.9, 0.2]}
    result = me.score([theme], cats, 0.4)
    row = result["themes"][0]
    # matching: 0, 1, 3 (4 is below the threshold); labelled: 0, 1 -> reliability 1 of 2
    assert (row["matching"], row["labelled"], row["category"]) == (3, 2, "reliability")
    assert row["precision"] == pytest.approx(0.5)
    assert row["recall"] == pytest.approx(0.5)  # 1 of the 2 reliability sentences in the whole run
    assert result["macro"]["f1"] == pytest.approx(0.5)


def test_a_theme_with_no_labelled_matches_is_left_out_of_the_averages(labels):
    cats = me.link(SENTENCES, labels)
    themes = [
        {"name": "Cost", "actionable": True, "members": [2], "sims": [0.9]},
        {"name": "Nothing", "actionable": False, "members": [3], "sims": [0.9]},
    ]
    result = me.score(themes, cats, 0.3)
    assert result["themes"][1]["precision"] is None
    assert result["macro"]["precision"] == pytest.approx(1.0)


def test_evaluate_recommends_the_best_f1_threshold_then_the_more_precise_count(labels):
    export = {
        "model": "fake",
        "sentences": SENTENCES,
        "counts": {
            # at 0.25 both themes catch noise from another category; from 0.30 they are clean
            "12": [{"name": "Calls", "actionable": True, "members": [0, 4, 2], "sims": [0.9, 0.8, 0.27]}],
            "20": [{"name": "Calls", "actionable": True, "members": [0, 4, 1], "sims": [0.9, 0.5, 0.31]}],
        },
    }
    rec = me.evaluate(export, labels)["recommended"]
    assert rec["threshold"] == 0.35  # 0.30 still lets the usability sentence into the 20-theme run
    assert rec["themes"] == 12  # equal precision at 0.35; the smaller count wins the tie
