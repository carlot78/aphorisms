# Aphorisms

One thought a day — a sentence, aphorism or short paragraph — drawn from the
personal-development sources you choose. The app fetches the text itself from
[Wikiquote](https://en.wikiquote.org), so the pool keeps growing without you
maintaining a quote list.

**Live app:** https://carlot78.github.io/aphorisms/

## How it works

- **Sources** — a curated catalog of ~80 authors and books (Stoics, Eastern
  wisdom, philosophers, psychologists, modern self-improvement writers…).
  Tick the ones you want; add any other Wikiquote page by title; or paste your
  own lines.
- **Autonomous retrieval** — the browser calls the Wikiquote API directly,
  parses the quote lists, and caches them locally for a week. A GitHub Action
  ([`refresh-quotes.yml`](.github/workflows/refresh-quotes.yml)) also runs
  weekly and commits a snapshot under `data/` that the app falls back to when
  Wikiquote is unreachable.
- **One per day** — the day's pick is chosen from your enabled sources with an
  equal chance per source (so a 1000-quote page doesn't drown a 50-quote one),
  never repeats until everything has been shown, and stays put for the whole
  day. "Another" swaps it if it doesn't land.
- **Translation** — optionally show the day's thought in a second language
  (24 languages), always alongside the English original. Uses the browser's
  built-in on-device translator when available, otherwise the free MyMemory
  API with Google Translate as a fallback. Translations are cached locally.
- **Installable & offline** — it's a PWA. On a phone, "Add to Home Screen";
  the shell and your cached quotes work without a connection.
- **Private** — everything (selection, history, favourites, own lines) lives
  in your browser's localStorage. No account, no tracking, no backend.

## Run locally

It's plain HTML/JS with no build step. Serve the folder over HTTP (ES modules
don't load from `file://`):

```bash
python -m http.server 8080
```

then open http://localhost:8080.

## Refresh the snapshot manually

```bash
node scripts/fetch.mjs            # every catalog source
node scripts/fetch.mjs seneca     # one source id (see src/sources.js)
```

## Layout

| Path | Purpose |
| --- | --- |
| `index.html`, `style.css`, `app.js` | The app |
| `src/wikiquote.js` | Wikiquote fetch + HTML parser (shared by browser and Node) |
| `src/sources.js` | Source catalog |
| `src/translate.js` | Translation providers (on-device → MyMemory → Google) |
| `scripts/fetch.mjs` | Snapshot builder used by the Action |
| `data/` | Generated snapshot (committed by the Action) |
| `sw.js`, `manifest.webmanifest` | PWA bits |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Requirements and architecture document |

## Licence

Code: MIT. Quote text comes from Wikiquote and is
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
