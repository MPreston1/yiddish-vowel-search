# Yiddish Vowel Search

A small, installable web app (PWA) with two tools for looking up how Yiddish vowels are pronounced:

- **Vowel Length Identifier for Yiddish Dialects.** Search a Yiddish word and see its vowel length, associated rule, and notes. If the word is not in the database, a guided "find the rule" wizard and (for non-loshn-koydesh words) a semi-automated rule finder help you work out which rule applies.
- **Pronunciation of ױ by Yiddish Dialect.** Search words containing the ױ (*oy*) vowel and see how they are pronounced in Klal (Standard), NEY (Northeastern), CY (Central) and SEY (Southeastern) Yiddish. Browse the dialect groups and the minimal pairs.

Everything runs in the browser. There is no build step and no server of its own, and it can be hosted on GitHub Pages.

## Features

- Search by Yiddish word (partial matches included) or by English gloss
- Search distinguishes vowel and letter marks (פּ / פֿ, ב / בּ / בֿ, ש / שׂ, אַ / אָ), and treats the ligatures װ = וו, ױ = וי and ײ = יי as their spelled-out forms
- Built-in Yiddish typing mode: press `~` (or tap the **A / א** button) to switch the search box to a Yiddish keyboard; type `~~` for a literal `~`
- Pronunciation tables, footnotes and rule pop-ups read from the guide slides
- Rule finder: guesses the stressed syllable from the spelling, evaluates the spelling-based rules, and lets you override the ones that cannot be judged from spelling
- Works offline after the first load (data is cached in the browser)
- Installable on a phone or desktop ("Add to Home Screen")
- Deep links: `#length` and `#oy` open a specific tool; the last tool used is remembered

## Files

| File                                   | Purpose                                                                                                                                        |
|----------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------|
| `index.html`                           | Page structure and the switch between the two tools                                                                                            |
| `style.css`                            | Styles                                                                                                                                         |
| `shared.js`                            | Shared helpers: search, pop-ups, storage, export, the Yiddish typing mode, the tool switch                                                     |
| `rules.js`                             | Reads the vowel-length Database and Rules sheets and `guide.pptx`; rule ordering and rule pop-ups                                              |
| `rulefinder.js`                        | Guesses the stressed syllable and the applicable vowel-length rule from a word's spelling (works in the browser and in Node)                   |
| `length.js`                            | The vowel-length tool                                                                                                                          |
| `oy.js`                                | The ױ pronunciation tool                                                                                                                       |
| `jszip.min.js`                         | [JSZip](https://stuk.github.io/jszip/), used to read `guide.pptx`                                                                              |
| `sw.js`, `manifest.webmanifest`, icons | Offline support and installability                                                                                                             |
| `data/`                                | Approved local copies of the spreadsheet tabs (`database.csv`, `rules.csv`, `oy.csv`, `oy-rules.csv`, `oy-minimal-pairs.csv`) and `guide.pptx` |
| `sync/`                                | Local copies of the spreadsheet tabs `oy-author.csv` and `oy-guide-text.txt`                                                                   |
| `lk.html`, `lk-engine.js`, `test-lk.js` | Experiments with automating losh-koydesh rule application                                                                                      |

## Where the data comes from

The app reads the approved copies in `data/` first and falls back to the live Google Sheets if a copy is missing. The most recent data is cached in the browser, so the app keeps working offline. **Refresh data** reloads everything.

- Vowel length: the "Companion Database for the L.O.K.SH.N Guide to Vowel Length" Google Sheet and the "L.O.K.SH.N Guide to Vowel Length" slides (`guide.pptx`)
- ױ pronunciation: a Google Sheet drawing data from "Oy? (a guide to the ױ vowel for dialect-aspirers)" 

## Running locally

The app is plain HTML, CSS and JavaScript. Serve the folder with any static file server (opening `index.html` directly will not work, because the app loads files and registers a service worker):

```
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Credits

- The vowel-length tool is based on the [“L.O.K.SH.N Guide to Vowel Length”](https://docs.google.com/presentation/d/1OzduSlGXEnK3ZCFV1P83UKeNwms5MjKgagxxe6kpKZY/edit) and the [“Companion Database for the L.O.K.SH.N Guide to Vowel Length,”](https://docs.google.com/spreadsheets/d/1Vip_J4QjpMBorfov15jmbXouSXQMAmMXT0EbYsYfPkc/edit?gid=671156978#gid=671156978) both compiled by Arun (Arele) Schaechter Viswanath.
- The ױ tool is based on [“Oy!: a self-directed guide to the וי vowel for dialect-aspirers,”](https://www.facebook.com/arun.avrum.viswanath/posts/pfbid0uQkRvTzjkXD2cPCEdBobP9nGxVMJNLaASXHVRKxkZYy59v4NMNE6BRaDEBWxb92El) compiled by Arele Schaechter Viswanath.
- The Yiddish keyboard layout used for Yiddish typing mode is based on the [Yiddish Klal keyboard layout](https://github.com/ibleaman/Yiddish-Klal) created by Isaac L. Bleaman.
- Place-name references link to the YIVO [Yiddishland topography](https://yivo.org/yiddishland-topo).

## License

This work is licensed under the [Creative Commons Attribution-ShareAlike 4.0 International License (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/).

You are free to share and adapt it for any purpose, including commercially, as long as you give appropriate credit, indicate if changes were made, and distribute your contributions under the same license. See the [`LICENSE`](LICENSE) file or the [full legal code](https://creativecommons.org/licenses/by-sa/4.0/legalcode).

**Third-party material.** The license above covers the code and original content in this repository. The guides, spreadsheets and slides credited above were compiled by Arele Schaechter Viswanath, and the Yiddish Klal keyboard layout was created by Isaac L. Bleaman. Their works remain subject to their authors' own terms. The bundled `jszip.min.js` is distributed under its own license (see the header of that file).
