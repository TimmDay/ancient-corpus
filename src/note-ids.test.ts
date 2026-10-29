import { describe, expect, it } from "vitest"
import type { EditionText, Passage } from "./corpus.ts"
import { noteRefHtml } from "./importers/gutenberg.ts"
import { nameNotes } from "./note-ids.ts"

const passage = (
  locator: string,
  division: string,
  notes: { id: string; label?: string }[],
): Passage => ({
  locator,
  division,
  headings: [],
  blocks: [notes.map((n) => `Text${noteRefHtml(n.id, n.label)}`).join(" ")],
  notes: notes.map((n) => ({ ...n, html: `Note ${n.id}` })),
  text: "",
  flags: [],
})

const text = (passages: Passage[]): EditionText => ({
  divisions: [],
  passages,
  editorial: [],
})

describe("nameNotes", () => {
  it("names a note by Edition, division and printed number, and shows only the number in the text", () => {
    const [named] = nameNotes(
      text([
        passage("Clodius Albinus 1", "Clodius Albinus", [
          { id: "1186", label: "1" },
        ]),
      ]),
      "magie",
    ).passages
    expect(named?.notes).toEqual([
      { id: "magie-clodius-albinus-1", label: "1", html: "Note 1186" },
    ])
    expect(named?.blocks[0]).toBe(
      'Text<sup class="nref"><a href="#n-magie-clodius-albinus-1" id="r-magie-clodius-albinus-1">1</a></sup>',
    )
  })

  it("uses the id as the number when the importer's ids are the printed numbers", () => {
    const [named] = nameNotes(
      text([passage("9.2", "9", [{ id: "171" }])]),
      "hazzard-1898",
    ).passages
    expect(named?.notes[0]?.id).toBe("hazzard-1898-9-171")
  })

  it("refuses two notes that would share an id", () => {
    expect(() =>
      nameNotes(
        text([
          passage("72.1", "72", [{ id: "1", label: "3" }]),
          passage("72.2", "72", [{ id: "2", label: "3" }]),
        ]),
        "foster",
      ),
    ).toThrow("Two notes would both be foster-72-3")
  })
})
