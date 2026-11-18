// Controls on every page: the menu, the theme toggle and the back-to-top button.

// On narrow screens the site links slide in from the side behind a menu
// button. While closed the panel is inert, so keyboard focus skips it; while
// open, Escape, the scrim or a link closes it, and focus stays inside.

const menuButton = document.querySelector<HTMLButtonElement>(".nav-toggle")
const closeButton = document.querySelector<HTMLButtonElement>(".nav-close")
const panel = document.querySelector<HTMLElement>(".nav-panel")
const scrim = document.querySelector<HTMLElement>(".nav-scrim")
const narrow = window.matchMedia("(max-width: 47.99rem)")

function setMenu(open: boolean, returnFocus = true): void {
  if (!menuButton || !panel || !scrim) return
  const wasOpen = menuButton.getAttribute("aria-expanded") === "true"
  menuButton.setAttribute("aria-expanded", String(open))
  menuButton.setAttribute("aria-label", open ? "Close menu" : "Open menu")
  panel.dataset.open = String(open)
  panel.inert = narrow.matches && !open
  scrim.hidden = !open
  document.documentElement.classList.toggle("menu-open", open)
  if (open) panel.querySelector<HTMLElement>("a")?.focus()
  else if (wasOpen && returnFocus) menuButton.focus()
}

if (menuButton && closeButton && panel && scrim) {
  menuButton.hidden = false
  closeButton.hidden = false
  menuButton.addEventListener("click", () =>
    setMenu(menuButton.getAttribute("aria-expanded") !== "true"),
  )
  closeButton.addEventListener("click", () => setMenu(false))
  scrim.addEventListener("click", () => setMenu(false))
  panel.addEventListener("click", (event) => {
    if ((event.target as Element).closest("a")) setMenu(false, false)
  })
  document.addEventListener("keydown", (event) => {
    if (panel.dataset.open !== "true") return
    if (event.key === "Escape") setMenu(false)
    if (event.key !== "Tab") return
    const focusable = [
      ...panel.querySelectorAll<HTMLElement>("a, button:not([hidden])"),
    ]
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  })
  // Widening the window turns the panel back into header links.
  narrow.addEventListener("change", () => setMenu(false, false))
  setMenu(false, false)
}

// The theme follows the system until the reader picks one, which is then
// remembered. A script in the page head applies the choice before paint, so
// this only handles the button.

const themeButton = document.querySelector<HTMLButtonElement>(".theme-toggle")
const systemDark = window.matchMedia("(prefers-color-scheme: dark)")

type Theme = "light" | "dark"

function currentTheme(): Theme {
  const chosen = document.documentElement.dataset.theme
  if (chosen === "light" || chosen === "dark") return chosen
  return systemDark.matches ? "dark" : "light"
}

function updateThemeLabel(): void {
  if (!themeButton) return
  const next = currentTheme() === "dark" ? "light" : "dark"
  themeButton.setAttribute("aria-label", `Switch to ${next} theme`)
  themeButton.title = `Switch to ${next} theme`
}

themeButton?.addEventListener("click", () => {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark"
  document.documentElement.dataset.theme = next
  try {
    localStorage.setItem("theme", next)
  } catch {
    // Storage can be blocked; the choice then lasts for this page only.
  }
  updateThemeLabel()
})
systemDark.addEventListener("change", updateThemeLabel)
if (themeButton) themeButton.hidden = false
updateThemeLabel()

// Back to top appears once the reader is a screen or more down the page.

const topButton = document.querySelector<HTMLButtonElement>(".to-top")
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)")

if (topButton) {
  let queued = false
  const update = () => {
    queued = false
    topButton.dataset.away = String(window.scrollY > window.innerHeight)
  }
  window.addEventListener(
    "scroll",
    () => {
      if (!queued) requestAnimationFrame(update)
      queued = true
    },
    { passive: true },
  )
  topButton.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: reduceMotion.matches ? "auto" : "smooth",
    })
    // Keyboard users carry on from the top of the page, not from the button.
    document
      .querySelector<HTMLElement>(".brand")
      ?.focus({ preventScroll: true })
  })
  topButton.hidden = false
  update()
}
