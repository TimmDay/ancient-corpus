# RAG goals

Where this corpus is headed, why, and what's already been built against it.
Companion to `TODO.md` (task-level tracking) and `docs/architecture.md`
(the high-level shape) — this doc is about *intent*: what the corpus
service needs to be capable of, and what's already committed to as a
result of building the first real consumer.

## The actual goal

This corpus isn't being built for its own sake — it's infrastructure for
several planned front-end features, of which **form pre-fill in
`somnus-data-ingestion`** (a private coin-collection admin tool, sibling
repo) is the first, already-built one. Others discussed but not yet
started:

- **"Construct a timeline for this person/event"** — pull dated/ordered
  passages about a subject and lay them out chronologically.
- **"Extract geographical references"** — pull place names mentioned in
  connection with a subject, resolve them (approximately) to coordinates,
  plot them on a map.
- **"Set up a chatbot with Plato"** — persona-grounded conversational
  access to one author's corpus.

**Implication for the corpus API design:** don't build retrieval that only
serves the form-prefill shape. The specific query patterns above differ a
lot (entity lookup vs. temporal ordering vs. geo-entity extraction vs.
open-ended chat), but they all need the same underlying capability: fetch
real, citable passages, scoped by entity/work/section, ranked by semantic
relevance. Keep that layer general; let each consumer build its own
prompt/shape on top of it. **Priority order is still: ship form pre-fill
first, design the retrieval layer so the others aren't precluded.**

## What's already built (as of this doc)

Driven by the form-prefill use case, working end-to-end in code (not yet
deployed — see "Outstanding handoff steps" below):

