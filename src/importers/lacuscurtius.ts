// Texts transcribed by Bill Thayer on LacusCurtius
// (penelope.uchicago.edu/Thayer), saved page by page into one intake zip.
//
// Every page marks chapters as <a class="chapter" name="N"> and sections as
// <a class="sec" name="N.M">, usually inside a paragraph. Passages are chapters:
// a section Locator such as `Three Gordians 30.8` lands on its chapter. Print
// page numbers (<span class="pagenum">) and the flag links between the English
// and Latin pages are dropped. The editor's notes follow <hr class="endnotes">,
// each opened by <a class="note" id="noteN">; references in the text are
// <a class="ref">. Notes restart on every page, so they are renumbered through
// the Edition, each keeping the number LacusCurtius shows (continued through a
// Life of several pages). Bill Thayer's own notes (<div class="mynote">) are
// kept with the note they follow, marked as his.

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { load, type CheerioAPI } from "cheerio"
import type { AnyNode, Element } from "domhandler"
import { unzipSync } from "fflate"
import {
  INTAKE_DIR,
  type Division,
  type EditionSource,
  type Heading,
  type ImportedEdition,
  type IntakeArchive,
  type Passage,
} from "../corpus.ts"
import { notesFor } from "./eutropius.ts"
import { inlineHtml, onlyArchive, plainText } from "./gutenberg.ts"

type Draft = Omit<Passage, "flags">

/** A division of a Work and the pages that hold it, by path under the Work's folder. */
type Part = { locator: string; pages: string[] }

/** The Lives of the Historia Augusta in Magie's order, by canonical Locator name. */
const HISTORIA_AUGUSTA: Part[] = [
  { locator: "Hadrian", pages: ["Hadrian/1", "Hadrian/2"] },
  { locator: "Aelius", pages: ["Aelius"] },
  { locator: "Antoninus Pius", pages: ["Antoninus_Pius"] },
  {
    locator: "Marcus Aurelius",
    pages: ["Marcus_Aurelius/1", "Marcus_Aurelius/2"],
  },
  { locator: "Verus", pages: ["Lucius_Verus"] },
  { locator: "Avidius Cassius", pages: ["Avidius_Cassius"] },
  { locator: "Commodus", pages: ["Commodus"] },
  { locator: "Pertinax", pages: ["Pertinax"] },
  { locator: "Didius Julianus", pages: ["Didius_Julianus"] },
  { locator: "Septimius Severus", pages: ["Septimius_Severus"] },
  { locator: "Pescennius Niger", pages: ["Pescennius_Niger"] },
  { locator: "Clodius Albinus", pages: ["Clodius_Albinus"] },
  { locator: "Caracalla", pages: ["Caracalla"] },
  { locator: "Geta", pages: ["Geta"] },
  { locator: "Macrinus", pages: ["Macrinus"] },
  { locator: "Diadumenianus", pages: ["Diadumenianus"] },
  { locator: "Elagabalus", pages: ["Elagabalus/1", "Elagabalus/2"] },
  {
    locator: "Severus Alexander",
    pages: [
      "Severus_Alexander/1",
      "Severus_Alexander/2",
      "Severus_Alexander/3",
    ],
  },
  { locator: "Two Maximini", pages: ["Maximini_duo"] },
  { locator: "Three Gordians", pages: ["Gordiani_tres"] },
  { locator: "Maximus and Balbinus", pages: ["Maximus_et_Balbinus"] },
  { locator: "Two Valerians", pages: ["Valeriani_duo"] },
  { locator: "Two Gallieni", pages: ["Gallieni_duo"] },
  { locator: "Thirty Pretenders", pages: ["Tyranni_XXX"] },
  { locator: "Claudius", pages: ["Claudius"] },
  { locator: "Aurelian", pages: ["Aurelian/1", "Aurelian/2", "Aurelian/3"] },
  { locator: "Tacitus", pages: ["Tacitus"] },
  { locator: "Probus", pages: ["Probus"] },
  { locator: "Four Pretenders", pages: ["Firmus_et_al"] },
  { locator: "Carus", pages: ["Carus_et_al"] },
]

