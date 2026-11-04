// Service worker.
// Owns: storage defaults, command keybind → content script ping, install-time
// options page open if the user hasn't pasted a token yet.

const DEFAULTS = {
  apiBase: "https://jobscout-wnwafxvfia-uw.a.run.app", // overridden by user in options
  token: "",
};

chrome.runtime.onInstalled.addListener(async (details) => {
  const cur = await chrome.storage.sync.get(["apiBase", "token"]);
  if (cur.apiBase == null) await chrome.storage.sync.set({ apiBase: DEFAULTS.apiBase });
  if (details.reason === "install" && !cur.token) {
    chrome.runtime.openOptionsPage();
  }
});

// Keyboard shortcut → ask the active tab's content script to score.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "score-current-job") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "score-current-job" });
  } catch {
    // Content script not loaded — probably not on an Upwork job page.
  }
});

// Routes API calls so the content script doesn't need to know the API base.
// Also keeps the bearer token out of page-script context.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "api") return false;
  void (async () => {
    try {
      const { apiBase, token } = await chrome.storage.sync.get(["apiBase", "token"]);
      if (!token) { sendResponse({ ok: false, error: "no_token", help: "Open the JobScout extension popup and paste your token." }); return; }
      if (!apiBase) { sendResponse({ ok: false, error: "no_api_base" }); return; }
      const url = apiBase.replace(/\/+$/, "") + msg.path;
      const resp = await fetch(url, {
        method: msg.method ?? "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: msg.body ? JSON.stringify(msg.body) : undefined,
      });
      const json = await resp.json().catch(() => ({}));
      sendResponse({ ok: resp.ok, status: resp.status, json });
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  })();
  return true; // async sendResponse
});
