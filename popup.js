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

const statusDiv = document.getElementById("status");
let bundledStats = null;

async function loadBundledVocabulary() {
  const response = await fetch(chrome.runtime.getURL("vocabulary.json"));
  if (!response.ok) throw new Error("Vocabulary index could not be loaded");
  const index = await response.json();
  const shards = await Promise.all((index.shards || []).map(async file => {
    const result = await fetch(chrome.runtime.getURL(file));
    if (!result.ok) throw new Error("Vocabulary shard could not be loaded: " + file);
    return result.json();
  }));
  const entries = shards.flat().map(tuple => Array.isArray(tuple) ? ({
    inputWord: tuple[0], primary: tuple[1], alternatives: tuple[2] || [],
    notes: tuple[3] || [], ambiguous: Boolean(tuple[4]), autoConvert: !Boolean(tuple[4])
  }) : tuple);
  return { index, entries };
}
function showStatus(msg) {
  statusDiv.textContent = msg;
  setTimeout(() => (statusDiv.textContent = ""), 2500);
}

function reloadActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0] && tabs[0].id) chrome.tabs.reload(tabs[0].id);
  });
}

// Tab switching
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

// Load settings & initialize
chrome.storage.local.get(
  {
    isEnabled: true,
    showTooltips: true,
    whitelistOnly: false,
    allowedDomains: DEFAULT_DOMAINS,
    masterDictionary: {},
    customWords: {}
  },
  (data) => {
    document.getElementById("toggleActive").checked = data.isEnabled;
    document.getElementById("toggleHighlight").checked = data.showTooltips;
    document.getElementById("toggleWhitelist").checked = data.whitelistOnly;

    renderCustomWords(data.customWords);
    renderDomains(data.allowedDomains);
    fetch(chrome.runtime.getURL("vocabulary.json"))
      .then(response => response.json())
      .then(dataset => { bundledStats = dataset.stats; updateCountBadge(data.masterDictionary, data.customWords, dataset.stats); })
      .catch(() => updateCountBadge(data.masterDictionary, data.customWords, null));
  }
);

function updateCountBadge(masterDict, customWords, builtInStats) {
  const masterCount = masterDict ? Object.keys(masterDict).length : 0;
  const customCount = customWords ? Object.keys(customWords).length : 0;
  const stats = builtInStats || bundledStats;
  const builtInCount = stats ? stats.uniqueForms : 0;
  const ambiguous = stats ? stats.ambiguousForms : 0;
  document.getElementById("dictCountBadge").textContent =
    `ಪದರೂಪಗಳು: ${builtInCount} ನಿಘಂಟು / ${masterCount} ಆಮದು / ${customCount} ಸ್ವಂತ; ಪರಿಶೀಲನೆ: ${ambiguous}`;
}

// Toggles
document.getElementById("toggleActive").addEventListener("change", (e) => {
  chrome.storage.local.set({ isEnabled: e.target.checked }, reloadActiveTab);
});
document.getElementById("toggleHighlight").addEventListener("change", (e) => {
  chrome.storage.local.set({ showTooltips: e.target.checked }, reloadActiveTab);
});
document.getElementById("toggleWhitelist").addEventListener("change", (e) => {
  chrome.storage.local.set({ whitelistOnly: e.target.checked }, reloadActiveTab);
});

// Add single custom root word
document.getElementById("addWordBtn").addEventListener("click", () => {
  const skt = document.getElementById("sanskritInput").value.trim().normalize("NFC");
  const nat = document.getElementById("nativeInput").value.trim().normalize("NFC");
  const alts = document.getElementById("altInput").value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!skt || !nat) return;

  chrome.storage.local.get({ customWords: {}, masterDictionary: {} }, (data) => {
    const updated = {
      ...data.customWords,
      [skt]: { primary: nat, alts: alts, note: "Custom entry" }
    };
    chrome.storage.local.set({ customWords: updated }, () => {
      document.getElementById("sanskritInput").value = "";
      document.getElementById("nativeInput").value = "";
      document.getElementById("altInput").value = "";
      renderCustomWords(updated);
      updateCountBadge(data.masterDictionary, updated);
      showStatus("ಪದ ಉಳಿಸಲಾಗಿದೆ! (Saved)");
      reloadActiveTab();
    });
  });
});

function renderCustomWords(words) {
  const box = document.getElementById("customList");
  box.replaceChildren();
  for (const [skt, val] of Object.entries(words || {})) {
    const primary = typeof val === "string" ? val : val.primary;
    const div = document.createElement("div");
    div.className = "list-item";
    const label = document.createElement("span");
    label.textContent = skt + " → ";
    const strong = document.createElement("b");
    strong.textContent = primary || "";
    label.appendChild(strong);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "del-btn";
    remove.dataset.skt = skt;
    remove.textContent = "✕";
    div.append(label, remove);
    box.appendChild(div);
  }
  box.querySelectorAll(".del-btn").forEach(btn => {
    btn.addEventListener("click", event => {
      const key = event.currentTarget.dataset.skt;
      chrome.storage.local.get({ customWords: {}, masterDictionary: {} }, data => {
        delete data.customWords[key];
        chrome.storage.local.set({ customWords: data.customWords }, () => {
          renderCustomWords(data.customWords);
          updateCountBadge(data.masterDictionary, data.customWords);
          reloadActiveTab();
        });
      });
    });
  });
}

