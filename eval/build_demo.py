"""Builds site/public/demo.json, the precomputed demo, from exported runs. No model calls.

Inputs:
- eval/runs/demo_export.json: the run the AWARE evaluation used (RESULTS.md), themes named at 12 and 20;
- eval/runs/demo_export_all.json: a run with every slider count, each theme stored once by fine-group key;
- data/demo_reviews.csv: each review's rating and app.
The grouping is seeded, so both runs produce the same themes. Names from the evaluated run win wherever the runs
overlap, so the demo at 12 and 20 themes shows exactly what RESULTS.md measured; the full run names the rest.

For each theme it keeps the name, problem statement and actionable flag, the review rows of its matching sentences
(similarity at or above the site's MATCH_THRESHOLD, read from site/lib/match.ts so the two cannot drift apart), how
many sentences were only loosely related, and up to 3 matching sentences nearest the theme centre, one per review.
The site computes every size number from these rows with the same code it uses for uploaded files.

Run: python -m eval.build_demo
"""

import csv
import json
import re
from pathlib import Path

EVALUATED = Path("eval/runs/demo_export.json")
FULL = Path("eval/runs/demo_export_all.json")
REVIEWS = Path("data/demo_reviews.csv")
MATCH_TS = Path("site/lib/match.ts")
OUT = Path("site/public/demo.json")
EXAMPLES = 3


def read_threshold(path=MATCH_TS):
    found = re.search(r"MATCH_THRESHOLD: number \| null = ([0-9.]+);", path.read_text(encoding="utf-8"))
    if not found:
        raise ValueError(f"MATCH_THRESHOLD not found in {path}")
    return float(found.group(1))


def groups_key(theme):
    """The evaluated run stored the site's cache key, "provider:model:groups"; the groups part identifies the theme."""
    return theme["key"].rsplit(":", 1)[1]


def merge(evaluated, full):
    """One run with every count: themes by fine-group key, the evaluated run's names first."""
    if [s["text"] for s in evaluated["sentences"]] != [s["text"] for s in full["sentences"]]:
        raise ValueError("The two runs split the reviews into different sentences.")
    themes = dict(full["themes"])
    for n, listed in evaluated["counts"].items():
        keys = [groups_key(t) for t in listed]
        if sorted(keys) != sorted(full["counts"].get(n, [])):
            raise ValueError(f"The themes at {n} differ between the runs, so the grouping was not the same.")
        themes.update(zip(keys, listed))
    missing = {k for keys in full["counts"].values() for k in keys} - themes.keys()
    if missing:
        raise ValueError(f"{len(missing)} themes are not named yet; name every slider count before exporting.")
    return {"model": full["model"], "sentences": full["sentences"], "themes": themes, "counts": full["counts"]}


def build(run, reviews, threshold):
    sentences = run["sentences"]
    themes = {}
    for key, t in run["themes"].items():
        # members are ordered nearest the theme centre first; sims are aligned with them
        matching = [m for m, s in zip(t["members"], t["sims"]) if s >= threshold]
        examples, seen = [], set()
        for m in matching:
            row = sentences[m]["row"]
            if row not in seen and len(examples) < EXAMPLES:
                seen.add(row)
                examples.append({"row": row, "text": sentences[m]["text"]})
        themes[key] = {
            "name": t["name"],
            "problem": t["problem"],
            "actionable": t["actionable"],
            "rows": [sentences[m]["row"] for m in matching],
            "loose": len(t["members"]) - len(matching),
            "examples": examples,
        }
    used = {k for keys in run["counts"].values() for k in keys}
    return {
        "model": run.get("model"),
        "threshold": threshold,
        "sentences": len(sentences),
        "hasText": [bool(r["text"].strip()) for r in reviews],
        "ratings": [float(r["rating"]) if r["rating"].strip() else None for r in reviews],
        "segments": [r["app"] for r in reviews],
        "themes": {k: v for k, v in themes.items() if k in used},
        "counts": run["counts"],
    }


def main():
    run = merge(json.loads(EVALUATED.read_text(encoding="utf-8")), json.loads(FULL.read_text(encoding="utf-8")))
    with open(REVIEWS, encoding="utf-8", newline="") as f:
        reviews = list(csv.DictReader(f))
    demo = build(run, reviews, read_threshold())
    OUT.write_text(json.dumps(demo, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    counts = [int(n) for n in demo["counts"]]
    print(f"{OUT}: {OUT.stat().st_size:,} bytes; {len(demo['themes'])} themes; counts {min(counts)}-{max(counts)}")


if __name__ == "__main__":
    main()
