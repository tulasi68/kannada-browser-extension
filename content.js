// DOM Walker + Live MutationObserver for Accagannada Extension v5.0

const trie = new AccagannadaTrie();
let showTooltips = true;

function isAllowedHost(whitelistEnabled, allowedDomains) {
  if (!whitelistEnabled) return true;
  const host = window.location.hostname.toLowerCase();
  return allowedDomains.some((domain) => host === domain || host.endsWith("." + domain));
}

function buildTooltipText(original, data) {
  let tip = `ಮೂಲ (Original): ${original}`;
  if (data.alts && data.alts.length > 0) {
    tip += `\nಪರ್ಯಾಯ (Alternatives): ${data.alts.join(", ")}`;
  }
  if (data.note) {
    tip += `\nವಿವರ (Note): ${data.note}`;
  }
  return tip;
}

function processTextNode(textNode) {
  const raw = textNode.nodeValue;
  if (!raw || !/[\u0C80-\u0CFF]/.test(raw)) return;

  const segments = trie.tokenizeAndConvert(raw);
  if (!segments.some((s) => s.converted)) return;

  const frag = document.createDocumentFragment();
  for (const seg of segments) {
    if (seg.converted) {
      const span = document.createElement("span");
      span.className = showTooltips ? "accagannada-word accagannada-highlight" : "accagannada-word";
      span.textContent = seg.text;
      if (showTooltips) {
        span.title = buildTooltipText(seg.original, seg.data);
      }
      frag.appendChild(span);
    } else {
      frag.appendChild(document.createTextNode(seg.text));
    }
  }
  textNode.parentNode.replaceChild(frag, textNode);
}

function walkDOM(rootNode) {
  if (!rootNode) return;
  const skipTags = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "SELECT", "CODE", "PRE", "NOSCRIPT"]);

  const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (skipTags.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
      if (parent.classList && parent.classList.contains("accagannada-word")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const nodesToProcess = [];
  let current;
  while ((current = walker.nextNode())) {
    nodesToProcess.push(current);
  }
  for (const textNode of nodesToProcess) {
    processTextNode(textNode);
  }
}

const DEFAULT_DOMAINS = [
  "tv9kannada.com",
  "publictv.in",
  "prajavani.net",
  "vijaykarnataka.com",
  "kannadaprabha.com",
  "udayavani.com",
  "asianetnews.com",
  "oneindia.com",
  "news18.com",
  "zeenews.india.com"
];

chrome.storage.local.get(
  {
    isEnabled: true,
    showTooltips: true,
    whitelistOnly: false,
    allowedDomains: DEFAULT_DOMAINS,
    masterDictionary: null,
    customWords: {}
  },
  (settings) => {
    if (!settings.isEnabled) return;
    if (!isAllowedHost(settings.whitelistOnly, settings.allowedDomains)) return;

    showTooltips = settings.showTooltips;

    fetch(chrome.runtime.getURL("accagannada_news_dictionary.json"))
      .then((res) => res.json())
      .then((builtIn) => {
        const combined = {
          ...(builtIn.phrases || {}),
          ...(builtIn.roots || {}),
          ...(settings.masterDictionary || {}),
          ...(settings.customWords || {})
        };
        trie.loadDictionary(combined);
        walkDOM(document.body);

        const observer = new MutationObserver((mutations) => {
          for (const m of mutations) {
            for (const added of m.addedNodes) {
              if (added.nodeType === Node.ELEMENT_NODE) {
                walkDOM(added);
              } else if (added.nodeType === Node.TEXT_NODE) {
                processTextNode(added);
              }
            }
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
      });
  }
);
