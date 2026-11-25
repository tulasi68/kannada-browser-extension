// Full Morphology-Aware Kannada Prefix Tree (Trie) Engine v5.0
// Handles 12,000+ uninflected roots: noun cases, -u vowel elision, postpositions, and -isu verb conjugations.

const VOWEL_SIGNS = new Set(["ಾ", "ಿ", "ೀ", "ು", "ೂ", "ೃ", "ೄ", "ೆ", "ೇ", "ೈ", "ೊ", "ೋ", "ೌ", "್"]);

// Reverse map: Kannada vowel sign -> independent vowel (for elision recovery)
const SIGN_TO_INDEP_VOWEL = {
  "ಾ": "ಆ",
  "ಿ": "ಇ",
  "ೀ": "ಈ",
  "ು": "ಉ",
  "ೂ": "ಊ",
  "ೃ": "ಋ",
  "ೆ": "ಎ",
  "ೇ": "ಏ",
  "ೈ": "ಐ",
  "ೊ": "ಒ",
  "ೋ": "ಓ",
  "ೌ": "ಔ"
};

// Common Kannada postpositions & compound clitics attached directly to case-inflected nouns
const POSTPOSITIONS = [
  "ೊಂದಿಗೆ", "ೊಡನೆ", "ಗಾಗಿ", "ಗೋಸ್ಕರ", "ತ್ತ", "ವರೆಗೆ", "ತನಕ", "ಬಗ್ಗೆ", "ಕುರಿತು", "ಮೂಲಕ", "ಪ್ರಕಾರ"
];

// Common -isu verbalizer inflection tails (after stripping -ಇಸ / -ಇಸಿ / -ಇಸು)
const VERB_TAILS = [
  "ಲಾಗುತ್ತಿದೆ", "ಲಾಗುತ್ತದೆ", "ಲಾಗಿತ್ತು", "ಲಾಗಿದೆ", "ಲಾಗುವುದು", "ಲಾಯಿತು",
  "ುತ್ತಿದ್ದಾರೆ", "ುತ್ತಿದ್ದಾನೆ", "ುತ್ತಿದ್ದಾಳೆ", "ುತ್ತಿದ್ದೇವೆ", "ುತ್ತಿದ್ದೀರಿ", "ುತ್ತಿದ್ದರು",
  "ುತ್ತಿದ್ದ", "ುತ್ತಿರುವ", "ುತ್ತಿದೆ", "ುತ್ತದೆ", "ುತ್ತಾ", "ುತ್ತ",
  "ಿದವರು", "ಿದವನು", "ಿದವಳು", "ಿದಂತೆ", "ಿದಾಗ", "ಿದರೆ", "ಿದರು", "ಿದನು", "ಿದಳು", "ಿದೆವು", "ಿದಿರಿ", "ಿದೆ", "ಿದ",
  "ುವವರು", "ುವಂತೆ", "ುವಾಗ", "ುವುದು", "ುವರು", "ುವ",
  "ಬೇಕು", "ಬಾರದು", "ಬಹುದು", "ಬಲ್ಲ", "ದಂತೆ", "ದೆ", "ದ", "ಲು", "ಲಿ", "ಿರಿ", "ಿ", "ು"
];

class AccagannadaTrie {
  constructor() {
    this.root = {};
  }

  insert(sanskritWord, entryObj) {
    const cleanKey = sanskritWord.trim();
    if (!cleanKey) return;
    let node = this.root;
    for (const char of cleanKey) {
      if (!node[char]) node[char] = {};
      node = node[char];
    }
    node._data = typeof entryObj === "string"
      ? { primary: entryObj.trim(), alts: [], note: "" }
      : entryObj;
  }

  loadDictionary(dictObject) {
    this.root = {};
    for (const [skt, val] of Object.entries(dictObject)) {
      if (skt && val) this.insert(skt, val);
    }
  }

  // Exact lookup in Trie
  lookupExact(word) {
    let node = this.root;
    for (const char of word) {
      if (!node[char]) return null;
      node = node[char];
    }
    return node._data || null;
  }

  // Match multi-word phrases starting at index `start`
  findPhraseMatch(text, start) {
    let node = this.root;
    let lastMatch = null;
    let lastEnd = start;

    for (let i = start; i < text.length; i++) {
      const char = text[i];
      if (!node[char]) break;
      node = node[char];
      if (node._data !== undefined && text.slice(start, i + 1).includes(" ")) {
        const nextChar = text[i + 1];
        if (!nextChar || !/[\u0C80-\u0CFF]/.test(nextChar)) {
          lastMatch = node._data;
          lastEnd = i + 1;
        }
      }
    }
    return lastMatch ? { data: lastMatch, end: lastEnd } : null;
  }

