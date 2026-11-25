// ಅಚ್ಚ ಕನ್ನಡ News Converter — conservative exact-form engine.
// Morphology is intentionally gated by reviewed paradigms; the source vocabulary
// contains both roots and inflected forms, so suffix stripping is not guessed.
(function (root) {
  "use strict";

  const KANNADA_CHAR = /[\u0C80-\u0CFF]/u;

  class AccagannadaTrie {
    constructor() {
      this.root = {};
      this.size = 0;
      this.ambiguousCount = 0;
    }

    insert(word, value) {
      const key = String(word || "").trim().normalize("NFC");
      if (!key || !value) return;
      const entry = typeof value === "string"
        ? { inputWord: key, primary: value.trim(), alternatives: [], notes: [], autoConvert: true }
        : { inputWord: key, ...value };
      if (!entry.primary) return;

      let node = this.root;
      for (const char of key) {
        if (!node[char]) node[char] = {};
        node = node[char];
      }
      node._entry = entry;
    }

    loadDictionary(dataset) {
      this.root = {};
      this.size = 0;
      this.ambiguousCount = 0;
      let entries = [];

      if (dataset && Array.isArray(dataset.entries)) {
        entries = dataset.entries.map(value => Array.isArray(value) ? ({
          inputWord: value[0],
          primary: value[1],
          alternatives: value[2] || [],
          notes: value[3] || [],
          ambiguous: Boolean(value[4]),
          autoConvert: !Boolean(value[4])
        }) : value);
      } else if (dataset && (dataset.roots || dataset.phrases)) {
        for (const [word, value] of Object.entries(dataset.phrases || {})) entries.push({ inputWord: word, ...(typeof value === "string" ? { primary: value } : value) });
        for (const [word, value] of Object.entries(dataset.roots || {})) entries.push({ inputWord: word, ...(typeof value === "string" ? { primary: value } : value) });
      } else if (dataset && typeof dataset === "object") {
        entries = Object.entries(dataset).map(([word, value]) => ({
          inputWord: word,
          ...(typeof value === "string" ? { primary: value } : value)
        }));
      }

      for (const entry of entries) {
        if (!entry || !entry.inputWord || !entry.primary) continue;
        this.insert(entry.inputWord, entry);
        this.size++;
        if (entry.ambiguous) this.ambiguousCount++;
      }
      return { size: this.size, ambiguousCount: this.ambiguousCount };
    }

    lookupExact(word) {
      let node = this.root;
      for (const char of String(word || "").normalize("NFC")) {
        if (!node[char]) return null;
        node = node[char];
      }
      return node._entry || null;
    }

    findPhraseMatch(text, start) {
      let node = this.root;
      let match = null;
      let end = start;
      for (let i = start; i < text.length; i++) {
        const char = text[i];
        if (!node[char]) break;
        node = node[char];
        const next = text[i + 1] || "";
        if (node._entry && (i + 1 === text.length || !KANNADA_CHAR.test(next))) {
          match = node._entry;
          end = i + 1;
        }
      }
      return match ? { data: match, end } : null;
    }

    resolveWord(token) {
      const entry = this.lookupExact(token);
      if (!entry || entry.autoConvert === false || entry.ambiguous) return null;
      return { data: entry, text: entry.primary, original: token };
    }

    tokenizeAndConvert(input) {
      const text = String(input == null ? "" : input);
      const segments = [];
      let i = 0;

      while (i < text.length) {
        const isKannada = KANNADA_CHAR.test(text[i]);
        const isWordStart = i === 0 || !KANNADA_CHAR.test(text[i - 1]);

        if (isKannada && isWordStart) {
          const phrase = this.findPhraseMatch(text, i);
          if (phrase && phrase.data.autoConvert !== false && !phrase.data.ambiguous) {
            const original = text.slice(i, phrase.end);
            segments.push({ converted: true, text: phrase.data.primary, original, data: phrase.data });
            i = phrase.end;
            continue;
          }

          let end = i;
          while (end < text.length && KANNADA_CHAR.test(text[end])) end++;
          const word = text.slice(i, end);
          const resolved = this.resolveWord(word);
          if (resolved) {
            segments.push({ converted: true, text: resolved.text, original: word, data: resolved.data });
          } else {
            const exact = this.lookupExact(word);
            segments.push({ converted: false, text: word, ambiguous: Boolean(exact && exact.ambiguous), data: exact || null });
          }
          i = end;
        } else {
          let end = i + 1;
          while (end < text.length && !KANNADA_CHAR.test(text[end])) end++;
          segments.push({ converted: false, text: text.slice(i, end) });
          i = end;
        }
      }
      return segments;
    }

    convertText(input) {
      return this.tokenizeAndConvert(input).map(segment => segment.text).join("");
    }
  }

  root.AccagannadaTrie = AccagannadaTrie;
  if (typeof module !== "undefined" && module.exports) module.exports = { AccagannadaTrie };
})(typeof globalThis !== "undefined" ? globalThis : this);
