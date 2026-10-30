---
name: ask-the-corpus
description: Answer a question from the ancient sources in this corpus (Roman emperors, wars, events, people) with Findings that link to the exact Passages. Use when asked what the sources say about something, or to find, read or cite a passage.
---

# Ask the corpus

The corpus holds ancient histories in their original languages and in English. Three commands, run from the repository root, print JSON:

- `pnpm --silent ask "<question>" [--limit 30]`: candidate Passages for a question, from every Work and language.
- `pnpm --silent read "<work>" "<locator>" [--lang en] [--edition <id>]`: a Passage, a range (`1.18-1.19`) or a whole book or Life.
- `pnpm --silent works`: the Works, the years they cover, how their Locators are written, and their Editions.

Each Passage's `text` is numbered Sentences, `[1] … [2] …`, and its `url` opens it in the reader.

## Steps

1. **Search.** Run `ask` with the question as asked. The candidates are wide on purpose.
2. **Judge every candidate.** Read each one's text and keep those that bear on the question. Use `read` for the Passages either side of a Finding when its meaning depends on them, and `read --lang en` for an English Edition of a Greek or Latin one. Done when every candidate is kept or dropped.
3. **Answer with Findings.** A Finding is a kept Passage, or Sentences within it, as a link plus one line on why it is relevant. Link Sentences by adding `@N` or `@N-M` to its `url`, using its `[N]` numbers: `…/eutropius/breviarium/#9.2@5-6`. Group Findings by Work.
4. **State what was searched.** Say how many candidates you dropped, and give the Coverage: the Works in the result's `coverage`. A Work missing from the Coverage is not in the corpus yet, so its silence says nothing about what it records. Pass on any `warning` from the result.

Write a summary only when asked, citing only the Findings.

If `ask` returns `"error": "The search index is empty…"`, run `pnpm index` (Ollama must be running for semantic search; see the README) and search again.