const WORKS: Record<string, { folder: string; parts: Part[] }> = {
  "Historia Augusta": {
    folder: "Roman/Texts/Historia_Augusta",
    parts: HISTORIA_AUGUSTA,
  },
}

export function importLacusCurtius(
  source: EditionSource,
  work: string,
  language: string,
): ImportedEdition {
  const config = WORKS[work]
  if (!config) throw new Error(`No LacusCurtius layout for ${work}`)
  const pages = readIntakePages(onlyArchive(source))
  const prefix = language === "la" ? "L" : "E"
  const divisions: Division[] = []
  const passages: Draft[] = []
  let nextNoteId = 1

  for (const part of config.parts) {
    divisions.push({ locator: part.locator, label: part.locator })
    let opened = false
    // Notes restart on each web page; through a Life of several pages they go on.
    const before = { numbered: 0, lettered: 0 }
    for (const page of part.pages) {
      const file = `pages/${prefix}/${config.folder}/${page}.html`
      const $ = pages.get(file)
      if (!$) throw new Error(`${file} is not in the intake archive`)
      const read = readPage($, part.locator, nextNoteId, before)
      nextNoteId += read.notes.size
      for (const passage of read.passages) {
        passage.notes = notesFor(passage.blocks.join(" "), read.notes).map(
          (note) => ({ ...note, label: read.labels.get(note.id) ?? note.id }),
        )
        // A chapter cut by the end of a page goes on at the top of the next.
        const previous = passages.at(-1)
        if (previous?.locator === passage.locator) {
          previous.blocks.push(...passage.blocks)
          previous.notes.push(...passage.notes)
          previous.text = plainText(previous.blocks.join(" "))
          continue
        }
        passage.text = plainText(passage.blocks.join(" "))
        if (!opened)
          passage.headings.unshift({
            kind: "division",
            html: part.locator,
            editorial: false,
          })
        opened = true
        passages.push(passage)
      }
    }
  }
  return { divisions, passages, editorial: [] }
}

