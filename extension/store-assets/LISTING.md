# FicTracker 2.0.0 store submission

Everything to paste into the Chrome Web Store dashboard and AMO for 2.0.0.
Uploads live in `extension/dist/` after `npm run build:ext`:

- Chrome: `fictracker-chrome-v2.0.0.zip`
- Firefox: `fictracker-firefox-v2.0.0.zip`, plus `fictracker-source-v2.0.0.zip`
  as the source code (it includes `BUILD-FOR-REVIEWERS.md`)

Images in this folder: `marquee-1400x560.png` (Chrome marquee),
`small-tile-440x280.png` (Chrome small promo tile). Rendered from
`promo-tile.html` at the repo root. Screenshots (1280x800) are in
`screenshots/`, made in Playwright with a made-up library and a made-up fic
(Original Work) on a styled copy of AO3. Chrome takes up to 5: use 1-5.
AMO can take all 6.

---

## Summary

Chrome uses the manifest description (132 characters max), so there's
nothing to paste. AMO's summary (250 max):

> Track your AO3 reading, WIP updates and the authors you follow. Free, no account, no AI. Your library stays in your browser.

## Description (both stores)

> FicTracker keeps track of what you're reading on Archive of Our Own, right where you read it.
>
> Open a fic on AO3 and a small panel shows your progress. Read the next chapter and it moves along with you. Set a status (Reading, To Read, Completed, On Hold, DNF), rate it and jot a note, right there on the page.
>
> What it does:
> - Tracks your chapter and status in every fic as you read on AO3
> - Imports your AO3 history and bookmarks, a page at a time, from those pages on AO3
> - Checks your WIPs for new chapters and shows a count on the toolbar button
> - Follows authors and series and tells you when they post something new
> - "More like this": an AO3 search built from a fic's own fandom, ship and tags, most kudos first
> - Shelves, smart shelves and saved Fic Finder searches, in your library or on AO3
> - Stats on what you read: words, fandoms, ships, streaks
> - EPUB import, and backups that merge, so you can carry your library between computers
> - Optional sync of settings, presets and follows through Chrome or Firefox Sync
> - Works on Firefox for Android too
>
> What it doesn't do:
> - No account. Your library is stored in your browser and never sent to us.
> - No AI. No recommendations made up by a model, no taste profiles.
> - No paywall. Everything is free. If you want to chip in, there's a Ko-fi link in Settings.
>
> Being polite to AO3: AO3 is run by volunteers, so FicTracker asks it for one page at a time, at least 3 seconds apart, and backs off for 10 minutes if AO3 says it's busy.
>
> Used the old FicTracker web app? Install the extension and open fictracker.app once. Your library is copied over automatically.
>
> FicTracker isn't affiliated with AO3 or the Organization for Transformative Works.

## What's new in 2.1.0 (AMO version notes / Chrome has no field)

> Rate a fic and jot a note right from the panel on AO3, and it'll ask for a rating when you finish one. New "More like this" button: an AO3 search built from a fic's own fandom, ship and tags, most kudos first. Use FicTracker on more than one computer: restoring a backup now merges, and you can sync settings, Fic Finder presets and follows through Chrome or Firefox Sync (off by default). Works on Firefox for Android. The panel matches the library's colors, and DNF and Dropped are one status now (your Dropped fics are under DNF).

## What's new in 2.0.0

> FicTracker 2.0 is a rebuild based on your feedback. Sign-in is gone (it was broken, sorry!) and so are accounts, the paid tier and AI Picks. Everything now lives in the extension: your library opens from the toolbar button. New: AO3 history import, WIP and author/series update checks, and a Fic Finder that searches AO3 for any of your tags.

---

## Chrome Web Store: Privacy practices tab

**Single purpose**

> FicTracker tracks the user's reading on Archive of Our Own (archiveofourown.org): progress and status in each fic, a personal library, and updates to fics, authors and series the user follows.

**Permission justifications**

- **storage**
  > Stores the user's library (fics, reading progress, statuses, shelves, follows and settings) in the browser. This is the only place the data lives; there is no server. If the user switches on sync in Settings (off by default), settings, saved filters, smart shelves and the list of followed authors and series also go into chrome.storage.sync, the user's own Chrome sync; the library itself never does.
- **unlimitedStorage**
  > Libraries can hold thousands of fics with tags and reading history, which can grow past the default local storage quota. Without it, imports of a large AO3 history would fail partway.
- **alarms**
  > Runs the optional background check for new chapters in the user's WIPs and new works from followed authors and series, every 12 hours by default (adjustable or off in Settings).
- **Host permission: https://archiveofourown.org/\***
  > Shows the reading panel on AO3 work pages, imports the user's history and bookmarks from their own AO3 pages, and fetches the user's tracked fics and followed authors/series to check for updates. Requests are paced at least 3 seconds apart.
- **Host permission: https://fictracker.app/\***
  > One-time move from the old FicTracker web app: reads the library that app left in the browser's storage on fictracker.app and copies it into the extension. Nothing is sent anywhere.

**Remote code:** No, I am not using remote code. (All code is in the package.)

**Data usage:** Leave every data type unchecked. FicTracker doesn't collect or transmit user data to the developer or any third party. Then tick all three certifications (not sold, not used for unrelated purposes, not used for credit).

**Privacy policy URL:** https://fictracker.app/privacy

## AMO: other fields

- **Categories:** keep whatever the 1.x listing uses.
- **Support site:** https://fictracker.app
- **Privacy policy:** paste the text of `site/privacy.html` (AMO hosts its own copy) or link it.
- **Notes to reviewer:**
  > Source is attached (fictracker-source-v2.1.0.zip). Build steps are in BUILD-FOR-REVIEWERS.md: `npm ci && npm run build:ext` with Node 24; the output in extension/dist/build-firefox matches the uploaded package byte for byte. The background script and content scripts are not minified; the library page (app/) is built by Vite. To test: open any work on archiveofourown.org, the panel appears at the bottom right; the toolbar button opens the library. No account is needed.

---

## Reply for the old 1-star AMO reviews

Post once 2.0.0 is live. Same text works for both reviews.

> Hey! You were right, sign-in was broken and I'm sorry it wasted your time. FicTracker 2.0 is out and there's no sign-in anymore: no account, no paywall and no AI, and your library just lives in your browser. If you give it another try I'd love to hear what you think!
>
> Ro
