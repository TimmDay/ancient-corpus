# Ancient Corpus

An API-first, reusable corpus of ancient-world texts with stable passage identities, human-readable citations, searchable editions, and citation-linked HTML pages. The RAG chatbot and MCP server are separate clients of the corpus service.

## Repository layout

- `apps/corpus-service`: source-of-truth HTTP API, search, metadata, and HTML passage pages.
- `apps/corpus-mcp`: MCP adapter over the corpus service.
- `apps/chatbot`: RAG chatbot and user interface.
- `packages/corpus-schema`: shared corpus records and validation schemas.
- `packages/shared-types`: shared application and API types.
- `ingestion/importers`: source-format importers.
- `ingestion/manifests`: versioned source provenance and checksums.
- `docs`: architecture and corpus policy documentation.
- `tests`: cross-application and corpus validation tests.

Large source files, normalized corpora, databases, embeddings, and indexes are deliberately excluded from Git. See `.gitignore` and `docs/architecture.md`.

## Inventory candidate archives

Place unchanged candidate ZIP archives in `data/intake/`, then run:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 ingestion/inventory.py
```

The command reads archive members in memory without extracting or modifying the intake files. It generates:

- `ingestion/manifests/intake-inventory.json`: checksums, archive safety findings, embedded metadata, structural signals, duplicate/series grouping, and triage status.
- `docs/intake-report.md`: a human-readable summary and recommended importer-validation batch.

Run the tests with:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v
```
