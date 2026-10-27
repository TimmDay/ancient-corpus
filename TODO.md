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

- [ ] Cassius Dio, *Roman History* (Foster, six Gutenberg volumes; volume 1 is Zonaras's epitome plus fragments)
- [ ] Suetonius, *De Grammaticis et Rhetoribus* and *De Poetis*: same Gutenberg volume as the Lives, separate Works
- [ ] Replace or re-download the corrupt `Procopius-BuildingsOfJustinian-architecture.zip`
- [ ] Work through the rest of `docs/intake/report.md` a few Works at a time
- [ ] Port `inventory.py` to TypeScript when a new batch of intake archives arrives (it lives in git history at `69ad736`)

## somnus-data-ingestion (its side of the contract)

- [ ] Rewrite Suetonius Locators to the canonical form: `Life of Augustus, 5` becomes `Augustus 5`; update its `locator_format` to `Life chapter, e.g. Augustus 5`
- [ ] Rewrite *Historia Augusta* Locators the same way (`Life of Aurelian 25.3` becomes `Aurelian 25.3`) and decide canonical names for the joint Lives (*Three Gordians*, *Two Gallieni*, *Thirty Tyrants*) before that Work is imported
- [ ] Use en dashes in ranges (`3.1–2`, not `3.1-2`)
- [ ] Remove the dead `/passages/[id]` page and the `corpus_passages` references in `docs/SCHEMAS.md`
- [ ] Build citation links as the Edition's `url` plus `#` plus the Locator

## v2 and later

- [ ] MCP server for local LLMs ([#2](https://github.com/TimmDay/ancient-corpus/issues/2))
- [ ] Semantic ("vibe") search: embed Passages into a derived vector index (Firestore is the Google free-tier candidate), keyed by Work, Edition and Locator, returning reader links
- [ ] RAG chatbot over the corpus, with answers that cite reader links
- [ ] Timelines, place extraction and maps, persona chat (see git history of `RAG_GOALS.md` for the original notes)
- [ ] Parallel original and translation views when a Work has both Editions
- [ ] Lemma-aware search for Latin and Greek
