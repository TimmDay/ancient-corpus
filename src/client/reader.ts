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
    // Web fonts reflow a long page after it first lays out, so land again once they're in.
    first.scrollIntoView({ block: "start" })
    void document.fonts.ready.then(() =>
      first.scrollIntoView({ block: "start" }),
    )
  } else {
    first.scrollIntoView({
      block: "start",
      behavior: reduceMotion ? "auto" : "smooth",
    })
  }
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
  const observer = new IntersectionObserver(
    () => {
      const current = headings
        .filter((h) => h.getBoundingClientRect().top < window.innerHeight * 0.3)
        .at(-1)
      for (const [id, a] of links) {
        if (id === current?.id) a.setAttribute("aria-current", "location")
        else a.removeAttribute("aria-current")
      }
    },
    { rootMargin: "0px 0px -70% 0px" },
  )
  for (const h of headings) observer.observe(h)
}

// On narrow screens the contents start closed so the text comes first.
if (window.matchMedia("(max-width: 63.99rem)").matches) {
  document.querySelector(".toc-panel")?.removeAttribute("open")
}

window.addEventListener("hashchange", () => land())
land(true)
followContents()
