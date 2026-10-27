// The reader page: lands a link on its Passage, explains any fallback, copies
// passage links, and keeps the contents in step with the scroll position.

import {
  resolveLocator,
  resolvedTargets,
  type LocatorIndex,
} from "../locator.ts"
import { showToast } from "./toast.ts"

const index = JSON.parse(
  document.getElementById("locator-index")?.textContent ?? "{}",
) as LocatorIndex
const notice = document.getElementById("notice")
const reduceMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches

function land(initial = false): void {
  for (const el of document.querySelectorAll(".hit")) el.classList.remove("hit")
  hideNotice()
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

function showNotice(message: string): void {
  if (!notice) return
  notice.textContent = message
  notice.hidden = false
  // The notice is sticky; make room so it never covers the Passage it explains.
  document.documentElement.style.scrollPaddingTop = `${notice.offsetHeight + 24}px`
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

  // Checked on every scroll, so a jump straight past a heading still counts.
  const update = () => {
    queued = false
    const line = window.innerHeight * 0.3
    const current = headings.findLast(
      (h) => h.getBoundingClientRect().top < line,
    )
    const link = current ? links.get(current.id) : undefined
    if (link === marked) return
    marked?.removeAttribute("aria-current")
    link?.setAttribute("aria-current", "location")
    marked = link
  }
  window.addEventListener(
    "scroll",
    () => {
      if (!queued) requestAnimationFrame(update)
      queued = true
    },
    { passive: true },
  )
  update()
}

// On narrow screens the contents start closed so the text comes first.
if (window.matchMedia("(max-width: 63.99rem)").matches) {
  document.querySelector(".toc-panel")?.removeAttribute("open")
}

window.addEventListener("hashchange", () => land())
land(true)
followContents()
