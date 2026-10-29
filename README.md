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

## Asking the corpus questions

Search runs on your own machine with no internet connection. The plan is in [docs/v2-vector-search.md](docs/v2-vector-search.md).

```text
pnpm index                  rebuild indexes/corpus.sqlite from every committed Passage
pnpm index --keywords-only  the same without Ollama: keyword search only
pnpm ask "What did Shapur do to Valerian?"   candidate Passages as JSON
```

- **[Ollama](https://ollama.com)** runs the embedding model, BGE-M3, locally. An embedding model turns a piece of text into a list of numbers (a vector) so that texts with similar meaning, in any language, get similar vectors. Install it once (`brew install ollama`), start it (`ollama serve`, or open the app), and download the model once (`ollama pull bge-m3`, about 1.2 GB). After that nothing needs the internet. `pnpm index` stops with these instructions if Ollama isn't running.
- **Building the index** reads every committed Passage, asks Ollama for vectors of its text (long Passages in overlapping pieces), and writes them with the full text into one SQLite file (gitignored, safe to delete). Vectors are cached by the text's hash in `indexes/embeddings.sqlite`, so a rebuild only embeds what changed.
- **Asking** finds Passages containing the question's words, with every form of a name it mentions (Shapur, *Sapor*, Σαπώρης; listed in `src/search/names.ts`), and, when Ollama is running, the Passages whose vectors are closest to the question's. Both lists are merged, and the result names the Works searched. Judging which candidates are relevant, and why, is for the chat model reading them (Claude, or a local model in pi).

### In a chat, through the MCP server

`scripts/mcp.ts` is an MCP server: it lets a chat app search and read the corpus itself, and answer with links into the reader. It runs on your machine and reads the same index, so run `pnpm index` first and keep Ollama running (without it, search falls back to keywords and says so).

- **Claude Code** picks it up from `.mcp.json` when you open a session in this checkout, and asks once before using it.
- **Claude Desktop**: add it under Settings → Developer → Edit Config, with the full path to your checkout, then restart the app:

  ```json
  {
    "mcpServers": {
      "ancient-corpus": {
        "command": "node",
        "args": ["/Users/you/src/ancient-corpus/scripts/mcp.ts"]
      }
    }
  }
  ```

  It needs Node 24 or later on the app's path; if Desktop finds an older one, put the full path to `node` (`which node`) as the `command`.

Then ask, for example, "What is all the information we have about the death of Gordian III?". The server gives the chat three tools: `search` (wide candidates, each with its text as numbered Sentences), `read_passage` (a Passage, range or book, in any Edition) and `list_works`. Its instructions ask for the answer as Findings: a link and a line on why each is relevant, which Works were searched, and how many candidates were dropped.

Links point at `pnpm dev` (`http://localhost:4321`) unless `ANCIENT_CORPUS_SITE` is set to the published site's address (add `"env": { "ANCIENT_CORPUS_SITE": "https://…" }` to the config). Run it by hand with `node scripts/mcp.ts`, not `pnpm`, whose banner would corrupt the protocol.
