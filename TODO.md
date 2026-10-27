# Ancient Sources RAG Chatbot — Living TODO

Last updated: 2026-08-05

## Your next actions

- [x] Copy all candidate ZIP files, still zipped and with their original filenames, into `/Users/timday/Documents/src/ancient-corpus/data/intake/` (73 ZIPs, approximately 50 MB).
- [x] Treat `data/intake/` as immutable input: inventory tools may read candidates but must not rename, modify, or delete them.
- [ ] Preserve any accompanying download URLs, rights/licence notices, or repository metadata.
- [x] Have Codex inventory the candidate collection and produce a machine-readable intake manifest.
- [ ] Review the inventory for duplicates, multiple volumes, editions/translations, missing metadata, and unsuitable formats.
- [ ] Select a small representative importer-validation set after inventorying the collection; do not manually choose only by title.
- [ ] Decide whether Project Gutenberg ebook 18047 is a pilot source or only an importer example.
- [ ] If ebook 18047 is included, decide whether to include only the translated ancient material or also index Foster's introduction/editorial material as a separate collection.
- [ ] Choose the initial audience: personal research, teaching, public use, or some combination.
- [ ] Decide whether the MVP is English-translation-only or includes original Greek/Latin alongside translations.
- [ ] Decide whether the chatbot initially uses only primary texts or may also search separately labelled secondary/editorial material.
- [ ] Name any external applications or client types that should access the corpus first; otherwise the default will be a public versioned HTTP API plus an MCP adapter for AI clients.

### What to send with each pilot source

- Work and ancient author.
- File or download URL.
- Edition/editor and translator, if known.
- Publication date, if known.
- Language.
- Source repository or website.
- Rights/licence statement shown by the source.
- Any preferred citation convention.

## Candidate corpus intake and triage

- [x] Inventory every candidate without attempting full ingestion: path, filename, size, checksum, format, encoding, title, author, language, edition/editor, translator, source, rights, and structural signals.
- [x] Group exact duplicates by checksum, probable duplicates by digital source ID, and multi-file series by normalized work key.
- [x] Produce preliminary low-confidence classifications for works, volumes, translations/editions, scripture, late-antique Christian sources, legal sources, and modern derivative material; retain human confirmation as a separate task.
- [x] Flag archive corruption, unsafe paths, encryption, suspicious compression, missing metadata, weak citation structure, possible OCR/encoding issues, composite/partial scope signals, and ancillary material.
- [x] Score candidates for technical ingestion readiness; do not treat the automated score as a judgment of rights clearance or scholarly merit.
- [x] Choose a representative validation batch covering difficult structures and a negative corrupt-archive fixture.
- [ ] Build and verify importers against that validation batch before processing the rest.
- [ ] Batch-ingest all candidates that pass validation; quarantine failures with machine-readable error reports rather than silently omitting content.
- [x] Produce a generated intake report with ready-with-importer, duplicate, deferred, and needs-review counts.
- [ ] Require manual spot checks of passage boundaries, attribution, and citations before publishing each corpus release.

### Inventory snapshot (2026-08-05)

- [x] Inventory 73 candidate archives (44.5 MiB): 72 readable ZIPs and one corrupt ZIP.
- [x] Confirm zero exact checksum duplicates and zero duplicate Project Gutenberg source IDs.
- [x] Detect eight multi-file series groups.
- [x] Generate `ingestion/manifests/intake-inventory.json` and `docs/intake-report.md`.
- [x] Add a reproducible read-only inventory script and five passing safety/metadata/duplicate tests.
- [ ] Replace or re-download corrupt `data/intake/Procopius-BuildingsOfJustinian-architecture.zip`.
- [ ] Review the three metadata-flagged candidates: King James Bible, *Institutes of Justinian*, and *Pistis Sophia*.
- [ ] Review the seven structure-flagged candidates listed in `docs/intake-report.md`.
- [ ] Human-confirm the eight series groups and all automated content-category suggestions.
- [ ] Human-confirm edition, translator, rights, attribution, completeness, and citation conventions before accepting any candidate for publication.

