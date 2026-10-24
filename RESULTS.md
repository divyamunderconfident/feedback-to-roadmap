# Results

## Theme matching against the AWARE labels

**Question:** after a theme is named, a sentence counts towards it only if its similarity to the theme's problem
statement reaches a threshold (`MATCH_THRESHOLD` in `site/lib/match.ts`). Which threshold, and which default number
of themes, make the matching sentences agree best with the AWARE aspect labels?

**Data and run.** One run of the site on the demo data (`data/demo_reviews.csv`), themes named by
`gemini-3.5-flash-lite`, saved by the dev-only export to `eval/runs/demo_export.json`. The AWARE labels
(`data/labels/aware_sentences.csv`) are read only by `eval/match_eval.py`; they are never sent to a model or shown
in the product. Every number below comes from `eval/results/match_eval.json` (tables: `eval/results/match_eval.md`).
Re-run with `python -m eval.match_eval`.

**Method.** Each of the run's sentences is linked to the AWARE sentences of the same review whose text equals,
contains or is contained in it (ignoring case, spacing and quote style); unlinked sentences have no label and are
left out of the scores. For each theme and threshold:

- **top category**: the AWARE category most common among the theme's labelled matching sentences, chosen again at
  each threshold;
- **precision (P)**: the share of those labelled matching sentences that carry the top category;
- **recall (R)**: the share of all labelled sentences with the top category that are among the theme's matching
  sentences.

Macro precision and recall average over themes with at least one labelled matching sentence; macro F1 is their
harmonic mean. Rules agreed before the run: **threshold = best macro F1** (averaged over 12 and 20 themes);
**theme count = higher macro precision at that threshold**.

### Read this first

- **Coverage:** 5,853 of the run's 21,761 sentences link to an AWARE label. The scores rest on that share only.
- **AWARE categories are broad quality types** (usability, general, cost, security…), not specific problems. A
  coherent theme such as call audio sits mostly under "usability", next to unrelated usability complaints, so
  precision measures agreement with this classification, not whether a theme is right.
- **Recall per theme is small by design:** a big category such as usability is spread over many themes, and recall
  divides by all of it.
- **Themes whose problem statement is "none"** (praise the model marked not actionable) match almost nothing:
  "Versatile and Convenient Mobile Messaging" has no matching sentence at any threshold.
- **The top category can change between thresholds**, which is why recall sometimes rises at a stricter threshold
  (for example "App Hesitation and Criticism" switches from general to cost at 0.35).

### Tables

Sentences in the run: 21,761; linked to an AWARE label: 5,853.

#### 12 themes

