# Ancient corpus

A public reading reference of ancient texts: the full text of each Work, which other apps link into at a given Locator. The corpus is the authority for which Works exist and what they are called.

## Language

**Work**:
A citable text identified by its author and title (e.g. Eutropius, *Breviarium historiae Romanae*), one per text regardless of language.
_Avoid_: Book, source, text (for the whole thing)

**Edition**:
One published form of a Work, in one language: the original text or a particular translation, including one this project makes itself where no free translation exists. A Work may have several. One is preferred, normally one in the language the Work was written in: a link that names no language lands there, and a link that asks for a language the Work has no Edition in lands there too.
_Avoid_: Translation, version, copy

**Locator**:
The position inside a Work, written the way that Work is conventionally cited (e.g. `9.9`, `Augustus 3`, a range `9.9–10`). Each Passage has exactly one canonical Locator; every other spelling is a Locator alias. In a collection of Lives the Locator starts with the subject's name, without "Life of" (`Augustus 5`, `Aurelian 25.3`). Where a book starts its chapter numbers again, the second run is named in brackets after the chapter (`80.1(Alexander)`), and so is a second version of chapters already given (`60.32(epitome)`).
_Avoid_: Citation (for this part alone), page, passage reference

**Passage**:
The text at one Locator that an Edition actually marks: the finest unit a link can land on and highlight.
_Avoid_: Chunk, segment, section (as a generic term)

**Sentence**:
A grammatical sentence within a Passage of one Edition, numbered from 1 in the order the Edition prints them. Its number is not canonical: it only lets a link point at part of a Passage in that Edition (`9.2@3`, or a run `9.2@3-7`). A Sentence link is read in whichever Edition the link lands in.
_Avoid_: Line, clause, verse (for this)

**Finding**:
A Passage, or Sentences within it, returned for a question, with a note on why it is relevant to that question.
_Avoid_: Hit, match, result (for this), chunk

**Coverage**:
The Works that have an Edition in the corpus, and so can be searched. An answer states its Coverage, so a Work not yet in the corpus is not mistaken for silence in the sources.
_Avoid_: Scope, index (for this)

**Period covered**:
The span of years whose events a Work narrates, as distinct from when it was written; each of its divisions can have its own (Dio's Book 79 covers 217 to 218).
_Avoid_: Date, era, timeframe

**Editorial matter**:
Content of an Edition that is not the Work's own text (a translator's introduction, a commentary, a vocabulary). It has no Locator, so no link lands on it.
_Avoid_: Front matter, apparatus, extras

**Flag**:
A suspicion, raised when an Edition is imported, that a Passage does not match the printed source (it swallowed its neighbour, or ran on into Editorial matter). It is settled by checking the source, never by choosing a Locator. An Edition with unresolved Flags is not published.
_Avoid_: Warning, error, issue

**Correction**:
A recorded editorial fix to an Edition's imported Passages (a split, a merge, a text fix, or an accepted Flag with its reason). Corrections are reapplied every time the Edition is imported.
_Avoid_: Patch, override, manual edit

**Suggestion**:
A proposed answer to a Flag, found by checking the printed source, with the page it was read from and the Corrections it would make. It becomes Corrections only when the owner confirms it.
_Avoid_: Auto-fix, guess

**Locator alias**:
Another way of writing a Locator that resolves to the same Passage (e.g. `Life of Augustus 3` for `Augustus 3`).
_Avoid_: Synonym, redirect
