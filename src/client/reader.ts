// The reader page: lands a link on its Passage, explains any fallback, copies
// passage links, and keeps the contents in step with the scroll position.

import {
  resolveLocator,
  resolvedTargets,
  type LocatorIndex,
  type LocatorTarget,
} from "../locator.ts"
import { showToast } from "./toast.ts"

const index = JSON.parse(
  document.getElementById("locator-index")?.textContent ?? "{}",
) as LocatorIndex
const notice = document.getElementById("notice")
const chooser = document.getElementById("chooser")
/** Remembers, across a page load, which of several passages a reader picked. */
const CHOSEN_KEY = "chosen-locator"
const reduceMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches

function land(initial = false): void {
  for (const el of document.querySelectorAll(".hit")) el.classList.remove("hit")
  hideNotice()
  if (chooser) chooser.hidden = true
  const hash = location.hash.slice(1)
  if (!hash) return

  const resolution = resolveLocator(hash, index)
  if (resolution.kind === "not-found") {
    // Note and Editorial matter anchors are ordinary ids, not Locators.
    if (document.getElementById(hash)) return
    showNotice(
      `“${decode(hash)}” isn’t a Locator in this Edition. Choose a place from the contents.`,
    )
    document.querySelector<HTMLElement>(".toc-panel summary")?.focus()
    return
  }

  // A link from elsewhere that could mean more than one passage asks which.
  if (
    initial &&
    resolution.alternatives &&
    !wasChosen(resolution.start.locator)
  ) {
    showChooser(decode(hash), [resolution.start, ...resolution.alternatives])
    return
  }

  // A book-at-a-time Edition: go to the page that holds the Locator.
  const page = resolution.start.page
  if (page && page !== location.pathname) {
    location.replace(`${page}#${hash}`)
    return
  }

  const targets = resolvedTargets(resolution, index)
  const elements = targets.flatMap((t) => document.getElementById(t.id) ?? [])
  for (const el of elements) el.classList.add("hit")
  const first = elements[0]
  if (!first) return
  if (!resolution.exact) {
    showNotice(
      `Showing ${resolution.start.locator}. “${decode(hash)}” isn’t marked separately in this Edition.`,
    )
  }
  first.setAttribute("tabindex", "-1")
  first.focus({ preventScroll: true })
  if (initial) {
    pinWhileLoading(first)
  } else {
    first.scrollIntoView({
      block: "start",
      behavior: reduceMotion ? "auto" : "smooth",
    })
  }
}

/**
 * Web fonts and late layout reflow a long page after it first renders, and
 * document.fonts.ready can resolve before the fonts have even started. Keep
 * the target in place as things load, until the reader scrolls themselves.
 */
function pinWhileLoading(target: HTMLElement): void {
  let pinned = true
  const pin = () => {
    if (pinned) target.scrollIntoView({ block: "start" })
  }
  const release = () => {
    pinned = false
  }
  for (const event of ["wheel", "touchstart", "keydown", "mousedown"]) {
    window.addEventListener(event, release, { once: true, passive: true })
  }
  pin()
  window.addEventListener("load", pin, { once: true })
  document.fonts.addEventListener("loadingdone", pin)
  void document.fonts.ready.then(pin)
  const observer = new ResizeObserver(pin)
  observer.observe(document.body)
  setTimeout(() => {
    release()
    observer.disconnect()
    document.fonts.removeEventListener("loadingdone", pin)
  }, 4000)
}

function showChooser(written: string, options: LocatorTarget[]): void {
  if (!chooser) return
  const heading = document.createElement("h2")
  heading.id = "chooser-title"
  heading.tabIndex = -1
  heading.textContent = `Which ${written}?`
  const intro = document.createElement("p")
  intro.textContent = `This Edition has more than one passage that “${written}” could mean.`
  const list = document.createElement("ul")
  list.className = "choices"
  for (const option of options) {
    const choice = index.choices?.[option.id]
    const card = document.createElement("a")
    card.className = "choice"
    card.href = `${option.page ?? location.pathname}#${option.locator}`
    card.dataset.locator = option.locator
    for (const [className, text] of [
      ["choice-locator", option.locator],
      ["choice-what", choice?.what ?? ""],
      ["choice-excerpt", choice?.excerpt ? `“${choice.excerpt}”` : ""],
    ]) {
      if (!text) continue
      const line = document.createElement("span")
      line.className = className ?? ""
      line.textContent = text
      card.append(line)
    }
    const item = document.createElement("li")
    item.append(card)
    list.append(item)
  }
  chooser.replaceChildren(heading, intro, list)
  chooser.hidden = false
  window.scrollTo({ top: 0 })
  heading.focus({ preventScroll: true })
}

