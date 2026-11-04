const tokenEl = document.getElementById("token");
const baseEl = document.getElementById("api-base");
const statusEl = document.getElementById("status");
const form = document.getElementById("token-form");

(async function load() {
  const { token = "", apiBase = "" } = await chrome.storage.sync.get(["token", "apiBase"]);
  tokenEl.value = token;
  baseEl.value = apiBase;
})();

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const token = tokenEl.value.trim();
  const apiBase = baseEl.value.trim().replace(/\/+$/, "");
  if (!token.startsWith("jbsk_")) return show("Token must start with jbsk_", "err");
  if (!/^https?:\/\//.test(apiBase)) return show("API base must be a URL.", "err");
  await chrome.storage.sync.set({ token, apiBase });
  show("Saved. You can close this popup.", "ok");
});

function show(msg, kind) {
  statusEl.textContent = msg;
  statusEl.className = "status " + kind;
  statusEl.hidden = false;
}