| Theme | 0.25: P / R (top category) | 0.30: P / R (top category) | 0.35: P / R (top category) | 0.40: P / R (top category) | 0.45: P / R (top category) |
|---|---|---|---|---|---|
| App praise and enjoyment *(not actionable)* | 27.2% / 3.9% (general) | 35.7% / 2.5% (general) | 34.6% / 0.5% (usability) | 50.0% / 0.1% (general) | – / – (–) |
| Lack of text formatting options | 44.6% / 7.6% (usability) | 43.4% / 4.2% (usability) | 39.7% / 1.6% (usability) | 42.9% / 0.6% (general) | 50.0% / 0.1% (general) |
| Desire for better organization | 39.2% / 2.0% (general) | 38.9% / 1.0% (general) | 50.0% / 0.6% (general) | 50.0% / 0.4% (general) | 33.3% / 0.2% (efficiency) |
| Versatile and Convenient Mobile Messaging *(not actionable)* | – / – (–) | – / – (–) | – / – (–) | – / – (–) | – / – (–) |
| Product appreciation and design *(not actionable)* | 46.4% / 1.6% (usability) | 40.0% / 0.6% (usability) | 37.5% / 0.2% (general) | 25.0% / 0.1% (effectiveness) | 100.0% / 0.2% (efficiency) |
| Notification and account management issues | 35.9% / 7.6% (usability) | 38.8% / 5.7% (usability) | 41.4% / 3.3% (usability) | 39.5% / 1.5% (usability) | 50.0% / 0.6% (usability) |
| Updates failing to fix issues | 29.0% / 5.7% (general) | 27.7% / 3.6% (general) | 29.9% / 2.5% (general) | 26.3% / 4.5% (reliability) | 24.0% / 0.7% (effectiveness) |
| In-game currency acquisition is too slow | 43.9% / 10.6% (cost) | 33.8% / 5.9% (cost) | 29.7% / 4.3% (cost) | 28.6% / 3.2% (cost) | 37.1% / 2.9% (cost) |
| Call audio volume and quality issues | 40.7% / 9.8% (usability) | 40.1% / 8.2% (usability) | 37.5% / 5.7% (usability) | 36.4% / 3.2% (usability) | 44.0% / 1.7% (usability) |
| App updates and reinstalls fail | 29.9% / 3.5% (usability) | 30.0% / 3.5% (usability) | 30.1% / 3.5% (usability) | 30.4% / 3.3% (usability) | 30.6% / 3.0% (usability) |
| Device and operating system compatibility *(not actionable)* | 27.2% / 2.4% (general) | 27.8% / 1.9% (general) | 25.7% / 1.3% (general) | 27.8% / 0.7% (general) | 29.2% / 0.5% (general) |
| Core functionality and usability expectations | 41.7% / 4.8% (usability) | 42.3% / 4.8% (usability) | 43.6% / 4.7% (usability) | 41.8% / 4.1% (usability) | 41.5% / 3.6% (usability) |
| **Macro average** | **36.9% / 5.4%** (F1 9.5%) | **36.2% / 3.8%** (F1 6.9%) | **36.3% / 2.5%** (F1 4.8%) | **36.2% / 2.0%** (F1 3.8%) | **44.0% / 1.3%** (F1 2.6%) |

#### 20 themes

