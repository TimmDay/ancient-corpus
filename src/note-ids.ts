// Note ids: `<edition>-<division>-<number>`, e.g. `magie-clodius-albinus-1`,
// where the number is the one the Edition prints. The reference in the text
// shows only the number; the note itself is labelled with the whole id.

import type { EditionText, Note } from "./corpus.ts"
import { noteRefHtml } from "./importers/gutenberg.ts"

const NOTE_REF =
  /<sup class="nref"><a href="#n-([^"]+)" id="r-\1">[^<]*<\/a><\/sup>/g

/** `Clodius Albinus` → `clodius-albinus`, `80(Alexander)` → `80-alexander`. */
export function idPart(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

/** Gives every Note its Edition-wide id, refusing two notes that would share one. */
export function nameNotes(text: EditionText, edition: string): EditionText {
  const owners = new Map<string, string>()
  const rename = (notes: Note[], within: string) => {
    const renamed = new Map<string, Note>()
    for (const note of notes) {
      const label = note.label ?? note.id
      const id = [idPart(edition), idPart(within), idPart(label)].join("-")
      const owner = owners.get(id)
      if (owner !== undefined && owner !== `${within}/${note.id}`)
        throw new Error(
          `Two notes would both be ${id}: give the importer the printed numbers`,
        )
      owners.set(id, `${within}/${note.id}`)
      renamed.set(note.id, { id, html: note.html, label })
    }
    const refs = (html: string) =>
      html.replace(NOTE_REF, (ref, old: string) => {
        const note = renamed.get(old)
        return note ? noteRefHtml(note.id, note.label) : ref
      })
    return { notes: [...renamed.values()], refs }
  }

  return {
    divisions: text.divisions,
    passages: text.passages.map((passage) => {
      const { notes, refs } = rename(passage.notes, passage.division)
      return { ...passage, notes, blocks: passage.blocks.map(refs) }
    }),
    editorial: text.editorial.map((section) => {
      const { notes, refs } = rename(section.notes, section.id)
      return { ...section, notes, html: refs(section.html) }
    }),
  }
}
