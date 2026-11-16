const params = new URLSearchParams(location.search)
document.getElementById("server").textContent = params.get("server") || ""
document.getElementById("reason").textContent = params.get("reason") || ""
document.getElementById("retry").addEventListener("click", () => window.qaDesktop.retry())
document.getElementById("change").addEventListener("click", () => window.qaDesktop.openServerPicker())
// Come back by itself as soon as the network does.
window.addEventListener("online", () => window.qaDesktop.retry())
