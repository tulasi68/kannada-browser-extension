# ಅಚ್ಚಗನ್ನಡ ಸುದ್ದಿ ಪರಿವರ್ತಕ (Accagannada News Converter v5.0)

Designed for **12,000+ uninflected root words**. You only need to provide the base dictionary words—the morphological engine automatically handles:

1. **Noun Case Endings (ವಿಭಕ್ತಿ ಪ್ರತ್ಯಯಗಳು):** Automatically inflects converted native words for Dative (`-ಕ್ಕೆ`/`-ಗೆ`/`-ಇಗೆ`), Genitive (`-ದ`/`-ಯ`/`-ಇನ`), Accusative (`-ವನ್ನು`/`-ಯನ್ನು`/`-ನ್ನು`), Locative (`-ದಲ್ಲಿ`/`-ಯಲ್ಲಿ`/`-ಿನಲ್ಲಿ`), Instrumental (`-ದಿಂದ`/`-ಯಿಂದ`/`-ಿನಿಂದ`), and Plurals (`-ಗಳು`, `-ಗಳಿಗೆ`, `-ಗಳನ್ನು`).
2. **Final `-ಉ` Vowel Elision:** Automatically matches `-ಉ` roots (like `ತೀರ್ಪು`, `ಮಾತು`) when vowel-initial suffixes drop the `-ಉ` (e.g., `ತೀರ್ಪಿನ`, `ಮಾತಿನಲ್ಲಿ`).
3. **Postpositions & Clitics:** Strips attached postpositions like `-ೊಂದಿಗೆ`, `-ಗಾಗಿ`, `-ಬಗ್ಗೆ`, `-ಕುರಿತು`, `-ಮೂಲಕ` and reattaches them cleanly.
4. **`-ಇಸು` Verb Conjugations:** Automatically detects Sanskrit verbalized forms (`ಪ್ರತಿಪಾದಿಸುತ್ತಾ`, `ಆರೋಪಿಸಿದರು`, `ಘೋಷಿಸಲಾಗಿದೆ`, `ಖಂಡಿಸಿ`) from your base root word and conjugates the native Kannada verb.

## Installation
1. Unzip this folder.
2. Open `chrome://extensions/` (or `edge://extensions/` / `brave://extensions/`).
3. Turn on **Developer mode** and click **Load unpacked** -> select this folder.
4. Click the extension icon -> **12,000+ Import** tab -> upload your 5-column Markdown, CSV, TSV, or JSON file.
