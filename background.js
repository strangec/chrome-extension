chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed or updated.");
});

const synonymCache = new Map();

async function fetchFirstSynonym(word) {
  const key = String(word ?? "").toLowerCase();
  if (!key) return null;
  if (synonymCache.has(key)) return synonymCache.get(key);

  try {
    const url = `https://api.datamuse.com/words?rel_syn=${encodeURIComponent(key)}&max=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Datamuse HTTP ${res.status}`);
    const data = await res.json();
    const synonym = Array.isArray(data) && data[0]?.word ? String(data[0].word) : null;
    synonymCache.set(key, synonym);
    return synonym;
  } catch (_error) {
    synonymCache.set(key, null);
    return null;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "RESET_ACTIVE_TAB") {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        sendResponse({ ok: false, error: "No active tab." });
        return;
      }
      try {
        await chrome.tabs.reload(tab.id);
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message ?? String(e) });
      }
    })();
    return true;
  }

  if (message?.type === "APPLY_RULE_ACTIVE_TAB") {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        sendResponse({ ok: false, error: "No active tab." });
        return;
      }

      const url = String(tab.url ?? "");
      const isRestrictedUrl =
        url.startsWith("chrome://") ||
        url.startsWith("chrome-extension://") ||
        url.startsWith("about:") ||
        url.startsWith("view-source:");
      if (isRestrictedUrl) {
        sendResponse({
          ok: false,
          error: "Chrome blocks extensions on this page. Open a regular website (https://...) and try again.",
        });
        return;
      }

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        });

        const runRes = await chrome.tabs.sendMessage(tab.id, {
          type: "RUN_OULIPO",
          rule: message?.rule,
          lipogramLetters: message?.lipogramLetters,
        });
        if (runRes?.ok) {
          sendResponse({ ok: true });
          return;
        }
        sendResponse({ ok: false, error: runRes?.error ?? "Rule application failed." });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message ?? String(e) });
      }
    })();
    return true;
  }

  if (message?.type === "LOOKUP_SYNONYMS") {
    (async () => {
      const words = Array.isArray(message?.words) ? message.words : [];
      const synonyms = {};
      for (const word of words) {
        if (typeof word !== "string") continue;
        if (!word || word.length > 50) continue;
        const synonym = await fetchFirstSynonym(word);
        if (synonym) synonyms[word.toLowerCase()] = synonym;
      }
      sendResponse({ ok: true, synonyms });
    })();
    return true;
  }
});
