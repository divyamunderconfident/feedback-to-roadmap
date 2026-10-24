# PRD — Feedback to Roadmap: from messy feedback to ranked problems, with receipts

Feedback to Roadmap turns a CSV of support tickets, app reviews or survey comments into ranked themes, sized opportunities and problem statements. Every claim it makes links to the exact quotes behind it, and anything it can't back with a quote is flagged. It runs in the visitor's browser with their own free API key, so it costs $0 to host, and a demo on real public reviews works without any key.

## Constraints
- Built and tested by one person; no outside participants.
- $0: free model tiers, browser-side embeddings, public GitHub repo, Vercel Hobby hosting.
- The site calls a model only with the visitor's own key. Demo mode uses precomputed results.

## Why
- The pain: PMs either read thousands of comments by hand or skim them. A quick "paste it all into a chatbot" summary often invents themes and misses small but painful ones.
- Commercial: AI feedback analysis is an active paid market (Dovetail, Enterpret, Unwrap and others).
- AI PM signal: it is a PM's weekly job, plus a measurable trust feature: every claim has a receipt.

## Users
- Primary: PMs and founders at small startups with no budget for paid feedback tools.
- Secondary: UX researchers who need a quick first pass over open-text answers.

## How it works
1. Upload: the visitor drops a CSV and picks the text column, plus optional rating, date and segment columns (for example plan, country or app).
2. Group: the browser computes embeddings locally and clusters the feedback into themes.
3. Name and size: the model names each theme and writes a problem statement. Sizing (computed in code, never by the model) covers how many people raised it, their share, the average rating, the trend over time if dates exist, and the segments most affected.
4. Receipts: every claim must cite row IDs. A verifier checks each quoted sentence appears word for word (ignoring case and spacing) in the row it cites. Claims it can't verify are flagged and hidden by default.
5. Export: ranked opportunities as Markdown and CSV.

Privacy and cost: the file never leaves the browser except as text sent to the model. Calls go from the browser to Gemini with the visitor's own free key, stored only in their browser. Groq blocks direct browser calls (CORS), so for such providers a small Vercel function (api/proxy) forwards the request without storing or logging the key.

## Goals
- Works on any CSV of up to about 5,000 rows.
- Every claim shown is backed by a verified quote.
- A demo that works instantly, with no key.

## Non-goals
- No accounts and no server-side storage of anyone's data.
- Not a replacement for talking to users.

## Requirements
| ID | Requirement | Priority |
| --- | --- | --- |
| R1 | CSV upload and column mapping: text, plus optional rating, date and segment | P0 |
| R2 | Embeddings and clustering in the browser (in a Web Worker, with a progress bar) | P0 |
| R3 | Theme names, problem statements and sizing: count, share, average rating, trend, top segments | P0 |
| R4 | Receipt verifier: every claim cites row IDs; quotes checked word for word; unverified claims flagged | P0 |
| R5 | Bring-your-own-key model calls from the browser, with a no-log pass-through function as a fallback | P0 |
| R6 | Demo mode: precomputed results on data/demo_reviews.csv (AWARE dataset); no key needed | P0 |
| R7 | Export ranked opportunities as Markdown and CSV | P1 |
| R8 | Fully local mode with a model running in the browser (WebLLM), for sensitive data | P2 |

## Success metrics
- Receipt rate: share of claims backed by a verified quote, before and after the verifier. Target: 100% of claims shown.
- Against a one-prompt baseline (headline): give the same demo data to one model in one prompt; count themes with no supporting rows and themes it missed, against the AWARE labels. Example framing: "A one-prompt summary invented N of M themes; Feedback to Roadmap backed every claim with a quote."
- Theme quality: agreement between the tool's themes and the AWARE aspect labels (data/labels/aware_review_labels.csv), plus a hand spot-check of 50 rows.
- Speed and requests per 1,000 rows on free tiers.
- Commercial signal: number of visitors who upload their own file, counted with a privacy-safe event that records nothing about content.

## Milestones
1. Day 1: upload, column mapping, embeddings and clustering
2. Day 2: theme names, sizing and the receipt verifier
3. Day 3: evaluation against the AWARE labels and the one-prompt baseline
4. Day 4: bring-your-own-key with the fallback function, demo mode, export, write-up

## Risks
- Browser speed on 5,000 rows: embed in a Web Worker, cap rows, show progress.
- Key handling: keys stay in the browser; the fallback function never logs them; add a "forget my key" button.
- Demo data rights: see docs/data_credit.md; credit the AWARE authors on the site.
