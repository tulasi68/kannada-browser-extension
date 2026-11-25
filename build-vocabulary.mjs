import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vocabularyImport from "./vocabulary-import.js";

const { parseMarkdownRows, buildVocabularyIndex } = vocabularyImport;
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const sourceText = fs.readFileSync(path.join(repoRoot, "newwords.txt"), "utf8");
const rows = parseMarkdownRows(sourceText);
const entries = buildVocabularyIndex(rows);

// A compact tuple format keeps each extension resource small:
// [inputWord, primary, alternatives[], notes[], ambiguous(0|1)].
const SHARD_SIZE = 1000;
const shards = [];
for (let offset = 0; offset < entries.length; offset += SHARD_SIZE) {
  const number = String(shards.length + 1).padStart(2, "0");
  const file = "vocabulary-" + number + ".json";
  const tuples = entries.slice(offset, offset + SHARD_SIZE).map(entry => [
    entry.inputWord, entry.primary, entry.alternatives, entry.notes, entry.ambiguous ? 1 : 0
  ]);
  fs.writeFileSync(path.join(here, file), JSON.stringify(tuples) + "\n");
  shards.push(file);
}

// Root candidates are stored separately and are not used for conversion until
// their part of speech and Kannada inflection paradigm have been reviewed.
const rootMap = new Map();
for (const row of rows.filter(item => item.sourceFormat === "master-table")) {
  const key = row.inputWord;
  const previous = rootMap.get(key);
  if (!previous) {
    rootMap.set(key, [
      key, row.primary, [...(row.alternatives || [])],
      row.note || "", row.category || "", row.sourceLine
    ]);
  } else {
    for (const alt of row.alternatives || []) {
      if (!previous[2].includes(alt)) previous[2].push(alt);
    }
  }
}
fs.writeFileSync(path.join(here, "root-candidates.json"), JSON.stringify([...rootMap.values()]) + "\n");

// Remove stale shards if the source vocabulary shrinks.
const active = new Set(shards);
for (const file of fs.readdirSync(here).filter(name => /^vocabulary-\d+\.json$/u.test(name))) {
  if (!active.has(file)) fs.unlinkSync(path.join(here, file));
}

const index = {
  schemaVersion: 2,
  format: "compact-arrays-v1",
  dataset: "KannadaWords newwords.txt",
  sourcePath: "newwords.txt",
  sourceBlobSha: "fb331f455a64d694a7f08ec6c178c5e4fa69730e",
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
console.log(JSON.stringify(index.stats));
