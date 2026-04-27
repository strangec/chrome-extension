(() => {
  const w = window;

  const WORD_RE = /[A-Za-z][A-Za-z']*/g;
  const FUNCTION_WORDS = new Set([
    "a", "an", "the", "and", "or", "but", "nor", "for", "so", "yet", "to", "of", "in", "on", "at",
    "by", "from", "with", "without", "into", "onto", "over", "under", "up", "down", "off", "out",
    "about", "as", "is", "am", "are", "was", "were", "be", "been", "being", "do", "does", "did",
    "have", "has", "had", "not", "no", "yes", "i", "you", "he", "she", "it", "we", "they", "me",
    "him", "her", "us", "them", "my", "your", "his", "its", "our", "their", "this", "that", "these",
    "those", "who", "whom", "whose", "which", "what", "when", "where", "why", "how", "if", "then",
    "than", "there", "here", "very", "just", "only", "also", "too",
  ]);

  const DEFAULT_LIPOGRAM = "e";
  const PRISONERS_LETTERS = "bdfghjklpqty";

  function shouldSkipNode(node) {
    const parent = node.parentElement;
    if (!parent) return true;
    const tag = parent.tagName?.toLowerCase?.() ?? "";
    if (tag === "script" || tag === "style" || tag === "noscript") return true;
    if (tag === "textarea" || tag === "input" || tag === "select") return true;
    if (parent.isContentEditable) return true;
    return false;
  }

  function getTextNodes(root = document.body) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue || shouldSkipNode(node)) continue;
      nodes.push(node);
    }
    return nodes;
  }

  function isProbablyNoun(wordLower) {
    if (wordLower.length < 3) return false;
    if (FUNCTION_WORDS.has(wordLower)) return false;
    if (wordLower.endsWith("ly")) return false; // likely adverb
    if (wordLower.endsWith("ing")) return false; // likely verb/gerund
    return true;
  }

  function isAllCaps(s) {
    return s.toUpperCase() === s && s.toLowerCase() !== s;
  }

  function capitalize(s) {
    return s ? s[0].toUpperCase() + s.slice(1) : s;
  }

  function matchCasing(original, replacement) {
    if (!replacement) return replacement;
    if (isAllCaps(original)) return replacement.toUpperCase();
    if (original[0]?.toUpperCase() === original[0]) return capitalize(replacement);
    return replacement;
  }

  function removeLetters(textNodes, lettersToOmit) {
    if (!lettersToOmit) return;
    const escaped = lettersToOmit.replace(/[^a-z]/gi, "");
    if (!escaped) return;
    const deduped = Array.from(new Set(escaped.toLowerCase().split(""))).join("");
    if (!deduped) return;
    const pattern = new RegExp(`[${deduped}]`, "gi");
    for (const node of textNodes) {
      const oldText = node.nodeValue ?? "";
      const newText = oldText.replace(pattern, "");
      if (newText !== oldText) node.nodeValue = newText;
    }
  }

  function collectUniqueWords(textNodes, limit = 250) {
    const words = new Set();
    for (const node of textNodes) {
      const matches = (node.nodeValue ?? "").match(WORD_RE);
      if (!matches) continue;
      for (const word of matches) {
        const lower = word.toLowerCase();
        if (!FUNCTION_WORDS.has(lower) && lower.length > 2) {
          words.add(lower);
        }
        if (words.size >= limit) return Array.from(words);
      }
    }
    return Array.from(words);
  }

  async function lookupSynonyms(words) {
    const response = await chrome.runtime.sendMessage({ type: "LOOKUP_SYNONYMS", words });
    if (!response?.ok) throw new Error(response?.error ?? "Synonym lookup failed.");
    return response?.synonyms ?? {};
  }

  async function applySynonymize(textNodes) {
    const words = collectUniqueWords(textNodes, 250);
    if (words.length === 0) return;
    const synonymsByWord = await lookupSynonyms(words);
    for (const node of textNodes) {
      const oldText = node.nodeValue ?? "";
      const newText = oldText.replace(WORD_RE, (word) => {
        const synonym = synonymsByWord[word.toLowerCase()];
        return synonym ? matchCasing(word, synonym) : word;
      });
      if (newText !== oldText) node.nodeValue = newText;
    }
  }

  function buildNPlus7Map(textNodes) {
    const nounSet = new Set();
    for (const node of textNodes) {
      const matches = (node.nodeValue ?? "").match(WORD_RE);
      if (!matches) continue;
      for (const word of matches) {
        const lower = word.toLowerCase();
        if (isProbablyNoun(lower)) nounSet.add(lower);
      }
    }

    const nouns = Array.from(nounSet).sort((a, b) => a.localeCompare(b));
    if (nouns.length < 8) return new Map();

    const map = new Map();
    for (let i = 0; i < nouns.length; i += 1) {
      map.set(nouns[i], nouns[(i + 7) % nouns.length]);
    }
    return map;
  }

  function applyNPlus7(textNodes) {
    const replacements = buildNPlus7Map(textNodes);
    if (replacements.size === 0) return;

    for (const node of textNodes) {
      const oldText = node.nodeValue ?? "";
      const newText = oldText.replace(WORD_RE, (word) => {
        const replacement = replacements.get(word.toLowerCase());
        return replacement ? matchCasing(word, replacement) : word;
      });
      if (newText !== oldText) node.nodeValue = newText;
    }
  }

  async function applyRule(rule, lipogramLetters) {
    const textNodes = getTextNodes();
    if (textNodes.length === 0) return;

    if (rule === "synonymize") {
      await applySynonymize(textNodes);
      return;
    }
    if (rule === "prisoners_constraint") {
      removeLetters(textNodes, PRISONERS_LETTERS);
      return;
    }
    if (rule === "n_plus_7") {
      applyNPlus7(textNodes);
      return;
    }
    if (rule === "lipogram") {
      removeLetters(textNodes, lipogramLetters || DEFAULT_LIPOGRAM);
      return;
    }
    throw new Error("Unknown Oulipian rule.");
  }

  const onRuntimeMessage = (message, _sender, sendResponse) => {
    if (message?.type !== "RUN_OULIPO") return;
    (async () => {
      try {
        await applyRule(String(message?.rule ?? ""), String(message?.lipogramLetters ?? ""));
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message ?? String(e) });
      }
    })();
    return true;
  };

  // Re-register listener on each injection so updated code always handles messages.
  if (w.__oulipifyOnRuntimeMessage) {
    chrome.runtime.onMessage.removeListener(w.__oulipifyOnRuntimeMessage);
  }
  w.__oulipifyOnRuntimeMessage = onRuntimeMessage;
  chrome.runtime.onMessage.addListener(onRuntimeMessage);
})();
