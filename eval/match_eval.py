"""Offline check of theme matching against the AWARE sentence labels.

The labels are read only here, for evaluation: they are never sent to a model or shown in the product.
Input is the app's own exported run (eval/runs/demo_export.json, saved by the dev-only export on the site).

For each theme, at each threshold:
- matching sentences are the theme's sentences whose similarity to its problem statement is at or above it;
- the top category is the AWARE category most common among the matching sentences that have a label;
- precision is the share of those labelled matching sentences that carry the top category;
- recall is the share of all labelled sentences with the top category that are among the theme's matching sentences.
Macro precision and recall average over themes that have at least one labelled matching sentence;
macro F1 is the harmonic mean of the two.

Run: python -m eval.match_eval
"""

import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

THRESHOLDS = [0.25, 0.30, 0.35, 0.40, 0.45]
EXPORT = Path("eval/runs/demo_export.json")
LABELS = Path("data/labels/aware_sentences.csv")
OUT_JSON = Path("eval/results/match_eval.json")
OUT_MD = Path("eval/results/match_eval.md")


def normalize(text):
    """Ignore case, spacing and curly vs straight quotes, as the site's quote check does."""
    text = text.lower().replace("‘", "'").replace("’", "'").replace("“", '"').replace("”", '"')
    return re.sub(r"\s+", " ", text).strip()


def load_labels(path):
    """review id -> list of (normalized AWARE sentence, set of categories)."""
    by_sentence = defaultdict(set)
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            by_sentence[(r["review_id"], normalize(r["sentence"]))].add(r["category"])
    labels = defaultdict(list)
    for (review, sentence), cats in by_sentence.items():
        labels[review].append((sentence, cats))
    return labels


def link(sentences, labels):
    """Categories for each exported sentence: those of AWARE sentences in the same review whose text equals,
    contains or is contained in it. None when no AWARE sentence matches (the sentence is unlabelled)."""
    out = []
    for s in sentences:
        text = normalize(s["text"])
        cats = set()
        for sentence, c in labels.get(s["review"], []):
            if sentence and (sentence in text or text in sentence):
                cats |= c
        out.append(cats or None)
    return out


def score(themes, cats, threshold):
    """Per-theme top category, precision and recall at one threshold, plus macro averages."""
    totals = Counter(c for cs in cats if cs for c in cs)
    rows = []
    for t in themes:
        matching = [m for m, sim in zip(t["members"], t["sims"]) if sim >= threshold]
        labelled = [cats[m] for m in matching if cats[m]]
        row = {"name": t["name"], "actionable": t["actionable"], "matching": len(matching), "labelled": len(labelled)}
        if labelled:
            top, hits = Counter(c for cs in labelled for c in cs).most_common(1)[0]
            row.update(category=top, precision=hits / len(labelled), recall=hits / totals[top])
        else:
            row.update(category=None, precision=None, recall=None)
        rows.append(row)
    scored = [r for r in rows if r["precision"] is not None]
    p = sum(r["precision"] for r in scored) / len(scored) if scored else 0.0
    r = sum(r["recall"] for r in scored) / len(scored) if scored else 0.0
    return {"themes": rows, "macro": {"precision": p, "recall": r, "f1": 2 * p * r / (p + r) if p + r else 0.0}}


def evaluate(export, labels):
    cats = link(export["sentences"], labels)
    counts = {
        n: {f"{t:.2f}": score(themes, cats, t) for t in THRESHOLDS} for n, themes in export["counts"].items()
    }
    # Threshold: best macro F1, averaged over the theme counts. Theme count: best macro precision at that threshold.
    # Ties go to the lower threshold and the smaller count (first in order).
    f1 = {t: sum(c[t]["macro"]["f1"] for c in counts.values()) / len(counts) for t in next(iter(counts.values()))}
    threshold = max(f1, key=lambda t: (f1[t], -float(t)))
    count = max(counts, key=lambda n: (counts[n][threshold]["macro"]["precision"], -int(n)))
    return {
        "model": export.get("model"),
        "sentences": len(cats),
        "labelled_sentences": sum(1 for c in cats if c),
        "counts": counts,
        "recommended": {"threshold": float(threshold), "themes": int(count), "macro_f1_by_threshold": f1},
    }


def pct(x):
    return "–" if x is None else f"{x * 100:.1f}%"


def markdown(results):
    """Tables for RESULTS.md, every number taken from the results."""
    lines = [
        f"Sentences in the run: {results['sentences']:,}; linked to an AWARE label: {results['labelled_sentences']:,}.",
        "",
    ]
    for n, by_t in results["counts"].items():
        # The top category is chosen again at each threshold, so it is shown in every cell.
        lines += [f"### {n} themes", "", "| Theme | " + " | ".join(f"{t}: P / R (top category)" for t in by_t) + " |"]
        lines.append("|---" * (len(by_t) + 1) + "|")
        for i, theme in enumerate(by_t["0.30"]["themes"]):
            cells = []
            for t in by_t:
                row = by_t[t]["themes"][i]
                cells.append(f"{pct(row['precision'])} / {pct(row['recall'])} ({row['category'] or '–'})")
            name = theme["name"] + ("" if theme["actionable"] else " *(not actionable)*")
            lines.append(f"| {name} | " + " | ".join(cells) + " |")
        lines.append(
            "| **Macro average** | "
            + " | ".join(f"**{pct(m['precision'])} / {pct(m['recall'])}** (F1 {pct(m['f1'])})" for m in (by_t[t]["macro"] for t in by_t))
            + " |"
        )
        lines.append("")
    rec = results["recommended"]
    lines.append(f"Recommended: threshold {rec['threshold']:.2f}, {rec['themes']} themes.")
    return "\n".join(lines) + "\n"


def main():
    export = json.loads(EXPORT.read_text(encoding="utf-8"))
    results = evaluate(export, load_labels(LABELS))
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(results, indent=2), encoding="utf-8")
    OUT_MD.write_text(markdown(results), encoding="utf-8")
    print(OUT_MD.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