  // Resolve a single Kannada token using full morphological analysis
  resolveWord(token) {
    // 1. Direct exact match (covers uninflected roots & pre-inflected entries)
    const direct = this.lookupExact(token);
    if (direct) {
      return { data: direct, prefix: "", suffix: "", original: token };
    }

    // 2. Strip attached postpositions first (e.g., ಸರ್ಕಾರದೊಂದಿಗೆ -> ಸರ್ಕಾರದ + ೊಂದಿಗೆ)
    let workingToken = token;
    let attachedPostposition = "";
    for (const pp of POSTPOSITIONS) {
      if (workingToken.endsWith(pp) && workingToken.length > pp.length + 2) {
        workingToken = workingToken.slice(0, -pp.length);
        attachedPostposition = pp;
        break;
      }
    }

    // Re-check direct match after stripping postposition
    const postDirect = this.lookupExact(workingToken);
    if (postDirect) {
      return {
        data: postDirect,
        prefix: "",
        suffix: this.attachPostposition(postDirect.primary, attachedPostposition),
        original: token
      };
    }

    // 3. Verb conjugation analyzer (-isu / -isi / -isutta / -isidaru / -isalagide)
    const verbResolved = this.resolveVerb(workingToken, attachedPostposition, token);
    if (verbResolved) return verbResolved;

    // 4. Noun case & plural analyzer (handles -u elision, -a/-i/-e stems, plurals)
    const nounResolved = this.resolveNoun(workingToken, attachedPostposition, token);
    if (nounResolved) return nounResolved;

    return null;
  }

  // Analyze Sanskrit verbalized forms: ಆರೋಪಿಸುತ್ತಾ, ಖಂಡಿಸಿದರು, ಪ್ರತಿಪಾದಿಸಲಾಗಿದೆ, ಘೋಷಿಸಿ
  resolveVerb(workingToken, postposition, originalToken) {
    // Pattern A: Past participle ending in -ಿಸಿ (e.g., ಘೋಷಿಸಿ, ಖಂಡಿಸಿ, ಆರೋಪಿಸಿ)
    if (workingToken.endsWith("ಿಸಿ") && workingToken.length > 4) {
      const base = workingToken.slice(0, -2); // e.g., ಘೋಷ, ಖಂಡ, ಆರೋಪ
      const rootEntry = this.findRootFromVerbStem(base);
      if (rootEntry) {
        const nativeVerb = this.toNativeVerbStem(rootEntry.primary);
        return {
          data: rootEntry,
          prefix: "",
          suffix: this.conjugateNativeVerb(nativeVerb, "PAST_PARTICIPLE") + postposition,
          original: originalToken
        };
      }
    }

    // Pattern B: Inflected -ಇಸ + tail (e.g., ಪ್ರತಿಪಾದಿಸುತ್ತಾ -> ಪ್ರತಿಪಾದ + ಿಸ + ುತ್ತಾ)
    const isaIdx = workingToken.lastIndexOf("ಿಸ");
    if (isaIdx > 1) {
      const base = workingToken.slice(0, isaIdx); // stem before ಿಸ
      const tail = workingToken.slice(isaIdx + 2); // everything after ಿಸ
      const rootEntry = this.findRootFromVerbStem(base);
      if (rootEntry) {
        const nativeVerb = this.toNativeVerbStem(rootEntry.primary);
        const conjugated = this.conjugateNativeVerb(nativeVerb, "TAIL", tail);
        if (conjugated !== null) {
          return {
            data: rootEntry,
            prefix: "",
            suffix: conjugated + postposition,
            original: originalToken
          };
        }
      }
    }
    return null;
  }

  // Map a stripped verb stem (like ಪ್ರತಿಪಾದ or ಘೋಷ or ವಿಚಾರ) back to dictionary root
  findRootFromVerbStem(base) {
    const candidates = [
      base,                // ಆರೋಪ -> ಆರೋಪ
      base + "ು",          // ವಿಚಾರ -> ವಿಚಾರು / ಸಾರ -> ಸಾರು
      base + "ನೆ",         // ಘೋಷ -> ಘೋಷಣೆ (handled below), ಪ್ರತಿಪಾದ -> ಪ್ರತಿಪಾದನೆ
      base + "ಣೆ",         // ಘೋಷ -> ಘೋಷಣೆ, ವಿಚಾರ -> ವಿಚಾರಣೆ
      base + "ನ",          // ಪಾಲ -> ಪಾಲನ
      base + "ಿಸು"         // ಪ್ರತಿಪಾದ -> ಪ್ರತಿಪಾದಿಸು
    ];
    for (const cand of candidates) {
      const hit = this.lookupExact(cand);
      if (hit) return hit;
    }
    return null;
  }

