# FicTracker

A free browser add-on for [AO3](https://archiveofourown.org) readers. It
remembers the chapter you're on in every fic, checks your WIPs for new
chapters, and keeps your reading list, ratings, notes and shelves in order.

- **No account.** The library lives in your browser, inside the add-on.
- **No AI.** Nothing is generated or recommended by AI.
- **Free.** No tiers, no ads.

Install: [Chrome Web Store](https://chromewebstore.google.com/detail/fictracker/phfdhkgaagelchgejhhpelhcmebomdim) ·
[Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/fictracker/)

## Repository

- `extension/`: manifest, icons and the build script. See [extension/README.md](extension/README.md).
- `src/`: the code. `src/ext/` (background worker and content scripts),
  `src/core/` (shared logic), and the React library page.
- `site/`: fictracker.app, a static site (landing page and privacy policy) deployed by Vercel.

```bash
npm install
npm test            # unit tests
npm run build:ext   # build the Chrome and Firefox extensions
```

## History

v1 was a web app with accounts, a paid tier and AI recommendations. Feedback
from fanfic readers was clear: no paywalls and no AI, and the AI picks
hallucinated anyway. v2 is the extension on its own.
