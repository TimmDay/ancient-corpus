# Ancient Corpus

A public reading reference of ancient texts. Each Work is one static page with its full text and contents, and any other app can link straight to a passage:

```text
/eutropius/breviarium#9.9
/cite?author=Eutropius&title=Breviarium historiae Romanae&loc=9.9
```

The reader highlights the Passage. A range (`9.9–10`) highlights every Passage in it. A Locator more precise than the Edition marks (`9.9.2`) lands on the enclosing Passage with a note saying so. Names and terms are defined in [GLOSSARY.md](GLOSSARY.md); the decisions behind the design are in [docs/adr](docs/adr).

## How it works

```text
data/intake/*.zip          unchanged Gutenberg archives (not committed)
   │  pnpm ingest           importer + corrections.json → Passages, Flags
   ▼
works/<author>/<title>/     committed source of truth
   work.json                names, slug aliases, Locator aliases, Editions
   <edition>/passages.jsonl one Passage per line
   <edition>/edition.json   contents and Editorial matter
   <edition>/corrections.json
   │  pnpm build            only reads works/, so CI and Cloudflare can run it
   ▼
dist/                       static site for Cloudflare Pages
```

An Edition with unresolved Flags is not published. Work through them with `pnpm review`.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Build and serve the site at http://localhost:4321 |
| `pnpm ingest [author/title] [edition]` | Re-import Editions from `data/intake/` |
| `pnpm review` | Review Flags at http://localhost:4322; each action is saved as a Correction |
| `pnpm build` | Render `dist/` |
| `pnpm check` | Lint and typecheck |
| `pnpm test:run` | Unit tests |

## Adding a Work

1. Put the unchanged archive in `data/intake/`.
2. Add an Edition to the Work's `work.json` (seeded from somnus; add the Work if it is new), with the archive's SHA-256.
3. Write an importer in `src/importers/` and register it in `src/importing.ts`.
4. `pnpm ingest author/title`, then `pnpm review` until no Flags remain.
5. Commit `works/` and open a PR.

A source that is a website rather than an archive (LacusCurtius, tertullian.org) is saved page by page into a zip in `data/intake/` first, so it is recorded and checksummed the same way. Record every Edition's source, rights and credit in [SOURCES.md](SOURCES.md).

The intake inventory from the first batch of archives is in [docs/intake](docs/intake).

## Asking the corpus questions (being built)

Search will run on your own machine with no internet connection, once set up. The plan is in [docs/v2-vector-search.md](docs/v2-vector-search.md).

- **[Ollama](https://ollama.com)** runs the embedding model, BGE-M3, locally. An embedding model turns a piece of text into a list of numbers (a vector) so that texts with similar meaning, in any language, get similar vectors. Install it once (`brew install ollama`), start it (`ollama serve`, or open the app), and download the model once (`ollama pull bge-m3`, about 1.2 GB). After that nothing needs the internet.
- **Building the index** reads every committed Passage, asks Ollama for each one's vector, and writes them with the full text into one SQLite file (gitignored, so it is safe to delete and rebuild). Vectors are cached by the text's hash, so a rebuild only embeds what changed. It will stop with a message if Ollama isn't running.
- **A search** embeds your question with the same model, then finds the Passages whose vectors are closest, plus Passages that contain its words and names. It returns them all as reader links for the chat model (Claude, or a local model in pi) to read, judge and explain.
