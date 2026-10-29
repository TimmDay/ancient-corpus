# v2: asking the corpus questions

Ask a question such as "what is all the information we have about the death of Gordian III" and get back every Passage that bears on it, each with a reader link and a line on why it is relevant. The reader keeps doing its job unchanged: everything here is derived from the committed Passages (ADR 0002).

## Decided

- **The chat is an MCP server first** ([#2](https://github.com/TimmDay/ancient-corpus/issues/2)), run locally from a checkout. Claude Desktop or Claude Code is the chat; the corpus provides `search`, `read_passage` and `list_works` (`scripts/mcp.ts`).
- **An answer is a list of Findings.** Each Finding is a Passage, or Sentences within it, with a line on why it is relevant. A written summary is available on request and cites only the Findings.
- **Recall first.** `search` returns a wide set of candidates (keyword, name and semantic matches together); the chat model reads them, drops the irrelevant ones and says how many it dropped. The server makes no LLM calls.
- **Every Edition is searched**, in any language, with a multilingual embedding model. A Finding is shown in the Work's preferred Edition, with its other Editions linked.
- **An answer states its Coverage**: which Works were searched. A Work is imported one at a time, in no particular order, so a gap in Coverage must not read as silence in the sources.
- **The index is a local SQLite file**, gitignored and rebuilt from `passages.jsonl`: full text in FTS5 and vectors beside it, so both halves of a hybrid search come from one file. Long Passages are embedded in overlapping pieces of 200 words; a Passage is as close to a question as its closest piece. Vectors are compared in memory, which takes a moment at a few thousand Passages; sqlite-vec can take over if that grows slow. Embeddings are cached by a hash of their text in a second file, so a rebuild only embeds what changed. The index records which model made it.
- **The embedding model is BGE-M3**: free, open, multilingual, and runs locally.
- **Names are widened**: a keyword search for any form of a listed name looks for every form (`src/search/names.ts`): Shapur, Sapor, Šābuhr, Σαπώρης.
- **Search is one module with two front doors**: `pnpm ask "..."` printing JSON (pnpm keeps `search` for itself), for agents that call CLI tools (pi), and the MCP `search` tool.
- **Findings can point at Sentences**, not only a whole Passage. A Passage link stays valid; `#9.2@3` lands on Sentence 3 and `#9.2@3-7` highlights Sentences 3 to 7, inside their Passage. Sentence numbers belong to one Edition, are counted on the fly and are not canonical. A snapshot test of every published Passage's Sentence count catches a splitter change that would shift them.
- **A link can ask for a language.** Without one it lands in the preferred Edition, normally the original language; asking for a language the Work has no Edition in lands there too. Apps that want English ask for it.
- **Sentences end where the Edition's punctuation says**, with a per-language list of abbreviations ("C.", "cos."). Numbering runs on through the parts of a Passage printed in parts. A wrong split is fixed by a Correction.
- **Every Work records its Period covered**, with the years of each division where they are known, so a search can name relevant Works it could not search, and later narrow by date. Narrowing by date never drops a Work or division with no recorded years.
- **Everything runs offline** once set up: BGE-M3 through Ollama, the SQLite index and the search. Only the chat model may need a connection, unless it is a local one.

## Build order

One PR each: [#16](https://github.com/TimmDay/ancient-corpus/issues/16) Period covered and division years, [#17](https://github.com/TimmDay/ancient-corpus/issues/17) Sentence and language links, [#18](https://github.com/TimmDay/ancient-corpus/issues/18) the index and `pnpm ask`, [#2](https://github.com/TimmDay/ancient-corpus/issues/2) the MCP server.

Works are imported one PR at a time, starting with the sources for the Gordian III question: the Historia Augusta ([#19](https://github.com/TimmDay/ancient-corpus/issues/19)), Zosimus ([#20](https://github.com/TimmDay/ancient-corpus/issues/20)), Aurelius Victor and the *Epitome* ([#21](https://github.com/TimmDay/ancient-corpus/issues/21)), Orosius ([#22](https://github.com/TimmDay/ancient-corpus/issues/22)), Ammianus ([#23](https://github.com/TimmDay/ancient-corpus/issues/23)), then Zonaras, Shapur I and Festus ([#24](https://github.com/TimmDay/ancient-corpus/issues/24)–[#26](https://github.com/TimmDay/ancient-corpus/issues/26)). Where no public-domain English exists we translate the original ourselves (ADR 0003, [#28](https://github.com/TimmDay/ancient-corpus/issues/28)–[#33](https://github.com/TimmDay/ancient-corpus/issues/33)). Sources and credits are in [SOURCES.md](../SOURCES.md).

## Later

- [ ] **Hosted MCP server** on Cloudflare beside the reader, so it also works from claude.ai on the web and phone. Most of it is reused by [#15](https://github.com/TimmDay/ancient-corpus/issues/15).
- [ ] **Hosted index**: Cloudflare Vectorize for vectors and D1 for full text, built by the same pipeline as the local file. Needed by the hosted server and #15.
- [ ] **Compare paid embedding models against BGE-M3** (Voyage, Cohere embed-v4, OpenAI text-embedding-3-large) on the test questions below, especially for Latin and Ancient Greek.
- [ ] **Name the relevant Works not yet searched** ("Not yet in the corpus: Historia Augusta, Zosimus, ...") once every Work records the years it covers.
- [ ] **Ask from coin-cabinet** ([#15](https://github.com/TimmDay/ancient-corpus/issues/15)), after the MCP server has been used by hand for a while.

## Test questions

Kept in the repo, each with the Passages (and Sentences) we expect back, to choose and regression-test the embedding model.

| Question | Expected |
|---|---|
| What did Shapur do to Valerian? | *Historia Augusta*, *Two Valerians* 1–4 (Latin and English); Eutropius 9.7 |
| What is all the information we have about the death of Gordian III? | Eutropius 9.2; as they are imported: *Historia Augusta*, *Three Gordians* 26–34; Zosimus 1.18–19; Aurelius Victor 27.7–8; *Epitome de Caesaribus* 27.2; Orosius 7.19.5; Ammianus 23.5.7, 23.5.17; Zonaras 12.17–18; Shapur I, *Res Gestae* 3–4; Festus 22 |
