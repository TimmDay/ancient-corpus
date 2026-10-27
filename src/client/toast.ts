let timer: ReturnType<typeof setTimeout> | undefined

/** A short confirmation, announced to screen readers through the toast's live region. */
export function showToast(message: string): void {
  const toast = document.getElementById("toast")
  if (!toast) return
  toast.textContent = message
  toast.classList.add("shown")
  clearTimeout(timer)
  timer = setTimeout(() => toast.classList.remove("shown"), 2400)
}
