// The theme toggle: pages follow the system theme until the reader picks one,
// which is then remembered. The choice is applied before paint by a script in
// the page head, so this only handles the button.

const button = document.querySelector<HTMLButtonElement>(".theme-toggle")
const systemDark = window.matchMedia("(prefers-color-scheme: dark)")

type Theme = "light" | "dark"

function currentTheme(): Theme {
  const chosen = document.documentElement.dataset.theme
  if (chosen === "light" || chosen === "dark") return chosen
  return systemDark.matches ? "dark" : "light"
}

function updateLabel(): void {
  if (!button) return
  const next = currentTheme() === "dark" ? "light" : "dark"
  button.setAttribute("aria-label", `Switch to ${next} theme`)
  button.title = `Switch to ${next} theme`
}

button?.addEventListener("click", () => {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark"
  document.documentElement.dataset.theme = next
  try {
    localStorage.setItem("theme", next)
  } catch {
    // Storage can be blocked; the choice then lasts for this page only.
  }
  updateLabel()
})
systemDark.addEventListener("change", updateLabel)

if (button) button.hidden = false
updateLabel()