## Product goal

Build a chatbot for asking evidence-grounded questions about ancient-world primary texts (for example Tacitus, Herodotus, and Josephus), with precise citations and a clear distinction between what the source says and what the model infers.

## Confirmed requirements

- [x] Treat the corpus/retrieval service and RAG chatbot as separate components.
- [x] Store a controlled local copy of every source edition used by the system.
- [x] Use stable, human-readable passage citations.
- [x] Make citations clickable from the chat UI.
- [x] Open citations in a new browser tab on a simple HTML passage page.
- [x] Highlight the cited passage or range on that page.
- [x] Design the corpus for reuse by applications beyond the initial RAG chatbot.
- [x] Begin with a three-text pilot corpus selected and sourced by the project owner.

## Decisions to make

- [ ] Choose the initial audience: personal research tool, teaching aid, or public scholarly product.
- [ ] Record the selected three pilot texts and their editions/translations.
- [ ] Confirm copyright/licensing and preserve edition/translator metadata.
- [ ] Decide whether the first release supports English only or aligned original-language text.
- [ ] Decide whether answers may use secondary scholarship or only the selected primary corpus.
- [ ] Choose deployment target and privacy requirements.
- [ ] Decide whether to ship the MCP adapter with the MVP or immediately after the corpus HTTP API is stable.
- [ ] Revisit splitting the corpus service and chatbot into separate Git repositories if they acquire independent teams, permissions, release schedules, or external consumers.

## Repository strategy

- [x] Start with one Git repository containing separately deployable corpus-service and chatbot applications.
- [x] Initialize the project Git repository at `/Users/timday/Documents/src/ancient-corpus` (empty repository, `main` branch, no commits yet).
- [x] Move/copy the living project TODO into the new repository when scaffolding begins, then use that tracked copy as the source of truth.
- [x] Add an initial `.gitignore` before placing any corpus candidates in or beneath the project directory.
- [x] Create the initial monorepo directories for applications, shared packages, ingestion code, manifests, documentation, tests, and local data mounts.
- [ ] Commit the project README, this TODO, initial architecture notes, corpus manifest schema, and safe placeholder directories.
- [ ] Connect a private remote repository and enable basic branch protection/backups when ready.
- [ ] Define the corpus API contract in a shared package/schema and test both applications against it.
- [ ] Give each application its own dependency manifest, tests, environment configuration, container definition, and deployment pipeline.
- [ ] Keep large downloaded texts, generated indexes, embeddings, and databases out of ordinary Git.
- [ ] Commit small corpus manifests, ingestion code, schemas, migrations, fixtures, and checksums to Git.
- [ ] Choose durable corpus artifact storage (local development directory plus object storage or versioned data storage for deployment).
- [ ] Add CI path filters so changes only test/deploy affected applications where practical.

## Candidate source assessment

### Project Gutenberg ebook 18047 (provided example)

- [x] Confirm archive integrity; ZIP contains `pg18047-images.html` and a cover image.
- [x] Identify the work as *Dio's Rome, Volume 1 (of 6)*, translated by Herbert Baldwin Foster; English; Project Gutenberg ebook 18047.
- [x] Record the supplied archive SHA-256: `5b7facb9caaae69c8456774c1ebaee9484d3b5ea5fa72340f5a11d5cd8ae2d4c`.
- [x] Confirm that useful Dublin Core metadata is embedded in the HTML.
- [x] Note that this volume is composite: front matter, scholarly introduction, Zonaras's epitome of Dio's lost Books 1–21, and fragments assigned to Books 22–35.
- [x] Note that its references mix Boissevain book numbers, Zonaras book/chapter markers, fragment numbers, print page anchors, dates, and footnotes.
- [ ] Decide whether this example will be one of the three pilot sources or only an importer test fixture.
- [ ] Verify reuse rights for every jurisdiction where the corpus will be distributed; retain the Gutenberg rights notice and source metadata.
- [ ] Build an HTML importer that removes Gutenberg boilerplate while preserving source metadata and front/back-matter boundaries.
- [ ] Classify passages by textual status and attributed source (`dio`, `zonaras_epitome_of_dio`, or named fragment source) rather than attributing all prose directly to Dio.
- [ ] Parse Boissevain book headings, embedded Zonaras references, fragment labels, print page markers, footnotes, dates, small-caps fragment text, and lacunae.
- [ ] Detect and report missing or irregular headings instead of silently inventing continuity (the HTML jumps from a Book 2 heading to Book 4).
- [ ] Generate our own stable segment IDs; use Gutenberg page/anchor IDs only as source locators, not canonical corpus identifiers.
- [ ] Exclude or separately index editorial introduction, bibliography, contents, licence, and other non-primary-text material.
- [ ] Validate extracted passages and citation mappings against a manually reviewed sample before indexing.

