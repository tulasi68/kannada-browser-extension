// Safe, local page-text conversion for the Accagannada News Extension.
(() => {
  if (window.__accagannadaNewsConverterV6) return;
  window.__accagannadaNewsConverterV6 = true;

  const SKIP = [
    "script", "style", "noscript", "textarea", "input", "select", "option",
    "code", "pre", "[contenteditable]", "[role='textbox']", ".accagannada-word"
  ].join(",");
  const trie = new AccagannadaTrie();
  let showTooltips = true;

  function isAllowedHost(whitelistEnabled, allowedDomains) {
    if (!whitelistEnabled) return true;
    const host = window.location.hostname.toLowerCase();
    return (allowedDomains || []).some(domain => host === domain || host.endsWith("." + domain));
  }

  function tooltipText(original, entry) {
    const lines = ["ಮೂಲ ಪದ: " + original];
    const alternatives = entry && (entry.alternatives || entry.alts);
    if (Array.isArray(alternatives) && alternatives.length) lines.push("ಪರ್ಯಾಯಗಳು: " + alternatives.join(", "));
    const notes = entry && (entry.notes || (entry.note ? [entry.note] : []));
    if (Array.isArray(notes) && notes.length) lines.push("ಬಳಕೆಯ ಸೂಚನೆ: " + notes.join(" | "));
    return lines.join("\n");
  }

  function asEntries(value) {
    if (!value || typeof value !== "object") return [];
    return Object.entries(value).map(([inputWord, entry]) => ({
      inputWord,
      ...(typeof entry === "string" ? { primary: entry } : entry)
    }));
  }

  function processTextNode(textNode) {
    const raw = textNode.nodeValue;
    if (!raw || !/[\u0C80-\u0CFF]/u.test(raw) || !textNode.parentNode) return;
    const segments = trie.tokenizeAndConvert(raw);
    if (!segments.some(segment => segment.converted)) return;

    const fragment = document.createDocumentFragment();
    for (const segment of segments) {
      if (segment.converted) {
        const span = document.createElement("span");
        span.className = showTooltips ? "accagannada-word accagannada-highlight" : "accagannada-word";
        span.textContent = segment.text;
        if (showTooltips) span.title = tooltipText(segment.original, segment.data);
        fragment.appendChild(span);
      } else fragment.appendChild(document.createTextNode(segment.text));
    }
    textNode.parentNode.replaceChild(fragment, textNode);
  }

  function walkDOM(rootNode) {
    if (!rootNode) return;
    if (rootNode.nodeType === Node.TEXT_NODE) {
      if (rootNode.parentElement && !rootNode.parentElement.closest(SKIP)) processTextNode(rootNode);
      return;
    }
    if (rootNode.nodeType === Node.ELEMENT_NODE && rootNode.matches(SKIP)) return;
    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest(SKIP)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    for (const textNode of nodes) processTextNode(textNode);
  }

  function startObserver() {
    walkDOM(document.body);
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const added of mutation.addedNodes) {
          if (added.nodeType === Node.ELEMENT_NODE || added.nodeType === Node.TEXT_NODE) walkDOM(added);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  chrome.storage.local.get({
    isEnabled: true, showTooltips: true, whitelistOnly: false,
    allowedDomains: ["tv9kannada.com", "publictv.in", "prajavani.net", "vijaykarnataka.com", "kannadaprabha.com", "udayavani.com", "asianetnews.com", "oneindia.com", "news18.com", "zeenews.india.com"],
    masterDictionary: {}, customWords: {}
  }, settings => {
    if (!settings.isEnabled || !isAllowedHost(settings.whitelistOnly, settings.allowedDomains)) return;
    showTooltips = settings.showTooltips !== false;
    fetch(chrome.runtime.getURL("vocabulary.json"))
      .then(response => {
        if (!response.ok) throw new Error("Vocabulary index could not be loaded");
        return response.json();
      })
      .then(index => Promise.all((index.shards || []).map(file =>
        fetch(chrome.runtime.getURL(file)).then(response => {
          if (!response.ok) throw new Error("Vocabulary shard could not be loaded: " + file);
          return response.json();
        })
      )).then(shards => ({ index, entries: shards.flat() })))
      .then(bundle => {
        const merged = new Map(bundle.entries.map(tuple => {
          const entry = Array.isArray(tuple) ? {
            inputWord: tuple[0], primary: tuple[1], alternatives: tuple[2] || [],
            notes: tuple[3] || [], ambiguous: Boolean(tuple[4]), autoConvert: !Boolean(tuple[4])
          } : tuple;
          return [entry.inputWord, entry];
        }));
        for (const entry of asEntries(settings.masterDictionary)) merged.set(entry.inputWord, entry);
        for (const entry of asEntries(settings.customWords)) merged.set(entry.inputWord, entry);
        trie.loadDictionary({ entries: [...merged.values()] });
        if (document.body) startObserver();
      })
      .catch(error => console.error("[Accagannada] Failed to load vocabulary:", error));
  });
})();
