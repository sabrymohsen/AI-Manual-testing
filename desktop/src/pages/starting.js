const logEl = document.getElementById("log")
const params = new URLSearchParams(location.search)

function append(line) {
  const atBottom = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 4
  logEl.textContent += line + "\n"
  if (atBottom) logEl.scrollTop = logEl.scrollHeight
}

window.qaDesktop.getStackLog().then((lines) => lines.forEach(append))
window.qaDesktop.onStackLog(append)

if (params.get("error")) {
  document.getElementById("card").classList.add("failed")
  document.getElementById("title").textContent = "QA Engine couldn't start"
  document.getElementById("sub").textContent = params.get("error")
}

document.getElementById("retry").onclick = () => window.qaDesktop.retry()
document.getElementById("folder").onclick = () => window.qaDesktop.chooseRepo()
document.getElementById("server").onclick = () => window.qaDesktop.openServerPicker()
