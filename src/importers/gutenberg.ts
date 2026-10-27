// Helpers shared by importers of Project Gutenberg HTML editions.

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { load, type Cheerio, type CheerioAPI } from "cheerio"
import type { AnyNode, Element } from "domhandler"
import { unzipSync } from "fflate"
import { INTAKE_DIR, type EditionSource } from "../corpus.ts"

/** Reads the Edition's HTML from its unchanged intake archive, refusing an archive whose checksum moved. */
export function readIntakeHtml(source: EditionSource): CheerioAPI {
  const archive = readFileSync(path.join(INTAKE_DIR, source.intakeFile))
  const sha256 = createHash("sha256").update(archive).digest("hex")
  if (sha256 !== source.sha256) {
    throw new Error(
      `${source.intakeFile}: checksum ${sha256} does not match the manifest's ${source.sha256}`,
    )
  }
  const files = unzipSync(new Uint8Array(archive), {
    filter: (f) => /\.html?$/.test(f.name),
  })
  const [name, ...others] = Object.keys(files)
  if (!name || others.length)
    throw new Error(
      `${source.intakeFile}: expected one HTML file, found ${Object.keys(files).length}`,
    )
  return load(new TextDecoder().decode(files[name]))
}

export type InlineOptions = {
  /** Turns a footnote reference into its note id, or undefined to drop it. */
  noteRef?: (el: Element) => string | undefined
  /** Elements to drop entirely (print page numbers, line numbers). */
  drop?: (el: Element) => boolean
}

const INLINE_TAGS: Record<string, string> = {
  i: "i",
  em: "i",
  cite: "i",
  b: "b",
  strong: "b",
  sup: "sup",
  sub: "sub",
}
const BLOCK_TAGS: Record<string, string> = {
  p: "p",
  blockquote: "blockquote",
  ul: "ul",
  ol: "ol",
  li: "li",
  table: "table",
  tbody: "tbody",
  tr: "tr",
  td: "td",
  th: "th",
  h3: "h4",
  h4: "h4",
  h5: "h5",
  h6: "h5",
}

/** The inner content of `nodes` as clean inline HTML: emphasis, small caps and note references only. */
export function inlineHtml(
  $: CheerioAPI,
  nodes: Cheerio<AnyNode>,
  options: InlineOptions = {},
): string {
  return nodes
    .toArray()
    .map((node) => nodeHtml($, node, options, false))
    .join("")
    .replace(/\s+/g, " ")
}

/** Like inlineHtml, but keeps paragraphs, lists, tables and sub-headings, for Editorial matter. */
export function blockHtml(
  $: CheerioAPI,
  nodes: Cheerio<AnyNode>,
  options: InlineOptions = {},
): string {
  return nodes
    .toArray()
    .map((node) => nodeHtml($, node, options, true))
    .join("")
    .replace(/[ \t\r\n]+/g, " ")
    .replace(
      /\s*(<\/?(?:p|blockquote|ul|ol|li|table|tbody|tr|td|th|h4|h5)>)\s*/g,
      "$1",
    )
    .trim()
}

function nodeHtml(
  $: CheerioAPI,
  node: AnyNode,
  options: InlineOptions,
  blocks: boolean,
): string {
  if (node.type === "text") return escapeHtml(node.data)
  if (node.type !== "tag") return ""
  const el = node
  if (
    options.drop?.(el) ||
    el.name === "img" ||
    el.name === "script" ||
    el.name === "style"
  )
    return ""

  const noteId = options.noteRef?.(el)
  if (noteId !== undefined) return noteId ? noteRefHtml(noteId) : ""

  const children = el.children
    .map((child) => nodeHtml($, child, options, blocks))
    .join("")
  const classes = (el.attribs.class ?? "").split(/\s+/)
  if (el.name === "br") return blocks ? "<br>" : " "
  if (classes.includes("smcap") || classes.includes("smcapuc"))
    return `<span class="sc">${children}</span>`
  const inline = INLINE_TAGS[el.name]
  if (inline) return `<${inline}>${children}</${inline}>`
  const block = blocks ? BLOCK_TAGS[el.name] : undefined
  if (block) return `<${block}>${children}</${block}>`
  if (blocks && el.name === "div") return `${children} `
  return children
}

/** The markup every reference to note `id` gets, so the reader can style and link it the same way everywhere. */
export function noteRefHtml(id: string): string {
  return `<sup class="nref"><a href="#n-${id}" id="r-${id}">${escapeHtml(id)}</a></sup>`
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Plain text of sanitized HTML, without note references, for search. */
export function plainText(html: string): string {
  return html
    .replace(/<sup class="nref">.*?<\/sup>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+([,.;:!?’”)])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
}

const ROMAN_VALUES: [number, string][] = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
]

export function romanToInt(roman: string): number {
  let total = 0
  let i = 0
  while (i < roman.length) {
    const match = ROMAN_VALUES.find(([, symbol]) => roman.startsWith(symbol, i))
    if (!match) throw new Error(`Not a Roman numeral: ${roman}`)
    total += match[0]
    i += match[1].length
  }
  return total
}
