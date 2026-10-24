# Demo data: source, licence and credit

## Dataset
**AWARE: Aspect-Based Sentiment Analysis Dataset of Apps Reviews for Requirements Elicitation**
Nouf Alturaief, Hamoud Aljamaan and Malak Baslyman (King Fahd University of Petroleum and Minerals).
Published in the Proceedings of the 36th IEEE/ACM International Conference on Automated Software
Engineering Workshops (ASEW 2021), pages 211–218. DOI: https://doi.org/10.1109/ASEW52652.2021.00049

- Copy used: Hugging Face dataset `scholl99/aware` — https://huggingface.co/datasets/scholl99/aware
- Files downloaded on 24 October 2026: `AWARE_Productivity.csv` and `AWARE_Social_Networking.csv`
  (the Games file is not used).
- Content: real user reviews from Apple's App Store, split into sentences, with expert-validated
  aspect categories (for example usability, cost, reliability, security) and sentiment labels.

## Licence
- The Hugging Face copy is published under the **MIT licence**.
- That copy was uploaded by a Hugging Face user, not visibly by the paper's authors, and the licence
  of the authors' original release could not be confirmed. This project uses the data only for a
  non-commercial portfolio demo, credits the authors in full, and will remove or replace the data if
  the authors or rights holders ask.
- The review texts were written by App Store users; they are shown only as short quotes inside the
  demo, with the app name.

## What this project uses
| File | What it is | Rows |
| --- | --- | --- |
| `data/demo_reviews.csv` | One row per review: id, domain, app, title, text, rating. This is the demo input. | 3,542 reviews, 12 apps |
| `data/labels/aware_review_labels.csv` | Per review: the aspect categories annotated in AWARE, and the ones with negative sentiment. Used only to evaluate theme quality, never shown to the model. | 3,542 |
| `data/labels/aware_sentences.csv` | The two original files combined, sentence level, unchanged. | 6,892 sentences |
| `data/raw/` | The original downloads, unchanged. | — |

Apps: Gmail, Microsoft Word, Forest, Things 3, Evernote, Notability (productivity); WhatsApp,
Discord, Facebook, TeamSpeak 3, Threema, Free Tone (social networking).

## How to credit (use on the site and in the README)
> Demo data: AWARE dataset by N. Alturaief, H. Aljamaan and M. Baslyman (ASEW 2021,
> doi:10.1109/ASEW52652.2021.00049), via Hugging Face (scholl99/aware, MIT licence).
> Reviews by App Store users.
