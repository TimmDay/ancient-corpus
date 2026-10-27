# The corpus is an independent public app and the source of truth for Works

The corpus is a standalone public reference that any classics project can link into, with its own deployment and data, rather than a table inside `somnus-data-ingestion`'s Supabase project. It owns each Work's author, title and Editions; somnus (like any other consumer) is responsible for staying in sync and linking to the right Edition and Locator. The initial list of Works is seeded once from somnus's `works` table, after which the corpus is authoritative.

## Considered Options

- **Shared `corpus_passages` table in somnus's Supabase** (the original pilot plan in `RAG_GOALS.md`). Rejected: it ties a public, reusable resource to one private app, and that Supabase free tier is full.
- **somnus `works` as the authority, corpus copies names.** Rejected: the corpus is the place the texts actually live, and other consumers shouldn't depend on a private catalogue.

## Consequences

- The corpus is the only place a passage is read; somnus's `/passages/[id]` viewer is retired in favour of links here.
- Corpus URLs are a public contract: once published, a Work's or Locator's URL must keep working.
