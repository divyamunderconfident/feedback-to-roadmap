"""Builds site/public/demo.json, the precomputed demo, from an exported run. No model calls.

Input: eval/runs/demo_export.json (the site's own run on the demo data, saved by the dev-only export) and
data/demo_reviews.csv (for each review's rating and app). For each theme at each exported theme count it keeps the
name, problem statement and actionable flag, the review rows of its matching sentences (similarity at or above the
site's MATCH_THRESHOLD, read from site/lib/match.ts so the two cannot drift apart), how many sentences were only
loosely related, and up to 3 matching sentences nearest the theme centre, one per review. The site computes every
size number from these rows with the same code it uses for uploaded files.

Run: python -m eval.build_demo
"""

import csv
import json
import re
from pathlib import Path

EXPORT = Path("eval/runs/demo_export.json")
REVIEWS = Path("data/demo_reviews.csv")
MATCH_TS = Path("site/lib/match.ts")
OUT = Path("site/public/demo.json")
EXAMPLES = 3


def read_threshold(path=MATCH_TS):
    found = re.search(r"MATCH_THRESHOLD: number \| null = ([0-9.]+);", path.read_text(encoding="utf-8"))
    if not found:
        raise ValueError(f"MATCH_THRESHOLD not found in {path}")
    return float(found.group(1))


def build(export, reviews, threshold):
    sentences = export["sentences"]
    counts = {}
    for n, themes in export["counts"].items():
        out = []
        for t in themes:
            # members are ordered nearest the theme centre first; sims are aligned with them
            matching = [m for m, s in zip(t["members"], t["sims"]) if s >= threshold]
            examples, seen = [], set()
            for m in matching:
                row = sentences[m]["row"]
                if row not in seen and len(examples) < EXAMPLES:
                    seen.add(row)
                    examples.append({"row": row, "text": sentences[m]["text"]})
            out.append({
                "name": t["name"],
                "problem": t["problem"],
                "actionable": t["actionable"],
                "rows": [sentences[m]["row"] for m in matching],
                "loose": len(t["members"]) - len(matching),
                "examples": examples,
            })
        counts[n] = out
    return {
        "model": export.get("model"),
        "threshold": threshold,
        "sentences": len(sentences),
        "hasText": [bool(r["text"].strip()) for r in reviews],
        "ratings": [float(r["rating"]) if r["rating"].strip() else None for r in reviews],
        "segments": [r["app"] for r in reviews],
        "counts": counts,
    }


def main():
    export = json.loads(EXPORT.read_text(encoding="utf-8"))
    with open(REVIEWS, encoding="utf-8", newline="") as f:
        reviews = list(csv.DictReader(f))
    demo = build(export, reviews, read_threshold())
    OUT.write_text(json.dumps(demo, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"{OUT}: {OUT.stat().st_size:,} bytes; theme counts {list(demo['counts'])}; threshold {demo['threshold']}")


if __name__ == "__main__":
    main()