  // Convert a native dictionary noun/verb into a workable native verb stem
  toNativeVerbStem(nativePrimary) {
    // If dictionary already gives a verb ending in -ಉ (e.g., ಸಾರು, ತಳ್ಳಿಹಾಕು, ಎತ್ತಿಹಿಡಿ)
    if (nativePrimary.endsWith("ು") && !nativePrimary.endsWith("ವು") && !nativePrimary.endsWith("ಳು")) {
      return nativePrimary;
    }
    if (nativePrimary.endsWith("ಿ") || nativePrimary.endsWith("ೆ")) {
      // Verbal noun like ಸಾರಿಕೆ -> ಸಾರು, ಎತ್ತಿಹಿಡಿ -> ಎತ್ತಿಹಿಡಿ
      if (nativePrimary.endsWith("ಿಕೆ")) return nativePrimary.slice(0, -3) + "ು";
      if (nativePrimary.endsWith("ುವಿಕೆ")) return nativePrimary.slice(0, -5) + "ು";
      return nativePrimary; // e.g., ಎತ್ತಿಹಿಡಿ
    }
    // Otherwise attach native light-verb ಮಾಡು (do) (e.g., ಆರೋಪ -> ಹೊರಿಸುವಿಕೆ -> ಹೊರಿಸುವಿಕೆ ಮಾಡು)
    return nativePrimary + " ಮಾಡು";
  }

  conjugateNativeVerb(nativeStem, mode, tail = "") {
    // Case 1: Native verb ends in -ಉ (e.g., ತಳ್ಳಿಹಾಕು, ಸಾರು, ಮಾಡು)
    if (nativeStem.endsWith("ು")) {
      const bare = nativeStem.slice(0, -1); // ತಳ್ಳಿಹಾಕ್, ಸಾರ್, ಮಾಡ್
      if (mode === "PAST_PARTICIPLE") return bare + "ಿ"; // ತಳ್ಳಿಹಾಕಿ, ಸಾರಿ, ಮಾಡಿ
      if (mode === "TAIL") {
        // Passive -ಅಲಾಗು -> bare + ಅಲಾಗು...
        if (tail.startsWith("ಲ")) return bare + "ಅ" + tail; // ತಳ್ಳಿಹಾಕಲಾಗಿದೆ
        // Present/past/future tails starting with ು or ಿ or ೆ (ುತ್ತಾ, ಿದರು, ುವ)
        if (tail.startsWith("ು") || tail.startsWith("ಿ") || tail.startsWith("ೆ")) {
          return bare + tail; // ತಳ್ಳಿಹಾಕುತ್ತಾ, ತಳ್ಳಿಹಾಕಿದರು
        }
        return bare + "ು" + tail;
      }
    }
    // Case 2: Native verb ends in -ಇ (e.g., ಎತ್ತಿಹಿಡಿ, ಹಿಡಿ)
    if (nativeStem.endsWith("ಿ")) {
      if (mode === "PAST_PARTICIPLE") return nativeStem; // ಎತ್ತಿಹಿಡಿ -> ಎತ್ತಿಹಿಡಿದು
      if (mode === "TAIL") {
        if (tail.startsWith("ಲ")) return nativeStem + "ಯ" + tail; // ಎತ್ತಿಹಿಡಿಯಲಾಗಿದೆ
        if (tail.startsWith("ು")) return nativeStem + "ಯ" + tail; // ಎತ್ತಿಹಿಡಿಯುತ್ತಾ
        if (tail.startsWith("ಿ")) return nativeStem + "ದ" + tail.slice(1); // ಎತ್ತಿಹಿಡಿದರು
        return nativeStem + "ಯು" + tail;
      }
    }
    return null;
  }

