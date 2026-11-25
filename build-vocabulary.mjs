import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceRepository = "tulasi68/Kannadawords";
const sourcePath = "MergedMasterCopy_10000.csv";
const sourceRef = process.env.KANNADAWORDS_REF || "main";
const metadataUrl = `https://api.github.com/repos/${sourceRepository}/contents/${sourcePath}?ref=${encodeURIComponent(sourceRef)}`;

async function fetchResponse(url, label) {
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status} (${url})`);
  return response;
}

function parseCsv(text) {
  const rows = []; let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  if (quoted) throw new Error("Master CSV contains an unterminated quoted field.");
  return rows;
}

function parseArray(value, label) {
  let parsed;
  try { parsed = JSON.parse(value || "[]"); }
  catch { throw new Error(`Invalid JSON array in ${label}`); }
  if (!Array.isArray(parsed)) throw new Error(`Expected JSON array in ${label}`);
  return parsed.map(item => String(item || "").trim()).filter(Boolean);
}

const metadata = await (await fetchResponse(metadataUrl, "Master CSV metadata request failed")).json();
if (!metadata.sha || !metadata.download_url) throw new Error("GitHub did not return a source blob SHA and download URL.");
const sourceText = await (await fetchResponse(metadata.download_url, "Master CSV download failed")).text();
const rows = parseCsv(sourceText);
const expectedHeader = [
  "Entry ID", "Source Word / Loanword", "Primary Accha Kannada", "Alternative Native Options",
  "English Meaning", "Category / Domain", "Naturalness Fit", "Dravidian Root",
  "Usage & Etymology Notes", "Dataset Origin", "Resolution Status", "All Sources"
];
if (!rows.length || expectedHeader.some((name, index) => rows[0][index] !== name)) {
  throw new Error("Master CSV header does not match the expected 12-column schema; existing generated files were not replaced.");
}
const sourceRows = rows.slice(1).filter(row => row.some(value => value.trim()));
if (sourceRows.length !== 8470 || sourceRows.some(row => row.length !== 12)) {
  throw new Error(`Master CSV integrity check failed: expected 8,470 rows of 12 columns, received ${sourceRows.length} rows.`);
}

const byForm = new Map();
for (let index = 0; index < sourceRows.length; index++) {
  const row = sourceRows[index];
  const id = String(row[0] || "").trim();
  const forms = String(row[1] || "").split(/\\s*\\/\\s*/u).map(value => value.trim().normalize("NFC")).filter(Boolean);
  const primaryOptions = parseArray(row[2], `primary suggestions at CSV row ${index + 2}`);
  const alternatives = parseArray(row[3], `alternative suggestions at CSV row ${index + 2}`);
  if (!forms.length || !primaryOptions.length) continue;
  const notes = [
    row[6] ? "Naturalness fit: " + row[6] : "",
    row[7] ? "Dravidian root field: " + row[7] : "",
    row[8] ? row[8] : ""
  ].filter(Boolean);
  for (const inputWord of forms) {
    if (!byForm.has(inputWord)) byForm.set(inputWord, {
      inputWord, primary: primaryOptions[0], alternatives: [], notes: [],
      ambiguous: primaryOptions.length !== 1, primaryChoices: new Set(primaryOptions)
    });
    const entry = byForm.get(inputWord);
    for (const choice of primaryOptions) entry.primaryChoices.add(choice);
    if (entry.primaryChoices.size !== 1) entry.ambiguous = true;
    for (const value of alternatives) if (!entry.alternatives.includes(value)) entry.alternatives.push(value);
    for (const note of notes) if (!entry.notes.includes(note)) entry.notes.push(note);
    if (id) entry.sourceIds = [...(entry.sourceIds || []), id];
  }
}
const entries = [...byForm.values()].map(entry => {
  const choices = [...entry.primaryChoices];
  return {
    inputWord: entry.inputWord,
    primary: choices.length === 1 ? choices[0] : entry.primary,
    alternatives: entry.alternatives,
    notes: entry.notes,
    ambiguous: entry.ambiguous,
    autoConvert: !entry.ambiguous
  };
});
if (!entries.length) throw new Error("No usable vocabulary entries parsed; existing generated files were not replaced.");

const SHARD_SIZE = 1000;
const shards = [];
for (let offset = 0; offset < entries.length; offset += SHARD_SIZE) {
  const number = String(shards.length + 1).padStart(2, "0");
  const file = `vocabulary-${number}.json`;
  const tuples = entries.slice(offset, offset + SHARD_SIZE).map(entry => [
    entry.inputWord, entry.primary, entry.alternatives, entry.notes, entry.ambiguous ? 1 : 0
  ]);
  fs.writeFileSync(path.join(here, file), JSON.stringify(tuples) + "\\n");
  shards.push(file);
}
fs.writeFileSync(path.join(here, "root-candidates.json"), "[]\\n");

const activeShards = new Set(shards);
for (const file of fs.readdirSync(here).filter(name => /^vocabulary-\\d+\\.json$/u.test(name))) {
  if (!activeShards.has(file)) fs.unlinkSync(path.join(here, file));
}
const index = {
  schemaVersion: 2,
  format: "compact-arrays-v1",
  dataset: "Kannadawords MergedMasterCopy_10000.csv",
  sourceRepository, sourcePath, sourceRef, sourceBlobSha: metadata.sha,
  policy: {
    exactForms: "Only explicit source forms in the master CSV are matched.",
    ambiguousForms: "Multiple preferred primary options for a source form are never auto-converted.",
    morphology: "No suffix stripping, conjugation, or inferred morphology is performed."
  },
  stats: {
    sourceRows: sourceRows.length,
    uniqueForms: entries.length,
    autoConvertibleForms: entries.filter(entry => entry.autoConvert).length,
    ambiguousForms: entries.filter(entry => entry.ambiguous).length
  },
  shards,
  rootCandidatesFile: "root-candidates.json"
};
fs.writeFileSync(path.join(here, "vocabulary.json"), JSON.stringify(index, null, 2) + "\\n");
console.log(JSON.stringify({ sourceRef, sourceBlobSha: metadata.sha, ...index.stats }, null, 2));