- **`ingestion/importers/suetonius_twelve_caesars.py`** — parses the one
  pilot text (`data/intake/Suetonius-TwelveCaesars-complete.zip`, Project
  Gutenberg #6400) into 513 cited passages, one per numbered chapter
  (`"Suetonius, Augustus 3"` style citations). Chosen as the pilot because
  it's a single clean HTML file with an unambiguous Life/chapter citation
  convention, and it's the direct prosopographical source for the
  `somnus-data-ingestion` persons table.
- **`ingestion/embed.py`** — embeds passage text via Voyage AI
  (`voyage-4`, 1024-dim) and upserts into a **shared Supabase table**,
  `corpus_passages`, in `somnus-data-ingestion`'s own Supabase project
  (not a separate corpus database) — see "Architecture decision" below.
- **Quality flags on every passage**, written by the importer, honored by
  `embed.py --skip-flagged`:
  - `flagged_long` — chapter length is a wild outlier for its life
    (catches a chapter silently absorbing trailing non-Suetonius material
    once no further chapter marker is found — happened after Augustus
    101, ~15k words of what looks like an appended translator's essay).
  - `flagged_gap` — the next chapter number isn't `+1`, meaning a missed
    marker let one chapter silently absorb the next one's text.
  - Suetonius currently has 9 `flagged_long` + 25 `flagged_gap` chapters
    (some overlap) out of 513 — real, but a small minority. Not yet
    manually spot-checked/corrected.
- **Consumer side, in `somnus-data-ingestion`** (for reference, not owned
  by this repo): `/api/generate-person` (retrieval + forced-tool-call
  generation + citation verification) and `/passages/[id]` (the
  new-tab passage viewer citations link to). See that repo's
  `docs/SCHEMAS.md` (`corpus_passages` section) and
  `docs/migrations/2026-09-11_corpus_passages.sql` for the exact schema
  this repo's `embed.py` writes into.

## Architecture decision: shared Supabase table, not `corpus-service` (yet)

`docs/architecture.md`'s original plan routes every consumer through a
`corpus-service` HTTP API. For the pilot, we deliberately skipped that:
`ingestion/embed.py` writes straight into `somnus-data-ingestion`'s own
Supabase project (`corpus_passages` table, `service_role` key), and that
app queries Postgres directly (`pgvector` cosine search via a
`match_corpus_passages` RPC) — no network service in between.

**Why:** `corpus-service` was (and still is) an empty placeholder behind
~30 open editorial decisions in `TODO.md`. Standing it up before a single
real consumer existed would have meant designing its API blind. Building
the shared-table version first let the actual query shape (retrieval
scoped by person name, forced-citation generation, quote verification)
get discovered by building a real thing, not guessed at.

**Why this doesn't box in the other three use cases:** `corpus_passages`
is a plain Postgres table with a stable `corpus_uri` per passage,
independent of its own primary key — any future `corpus-service` can
layer over these exact same rows later without a data migration, and nothing about the schema is
form-prefill-specific (`section_label`/`locator`/`ordinal`/`embedding` are
all generic). What *would* need revisiting for the other three use cases:
non-Supabase-app consumers (an actual chatbot UI, a public map view) can't
reuse `match_corpus_passages` directly the way `somnus-data-ingestion`
does, since that requires Supabase credentials scoped to that project.
**That's the trigger for actually building `corpus-service`: the first
consumer that isn't itself a Supabase-project-holder.** Until then, adding
more tables/columns to the shared schema is cheaper than standing up and
maintaining a second service with no second consumer yet.

**When that trigger fires, GCP is worth defaulting to for it** — the
project owner isn't attached to Supabase specifically (it was the right
call for `somnus-data-ingestion` at the time, not a standing preference),
and has a general preference/familiarity pull toward GCP for new
infrastructure. The concrete shape worth considering: **Cloud Run hosting
the retrieval API and a self-hosted embedding model together** — one
service, one consistent model, called identically by this repo's ingestion
scripts and by every future FE consumer, which also sidesteps the
Voyage-dependency question from a different angle (see
"self-hosted embeddings" discussion — not written up in this doc, ask the
project owner if it matters). This is a direction, not a locked decision —
confirm with the project owner when `corpus-service` actually gets built
rather than treating this paragraph as settled.

## Design principles worth carrying forward

These came out of real bugs found while building the pilot — worth
applying to any future retrieval consumer, not just re-deriving them:

- **Retrieve-then-generate, never generate-then-cite.** Pull real passages
  first; constrain the model to what's actually in them. A model asked to
  "find a citation" after generating a claim will produce a plausible,
  fabricated one.
- **A verbatim quote is necessary but not sufficient.** Semantic search
  alone can retrieve a real, relevant-*sounding* passage from the *wrong*
  entity (e.g. Augustus's chapters surfacing for a Nero query) — the
  model can then quote it verbatim, and a naive "is this a real substring"
  check passes a real quote that's wrongly attributed. Any retrieval
  serving a named-entity query (a person, a place, a subject) needs a
  lexical/structural scoping filter *in addition to* vector similarity,
  not instead of it. `match_corpus_passages`'s `filter_section_label`
  (loose `ilike`, both directions) is the current example.
  For the timeline/geo/chatbot use cases, think about what the equivalent
  scoping key is before shipping (a date range? a place? nothing, for
  open-ended chat?).
- **Fail closed.** No passage support for a claim → leave it blank / say
  so, never guess from general world knowledge. Applies beyond form
  fields — a timeline with a wrong date, or a map pin in the wrong place,
  is worse than a gap.
- **Flag structural failures, don't silently trust or silently drop.**
  `flagged_long`/`flagged_gap` exist because chapter-boundary detection
  *will* fail on 500-page 19th-century OCR/translation HTML, in ways that
  don't crash — they merge content under the wrong citation. Surfacing
  that for manual review beats both blind trust and blind exclusion.
- **Passage identity (`corpus_uri`) is separate from storage identity
  (`id`).** Keeps citations stable if the passage ever needs to be
  re-ingested/re-embedded, and is what any future public URL scheme
  should be built from directly.

## Outstanding handoff steps (blocking the pilot going live)

Needs the project owner's credentials — nothing here can be completed
without them:

1. Run `somnus-data-ingestion/docs/migrations/2026-09-11_corpus_passages.sql`
   against the shared Supabase project (SQL editor; no migration tooling
   wired up yet — worth revisiting, see that repo's conversation history:
   `supabase/migrations/` is the idiomatic location, but the current
   `.gitignore` blanket-excludes `/supabase`, so migrations never end up
   tracked in git today).
2. `pnpm db:types` in `somnus-data-ingestion` afterward.
3. Get a Voyage AI key; add `VOYAGE_API_KEY` to both repos' `.env` (see
   each repo's `.env.example`).
4. `python3 ingestion/embed.py --skip-flagged` here, to load the verified
   subset of Suetonius.
5. Spot-check the flagged chapters (`Suetonius, Augustus 101` especially)
   before trusting citations from them; re-run `embed.py` without
   `--skip-flagged` for whichever get manually fixed.

## Cost reality check (so this doesn't become a blocker later)

Scaling the pilot's per-byte ratios to the full 73-text, ~45MB intake
gives a rough estimate of ~35–40k passages, ~400–600MB total Supabase
storage (text + `vector(1024)` + HNSW index) — within Supabase's free
tier, a small fraction of Pro's included 8GB. Embedding the *entire*
intake corpus once is an estimated ~17M tokens, well under Voyage's
200M-token free allowance (`voyage-4` after that: $0.06/M). The real
recurring cost driver is Claude API calls made by whichever consumer is
generating text (e.g. `somnus-data-ingestion`'s Sonnet calls per
"Generate with AI" click) — not corpus storage or embedding.

## Explicitly not decided yet

Left for the fresh session working in this repo to pick up, per
`TODO.md`'s existing "Decisions to make"/"Open questions" sections —
nothing above should be read as having settled those:

- Which texts come after Suetonius, and in what order (the intake skews
  histories/biography — no Ovid, Pausanias filed as a travel guide — so
  mythography-dependent consumers like a "chat with Plato" or
  deity-coverage use case need different source texts than the
  emperors-focused pilot did).
- The actual API/query shape for the timeline, geo-extraction, and
  chatbot use cases — only the underlying retrieval primitive
  (`match_corpus_passages`-equivalent, scoped + ranked passage fetch) is
  established, not how each consumer should call it.
- Whether/when to build `corpus-service` for real (see trigger condition
  above).
- Original-language (Greek/Latin) text alongside translations — still
  untouched, all pilot work is English-translation-only.
