(() => {
  const WORD_RE = /[A-Za-z][A-Za-z']*/g;
  const CONJUNCTIONS = new Set([
    "and",
    "or",
    "but",
    "nor",
    "for",
    "so",
    "yet",
    "although",
    "though",
    "because",
    "since",
    "unless",
    "while",
    "whereas",
    "after",
    "before",
    "once",
    "until",
    "when",
    "whenever",
    "where",
    "wherever",
    "if",
    "than",
    "that",
    "whether",
  ]);

  // Heuristic: avoid synonymizing function words; tends to leave nouns/verbs/adverbs.
  const FUNCTION_WORDS = new Set([
    ...CONJUNCTIONS,
    "a",
    "an",
    "the",
    "this",
    "that",
    "these",
    "those",
    "my",
    "your",
    "his",
    "her",
    "its",
    "our",
    "their",
    "me",
    "you",
    "him",
    "her",
    "it",
    "us",
    "them",
    "i",
    "we",
    "they",
    "he",
    "she",
    "who",
    "whom",
    "whose",
    "which",
    "what",
    "to",
    "of",
    "in",
    "on",
    "at",
    "by",
    "from",
    "with",
    "without",
    "into",
    "onto",
    "over",
    "under",
    "up",
    "down",
    "off",
    "out",
    "about",
    "as",
    "is",
    "am",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "do",
    "does",
    "did",
    "doing",
    "have",
    "has",
    "had",
    "having",
    "not",
    "no",
    "yes",
    "very",
    "just",
    "only",
    "also",
    "too",
    "here",
    "there",
  ]);

  function isAllCaps(s) {
    return s.toUpperCase() === s && s.toLowerCase() !== s;
  }

  function capitalize(s) {
    if (!s) return s;
    return s[0].toUpperCase() + s.slice(1);
  }

  function matchCasing(original, replacement) {
    if (!replacement) return replacement;
    if (isAllCaps(original)) return replacement.toUpperCase();
    if (original[0] && original[0].toUpperCase() === original[0]) return capitalize(replacement);
    return replacement;
  }

  function shouldSkipNode(node) {
    const p = node.parentElement;
    if (!p) return true;
    const tag = p.tagName?.toLowerCase?.() ?? "";
    if (tag === "script" || tag === "style" || tag === "noscript") return true;
    if (tag === "textarea" || tag === "input" || tag === "select") return true;
    if (p.isContentEditable) return true;
    return false;
  }

  function getTextNodes(root = document.body) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) {
      if (!n.nodeValue) continue;
      if (shouldSkipNode(n)) continue;
      if (!WORD_RE.test(n.nodeValue)) continue;
      WORD_RE.lastIndex = 0;
      nodes.push(n);
    }
    return nodes;
  }

  function collectUniqueWords(textNodes, limit = 250) {
    const set = new Set();
    for (const node of textNodes) {
      const text = node.nodeValue ?? "";
      const matches = text.match(WORD_RE);
      if (!matches) continue;
      for (const m of matches) {
        const w = m.toLowerCase();
        if (!set.has(w)) {
          set.add(w);
          if (set.size >= limit) return Array.from(set);
        }
      }
    }
    return Array.from(set);
  }

  async function lookupSynonyms(wordsLowercase) {
    const res = await chrome.runtime.sendMessage({ type: "LOOKUP_SYNONYMS", words: wordsLowercase });
    if (!res?.ok) throw new Error(res?.error ?? "Lookup failed");
    return res.synonyms ?? {};
  }

  function rewriteTextNodes(textNodes, synonymsByLower) {
    for (const node of textNodes) {
      const oldText = node.nodeValue ?? "";
      const newText = oldText.replace(WORD_RE, (word) => {
        const lower = word.toLowerCase();
        if (FUNCTION_WORDS.has(lower)) return word;
        if (lower.length <= 2) return word;

        const syn = synonymsByLower[lower];
        if (!syn) return word;
        return matchCasing(word, syn);
      });
      if (newText !== oldText) node.nodeValue = newText;
    }
  }

  async function run() {
    const textNodes = getTextNodes();
    const wordsLower = collectUniqueWords(textNodes, 250);
    if (wordsLower.length === 0) return;
    const synonyms = await lookupSynonyms(wordsLower);
    rewriteTextNodes(textNodes, synonyms);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "RUN_SYNONYMIZE") return;
    (async () => {
      try {
        await run();
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message ?? String(e) });
      }
    })();
    return true;
  });
})();
