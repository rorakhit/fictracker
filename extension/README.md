# FicTracker Browser Extension

Track your AO3 reading directly from Archive of Our Own. Add fics to your library, update reading progress, and change statuses — all without leaving AO3.

## Features

- **Floating panel** on every AO3 work page showing your tracking status
- **One-click add** to library with status picker (To Read / Reading / Completed)
- **Chapter tracking** with +/− controls for fics you're actively reading
- **Auto-complete** detection when you reach the final chapter
- **Status updates** without leaving AO3

## Chrome / Edge / Firefox

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable "Developer mode"
3. Click "Load unpacked" and select this `extension/` folder
4. Navigate to any AO3 work page — the FicTracker panel appears in the bottom-right

## Safari on iPad / Mac (Safari Web Extension)

Safari requires extensions to be packaged as an Xcode project. Apple provides a converter tool:

### Prerequisites
- macOS with Xcode 14+ installed
- Xcode Command Line Tools (`xcode-select --install`)

### Steps

```bash
# From the fictracker repo root:
xcrun safari-web-extension-converter extension/ \
  --project-location safari-extension/ \
  --app-name "FicTracker" \
  --bundle-identifier com.fictracker.extension

# Open the generated Xcode project:
open safari-extension/FicTracker/FicTracker.xcodeproj
```

In Xcode:
1. Select your Apple Developer team in Signing & Capabilities
2. For **iPad**: change the target to "iPad" and build (Cmd+B)
3. For **Mac**: just build directly
4. Run the app — it will prompt you to enable the extension in Safari Settings

### Testing on iPad
- Connect your iPad via USB
- In Xcode, select your iPad as the run destination
- Build & Run (Cmd+R) — the companion app installs on your iPad
- Open Safari → Settings → Extensions → Enable FicTracker
- Navigate to an AO3 work page — the panel appears!

### TestFlight Distribution
To share with others without the App Store:
1. Archive the build (Product → Archive)
2. Upload to App Store Connect
3. Add testers via TestFlight

## Architecture

```
extension/
├── manifest.json              # Extension manifest (v3)
├── background/
│   └── service-worker.js      # Auth + API layer (all Supabase calls)
├── content/
│   ├── content.js             # Injected on AO3 — scrapes metadata, renders panel
│   └── content.css            # Panel styling (prefixed to avoid AO3 conflicts)
├── popup/
│   ├── popup.html             # Extension popup (login + stats)
│   └── popup.js               # Popup logic
└── icons/
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png
```

**Design decisions:**
- All Supabase API calls go through the background service worker via `chrome.runtime.sendMessage`. This centralizes auth token management — the content script and popup don't need their own Supabase instances.
- The content script uses DOM scraping instead of an API because AO3 doesn't have a public API. The scraper targets AO3's semantic CSS classes (`dd.chapters`, `dd.fandom.tags`, etc.) which have been stable for years.
- CSS uses `!important` on reset properties to override AO3's aggressive global styles. All selectors are prefixed with `#fictracker-` or `.ft-` to avoid conflicts.
- Session is stored in `chrome.storage.local` with automatic token refresh, so you stay logged in across browser restarts.
