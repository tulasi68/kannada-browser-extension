import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vocabularyImport from "./vocabulary-import.js";

const { parseMarkdownRows, buildVocabularyIndex } = vocabularyImport;
const here = path.dirname(fileURLToPath(import.meta.url));
const sourceRepository = "tulasi68/Kannadawords";
const sourcePath = "newwords.txt";
const sourceRef = process.env.KANNADAWORDS_REF || "main";
const metadataUrl = `https://api.github.com/repos/${sourceRepository}/contents/${sourcePath}?ref=${encodeURIComponent(sourceRef)}`;

async function fetchResponse(url, label) {
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status} (${url})`);
  return response;
}

const metadata = await (await fetchResponse(metadataUrl, "Vocabulary metadata request failed")).json();
if (!metadata.sha || !metadata.download_url) {
  throw new Error("GitHub did not return a source blob SHA and download URL.");
}
const sourceResponse = await fetchResponse(metadata.download_url, "Vocabulary download failed");
const sourceText = await sourceResponse.text();
const rows = parseMarkdownRows(sourceText);
if (!rows.length) throw new Error("No vocabulary rows parsed; existing generated files were not replaced.");

const entries = buildVocabularyIndex(rows);
if (!entries.length) throw new Error("Vocabulary index is empty; existing generated files were not replaced.");

const SHARD_SIZE = 1000;
const shards = [];
for (let offset = 0; offset < entries.length; offset += SHARD_SIZE) {
  const number = String(shards.length + 1).padStart(2, "0");
  const file = `vocabulary-${number}.json`;
  const tuples = entries.slice(offset, offset + SHARD_SIZE).map(entry => [
    entry.inputWord, entry.primary, entry.alternatives, entry.notes, entry.ambiguous ? 1 : 0
  ]);
  fs.writeFileSync(path.join(here, file), JSON.stringify(tuples) + "\n");
  shards.push(file);
}

const rootMap = new Map();
for (const row of rows.filter(item => item.sourceFormat === "master-table")) {
  const previous = rootMap.get(row.inputWord);
  if (!previous) {
    rootMap.set(row.inputWord, [
      row.inputWord, row.primary, [...(row.alternatives || [])],
      row.note || "", row.category || "", row.sourceLine
    ]);
  } else {
    for (const alt of row.alternatives || []) {
      if (!previous[2].includes(alt)) previous[2].push(alt);
    }
  }
}
fs.writeFileSync(path.join(here, "root-candidates.json"), JSON.stringify([...rootMap.values()]) + "\n");

const activeShards = new Set(shards);
for (const file of fs.readdirSync(here).filter(name => /^vocabulary-\d+\.json$/u.test(name))) {
  if (!activeShards.has(file)) fs.unlinkSync(path.join(here, file));
}

const index = {
  schemaVersion: 2,
  format: "compact-arrays-v1",
  dataset: "KannadaWords newwords.txt",
  sourceRepository,
  sourcePath,
  sourceRef,
  sourceBlobSha: metadata.sha,
  policy: {
    exactForms: "Source vocabulary forms are matched exactly.",
    ambiguousForms: "Entries with conflicting preferred alternatives are not auto-converted.",
    morphology: "Root candidates remain inactive until a Kannada-specific paradigm is reviewed and explicitly approved."
  },
  stats: {
    sourceRows: rows.length,
    uniqueForms: entries.length,
    autoConvertibleForms: entries.filter(item => item.autoConvert).length,
    ambiguousForms: entries.filter(item => item.ambiguous).length,
    rootCandidates: rootMap.size
  },
  shards,
  rootCandidatesFile: "root-candidates.json"
};
fs.writeFileSync(path.join(here, "vocabulary.json"), JSON.stringify(index, null, 2) + "\n");
console.log(JSON.stringify({ sourceRef, sourceBlobSha: metadata.sha, ...index.stats }, null, 2));
