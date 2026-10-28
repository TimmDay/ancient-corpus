# Links can point at a Sentence and ask for a language

Apps such as coin-cabinet store links into the corpus, so the link format is a contract we cannot take back. Two additions to it:

- **A Sentence**: `#9.2@3` lands on Sentence 3 of Passage 9.2, and `#9.2@3-7` on Sentences 3 to 7. Sentence numbers are counted on the fly in whichever Edition the link lands in. They are not canonical and differ between Editions, because a translator splits sentences differently from the original. A link without `@` still means the whole Passage.
- **A language**: `?lang=en` asks for an Edition in that language. Without it a link lands in the preferred Edition, normally the original language; if the Work has no Edition in the language asked for, it lands there too. An app that wants English asks for it.

## Considered Options

- **`#9.2.3` for a Sentence.** Already taken: a Locator more precise than the Edition (`72.3.2`, a Boissevain section) falls back to its Passage.
- **Sentence numbers stored with each Passage**, so they could never move. The texts are finished and do not change; only a change to the sentence splitter could renumber them, and a snapshot test of every published Passage's Sentence count catches that more cheaply.
- **A language as a path segment** (`/eutropius/breviarium/en/`). It needs a generated page or redirect per Work and language, and could collide with an Edition's slug. A query parameter works on a static site with no server.
- **English as the default.** It would make a link's meaning depend on which translations happen to exist; the original is the one Edition every Work will have.

## Consequences

- Switching Edition from a Sentence link keeps the Passage and drops the Sentence, with a note saying so.
- The splitter's output for published Editions is pinned by a snapshot test; changing it is a deliberate, reviewed change.
