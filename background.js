chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed or updated.");
});

const synonymCache = new Map();

async function fetchFirstSynonym(word) {
  const key = word.toLowerCase();
  if (synonymCache.has(key)) return synonymCache.get(key);

  try {
    const url = `https://api.datamuse.com/words?rel_syn=${encodeURIComponent(key)}&max=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Datamuse HTTP ${res.status}`);
    const data = await res.json();
    const syn = Array.isArray(data) && data[0]?.word ? String(data[0].word) : null;
    synonymCache.set(key, syn);
    return syn;
  } catch (_e) {
    synonymCache.set(key, null);
    return null;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SYNONYMIZE_ACTIVE_TAB") {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        sendResponse({ ok: false, error: "No active tab." });
        return;
      }

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        });

        await chrome.tabs.sendMessage(tab.id, { type: "RUN_SYNONYMIZE" });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message ?? String(e) });
      }
    })();
    return true;
  }

  if (message?.type === "LOOKUP_SYNONYMS") {
    (async () => {
      const words = Array.isArray(message?.words) ? message.words : [];
      const out = {};

      for (const w of words) {
        if (typeof w !== "string") continue;
        if (!w || w.length > 50) continue;
        const syn = await fetchFirstSynonym(w);
        if (syn) out[w] = syn;
      }

      sendResponse({ ok: true, synonyms: out });
    })();
    return true;
  }
});
