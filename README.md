# FicTracker

**Your fanfiction library, finally organized.**

FicTracker is a personal reading tracker for [Archive of Our Own (AO3)](https://archiveofourown.org) readers. Import your bookmarks, track what you're reading, rate your favorites, and get personalized recommendations — all in a clean, dark-mode interface built for binge readers.

## Why FicTracker?

AO3 is incredible for hosting fanfiction, but its tools for *managing* your reading life are minimal. Bookmarks pile up. You lose track of WIPs. You forget which fic in a 200k-word series you stopped at. You re-read the same tags hoping to find something new.

FicTracker fixes all of that.

### Import in seconds

Drag a bookmarklet to your browser bar, click it on your AO3 bookmarks page, and watch your entire library flow in — metadata, tags, stats, and all. Got EPUBs downloaded on your device? Drop them in too. FicTracker reads AO3 metadata from the files automatically.

### Track everything

Set reading status (to read, reading, completed, on hold, dropped), rate fics 1–5 stars, track your current chapter in long multi-chapter works with a visual progress bar, and add personal notes. Your library, your way.

### Smart recommendations

FicTracker learns what you love. Rate a few fics and the For You tab surfaces unread works that match your favorite fandoms and ships, weighted by what you've enjoyed most.

### Stats that tell a story

See your reading life at a glance: top fandoms, favorite ships, word count distributions, rating breakdowns, and aggregate stats across your entire library. (Reading Wrapped coming soon.)

### WIP badges

Never lose track of an update. FicTracker flags your incomplete works when new chapters drop, right in your library view — no email noise, just a quiet badge when something you're reading has new content.

### Chrome extension

The FicTracker extension lives on every AO3 page. Add fics to your library, update your reading status, and advance chapters — all without leaving AO3. It auto-detects which chapter you're on and silently syncs your progress as you read.

The panel has three modes: full (everything visible), mini (compact status badge + chapter controls), and hidden (floating button only). Your preference persists across page navigations.

### Chapter tracking everywhere

Whether you use the Chrome extension (auto-detects your chapter), the Chapter Sync bookmarklet (one tap on mobile), or the chapter slider in the web app — your progress syncs to the same place. Open a fic in FicTracker and "Continue Ch. 5 on AO3" takes you directly to that chapter page.

### Reading Wrapped

Spotify Wrapped, but for fic. See monthly and yearly summaries of your reading: total words, chapters, fics completed, top fandom, top ship, and longest fic — all rendered as shareable cards.

## Quick start

1. **Sign up** at [fictracker.app](https://fictracker.app) *(coming soon)*
2. **Import** your AO3 bookmarks with one click
3. **Browse, filter, and sort** your library by status, fandom, ship, rating, word count, or tags
4. **Rate and track** your way through your reading list
5. **Discover** new fics tailored to your taste

## Tech stack

- **Frontend:** Vite + React 19 (component architecture with custom hooks)
- **Backend:** [Supabase](https://supabase.com) (Postgres, Auth, Edge Functions, Row Level Security)
- **Hosting:** [Vercel](https://vercel.com) (auto-deploys from GitHub)
- **Charts:** Recharts
- **Payments:** Stripe *(planned)*

## Pricing

| | Free | Plus |
|---|---|---|
| **Price** | $0 | $4/month (or $36/year) |
| Fics tracked | Up to 50 | Unlimited |
| Import bookmarks | ✓ | ✓ |
| Quick Add bookmarklet | ✓ | ✓ |
| Chapter Sync bookmarklet | ✓ | ✓ |
| Chrome extension | ✓ | ✓ |
| Search, filter, sort | ✓ | ✓ |
| Status & chapter tracking | ✓ | ✓ |
| WIP update badges | ✓ | ✓ |
| Stats & analytics | — | ✓ |
| Reading Wrapped | — | ✓ |
| Personalized recs | — | ✓ |
| EPUB import | — | ✓ |

## Development

```bash
# Clone the repo
git clone https://github.com/rorakhit/fictracker.git
cd fictracker

# Install dependencies (requires Node >= 20)
npm install

# Start dev server
npm run dev

# Production build
npm run build
```

### Project structure

```
fictracker/
├── index.html              # Vite entry point
├── src/
│   ├── main.jsx            # React entry point
│   ├── App.jsx             # Auth wrapper + Dashboard (tab routing)
│   ├── supabase.js         # Supabase client init
│   ├── styles/index.css    # All CSS
│   ├── components/
│   │   ├── LoginPage.jsx   # Email/password + OAuth
│   │   ├── Library.jsx     # Fic list, filters, sorting, bulk actions
│   │   ├── StatsView.jsx   # Charts (fandoms, ratings, word count, ships)
│   │   ├── RecsView.jsx    # Recommendation cards
│   │   ├── ImportView.jsx  # Bookmarklet, EPUB import, add-by-URL
│   │   ├── SettingsView.jsx
│   │   ├── WorkModal.jsx   # Work detail modal
│   │   └── Stars.jsx       # Star rating component
│   ├── hooks/
│   │   ├── useLibrary.js   # Data layer (fetching, CRUD, bulk ops, import)
│   │   └── useAnalytics.js # Analytics engine (timelines, pace, streaks, wrapped)
│   └── utils/
│       ├── helpers.js      # Shared utilities
│       └── bookmarklet.js  # Bookmarklet generators (Quick Add + Chapter Sync)
├── extension/              # Chrome Extension (manifest v3)
│   ├── manifest.json       # Content scripts on AO3, service worker
│   ├── background/
│   │   └── service-worker.js  # Supabase API proxy, auth, message handler
│   ├── content/
│   │   ├── content.js      # AO3 panel (full/mini/hidden), chapter tracking
│   │   └── content.css     # Scoped styles with !important overrides
│   ├── popup/              # Extension popup UI
│   └── icons/              # Extension icons (16/48/128px)
├── FicTracker_Brand_Board.html  # Brand identity reference
├── README.md
└── .gitignore
```

### Database

FicTracker uses Supabase with Row Level Security for full multi-user data isolation. The schema includes:

- **works** — Shared AO3 metadata cache (title, authors, tags, stats)
- **reading_status** — Per-user reading state, ratings, notes, chapter progress
- **reading_log** — Per-user reading session history (for stats over time)
- **wip_tracking** — Per-user WIP monitoring
- **user_preferences** — Per-user settings (AO3 username, notification prefs)

## Contributing

FicTracker is currently in active development. If you're an AO3 reader who wants to help shape the product, reach out or open an issue — especially if you have thoughts on features, UX, or fandom-specific needs.

## License

MIT

---

*Built by a fanfic reader, for fanfic readers.*