  // Analyze noun inflections including -u elision (ತೀರ್ಪಿನ -> ತೀರ್ಪು + ಿನ)
  resolveNoun(workingToken, postposition, originalToken) {
    const nounRules = [
      // Accusative (-ವನ್ನು, -ಯನ್ನು, -ಅನ್ನು, -ನ್ನು)
      { suffixes: ["ವನ್ನು", "ಯನ್ನು", "ಅನ್ನು", "ನ್ನು"], type: "ACC" },
      // Locative (-ದಲ್ಲಿ, -ಯಲ್ಲಿ, -ಿನಲ್ಲಿ, -ಅಲ್ಲಿ, -ಲ್ಲಿ)
      { suffixes: ["ದಲ್ಲಿ", "ಯಲ್ಲಿ", "ಿನಲ್ಲಿ", "ಅಲ್ಲಿ", "ಲ್ಲಿ"], type: "LOC" },
      // Instrumental / Ablative (-ದಿಂದ, -ಯಿಂದ, -ಿನಿಂದ, -ಇಂದ)
      { suffixes: ["ದಿಂದ", "ಯಿಂದ", "ಿನಿಂದ", "ಇಂದ"], type: "ABL" },
      // Dative (-ಕ್ಕೆ, -ಗೆ, -ಇಗೆ)
      { suffixes: ["ಕ್ಕೆ", "ಿಗೆ", "ಗೆ"], type: "DAT" },
      // Genitive (-ದ, -ಯ, -ಿನ, -ಅ)
      { suffixes: ["ಿನ", "ದ", "ಯ"], type: "GEN" },
      // Plurals + Case (-ಗಳಿಗೆ, -ಗಳನ್ನು, -ಗಳಲ್ಲಿ, -ಗಳ, -ಗಳು)
      { suffixes: ["ಗಳಿಗೆ", "ಗಳನ್ನು", "ಗಳಲ್ಲಿ", "ಗಳಿಂದ", "ಗಳ", "ಗಳು"], type: "PLURAL_RAW" }
    ];

    for (const rule of nounRules) {
      for (const suf of rule.suffixes) {
        if (workingToken.endsWith(suf) && workingToken.length > suf.length + 1) {
          const rawStem = workingToken.slice(0, -suf.length);

          // Candidate roots to check in dictionary
          const rootCandidates = this.expandStemCandidates(rawStem, suf);
          for (const cand of rootCandidates) {
            const hit = this.lookupExact(cand);
            if (hit) {
              const inflected = rule.type === "PLURAL_RAW"
                ? this.inflectPluralRaw(hit.primary, suf)
                : this.inflectNativeNoun(hit.primary, rule.type);

              const finalWithPP = postposition
                ? this.attachPostposition(inflected, postposition)
                : inflected;

              return {
                data: hit,
                prefix: "",
                suffix: finalWithPP.slice(hit.primary.length),
                fullOverride: finalWithPP,
                original: originalToken
              };
            }
          }
        }
      }
    }
    return null;
  }

  // Recover base dictionary word when Kannada vowel elision or sandhi altered the stem
  expandStemCandidates(stem, strippedSuffix) {
    const cands = [stem];

    // 1. Restore dropped '-ು' (e.g., ತೀರ್ಪ + ಿನ -> ತೀರ್ಪು, ಸರ್ಕಾರ + ದ -> ಸರ್ಕಾರು)
    if (!VOWEL_SIGNS.has(stem.slice(-1))) {
      cands.push(stem + "ು");
    }

    // 2. If suffix started with 'ಿ' or 'ು' merged into stem's final vowel sign
    const lastChar = stem.slice(-1);
    if (lastChar === "ಿ" || lastChar === "ು" || lastChar === "ೆ" || lastChar === "ೊ") {
      const bareConsonant = stem.slice(0, -1);
      cands.push(bareConsonant);      // inherent -ಅ root (e.g., ಆರೋಪ)
      cands.push(bareConsonant + "ು"); // -ಉ root (e.g., ಮಾತು -> ಮಾತಿನ)
    }

    // 3. Handle doubled consonant before vowel suffix (e.g., ಕಣ್ಣಿನ -> ಕಣ್ಣು)
    if (stem.endsWith("್" + stem.slice(-1))) {
      cands.push(stem + "ು");
    }

    return cands;
  }

