// The Index: sort by any column, filter by text, years and language. The
// table is rendered in full and works without this script; the choices are
// kept in the address, so a filtered view can be shared.

import { normalizeName } from "../works-index.ts"

type Key =
  | "author"
  | "work"
  | "covers"
  | "written"
  | "language"
  | "translator"
  | "machine"
  | "licence"
  | "published"

const NUMERIC: Partial<Record<Key, string>> = {
  covers: "coversFrom",
  written: "written",
  published: "published",
}

const form = document.querySelector<HTMLFormElement>(".index-filters")
const tbody =
  document.querySelector<HTMLTableSectionElement>(".index-table tbody")
const headers = [
  ...document.querySelectorAll<HTMLTableCellElement>(".index-table th"),
]
const count = document.getElementById("index-count")
const empty = document.getElementById("index-empty")

if (form && tbody) {
  const rows = [...tbody.rows]
  const field = <T extends HTMLElement>(name: string) =>
    form.elements.namedItem(name) as T
  const q = field<HTMLInputElement>("q")
  const from = field<HTMLInputElement>("from")
  const to = field<HTMLInputElement>("to")
  const lang = field<HTMLSelectElement>("lang")
  const sortSelect = field<HTMLSelectElement>("sort")
  let sort: { key: Key; descending: boolean } = {
    key: "author",
    descending: false,
  }

  const params = new URLSearchParams(location.search)
  q.value = params.get("q") ?? ""
  from.value = params.get("from") ?? ""
  to.value = params.get("to") ?? ""
  lang.value = params.get("lang") ?? ""
  const sortParam = params.get("sort")
  if (sortParam) {
    const key = sortParam.replace(/^-/, "") as Key
    if (headers.some((th) => th.dataset.key === key))
      sort = { key, descending: sortParam.startsWith("-") }
  }

  const compare = (a: HTMLTableRowElement, b: HTMLTableRowElement) => {
    const numeric = NUMERIC[sort.key]
    const attr = numeric ?? sort.key
    const x = sort.key === "covers" ? coverStart(a.dataset) : a.dataset[attr]
    const y = sort.key === "covers" ? coverStart(b.dataset) : b.dataset[attr]
    // Rows without a value go last whichever way the column is sorted.
    if (x === undefined || y === undefined)
      return x === y ? 0 : x === undefined ? 1 : -1
    const order = numeric
      ? Number(x) - Number(y)
      : x.localeCompare(y, undefined, { sensitivity: "base" })
    return sort.descending ? -order : order
  }

  const apply = () => {
    const terms = normalizeName(q.value).split(" ").filter(Boolean)
    const lo = parseYear(from.value) ?? -Infinity
    const hi = parseYear(to.value) ?? Infinity
    const filteringYears = lo !== -Infinity || hi !== Infinity
    from.toggleAttribute(
      "aria-invalid",
      !!from.value && parseYear(from.value) === undefined,
    )
    to.toggleAttribute(
      "aria-invalid",
      !!to.value && parseYear(to.value) === undefined,
    )

    let shown = 0
    for (const row of rows) {
      const d = row.dataset
      const haystack = normalizeName(d.search ?? "")
      let match =
        terms.every((t) => haystack.includes(t)) &&
        (!lang.value || d.language === lang.value)
      if (match && filteringYears) {
        const coversFrom = Number(coverStart(d) ?? NaN)
        const coversTo = d.coversTo === undefined ? NaN : Number(d.coversTo)
        const published = d.published === undefined ? NaN : Number(d.published)
        const covers = coversFrom <= hi && coversTo >= lo
        const printed = published >= lo && published <= hi
        match = covers || printed
      }
      row.hidden = !match
      if (match) shown++
    }

    // Original order breaks ties, so equal rows stay grouped by author.
    const sorted = rows
      .map((row, i) => ({ row, i }))
      .sort((a, b) => compare(a.row, b.row) || a.i - b.i)
    tbody.append(...sorted.map(({ row }) => row))

    for (const th of headers) {
      if (th.dataset.key === sort.key)
        th.setAttribute(
          "aria-sort",
          sort.descending ? "descending" : "ascending",
        )
      else th.removeAttribute("aria-sort")
    }
    sortSelect.value = sort.key

    if (count)
      count.textContent =
        shown === rows.length
          ? `${rows.length} editions`
          : `${shown} of ${rows.length} editions`
    if (empty) empty.hidden = shown > 0

    const next = new URLSearchParams()
    if (q.value) next.set("q", q.value)
    if (from.value) next.set("from", from.value)
    if (to.value) next.set("to", to.value)
    if (lang.value) next.set("lang", lang.value)
    if (sort.key !== "author" || sort.descending)
      next.set("sort", `${sort.descending ? "-" : ""}${sort.key}`)
    const search = next.toString()
    history.replaceState(null, "", search ? `?${search}` : location.pathname)
  }

  for (const th of headers) {
    th.querySelector("button")?.addEventListener("click", () => {
      const key = th.dataset.key as Key
      sort = {
        key,
        descending: sort.key === key ? !sort.descending : false,
      }
      apply()
    })
  }
  sortSelect.addEventListener("change", () => {
    sort = { key: sortSelect.value as Key, descending: false }
    apply()
  })
  form.addEventListener("input", (event) => {
    if (event.target !== sortSelect) apply()
  })
  form.addEventListener("reset", () => {
    sort = { key: "author", descending: false }
    // The form clears its fields after this event.
    setTimeout(apply)
  })
  apply()
}

/** "44 BC", "-44", "AD 476", "476 CE" as a year; BC years are negative. */
export function parseYear(value: string): number | undefined {
  const match = /^\s*(?:(AD|CE)\s*)?(-?\d{1,4})\s*(BCE?|AD|CE)?\s*$/i.exec(
    value,
  )
  if (!match?.[2]) return undefined
  const year = Number(match[2])
  return /^BC/i.test(match[3] ?? "") ? -Math.abs(year) : year
}

/**
 * Where a row's coverage starts, for sorting and matching years. A Work known
 * only to end at a year ("to 417", from the Creation) is open at the start.
 */
function coverStart(d: DOMStringMap): string | undefined {
  if (d.coversFrom !== undefined) return d.coversFrom
  return d.coversTo === undefined ? undefined : "-Infinity"
}
