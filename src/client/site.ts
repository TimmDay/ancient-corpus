// Controls on every page: the theme toggle and the back-to-top button.

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
