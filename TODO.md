# TODO

Last updated: 2026-10-27

## v1: the reader

- [x] Locator contract: canonical Locators, aliases, ranges, fallback to the enclosing Passage
- [x] Corrections and Flags pipeline; `pnpm review` for working through Flags
- [x] Static reader, `/cite` lookup, home catalogue, slug redirects
- [x] Eutropius, *Breviarium* (Hazzard 1898, Latin): published
- [ ] Suetonius, *De Vita Caesarum* (Thomson/Forester): review its 8 long Flags in `pnpm review` (seven are translator's essays at the end of a Life; Augustus 94 may be Suetonius's own long chapter), then commit
- [ ] Connect Cloudflare Pages: build command `pnpm build`, output directory `dist`, Node 24
- [ ] Choose a custom domain before any app stores links, then set somnus `work_editions.url` for Eutropius and Suetonius
- [ ] Footer with related projects and donations ([#1](https://github.com/TimmDay/ancient-corpus/issues/1))

## Next Works

- [ ] Cassius Dio, *Roman History* (Foster): books 36–60 and 78–80 imported from volumes 2, 3, 4 and 6 (1,231 Passages, 22 Flags, visible with `pnpm dev:drafts`)
  - [ ] Decide the book numbering for books 78–80, where Foster's numbers run one behind Boissevain's and Boissevain's Book 80 restarts its chapters for Alexander
  - [ ] Decide how to hold the bracketed epitome versions that repeat chapter numbers (60.32–33, 78.19–20, 80.11–12)
  - [ ] Review the remaining gap and duplicate Flags (likely transcription slips, e.g. 48.28, 48.40)
  - [ ] Volume 5 (books 61–77): its own markup, chapter anchors `a61_1` and side notes
  - [ ] Volume 1 (books 1–35): Zonaras's epitome and fragments, with Boissevain fragment numbers
  - [ ] Volume 6's "Fragments preserved from books preceding No. 36"
  - [ ] The finished page will be around 4 MB (1.3 MB compressed); consider splitting Dio into a page per book
- [ ] Suetonius, *De Grammaticis et Rhetoribus* and *De Poetis*: same Gutenberg volume as the Lives, separate Works
- [ ] Replace or re-download the corrupt `Procopius-BuildingsOfJustinian-architecture.zip`
- [ ] Work through the rest of `docs/intake/report.md` a few Works at a time
- [ ] Port `inventory.py` to TypeScript when a new batch of intake archives arrives (it lives in git history at `69ad736`)

## somnus-data-ingestion

Tracked as issues in that repo: [#84](https://github.com/TimmDay/somnus-data-ingestion/issues/84) canonical Locators, [#85](https://github.com/TimmDay/somnus-data-ingestion/issues/85) dead passages page, [#86](https://github.com/TimmDay/somnus-data-ingestion/issues/86) citation links, [#87](https://github.com/TimmDay/somnus-data-ingestion/issues/87) Dio book numbering.

## v2 and later

- [ ] MCP server for local LLMs ([#2](https://github.com/TimmDay/ancient-corpus/issues/2))
- [ ] Semantic ("vibe") search: embed Passages into a derived vector index (Firestore is the Google free-tier candidate), keyed by Work, Edition and Locator, returning reader links
- [ ] RAG chatbot over the corpus, with answers that cite reader links
- [ ] Timelines, place extraction and maps, persona chat (see git history of `RAG_GOALS.md` for the original notes)
- [ ] Parallel original and translation views when a Work has both Editions
- [ ] Lemma-aware search for Latin and Greek
