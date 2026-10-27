# Files in Git are the source of truth; every database is derived

Each Work's manifest and each Edition's normalized Passages are committed files, and the reader is static HTML generated from them at build time. There is no database in v1. Any later store (a vector index for semantic search or RAG, a query API) is built from those files by a pipeline and can be dropped and rebuilt without touching the reader or any published URL. Works change rarely and by one editor, so Git's review and history serve as the edit log, and a reader page costs one static file with no API call.

## Considered Options

- **Firestore (or another hosted database) as the store from day one.** Rejected for v1: it adds a running dependency and per-read cost to what is a read-only page, and it would still need an export for reproducible releases.

## Consequences

- Normalized Passages are committed, not gitignored. Raw intake archives stay out of Git; each Edition records its source URL and checksum so they can be fetched again.
- Importing and Corrections run locally, where the archives are; CI and the deploy only render committed Passages. A change to an importer is not live until its re-imported Passages are committed.
- A Passage is keyed by Work, Edition and Locator, and that key is what any derived index stores, so a search result is always a link into the reader.