export function readPage(
  $: CheerioAPI,
  division: string,
  firstNoteId: number,
  /** Notes on earlier pages of the same Life, counted on and updated. */
  before = { numbered: 0, lettered: 0 },
): {
  passages: Draft[]
  notes: Map<string, string>
  /** The number each note shows, by id. */
  labels: Map<string, string>
} {
  const noteIds = new Map<string, string>()
  const idFor = (n: string) => {
    let id = noteIds.get(n)
    if (!id) {
      id = String(firstNoteId + noteIds.size)
      noteIds.set(n, id)
    }
    return id
  }
  const options = {
    // A note referred to twice has a second ref id ("ref18bis"); its link says which note.
    noteRef: (el: Element) =>
      el.name === "a" && /\bref\d*\b/.test(el.attribs.class ?? "")
        ? idFor(
            /#note([^\s"]+)\s*$/.exec(el.attribs.href ?? "")?.[1] ??
              (el.attribs.id ?? "").replace(/^ref/, ""),
          )
        : undefined,
    drop: (el: Element) => {
      const classes = el.attribs.class ?? ""
      return (
        /\b(sec|pagenum|chapter)\b/.test(classes) ||
        (el.name === "a" && $(el).find("img").length > 0)
      )
    },
  }

  const passages: Draft[] = []
  let pending: Heading[] = []
  const body = $("h1").first().nextUntil("hr.endnotes").toArray()
  for (const el of body) {
    if (el.type !== "tag") continue
    if (/^h[2-6]$/.test(el.name)) {
      const html = clean(inlineHtml($, $(el).contents(), options))
      if (plainText(html))
        pending.push({ kind: "section", html, editorial: false })
      continue
    }
    if (/^\(For the beginning of chapter/.test($(el).text().trim())) continue
    // A chapter can open part way through a paragraph: the paragraph is cut there.
    const runs: { chapter?: string; nodes: AnyNode[] }[] = [{ nodes: [] }]
    for (const node of $(el).contents().toArray()) {
      const anchor =
        node.type === "tag" && /\bchapter\b/.test(node.attribs.class ?? "")
          ? node
          : $(node).find("a.chapter").get(0)
      const chapter = anchor && chapterNumber($, anchor)
      if (chapter) runs.push({ chapter, nodes: [] })
      runs.at(-1)?.nodes.push(node)
    }
    for (const run of runs) {
      const html = clean(inlineHtml($, $(run.nodes), options))
      if (run.chapter) {
        passages.push({
          locator: `${division} ${run.chapter}`,
          headings: pending,
          division,
          blocks: [],
          notes: [],
          text: "",
        })
        pending = []
      }
      if (plainText(html)) passages.at(-1)?.blocks.push(html)
    }
  }

  const notes = new Map<string, string>()
  const labels = new Map<string, string>()
  for (const anchor of $("hr.endnotes ~ * a.note, hr.endnotes ~ a.note")
    .toArray()
    .filter((a) => a.type === "tag")) {
    const n = (anchor.attribs.id ?? "").replace(/^note/, "")
    const body: AnyNode[] = []
    const thayer: AnyNode[] = []
    for (let node = anchor.next; node; node = node.next) {
      if (node.type === "tag" && /\bnote\b/.test(node.attribs.class ?? ""))
        break
      ;(isThayerNote(node) ? thayer : body).push(node)
    }
    // Thayer's own notes follow the paragraph of the note they comment on.
    for (let node = anchor.parent?.next; node; node = node.next) {
      if (isThayerNote(node)) thayer.push(node)
      else if (node.type === "tag") break
    }
    const id = idFor(n)
    // Magie's notes are numbered; Thayer's own are lettered ("a", "b") and wholly his.
    const numbered = /^\d+$/.test(n)
    const letter = $(anchor).text().trim()
    labels.set(
      id,
      numbered
        ? String(before.numbered + Number(n))
        : lettered(before.lettered + letter.charCodeAt(0) - 96),
    )
    const own = clean(inlineHtml($, $(body), options))
    notes.set(
      id,
      [
        numbered || /^Thayer/.test(own)
          ? own
          : `<span class="thayer">Thayer's note: ${own}</span>`,
        ...thayer.map(
          (node) =>
            `<span class="thayer">${clean(inlineHtml($, $(node).contents(), options))}</span>`,
        ),
      ].join(" "),
    )
  }
  for (const label of noteIds.keys())
    if (/^\d+$/.test(label)) before.numbered++
    else before.lettered++
  return { passages, notes, labels }
}

/** The chapter an anchor opens: its name, or on some pages only its text ("(37)" where a page goes on with a chapter). */
function chapterNumber($: CheerioAPI, anchor: Element): string | undefined {
  const number = (anchor.attribs.name ?? $(anchor).text()).replace(
    /[()\s]/g,
    "",
  )
  return /^\d+[a-z]?$/.test(number) ? number : undefined
}

/** 1 → "a", 26 → "z", 27 → "aa". */
function lettered(n: number): string {
  return n > 26
    ? lettered(Math.floor((n - 1) / 26)) + lettered(((n - 1) % 26) + 1)
    : String.fromCharCode(96 + n)
}

/** Bill Thayer's own note on LacusCurtius ("Thayer's Note: …"), not part of the printed Edition. */
function isThayerNote(node: AnyNode): boolean {
  return node.type === "tag" && /\bmynote\b/.test(node.attribs.class ?? "")
}

/** Drops the soft hyphens and word joiners LacusCurtius uses for line breaking. */
function clean(html: string): string {
  return html.replace(/[\u00ad\u2060]/g, "").trim()
}

/** Reads every page from one unchanged intake zip, refusing a zip whose checksum moved. */
export function readIntakePages(
  intake: IntakeArchive,
): Map<string, CheerioAPI> {
  const archive = readFileSync(path.join(INTAKE_DIR, intake.file))
  const sha256 = createHash("sha256").update(archive).digest("hex")
  if (sha256 !== intake.sha256) {
    throw new Error(
      `${intake.file}: checksum ${sha256} does not match the manifest's ${intake.sha256}`,
    )
  }
  const files = unzipSync(new Uint8Array(archive), {
    filter: (f) => f.name.endsWith(".html"),
  })
  return new Map(
    Object.entries(files).map(([name, bytes]) => [
      name,
      load(new TextDecoder().decode(bytes)),
    ]),
  )
}
