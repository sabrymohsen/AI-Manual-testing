const input = document.getElementById("url")
const error = document.getElementById("error")
window.qaDesktop.getSettings().then((s) => {
  input.value = s.customUrl || ""
  input.select()
})
document.getElementById("cancel").addEventListener("click", () => window.close())
document.getElementById("form").addEventListener("submit", async (e) => {
  e.preventDefault()
  error.textContent = ""
  const res = await window.qaDesktop.setCustomServer(input.value)
  if (!res.ok) error.textContent = res.error
})
