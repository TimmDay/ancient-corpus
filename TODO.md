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

Next, the sources for the death of Gordian III, one PR each: [#19](https://github.com/TimmDay/ancient-corpus/issues/19) to [#26](https://github.com/TimmDay/ancient-corpus/issues/26); English Eutropius [#27](https://github.com/TimmDay/ancient-corpus/issues/27). Sources and rights are in [SOURCES.md](SOURCES.md).


- [ ] Cassius Dio, *Roman History* (Foster): books 36–60 and 78–80 imported from volumes 2, 3, 4 and 6 (1,232 Passages, 9 Flags, visible with `pnpm dev:drafts`), read a book at a time
  - [x] Boissevain's book numbers are canonical; Book 80's restarted run for Alexander is `80.1(Alexander)` and so on
  - [x] One page per book (`/cassius-dio/roman-history/44/`); `/cassius-dio/roman-history#44.19` still works and forwards to the book
  - [x] Epitome versions that repeat chapter numbers are `60.32(epitome)` and so on (60.32–33, 78.19–20, 80.11–12)
  - [ ] Confirm the 9 Suggestions in `pnpm review`: each was checked against the printed scan; 54.33 restores two pages the transcription skipped
  - [ ] Volume 5 (books 61–77): its own markup, chapter anchors `a61_1` and side notes
  - [ ] Volume 1 (books 1–35): Zonaras's epitome and fragments, with Boissevain fragment numbers
  - [ ] Volume 6's "Fragments preserved from books preceding No. 36"
- [ ] Suetonius, *De Grammaticis et Rhetoribus* and *De Poetis*: same Gutenberg volume as the Lives, separate Works
- [ ] Replace or re-download the corrupt `Procopius-BuildingsOfJustinian-architecture.zip`
- [ ] Work through the rest of `docs/intake/report.md` a few Works at a time
- [ ] Port `inventory.py` to TypeScript when a new batch of intake archives arrives (it lives in git history at `69ad736`)

## somnus-data-ingestion

Tracked as issues in that repo: [#84](https://github.com/TimmDay/somnus-data-ingestion/issues/84) canonical Locators, [#85](https://github.com/TimmDay/somnus-data-ingestion/issues/85) dead passages page, [#86](https://github.com/TimmDay/somnus-data-ingestion/issues/86) citation links, [#87](https://github.com/TimmDay/somnus-data-ingestion/issues/87) Dio book numbering.

## v2 and later

- [ ] MCP server for local LLMs ([#2](https://github.com/TimmDay/ancient-corpus/issues/2))
- [ ] Asking the corpus questions: hybrid keyword and semantic search over every Edition, answered as Findings with reader links. Plan and later steps in [`docs/v2-vector-search.md`](docs/v2-vector-search.md)
- [ ] Timelines, place extraction and maps, persona chat (see git history of `RAG_GOALS.md` for the original notes)
- [ ] Parallel original and translation views when a Work has both Editions
- [ ] Lemma-aware search for Latin and Greek
- [ ] Owner comments on the text, Google Docs style ([#8](https://github.com/TimmDay/ancient-corpus/issues/8))
