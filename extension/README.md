# FicTracker browser extension

The whole of FicTracker v2. It adds a panel to AO3 work pages, keeps your
library in the browser's extension storage, and has a full-tab library page
(the toolbar button opens it). No account, no server, no AI.

## Layout

| Path | What it is |
| --- | --- |
| `src/ext/background.js` | Service worker. The only code that writes the library; applies changes one at a time. |
| `src/ext/content-ao3.js` | The panel on `archiveofourown.org/works/*`. |
| `src/ext/content-site.js` | Runs on `fictracker.app`; copies a library left by the old web app into the extension, once. |
| `src/core/` | Shared library logic and the AO3 page parser (tests: `npm test`). |
| `src/` (React) | The library page, built by Vite into `app/` inside the extension. |
| `extension/manifest.json`, `icons/`, `content/content.css` | Copied into the build as-is. |

## Build

```bash
npm install
npm run build:ext
```

This writes `extension/dist/build-chrome/` and `extension/dist/build-firefox/`
(load these unpacked) and a zip of each for the stores.

## Load for testing

- **Chrome / Edge:** `chrome://extensions` → Developer mode → Load unpacked →
  `extension/dist/build-chrome`.
- **Firefox:** `about:debugging#/runtime/this-firefox` → Load Temporary Add-on →
  `extension/dist/build-firefox/manifest.json`. Temporary add-ons go away when
  Firefox restarts.

## Being polite to AO3

AO3 is run by volunteers. Every request the library page makes to AO3 goes
through `politeAo3Fetch` in `src/hooks/useLibrary.js`, which spaces requests
at least 3 seconds apart and stops on HTTP 429. Keep new AO3 features on it.
