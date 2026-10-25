# Feedback to Roadmap

**Turn a CSV of reviews, tickets or survey answers into ranked problems, each backed by quotes checked word for word.**

**Live demo:** _link coming soon_

The site opens on a demo built from 3,542 real App Store reviews of 12 apps, with no key needed. To analyze your own file,
upload a CSV and add your own free Gemini or Groq key. It costs nothing to host: the heavy work runs in your browser.

## How it works

1. **Upload.** Drop a CSV and pick the text column, plus optional rating, date and segment (for example the app or plan).
   The file never leaves your browser.
2. **Group.** The browser splits the text into sentences of 5+ words, embeds them with `all-MiniLM-L6-v2`
   (transformers.js, in a Web Worker), removes each segment's average meaning and its name, splits the sentences into 40
   small groups and merges them step by step (Ward linkage). A slider chooses how many themes to show; the default is 20.
3. **Name.** With your own key, a model gets up to 30 sentences per theme with their review IDs and returns a name, a
   one-line problem statement, whether the theme is actionable, and up to 3 claims that each quote a review.
4. **Check.** Every quote must appear word for word (ignoring case, spacing and quote style) in the review it cites;
   claims that fail are hidden and counted. A sentence only counts towards a theme if its similarity to the theme's
   problem statement is at least 0.30; the rest are shown as "loosely related".
5. **Size and rank.** Share of reviews, average rating, top segments and trend are computed in code, never by the
   model. Themes are ranked by share; praise and filler go last.
6. **Export.** Download the ranked themes as Markdown or CSV.

Your key stays in your browser (localStorage). Gemini is called directly; Groq can also go through a small pass-through
function (`/api/proxy`) that never logs or stores the key. A "Forget my key" button removes it.

## Results

All figures are from [RESULTS.md](RESULTS.md) and `eval/results/match_eval.json`, for one run on the demo data with
themes named by `gemini-3.5-flash-lite`.

**Theme matching against the AWARE labels.** 5,853 of the run's 21,761 sentences link to an AWARE aspect label. At the
site's threshold of 0.30, a theme's matching sentences fall in its most common AWARE category with a macro precision of
**39.7% at 20 themes** (36.2% at 12), and macro recall of 4.6% (3.8% at 12). Macro precision barely moves between
thresholds 0.25 and 0.40, so the labels cannot choose the threshold; they did favour 20 themes over 12, which is the
default. AWARE's categories are broad (usability, cost, security…), so these numbers measure agreement with that
classification, not whether a theme is right.

**Quote check.** Every claim shown on the site has passed the word-for-word check. The share of claims that pass has not
yet been measured in a results file.

## Limitations

- **Similarity is a weak filter.** An earlier hand check found sentences near the 0.30 threshold mostly off-topic. A
  hand-labelling tool (`/label`, development only) is ready to measure this properly; it has not been run yet.
- **The quote check proves a quote exists, not that it supports the claim.**
- **Some themes are generic** (praise, "I've used this app for years"); the model marks most of them not actionable.
- **Naming is not deterministic.** The same theme can be named, or judged actionable, differently on another run.
- **Speed.** Embedding about 22,000 demo sentences takes a few minutes in the browser; the demo is precomputed for that
  reason.
- **Limits:** up to 5,000 rows per file; date parsing relies on the browser and works best with ISO dates.

## Run it locally

```bash
cd site
npm install
npm run dev
```

Tests: `npm test` in `site/`, and `python -m pytest` at the repo root (Python 3.11+). Tests never call a real model.
The demo is rebuilt from an exported run with `python -m eval.build_demo`; the AWARE evaluation with
`python -m eval.match_eval`.

## Data credit

Demo data: AWARE dataset by N. Alturaief, H. Aljamaan and M. Baslyman (ASEW 2021,
[doi:10.1109/ASEW52652.2021.00049](https://doi.org/10.1109/ASEW52652.2021.00049)), via Hugging Face
([scholl99/aware](https://huggingface.co/datasets/scholl99/aware), MIT licence). Reviews by App Store users.
See [docs/data_credit.md](docs/data_credit.md).
