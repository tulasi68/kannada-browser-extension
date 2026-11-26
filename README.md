# ಅಚ್ಚಗನ್ನಡ ಸುದ್ದಿ ಪರಿವರ್ತಕ (Accagannada News Converter)

A standalone Manifest V3 browser extension for conservative, offline Kannada text conversion. Its vocabulary is maintained in [tulasi68/Kannadawords](https://github.com/tulasi68/Kannadawords).

## Conversion policy

- Matches the longest exact word or phrase in the bundled vocabulary.
- Converts only entries with one unambiguous preferred alternative.
- Includes all source forms, including entries with multiple valid Kannada suggestions.
- Leaves ambiguous and unknown forms unchanged rather than choosing arbitrarily.
- Preserves every primary candidate and alternative native option, plus usage notes, for review.
- Does not guess noun suffixes or verb conjugations. Morphology remains disabled until Kannada-specific paradigms are reviewed.

The single vocabulary source is `tulasi68/Kannadawords/MergedMasterCopy_10000.csv` (8,470 rows; 12 columns). The build validates its header, row count, and JSON-array suggestion columns, then records the exact source blob SHA and build statistics. Vocabulary is bundled locally, so conversion works offline after installation.

## Build and test

Requirements: Node.js 20 or newer.

```sh
npm run build:vocabulary
npm test
```

The build fetches `MergedMasterCopy_10000.csv` from the selected Kannadawords ref (default: `main`) and regenerates the local index and shards. Legacy `newwords.txt` is not merged into the active extension vocabulary. To build from another branch or tag:

```sh
KANNADAWORDS_REF=feature/editor-extension-v6 npm run build:vocabulary
```

This is a build-time fetch only. The extension makes no runtime request to Kannadawords.

## Install locally

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this repository's root directory.
5. Open a Kannada news page and use the extension popup.

## Features

- Enable or disable conversion.
- Show or hide source/alternative tooltips.
- Add custom exact-word mappings.
- Import Markdown, CSV, TSV, or JSON dictionaries.
- Export the bundled and user-imported dictionary.
- Test a word or sentence in the popup.

## Privacy and limitations

- Page text is processed locally; it is not sent to a server.
- Editable fields, code, scripts, and styles are skipped.
- Phrases split across separate HTML text nodes may not match.
- Ambiguous and unknown forms remain unchanged.
- General Kannada morphology and automatic verb conjugation are not claimed.

## Main files

- `manifest.json` — browser extension manifest.
- `content.js` — safe DOM traversal and conversion.
- `trie_converter.js` — exact-form, phrase-first conversion engine.
- `vocabulary-import.js` — dictionary importer and normalization.
- `popup.html` / `popup.js` — controls, importer, and tester.
- `build-vocabulary.mjs` — reproducible vocabulary build.
- `vocabulary.json` and `vocabulary-*.json` — local vocabulary index and shards.
- `root-candidates.json` — inactive candidates for future review.
- `morphology-rules.json` — explicit morphology approval gate.
