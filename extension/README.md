# FicTracker browser extension

The whole of FicTracker v2. It adds a panel to AO3 work pages, keeps your
library in the browser's extension storage, and has a full-tab library page
(the toolbar button opens it). No account, no server, no AI.

## Layout

| Path | What it is |
| --- | --- |
| `src/ext/background.js` | Service worker. The only code that writes the library, follows and news (one change at a time); owns AO3 request pacing, the scheduled checks (`chrome.alarms`) and the toolbar badge. |
| `src/ext/content-ao3.js` | Runs on all of AO3: the panel on work pages (progress, follow buttons), and notes the logged-in username. |
| `src/ext/ao3-import.js` | History and bookmarks import, shown on `/users/*/readings` and `/users/*/bookmarks`. Runs on AO3 so the pages come with your login. |
| `src/ext/content-site.js` | Runs on `fictracker.app`; copies a library left by the old web app into the extension, once. |
| `src/core/` | Shared logic: library ops, follows, AO3 page parsers (tests: `npm test`; parser fixtures in `src/core/fixtures/`, hand-made from AO3's markup). |
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

AO3 is run by volunteers. Every FicTracker request to AO3 waits its turn in
the background worker (`takeSlot` in `src/ext/background.js`): one request at
least 3 seconds after the last, from any tab. On HTTP 429 or 503 it pauses
all requests for 10 minutes (longer if AO3's Retry-After says so). The library
page fetches through the `AO3_FETCH` message; code running on AO3 itself asks
for a turn with `AO3_SLOT` and reports a 429 with `AO3_RATE_LIMITED`. Keep new
AO3 features on these.

Chrome's background service worker has no `DOMParser`, so it parses AO3
pages with `linkedom`. Firefox's background page uses the built-in parser.
