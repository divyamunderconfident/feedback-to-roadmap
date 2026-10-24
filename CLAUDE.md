# Project rules
- Read docs/PRD.md before any task. Work on one requirement (R-number) at a time.
- Stack: a Next.js app in /site for the product; Python 3.11 in /eval for offline runs and evaluation.
- Free services only: Gemini or Groq free tiers, local Ollama, embeddings in the browser (transformers.js) or locally. No paid APIs, databases or hosting.
- Every offline model call goes through llm.py, which caches each call on disk by a hash of its input.
- Long offline runs must stop cleanly at the daily quota and resume from where they stopped.
- Tests use pytest (Python) or the site's test runner, with a fake model client. Tests never call a real model.
- Never read, print or commit .env. Never hard-code keys. The repo is public.
- The website calls a model only with the visitor's own key; demo mode uses precomputed results.
- The visitor's key stays in their browser. The api/proxy function may forward it but must never log or store it.
- After each change: run the tests, then explain what changed in plain language.
- Never invent numbers in README, RESULTS.md or write-ups. Quote them from results files.

# Data
- Demo input: data/demo_reviews.csv (3,542 App Store reviews, 12 apps; columns id, domain, app, title, text, rating). There is no date column.
- Ground-truth labels for evaluation only: data/labels/aware_review_labels.csv. Never send these labels to a model or show them in the product.
- Credit and licence: docs/data_credit.md. Show its credit line on the site and in the README.
- data/raw/ holds the original downloads, unchanged.
