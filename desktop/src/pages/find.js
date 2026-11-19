// Find bar (an overlay view on top of the page; the search runs in main).
const q = document.getElementById("q")
const n = document.getElementById("n")
const find = window.qaDesktop.find
const search = (forward, findNext) => find.search(q.value, forward, findNext)
q.addEventListener("input", () => search(true, false))
q.addEventListener("keydown", (e) => {
  if (e.key === "Enter") search(!e.shiftKey, true)
  if (e.key === "Escape") find.close()
})
document.getElementById("next").addEventListener("click", () => search(true, true))
document.getElementById("prev").addEventListener("click", () => search(false, true))
document.getElementById("close").addEventListener("click", () => find.close())
find.onResult((r) => {
  n.textContent = r.total ? `${r.active} of ${r.total}` : q.value ? "No results" : ""
})
find.onFocus(() => {
  q.focus()
  q.select()
})