## MVP

### Corpus technical decisions

- [ ] Choose the canonical normalized representation (recommended: passage records in PostgreSQL, with TEI/XML or source-native files retained as raw artifacts).
- [ ] Define the identity model for author, work, textual location, edition, translation, and passage range.
- [ ] Decide whether canonical passage identity is edition-independent, and how editions with incompatible section boundaries are mapped.
- [ ] Define permanent public URL and URI schemes for works, editions, passages, and passage ranges.
- [ ] Select the finest addressable unit (section, sentence, paragraph, or token span) and rules for stable highlighting.
- [ ] Define the metadata schema, required fields, controlled vocabularies, and validation rules.
- [ ] Choose an ingestion interface for the pilot formats (for example TEI XML, Perseus XML, HTML, EPUB, or plain text).
- [ ] Define normalization rules for Unicode, whitespace, notes, headings, lacunae, editorial marks, and footnotes.
- [ ] Decide how variant spellings, transliterated names, abbreviations, and aliases will be represented.
- [ ] Choose primary storage and backup/versioning for raw and normalized corpus artifacts.
- [ ] Choose the operational database and search engine (recommended starting point: PostgreSQL with full-text search and vector support).
- [ ] Select embedding and reranking models, while keeping generated indexes replaceable and versioned.
- [ ] Define the public HTTP API style, pagination, filtering, error format, and machine-readable API specification.
- [ ] Define API versioning and compatibility policy for future third-party applications.
- [ ] Decide which endpoints are public, authenticated, or rate-limited.
- [ ] Define corpus release versions and immutable identifiers so external applications can reproduce results.
- [ ] Define update/deprecation behavior if metadata or passage boundaries must be corrected.
- [ ] Choose licensing display and machine-readable rights fields for each edition.
- [ ] Establish backups, integrity checks, observability, and rebuild/disaster-recovery procedures.
- [ ] Decide whether bulk dataset downloads will be offered in addition to HTTP and MCP access.
- [ ] Define performance targets for passage lookup, search latency, corpus size, and concurrent clients.

### Corpus and ingestion

- [ ] Acquire machine-readable source texts from reputable, legally reusable editions.
- [ ] Preserve downloaded source files unchanged in versioned raw-source storage.
- [ ] Store normalized text separately from raw source files.
- [ ] Normalize encoding while preserving structural divisions (author, work, book, chapter, section, paragraph).
- [ ] Store canonical passage identifiers and source URLs/bibliographic metadata.
- [ ] Keep original text, translation, edition, translator, language, and date as explicit metadata.
- [ ] Chunk by textual structure first, with limited overlap; do not split blindly by token count.
- [ ] Build a repeatable ingestion/indexing pipeline with corpus versioning and content hashes.
- [ ] Make imports reproducible from a corpus manifest containing source URL, license, retrieval date, checksum, and edition ID.

### Retrieval