// Live exact-form tester using the same bundled vocabulary as page conversion.
document.getElementById("runTestBtn").addEventListener("click", () => {
  const sampleText = document.getElementById("testInput").value.trim();
  if (!sampleText) return;
  chrome.storage.local.get({ masterDictionary: {}, customWords: {} }, settings => {
    loadBundledVocabulary()
      .then(bundle => {
        const merged = new Map(bundle.entries.map(entry => [entry.inputWord, entry]));
        for (const [word, value] of Object.entries(settings.masterDictionary || {})) {
          merged.set(word, { inputWord: word, ...(typeof value === "string" ? { primary: value } : value) });
        }
        for (const [word, value] of Object.entries(settings.customWords || {})) {
          merged.set(word, { inputWord: word, ...(typeof value === "string" ? { primary: value } : value) });
        }
        const testTrie = new AccagannadaTrie();
        testTrie.loadDictionary({ entries: [...merged.values()] });
        document.getElementById("testOutput").textContent = testTrie.convertText(sampleText);
      })
      .catch(() => showStatus("ಪದಕೋಶ ತೆರೆಯಲು ಆಗಲಿಲ್ಲ (Could not load vocabulary)"));
  });
});

// Robust import for Markdown, CSV, TSV and JSON vocabulary files.
function parseVocabularyFile(rawText, fileName) {
  if (!window.AccaVocabularyImport) throw new Error("Vocabulary importer is unavailable");
  return window.AccaVocabularyImport.parseVocabularyFile(rawText, fileName);
}

document.getElementById("importBulkBtn").addEventListener("click", () => {
  const fileInput = document.getElementById("bulkFileInput");
  const file = fileInput.files[0];
  if (!file) {
    showStatus("ಮೊದಲು ಫೈಲ್ ಆಯ್ಕೆ ಮಾಡಿ (Select a file first)");
    return;
  }
  const reader = new FileReader();
  reader.onload = event => {
    try {
      const parsed = parseVocabularyFile(event.target.result, file.name.toLowerCase());
      const parsedDict = Object.fromEntries(parsed.map(entry => [entry.inputWord, entry]));
      const count = Object.keys(parsedDict).length;
      if (!count) {
        showStatus("ಯಾವುದೇ ಪದಗಳು ಸಿಗಲಿಲ್ಲ (No valid rows found)");
        return;
      }
      const ambiguous = parsed.filter(entry => entry.ambiguous).length;
      chrome.storage.local.get({ customWords: {} }, data => {
        chrome.storage.local.set({ masterDictionary: parsedDict }, () => {
          fetch(chrome.runtime.getURL("vocabulary.json"))
            .then(response => response.json())
            .then(dataset => updateCountBadge(parsedDict, data.customWords, dataset.stats))
            .catch(() => updateCountBadge(parsedDict, data.customWords));
          showStatus(`${count} ಪದಗಳು ಆಮದು; ${ambiguous} ಪದಗಳಿಗೆ ಪರಿಶೀಲನೆ ಬೇಕು`);
          reloadActiveTab();
        });
      });
    } catch (error) {
      console.error(error);
      showStatus("ಫೈಲ್ ಓದುವಲ್ಲಿ ದೋಷ (Invalid file format)");
    }
  };
  reader.readAsText(file, "UTF-8");
});

document.getElementById("exportJsonBtn").addEventListener("click", () => {
  chrome.storage.local.get({ masterDictionary: {}, customWords: {} }, settings => {
    loadBundledVocabulary()
      .then(bundle => {
        const merged = new Map(bundle.entries.map(entry => [entry.inputWord, entry]));
        for (const [word, value] of Object.entries(settings.masterDictionary || {})) {
          merged.set(word, { inputWord: word, ...(typeof value === "string" ? { primary: value } : value) });
        }
        for (const [word, value] of Object.entries(settings.customWords || {})) {
          merged.set(word, { inputWord: word, ...(typeof value === "string" ? { primary: value } : value) });
        }
        const blob = new Blob([JSON.stringify({ schemaVersion: 2, entries: [...merged.values()] }, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "accagannada-vocabulary.json";
        anchor.click();
        URL.revokeObjectURL(url);
      });
  });
});

document.getElementById("clearMasterBtn").addEventListener("click", () => {
  chrome.storage.local.get({ customWords: {} }, data => {
    chrome.storage.local.set({ masterDictionary: {} }, () => {
      updateCountBadge({}, data.customWords);
      showStatus("ಆಮದು ಪದಕೋಶ ತೆರವುಗೊಳಿಸಲಾಗಿದೆ (Cleared)");
      reloadActiveTab();
    });
  });
});

// Website Whitelist Management
function renderDomains(domains) {
  const box = document.getElementById("domainList");
  box.replaceChildren();
  for (const domain of domains || []) {
    const div = document.createElement("div");
    div.className = "list-item";
    const label = document.createElement("span");
    label.textContent = domain;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "del-btn";
    remove.dataset.domain = domain;
    remove.textContent = "✕";
    div.append(label, remove);
    box.appendChild(div);
  }
  box.querySelectorAll(".del-btn").forEach(btn => {
    btn.addEventListener("click", event => {
      const target = event.currentTarget.dataset.domain;
      chrome.storage.local.get({ allowedDomains: DEFAULT_DOMAINS }, data => {
        const updated = data.allowedDomains.filter(item => item !== target);
        chrome.storage.local.set({ allowedDomains: updated }, () => {
          renderDomains(updated);
          reloadActiveTab();
        });
      });
    });
  });
}

document.getElementById("addDomainBtn").addEventListener("click", () => {
  const raw = document.getElementById("domainInput").value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!raw) return;
  chrome.storage.local.get({ allowedDomains: DEFAULT_DOMAINS }, (data) => {
    const updated = Array.from(new Set([...data.allowedDomains, raw]));
    chrome.storage.local.set({ allowedDomains: updated }, () => {
      document.getElementById("domainInput").value = "";
      renderDomains(updated);
      showStatus("ತಾಣ ಸೇರಿಸಲಾಗಿದೆ!");
      reloadActiveTab();
    });
  });
});
