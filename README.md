# ಅಚ್ಚಗನ್ನಡ ಸುದ್ದಿ ಪರಿವರ್ತಕ (Accagannada News Converter v6.0)

A standalone Chrome/Edge/Brave Manifest V3 extension powered by the vocabulary already maintained in the KannadaWords repository.

## Vocabulary source

The bundled vocabulary.json is generated from the repository-root newwords.txt file. The current source contains 4,559 rows across three existing table layouts:

- 2,593 Accha Kannada / nuance rows
- 1,310 native-word table rows
- 656 Sanskrit/loan-word master-table rows

The build currently produces 3,974 distinct source forms. The bundle is split into four compact JSON shards so the browser can load it reliably. Repeated source forms are merged without silently discarding alternatives or notes. Where source rows disagree on the preferred alternative, the entry is marked ambiguous and is not automatically converted.

## Conversion strategy

1. Match the longest exact phrase or word form from the vocabulary.
2. Automatically replace only entries with one unambiguous preferred alternative.
3. Preserve alternatives and usage/meaning notes for tooltips and review.
4. Leave ambiguous or unknown words unchanged.
5. Keep the 656 master-table entries as root candidates for future morphology work, but do not treat them as approved grammatical roots automatically.

**Morphology is deliberately review-gated.** newwords.txt contains a mixture of roots and already-inflected forms. Guessing roots by stripping endings can corrupt Kannada. The extension therefore uses exact source forms today. Add a noun or verb paradigm to morphology-rules.json only after its Kannada forms have been reviewed and regression-tested. Do not bulk-generate inflected vocabulary entries.

## Build the bundled vocabulary

From the repository root, run:

    node editorExtension/build-vocabulary.mjs

This reads newwords.txt and regenerates editorExtension/vocabulary.json.

## Install

1. Open chrome://extensions (or edge://extensions).
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select the editorExtension folder.
5. Open a Kannada news page and test the converter from the extension popup.

## Popup features

- Enable/disable conversion.
- Show/hide source and alternative tooltips.
- Add custom exact word mappings.
- Import Markdown, CSV, TSV or JSON vocabulary files.
- Export the bundled and user-imported dictionary.
- Test a word or sentence using the same conversion engine.

## Safety and limitations

- Conversion is local in the browser; page text is not sent to a server.
- Editable fields, code, scripts and styles are skipped.
- Exact phrases are preferred over individual word matches.
- A phrase split across separate HTML text nodes may not match.
- Ambiguous preferred alternatives and unknown words remain unchanged.
- General Kannada morphology and automatic verb conjugation are not claimed until reviewed paradigms and test cases exist.

## Files

- vocabulary.json — small index listing the generated shards and build statistics.
- vocabulary-01.json through vocabulary-04.json — compact vocabulary data shards.
- root-candidates.json — 656 inactive candidates for later root/paradigm review.
- build-vocabulary.mjs — reproducible build from newwords.txt.
- vocabulary-import.js — Markdown/CSV/TSV/JSON importer.
- trie_converter.js — phrase-first exact-form trie.
- morphology-rules.json — explicit approval gate for morphology.
- content.js — safe DOM traversal and local conversion.
- popup.html / popup.js — controls, importer and live tester.