- [ ] Implement hybrid retrieval: full-text/BM25 plus embeddings.
- [ ] Add metadata filters for author, work, book, language, edition, and date.
- [ ] Add reranking after initial retrieval.
- [ ] Return neighboring passages so quotations retain context.
- [ ] Support direct citation lookup (for example, `Tacitus, Annals 15.44`).
- [ ] Make retrieval results inspectable in the UI.

### Chat and evidence

- [ ] Require every substantive claim to cite one or more retrieved passages.
- [ ] Render citations as stable, clickable passage references.
- [ ] Show quoted evidence and edition/translator details alongside answers.
- [ ] Instruct the model to say when the corpus does not support an answer.
- [ ] Visually distinguish quotation, paraphrase, and model inference.
- [ ] Preserve conversation context without letting earlier unsupported claims become evidence.

### Evaluation

- [ ] Create a small expert-reviewed question set covering lookup, synthesis, ambiguity, and unanswerable questions.
- [ ] Measure retrieval recall separately from answer quality.
- [ ] Test citation correctness and whether quotations actually entail claims.
- [ ] Include adversarial tests for names, variant spellings, chronology, and conflicting accounts.

### Application

- [ ] Build a simple chat UI with corpus/author/work filters.
- [ ] Add a passage reader and citation side panel.
- [ ] Define permanent passage URLs, for example `/texts/tacitus/annals/15/44`.
- [ ] Support passage-range fragments/query parameters, for example `#p3-p5`, without making them part of the passage identity.
- [ ] Render semantic HTML with stable element IDs for every addressable passage.
- [ ] Open citation links in a new tab with safe external-link attributes.
- [ ] Highlight the cited element or range and scroll it into view.
- [ ] Include work, edition, translator, language, and canonical citation on every passage page.
- [ ] Add canonical URL handling and redirects so reorganizing the application does not break saved citations.
- [ ] Record corpus/index/model versions with each answer for reproducibility.
- [ ] Add feedback controls for incorrect retrieval, citation, or interpretation.

## Corpus service and MCP adapter

- [ ] Build one corpus service as the source of truth for passage lookup, search, metadata, and citation resolution.
- [ ] Give the chatbot access to the corpus service through an ordinary typed HTTP/internal API.
- [ ] Keep the MCP server as a thin adapter over the same corpus service; do not duplicate the corpus or retrieval logic inside it.
- [ ] If interoperability is valuable, expose read-only MCP tools such as `search_passages`, `get_passage`, `get_context`, and `list_editions`.
- [ ] Expose stable texts and corpus metadata as MCP resources/resource templates with canonical URIs.
- [ ] Return structured results containing passage ID, text, author, work, location, edition, translator, language, score, and source URL.
- [ ] Add rate limits, result-size limits, logging, and input validation before remote deployment.
- [ ] Test the server with more than one MCP client before treating interoperability as achieved.

## Later features

- [ ] Parallel original-language and translation views.
- [ ] Lemma/morphology-aware search for Greek and Latin.
- [ ] Named-entity authority records and aliases across languages/translations.
- [ ] Compare accounts of the same event across authors.
- [ ] Timeline, map, and prosopography views.
- [ ] User annotations, saved passages, and shareable research trails.
- [ ] Optional secondary-source index clearly separated from primary evidence.
- [ ] Export answers and citations to Markdown/BibTeX/Zotero-compatible formats.

## Open questions for our next discussion

- Is this primarily for your own research, a class, or public users?
- Which three works and exact editions/translations will form the pilot corpus?
- Do you need Greek/Latin originals in the first version?
- Which external applications or client types should the first public corpus API support?
- Do you already have preferred text repositories or editions?

## Notes / current recommendation

- Build the corpus and retrieval system as an ordinary application service first, with durable raw files, normalized records, search indexes, and public passage pages.
- The MCP server should expose the corpus service, not contain or own it. MCP complements the RAG pipeline; it does not replace storage, ingestion, indexing, retrieval, reranking, citation handling, or evaluation.
- Both the web chatbot and MCP adapter should return the same canonical passage IDs and public citation URLs.
- Favor passage-level scholarly identifiers and transparent editions over generic document chunks.
