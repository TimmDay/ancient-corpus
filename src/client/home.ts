// The catalogue filter, and the message shown when /cite couldn't find a Work.

import { normalizeName } from "../works-index.ts"

const input = document.querySelector<HTMLInputElement>("#filter")
const empty = document.getElementById("empty")
const params = new URLSearchParams(location.search)

function filter(): void {
  const terms = normalizeName(input?.value ?? "")
    .split(" ")
    .filter(Boolean)
  let shown = 0
  for (const group of document.querySelectorAll<HTMLElement>(".author-group")) {
    let groupShown = 0
    for (const item of group.querySelectorAll<HTMLElement>("li[data-search]")) {
      const haystack = normalizeName(item.dataset.search ?? "")
      const match = terms.every((t) => haystack.includes(t))
      item.hidden = !match
      if (match) groupShown++
    }
    group.hidden = groupShown === 0
    shown += groupShown
  }
  if (empty) empty.hidden = shown > 0
}

if (input) {
  // After a failed /cite the list should show everything, not filter down to nothing.
  input.value = params.has("missing") ? "" : (params.get("q") ?? "")
  input.addEventListener("input", filter)
  filter()
}

const notice = document.getElementById("notice")
if (notice && params.has("missing")) {
  notice.textContent = `No work in the corpus matches “${params.get("q") ?? ""}” yet. Here is everything that does exist.`
  notice.hidden = false
}
