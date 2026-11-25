(function (root) {
  "use strict";

  function clean(value) {
    return String(value == null ? "" : value).trim().normalize("NFC");
  }

  function sourceKey(value) {
    // The master table sometimes appends an IAST/Latin transliteration in parentheses.
    return clean(value).replace(/\s*\([^()]*\)\s*$/u, "").trim().normalize("NFC");
  }

  function splitAlternatives(value) {
    return clean(value).split(/\s*[,;]\s*|\s+\/\s+/u)
      .map(clean).filter(item => item && item !== "—" && item !== "-");
  }

  function splitPrimary(value) {
    return clean(value).split(/\s+\/\s+/u).map(clean).filter(Boolean);
  }

  function parsePipeCells(line) {
    const cells = [];
    let cell = "", escaped = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (escaped) { cell += ch; escaped = false; continue; }
      if (ch === "\\" && line[i + 1] === "|") { escaped = true; continue; }
      if (ch === "|") { cells.push(cell.trim()); cell = ""; }
      else cell += ch;
    }
    cells.push(cell.trim());
    if (cells[0] === "") cells.shift();
    if (cells.length && cells[cells.length - 1] === "") cells.pop();
    return cells;
  }

  function isSeparator(cells) {
    return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/u.test(cell));
  }

  function parseMarkdownRows(text) {
    const rows = [];
    let mode = "nuance";
    const lines = String(text || "").split(/\r?\n/u);
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index].trim();
      if (!line.startsWith("|")) continue;
      const cells = parsePipeCells(line);
      const header = cells.join(" | ").toLocaleLowerCase();
      if (header.includes("input word") && header.includes("primary accha kannada")) {
        mode = "nuance"; continue;
      }
      if (header.includes("ಮೂಲ ಪದ") && header.includes("ಇತರ ಪರ್ಯಾಯಗಳು") && header.includes("english meaning")) {
        mode = "native-table"; continue;
      }
      if ((header.includes("sanskrit / loan word") || header.includes("sanskrit / loanword")) && header.includes("area / domain")) {
        mode = "master-table"; continue;
      }
      if (isSeparator(cells) || !/^\d+$/u.test(cells[0] || "")) continue;
      if (cells.length < 4 || cells.length > 5) continue;

      const inputWord = sourceKey(cells[1]);
      const primaryRaw = clean(cells[2]);
      if (!inputWord || !primaryRaw) continue;

      const primaryParts = splitPrimary(primaryRaw);
      const primary = primaryParts[0] || primaryRaw;
      const alternatives = mode === "master-table"
        ? primaryParts.slice(1)
        : [...primaryParts.slice(1), ...splitAlternatives(cells[3] || "")];

      rows.push({
        inputWord, primary, primaryRaw,
        alternatives: [...new Set(alternatives)],
        note: mode === "master-table" ? clean(cells[3] || "") : clean(cells[4] || ""),
        category: mode === "master-table" ? clean(cells[4] || "") : "",
        sourceFormat: mode,
        sourceLine: index + 1,
        sourceNumber: Number(cells[0]),
        sourceWord: clean(cells[1]),
        alternativeText: mode === "master-table" ? "" : clean(cells[3] || "")
      });
    }
    return rows;
  }

  function parseDelimited(text, delimiter) {
    const rows = [];
    let row = [], cell = "", quoted = false;
    const input = String(text || "");
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (ch === '"') {
        if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
        else quoted = !quoted;
      } else if (ch === delimiter && !quoted) {
        row.push(cell); cell = "";
      } else if ((ch === "\n" || ch === "\r") && !quoted) {
        if (ch === "\r" && input[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += ch;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function rowsFromDelimited(text, delimiter) {
    const rawRows = parseDelimited(text, delimiter);
    const rows = [];
    let start = 0;
    if (rawRows.length) {
      const h = rawRows[0].map(clean).join(" ").toLocaleLowerCase();
      if (h.includes("input word") || h.includes("ಮೂಲ ಪದ") || h.includes("sanskrit")) start = 1;
    }
    for (let i = start; i < rawRows.length; i++) {
      const cells = rawRows[i].map(clean);
      if (cells.length < 3) continue;
      const offset = /^\d+$/u.test(cells[0]) ? 1 : 0;
      const inputWord = sourceKey(cells[offset]);
      const primaryRaw = clean(cells[offset + 1]);
      if (!inputWord || !primaryRaw) continue;
      const primaryParts = splitPrimary(primaryRaw);
      rows.push({
        inputWord, primary: primaryParts[0] || primaryRaw, primaryRaw,
        alternatives: [...primaryParts.slice(1), ...splitAlternatives(cells[offset + 2] || "")],
        note: clean(cells[offset + 3] || ""),
        category: "",
        sourceFormat: delimiter === "\t" ? "tsv" : "csv",
        sourceLine: i + 1,
        sourceNumber: offset ? Number(cells[0]) : null,
        sourceWord: cells[offset],
        alternativeText: cells[offset + 2] || ""
      });
    }
    return rows;
  }

  function buildVocabularyIndex(rows) {
    const grouped = new Map();
    for (const row of rows || []) {
      const key = sourceKey(row.inputWord);
      const primaryParts = splitPrimary(row.primaryRaw || row.primary);
      const primary = primaryParts[0] || clean(row.primary);
      if (!key || !primary) continue;
      const item = grouped.get(key) || {
        inputWord: key, primaryCandidates: [], alternatives: [], notes: [],
        categories: [], sourceFormats: [], sourceLines: [], sourceRecords: [], forceAmbiguous: false
      };
      for (const candidate of [primary, ...primaryParts.slice(1), ...(row.alternatives || [])]) {
        const value = clean(candidate);
        if (value && value !== primary && !item.alternatives.includes(value)) item.alternatives.push(value);
      }
      if (!item.primaryCandidates.includes(primary)) item.primaryCandidates.push(primary);
      for (const note of [...(row.notes || []), row.note || ""]) {
        const value = clean(note);
        if (value && !item.notes.includes(value)) item.notes.push(value);
      }
      if (row.category && !item.categories.includes(row.category)) item.categories.push(row.category);
      if (row.ambiguous || row.autoConvert === false) item.forceAmbiguous = true;
      if (row.sourceFormat && !item.sourceFormats.includes(row.sourceFormat)) item.sourceFormats.push(row.sourceFormat);
      if (row.sourceLine != null) item.sourceLines.push(row.sourceLine);
      item.sourceRecords.push({
        sourceLine: row.sourceLine,
        sourceNumber: row.sourceNumber,
        sourceFormat: row.sourceFormat,
        sourceWord: row.sourceWord,
        primaryRaw: row.primaryRaw,
        alternativeText: row.alternativeText,
        note: row.note,
        category: row.category
      });
      grouped.set(key, item);
    }

    return [...grouped.values()].map(item => {
      const ambiguous = item.primaryCandidates.length > 1 || item.forceAmbiguous;
      const primary = item.primaryCandidates[0] || "";
      const alternatives = [...new Set([
        ...item.primaryCandidates.slice(1),
        ...item.alternatives
      ])].filter(value => value !== primary);
      return {
        inputWord: item.inputWord,
        primary,
        alternatives,
        notes: item.notes,
        categories: item.categories,
        sourceFormats: item.sourceFormats,
        sourceLines: item.sourceLines,
        sourceRecords: item.sourceRecords,
        ambiguous,
        autoConvert: !ambiguous && Boolean(primary),
        reviewStatus: ambiguous ? "conflicting-primary-review" : "source-exact-match"
      };
    });
  }

  function rowsFromJson(parsed) {
    if (Array.isArray(parsed)) {
      return parsed.map((v, i) => ({
        inputWord: sourceKey(v.inputWord || v.word || v.source),
        primary: clean(v.primary || v.preferred || v.acchaKannada),
        primaryRaw: clean(v.primary || v.preferred || v.acchaKannada),
        alternatives: Array.isArray(v.alternatives) ? v.alternatives : (Array.isArray(v.alts) ? v.alts : splitAlternatives(v.alternatives || v.alts || "")),
        note: clean(v.note || v.meaning || ""),
        notes: Array.isArray(v.notes) ? v.notes : [],
        category: clean(v.category || ""),
        ambiguous: Boolean(v.ambiguous),
        autoConvert: v.autoConvert,
        sourceFormat: "json", sourceLine: i + 1, sourceWord: v.inputWord || v.word || v.source || ""
      })).filter(v => v.inputWord && v.primary);
    }
    const rows = [];
    const addMap = (obj, format) => {
      for (const [word, value] of Object.entries(obj || {})) {
        if (!value) continue;
        const val = typeof value === "string" ? { primary: value } : value;
        const primaryRaw = clean(val.primary || val.preferred || val.acchaKannada);
        if (!primaryRaw) continue;
        rows.push({
          inputWord: sourceKey(word), primary: splitPrimary(primaryRaw)[0] || primaryRaw,
          primaryRaw, alternatives: Array.isArray(val.alts) ? val.alts : (Array.isArray(val.alternatives) ? val.alternatives : splitAlternatives(val.alts || val.alternatives || "")),
          note: clean(val.note || val.meaning || ""), notes: Array.isArray(val.notes) ? val.notes : [],
          category: clean(val.category || ""), ambiguous: Boolean(val.ambiguous), autoConvert: val.autoConvert,
          sourceFormat: format, sourceWord: word
        });
      }
    };
    if (parsed && Array.isArray(parsed.entries)) return rowsFromJson(parsed.entries);
    if (parsed && (parsed.roots || parsed.phrases)) {
      addMap(parsed.phrases, "json-phrase"); addMap(parsed.roots, "json-root");
    } else addMap(parsed, "json");
    return rows;
  }

  function parseVocabularyFile(rawText, fileName) {
    const name = String(fileName || "").toLowerCase();
    let rows;
    if (name.endsWith(".json")) rows = rowsFromJson(JSON.parse(rawText));
    else if (name.endsWith(".csv")) rows = rowsFromDelimited(rawText, ",");
    else if (name.endsWith(".tsv")) rows = rowsFromDelimited(rawText, "\t");
    else rows = parseMarkdownRows(rawText);
    return buildVocabularyIndex(rows);
  }

  const api = { clean, sourceKey, parsePipeCells, parseMarkdownRows, parseDelimited, rowsFromDelimited, buildVocabularyIndex, rowsFromJson, parseVocabularyFile };
  root.AccaVocabularyImport = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