chooser?.addEventListener("click", (event) => {
  const card = (event.target as Element).closest<HTMLAnchorElement>("a.choice")
  if (!card) return
  // On this page a hash that doesn't change fires no hashchange, so land here.
  if (card.pathname === location.pathname) {
    event.preventDefault()
    history.replaceState(null, "", card.hash)
    land()
    return
  }
  try {
    sessionStorage.setItem(CHOSEN_KEY, card.dataset.locator ?? "")
  } catch {
    // Without storage the next page asks again.
  }
})

/** Whether the reader just picked this Locator from the chooser; asks only once. */
function wasChosen(locator: string): boolean {
  try {
    const chosen = sessionStorage.getItem(CHOSEN_KEY)
    sessionStorage.removeItem(CHOSEN_KEY)
    return chosen === locator
  } catch {
    return false
  }
}

function showNotice(message: string): void {
  if (!notice) return
  notice.textContent = message
  notice.hidden = false
  // The notice sticks under the header; make room so neither covers the Passage it explains.
  const header = document.querySelector<HTMLElement>(".site-header")
  document.documentElement.style.scrollPaddingTop = `${(header?.offsetHeight ?? 0) + notice.offsetHeight + 32}px`
}

function hideNotice(): void {
  if (notice) notice.hidden = true
  document.documentElement.style.removeProperty("scroll-padding-top")
}

function decode(hash: string): string {
  try {
    return decodeURIComponent(hash)
  } catch {
    return hash
  }
}

// A Locator in the margin both goes to its Passage and copies a link to it.
document.addEventListener("click", (event) => {
  const link = (event.target as Element).closest<HTMLAnchorElement>("a.loc")
  if (!link) return
  const url = `${location.origin}${location.pathname}${link.hash}`
  navigator.clipboard?.writeText(url).then(
    () =>
      showToast(
        `Link to ${link.closest("section")?.getAttribute("aria-label") ?? "passage"} copied`,
      ),
    () => undefined,
  )
})

// Switching Edition keeps the reader at the same Locator.
document.addEventListener("click", (event) => {
  const link = (event.target as Element).closest<HTMLAnchorElement>(
    "a[data-keep-hash]",
  )
  if (link && location.hash) link.hash = location.hash
})

function followContents(): void {
  const links = new Map(
    [
      ...document.querySelectorAll<HTMLAnchorElement>(".toc a[data-division]"),
    ].map((a) => [a.dataset.division, a]),
  )
  const headings = [...document.querySelectorAll<HTMLElement>("h2.division")]
  let marked: HTMLAnchorElement | undefined
  let queued = false
  /** True while the text scrolls to a place picked from the contents. */
  let jumping = false

  const mark = (link: HTMLAnchorElement | undefined) => {
    if (link === marked) return
    marked?.removeAttribute("aria-current")
    link?.setAttribute("aria-current", "location")
    marked = link
  }

  // Checked on every scroll, so a jump straight past a heading still counts.
  const update = () => {
    queued = false
    if (jumping) return
    const line = window.innerHeight * 0.3
    // Above the first heading, the page's first book is the one being read:
    // on a page per book, that is the book just picked from the contents.
    const current =
      headings.findLast((h) => h.getBoundingClientRect().top < line) ??
      headings[0]
    mark(current ? links.get(current.id) : undefined)
  }
  window.addEventListener(
    "scroll",
    () => {
      if (!queued) requestAnimationFrame(update)
      queued = true
    },
    { passive: true },
  )

  // A place picked from the contents opens its book there at once, and the
  // contents hold still while the text scrolls to it, rather than opening and
  // closing every book it passes.
  document.querySelector(".toc")?.addEventListener("click", (event) => {
    const picked = (event.target as Element).closest<HTMLAnchorElement>("a")
    if (picked?.pathname !== location.pathname) return
    const book = picked
      .closest(".toc-list > li")
      ?.querySelector<HTMLAnchorElement>(":scope > a[data-division]")
    if (!book) return
    mark(book)
    jumping = true
    const settle = () => {
      jumping = false
      clearTimeout(timer)
      window.removeEventListener("scrollend", settle)
      update()
    }
    // scrollend never fires if the text is already there; the timer covers that.
    const timer = setTimeout(settle, 2000)
    window.addEventListener("scrollend", settle)
  })
  update()
}

// On narrow screens the contents start closed so the text comes first.
if (window.matchMedia("(max-width: 63.99rem)").matches) {
  document.querySelector(".toc-panel")?.removeAttribute("open")
}

window.addEventListener("hashchange", () => land())
land(true)
followContents()
