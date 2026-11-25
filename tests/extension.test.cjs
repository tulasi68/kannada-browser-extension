const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseVocabularyFile, parseMarkdownRows, buildVocabularyIndex } = require("../vocabulary-import.js");
const { AccagannadaTrie } = require("../trie_converter.js");

const root = path.join(__dirname, "..");
const index = JSON.parse(fs.readFileSync(path.join(root, "vocabulary.json"), "utf8"));
const tuples = index.shards.flatMap(file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8")));
const entries = tuples.map(tuple => ({
  inputWord: tuple[0], primary: tuple[1], alternatives: tuple[2],
  notes: tuple[3], ambiguous: Boolean(tuple[4]), autoConvert: !Boolean(tuple[4])
}));

test("generated bundle contains source provenance and complete shard set", () => {
  assert.equal(index.sourceRepository, "tulasi68/Kannadawords");
  assert.equal(index.sourcePath, "newwords.txt");
  assert.match(index.sourceBlobSha, /^[a-f0-9]{40}$/u);
  assert.equal(entries.length, index.stats.uniqueForms);
  assert.equal(index.shards.length, 4);
});

test("Markdown importer preserves blank alternative cells and notes", () => {
  const source = [
    "| # | Input Word | Primary Accha Kannada | Alternative Native Options | Nuance / Usage Note |",
    "| --- | --- | --- | --- | --- |",
    "| 1 | ಮೂಲಪದ | ಹೊಸಪದ |  | ಬಳಕೆಯ ಸೂಚನೆ |"
  ].join("\n");
  const rows = parseMarkdownRows(source);
  const result = buildVocabularyIndex(rows);
  assert.equal(result.length, 1);
  assert.equal(result[0].primary, "ಹೊಸಪದ");
  assert.deepEqual(result[0].alternatives, []);
  assert.deepEqual(result[0].notes, ["ಬಳಕೆಯ ಸೂಚನೆ"]);
});

test("CSV importer handles quoted commas and escaped quotes", () => {
  const source = 'Input Word,Primary,Alternatives,Note\n"ಮೂಲಪದ","ಹೊಸಪದ","ಪರ್ಯಾಯ, ಇನ್ನೊಂದು","ಅರ್ಥ ""ವಿವರ"""\n';
  const result = parseVocabularyFile(source, "sample.csv");
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].alternatives, ["ಪರ್ಯಾಯ", "ಇನ್ನೊಂದು"]);
  assert.equal(result[0].notes[0], 'ಅರ್ಥ "ವಿವರ"');
});

test("JSON importer accepts phrase and root maps", () => {
  const source = JSON.stringify({
    phrases: { "ಹಳೆಯ ಮಾತು": { primary: "ಹೊಸ ಮಾತು", alts: ["ಮತ್ತೊಂದು"] } },
    roots: { "ಮೂಲಪದ": { primary: "ಹೊಸಪದ", note: "ಸೂಚನೆ" } }
  });
  const result = parseVocabularyFile(source, "dictionary.json");
  assert.equal(result.length, 2);
  assert.ok(result.some(entry => entry.inputWord === "ಹಳೆಯ ಮಾತು"));
  assert.ok(result.some(entry => entry.inputWord === "ಮೂಲಪದ"));
});

test("trie prefers longest phrase and preserves ambiguous or unknown forms", () => {
  const trie = new AccagannadaTrie();
  trie.loadDictionary({ entries: [
    { inputWord: "ಸುದ್ದಿ", primary: "ಹೊಸತು", autoConvert: true },
    { inputWord: "ಹೊಸ ಸುದ್ದಿ", primary: "ಹೊಸ ಬಿತ್ತಿ", autoConvert: true },
    { inputWord: "ಗೊಂದಲ", primary: "ತಿಕ್ಕಾಟ", ambiguous: true, autoConvert: false }
  ] });
  assert.equal(trie.convertText("ಹೊಸ ಸುದ್ದಿ ಬಂದಿದೆ."), "ಹೊಸ ಬಿತ್ತಿ ಬಂದಿದೆ.");
  assert.equal(trie.convertText("ಸುದ್ದಿ, ಗೊಂದಲ ಮತ್ತು ಅಪರಿಚಿತಪದ"), "ಹೊಸತು, ಗೊಂದಲ ಮತ್ತು ಅಪರಿಚಿತಪದ");
});

test("real vocabulary examples obey exact-match and ambiguity policy", () => {
  const trie = new AccagannadaTrie();
  trie.loadDictionary({ entries });
  assert.equal(trie.convertText("ಪ್ರಜಾಪ್ರಭುತ್ವದ"), "ಮಂದಿಯಾಳ್ವಿಕೆಯ");
  assert.equal(trie.convertText("ಅಂತಃಪ್ರಜ್ಞೆಯನ್ನು"), "ಒಳ್ತಿಳುವಳಿಕೆಯನ್ನು");
  assert.equal(trie.convertText("ಸಹಭಾಗಿತ್ವ"), "ಸಹಭಾಗಿತ್ವ");
  assert.equal(trie.convertText("ಕ್ವಾಂಟಂಅಪರಿಚಿತಪದ"), "ಕ್ವಾಂಟಂಅಪರಿಚಿತಪದ");
});

test("morphology candidates remain inactive pending linguistic review", () => {
  const rules = JSON.parse(fs.readFileSync(path.join(root, "morphology-rules.json"), "utf8"));
  const candidates = JSON.parse(fs.readFileSync(path.join(root, index.rootCandidatesFile), "utf8"));
  assert.deepEqual(rules.approvedRootParadigms, []);
  assert.equal(candidates.length, index.stats.rootCandidates);
});