  // Properly inflect the target native Kannada noun according to Kannada grammar
  inflectNativeNoun(nativeRoot, caseType) {
    const lastChar = nativeRoot.slice(-1);
    const endsWithIorE = lastChar === "ಿ" || lastChar === "ೆ" || lastChar === "ೈ";
    const endsWithU = lastChar === "ು";

    // Handle -ವು / -ಳು / -ರು words (e.g., ತಿಳಿವು -> ತಿಳಿವಿನ, ನೆರವು -> ನೆರವಿನ)
    const isVuLuRu = nativeRoot.endsWith("ವು") || nativeRoot.endsWith("ಳು") || nativeRoot.endsWith("ರು");
    const uStem = endsWithU ? nativeRoot.slice(0, -1) : nativeRoot;

    switch (caseType) {
      case "DAT": // To / For (-ಕ್ಕೆ / -ಗೆ / -ಇಗೆ)
        if (endsWithIorE) return nativeRoot + "ಗೆ";
        if (endsWithU) return uStem + "ಿಗೆ";
        return nativeRoot + "ಕ್ಕೆ";

      case "GEN": // Of (-ದ / -ಯ / -ಇನ)
        if (endsWithIorE) return nativeRoot + "ಯ";
        if (endsWithU) return uStem + "ಿನ";
        return nativeRoot + "ದ";

      case "ACC": // Object (-ವನ್ನು / -ಯನ್ನು / -ಅನ್ನು)
        if (endsWithIorE) return nativeRoot + "ಯನ್ನು";
        if (endsWithU) return uStem + "ನ್ನು";
        return nativeRoot + "ವನ್ನು";

      case "LOC": // In / At (-ದಲ್ಲಿ / -ಯಲ್ಲಿ / -ಿನಲ್ಲಿ)
        if (endsWithIorE) return nativeRoot + "ಯಲ್ಲಿ";
        if (endsWithU) return uStem + "ಿನಲ್ಲಿ";
        return nativeRoot + "ದಲ್ಲಿ";

      case "ABL": // From / By (-ದಿಂದ / -ಯಿಂದ / -ಇನಿಂದ)
        if (endsWithIorE) return nativeRoot + "ಯಿಂದ";
        if (endsWithU) return uStem + "ಿನಿಂದ";
        return nativeRoot + "ದಿಂದ";

      default:
        return nativeRoot;
    }
  }

  inflectPluralRaw(nativeRoot, pluralSuffix) {
    // e.g., ಸಂಗತಿ + ಗಳು = ಸಂಗತಿಗಳು, ಕಟ್ಟಳೆ + ಗಳಿಗೆ = ಕಟ್ಟಳೆಗಳಿಗೆ
    return nativeRoot + pluralSuffix;
  }

  attachPostposition(inflectedWord, pp) {
    if (!pp) return inflectedWord;
    // If postposition starts with 'ೊ' (ೊಂದಿಗೆ, ೊಡನೆ) and word ends in 'ದ' or 'ಯ', merge smoothly
    if (pp.startsWith("ೊ") && (inflectedWord.endsWith("ದ") || inflectedWord.endsWith("ಯ"))) {
      return inflectedWord + pp; // e.g., ಆಳ್ವಿಕೆಯ + ೊಂದಿಗೆ = ಆಳ್ವಿಕೆಯೊಂದಿಗೆ
    }
    return inflectedWord + pp;
  }

  // Convert a full text string into an array of segments (plain text + converted tokens)
  tokenizeAndConvert(text) {
    const segments = [];
    let i = 0;

    while (i < text.length) {
      const isKannada = /[\u0C80-\u0CFF]/.test(text[i]);
      const isWordStart = i === 0 || !/[\u0C80-\u0CFF]/.test(text[i - 1]);

      if (isKannada && isWordStart) {
        // 1. Try multi-word phrase match first
        const phraseHit = this.findPhraseMatch(text, i);
        if (phraseHit) {
          const origPhrase = text.slice(i, phraseHit.end);
          segments.push({
            converted: true,
            text: phraseHit.data.primary,
            original: origPhrase,
            data: phraseHit.data
          });
          i = phraseHit.end;
          continue;
        }

        // 2. Extract complete single Kannada word
        let wordEnd = i;
        while (wordEnd < text.length && /[\u0C80-\u0CFF]/.test(text[wordEnd])) {
          wordEnd++;
        }
        const word = text.slice(i, wordEnd);
        const resolved = this.resolveWord(word);

        if (resolved) {
          const finalWord = resolved.fullOverride || (resolved.data.primary + resolved.suffix);
          segments.push({
            converted: true,
            text: finalWord,
            original: word,
            data: resolved.data
          });
        } else {
          segments.push({ converted: false, text: word });
        }
        i = wordEnd;
      } else {
        // Non-Kannada or mid-word character
        let nextKannadaStart = i + 1;
        while (nextKannadaStart < text.length && !/[\u0C80-\u0CFF]/.test(text[nextKannadaStart])) {
          nextKannadaStart++;
        }
        segments.push({ converted: false, text: text.slice(i, nextKannadaStart) });
        i = nextKannadaStart;
      }
    }
    return segments;
  }
}