| Theme | 0.25: P / R (top category) | 0.30: P / R (top category) | 0.35: P / R (top category) | 0.40: P / R (top category) | 0.45: P / R (top category) |
|---|---|---|---|---|---|
| Desire for better organization | 39.2% / 2.0% (general) | 38.9% / 1.0% (general) | 50.0% / 0.6% (general) | 50.0% / 0.4% (general) | 33.3% / 0.2% (efficiency) |
| Versatile and Convenient Mobile Messaging *(not actionable)* | – / – (–) | – / – (–) | – / – (–) | – / – (–) | – / – (–) |
| App Hesitation and Criticism *(not actionable)* | 25.7% / 5.8% (general) | 26.6% / 5.4% (general) | 26.2% / 13.8% (cost) | 29.1% / 8.8% (cost) | 35.8% / 4.3% (cost) |
| Product appreciation and design *(not actionable)* | 46.4% / 1.6% (usability) | 40.0% / 0.6% (usability) | 37.5% / 0.2% (general) | 25.0% / 0.1% (effectiveness) | 100.0% / 0.2% (efficiency) |
| App appreciation and long-term use *(not actionable)* | 29.0% / 3.3% (usability) | 29.0% / 3.3% (usability) | 29.6% / 3.2% (usability) | 28.4% / 2.8% (usability) | 27.3% / 2.1% (usability) |
| Lack of folder organization | 46.1% / 3.5% (usability) | 44.4% / 1.8% (usability) | 53.7% / 1.1% (usability) | 50.0% / 0.3% (usability) | 66.7% / 0.6% (compatibility) |
| Updates failing to fix issues | 29.0% / 5.7% (general) | 27.7% / 3.6% (general) | 29.9% / 2.5% (general) | 26.3% / 4.5% (reliability) | 24.0% / 0.7% (effectiveness) |
| App updates and reinstalls fail | 29.9% / 3.5% (usability) | 30.0% / 3.5% (usability) | 30.1% / 3.5% (usability) | 30.4% / 3.3% (usability) | 30.6% / 3.0% (usability) |
| Missing message and email notifications | 39.1% / 6.3% (usability) | 39.1% / 5.1% (usability) | 39.6% / 3.7% (usability) | 37.5% / 2.1% (usability) | 37.7% / 1.3% (usability) |
| Call Screen Behavior Issues | 39.7% / 3.9% (usability) | 40.5% / 3.5% (usability) | 40.7% / 2.8% (usability) | 44.3% / 2.0% (usability) | 49.1% / 1.3% (usability) |
| Account compromise and lack of access | 31.4% / 16.3% (security) | 35.2% / 15.0% (security) | 38.2% / 11.6% (security) | 41.2% / 7.1% (security) | 44.8% / 4.4% (security) |
| Device and operating system compatibility *(not actionable)* | 27.2% / 2.4% (general) | 27.8% / 1.9% (general) | 25.7% / 1.3% (general) | 27.8% / 0.7% (general) | 29.2% / 0.5% (general) |
| Pricing and subscription models | 63.4% / 23.1% (cost) | 64.5% / 18.1% (cost) | 65.1% / 12.2% (cost) | 67.3% / 7.9% (cost) | 74.1% / 4.5% (cost) |
| Cursor jumping while editing text | 54.0% / 5.5% (usability) | 54.5% / 4.3% (usability) | 53.2% / 2.9% (usability) | 50.7% / 1.7% (usability) | 55.6% / 1.0% (usability) |
| Core functionality and usability expectations | 41.7% / 4.8% (usability) | 42.3% / 4.8% (usability) | 43.6% / 4.7% (usability) | 41.8% / 4.1% (usability) | 41.5% / 3.6% (usability) |
| Changing review ratings *(not actionable)* | 54.1% / 1.4% (general) | 50.0% / 0.8% (general) | 25.0% / 0.6% (reliability) | 50.0% / 0.1% (general) | 66.7% / 0.1% (general) |
| Audio routing and volume issues | 43.4% / 6.2% (usability) | 42.0% / 5.3% (usability) | 42.3% / 4.6% (usability) | 43.3% / 3.7% (usability) | 44.0% / 2.6% (usability) |
| Photo sharing and uploading issues | 46.9% / 5.7% (usability) | 45.6% / 5.0% (usability) | 41.3% / 3.8% (usability) | 37.3% / 2.5% (usability) | 36.5% / 1.6% (usability) |
| Variety and real-world tree planting | 28.4% / 1.3% (general) | 28.8% / 1.3% (general) | 29.0% / 1.3% (general) | 30.2% / 1.1% (general) | 27.7% / 2.9% (cost) |
| Dark mode and color scheme | 48.8% / 4.2% (usability) | 47.9% / 3.9% (usability) | 47.9% / 3.4% (usability) | 47.2% / 2.9% (usability) | 46.2% / 2.4% (usability) |
| **Macro average** | **40.2% / 5.6%** (F1 9.8%) | **39.7% / 4.6%** (F1 8.3%) | **39.4% / 4.1%** (F1 7.4%) | **39.9% / 3.0%** (F1 5.5%) | **45.8% / 2.0%** (F1 3.8%) |

### Recommendation

**Threshold 0.25, 20 themes**, by the rules above.

- **Threshold.** Macro F1, averaged over 12 and 20 themes, is highest at 0.25 (9.7%) and falls at every step:
  7.6% at 0.30, 6.1% at 0.35, 4.6% at 0.40, 3.2% at 0.45. Raising the threshold from 0.25 to 0.40 leaves macro
  precision about the same (12 themes: 36.9% → 36.2%; 20 themes: 40.2% → 39.9%) while macro recall falls (12 themes:
  5.4% → 2.0%; 20 themes: 5.6% → 3.0%). Only 0.45 lifts precision (44.0% and 45.8%), at the lowest recall.
  In AWARE's terms, then, a stricter threshold mostly removes sentences without making the rest agree better.
- **Theme count.** At 0.25, 20 themes have higher macro precision than 12 (40.2% vs 36.9%). With 20 themes the
  biggest mixed themes split into narrower ones that line up with one category, for example "Pricing and
  subscription models" (63.4% cost) and "Account compromise and lack of access" (31.4% security, recall 16.3%).

**Limits of this recommendation.** It rests on one run, one naming model and the 5,853 labelled sentences, and on a
broad classification that cannot tell call audio from cursor jumping. The earlier hand check of "Call audio volume
and quality issues" found that sentences near 0.30 were mostly off-topic, and AWARE cannot confirm or refute that.
The site still uses 0.30 and 12 themes; changing them is a separate decision.
