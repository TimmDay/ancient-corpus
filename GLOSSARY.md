# Ancient corpus

A public reading reference of ancient texts: the full text of each Work, which other apps link into at a given Locator. The corpus is the authority for which Works exist and what they are called.

## Language

**Work**:
A citable text identified by its author and title (e.g. Eutropius, *Breviarium historiae Romanae*), one per text regardless of language.
_Avoid_: Book, source, text (for the whole thing)

**Edition**:
One published form of a Work, in one language: the original text or a particular translation. A Work may have several.
_Avoid_: Translation, version, copy

**Locator**:
The position inside a Work, written the way that Work is conventionally cited (e.g. `9.9`, `Augustus 3`, a range `9.9–10`). Each Passage has exactly one canonical Locator; every other spelling is a Locator alias. In a collection of Lives the Locator starts with the subject's name, without "Life of" (`Augustus 5`, `Aurelian 25.3`). Where a book starts its chapter numbers again, the second run is named in brackets after the chapter (`80.1(Alexander)`), and so is a second version of chapters already given (`60.32(epitome)`).
_Avoid_: Citation (for this part alone), page, passage reference

**Passage**:
The text at one Locator that an Edition actually marks: the finest unit a link can land on and highlight. Passages appear in the order the translator printed them, even where that is not number order. A Passage the translator prints in more than one place, interrupted by other chapters, is still one Passage at one Locator.
_Avoid_: Chunk, segment, section (as a generic term)

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
