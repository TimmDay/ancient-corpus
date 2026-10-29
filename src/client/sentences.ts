// Finds Sentences in a Passage on the page, by running the same splitter as
// the build over its text, without changing the page's markup.

import { sentenceSpans } from "../sentences.ts"

/**
 * DOM ranges covering Sentences `from` to `to` of a Passage, which may be
 * printed in parts; undefined when it has fewer Sentences than that.
 */
export function sentenceRanges(
  parts: HTMLElement[],
  from: number,
  to: number,
): { count: number; ranges?: Range[] } {
  // The Passage's own text: its paragraphs, without note references.
  const nodes: { node: Text; start: number }[] = []
  let text = ""
  for (const part of parts) {
    for (const paragraph of part.querySelectorAll(":scope > p")) {
      const walker = document.createTreeWalker(
        paragraph,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) =>
            node.parentElement?.closest(".nref")
              ? NodeFilter.FILTER_REJECT
              : NodeFilter.FILTER_ACCEPT,
        },
      )
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        nodes.push({ node: node as Text, start: text.length })
        text += node.textContent ?? ""
      }
      text += " "
    }
  }
  const language = parts[0]?.closest<HTMLElement>("[lang]")?.lang ?? "en"
  const spans = sentenceSpans(text, language)
  const first = spans[from - 1]
  const last = spans[to - 1]
  if (!first || !last) return { count: spans.length }

  // One range per text node the Sentences touch, so parts printed apart stay apart.
  const ranges = nodes.flatMap(({ node, start }) => {
    const length = node.length
    const begin = Math.max(first.start - start, 0)
    const end = Math.min(last.end - start, length)
    if (begin >= end) return []
    const range = document.createRange()
    range.setStart(node, begin)
    range.setEnd(node, end)
    return [range]
  })
  return { ranges, count: spans.length }
}
