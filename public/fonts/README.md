# Admin fonts

Inter (Latin variable, normal 100–900) and Source Serif 4 (Latin variable, italic 200–900) are self-hosted copies distributed by Google Fonts, retrieved 2026-10-19. Each font directory includes its official SIL Open Font License. These preserve the existing administrator font families and remove the Google Fonts stylesheet request from the application entry point.

- Inter: https://fonts.google.com/specimen/Inter
- Source Serif 4: https://fonts.google.com/specimen/Source+Serif+4
- Distribution CSS: https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=Source+Serif+4:ital,wght@1,200..900&display=swap
- Official licenses: https://github.com/google/fonts/tree/main/ofl/inter and https://github.com/google/fonts/tree/main/ofl/sourceserif4

Administrator UI sans-serif text uses the existing Pretendard Variable asset and license, with Inter as a fallback. Browsers load the files in `pretendard/subset/`, which `src/pretendard.css` declares by `unicode-range`. `PretendardVariable.woff2` is kept as their unmodified source and is not requested by the UI.

The subset files were made on 2026-11-23 with fontTools 4.68.0 (`layout_features=*`, all name records, woff2):

- `common` holds Basic Latin, Latin-1, common punctuation and symbols, Hangul compatibility jamo, the 2,350 KS X 1001 Hangul syllables, and every character in the current TypeScript files list, CSS and `index.html`.
- `hangul-NN` and `other-NN` hold the rest of the font in code point order, 600 code points each.
- Each code point is in exactly one file. File names carry the first 10 hex digits of the file's SHA-256, so they can be cached permanently.
- Outlines and advance widths were compared with the source at weights 45, 400, 700 and 920 without a difference. Marketing artwork titles use Elice Digital Baeum Bold (700), retrieved 2026-10-20 from the official Elice distribution. The original TTF and license PDF are included without modifying the font. The canvas preview and PNG/JPG exports share the same renderer and explicitly load this font before drawing.

- Official brand page: https://elice.io/ko/resources/brand
- Original TTF archive: https://cdn-front-door.elice.io/font/static/downloads/EliceDigitalBaeum_TTF.zip
- Original license: https://cdn-front-door.elice.io/font/static/downloads/EliceDigitalBaeum_License.pdf
