# Building FicTracker 2.0.0 from source

The add-on is built from this source with Vite (the library page, React) and
esbuild (background script and content scripts). Nothing is downloaded at
build time except npm packages, pinned by package-lock.json.

## Requirements

- Node.js 24 (tested with v24.21.0); npm 11 or later
- Linux or macOS

## Steps

```bash
npm ci
npm run build:ext
```

The Firefox build is written to `extension/dist/build-firefox/`, and the
uploaded package is `extension/dist/fictracker-firefox-v2.0.0.zip`.

## Where things come from

| In the package | Source |
| --- | --- |
| `background.js` | `src/ext/background.js` (bundled with esbuild, not minified) |
| `content/ao3.js` | `src/ext/content-ao3.js` and `src/ext/ao3-import.js` |
| `content/site.js` | `src/ext/content-site.js` |
| `app/` | the React app in `src/` (built by Vite, minified) |
| `manifest.json` | `extension/manifest.json`, with Firefox settings added by `extension/build.mjs` |

Third-party code is only what's in package.json (React, Recharts, JSZip,
linkedom and their dependencies). There is no remote code, no analytics and
no AI. The add-on talks to archiveofourown.org (the user's own pages, paced
at most one request every 3 seconds) and reads fictracker.app's local
storage once to copy a library from the old web app.
