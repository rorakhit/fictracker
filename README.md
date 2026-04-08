# FicTracker

**Your fanfiction library, finally organized.**

FicTracker is a personal reading tracker for [Archive of Our Own (AO3)](https://archiveofourown.org) readers. Import your bookmarks, track what you're reading, rate your favorites, and get personalized recommendations — all in a clean, dark-mode interface built for binge readers.

## Why FicTracker?

AO3 is incredible for hosting fanfiction, but its tools for *managing* your reading life are minimal. Bookmarks pile up. You lose track of WIPs. You forget which fic in a 200k-word series you stopped at. You re-read the same tags hoping to find something new.

FicTracker fixes all of that.

### Import your library

Multiple ways to get your fics into FicTracker. **Server-side sync** pulls your public AO3 bookmarks automatically — just enter your AO3 username and click. The **bulk import bookmarklet** scrapes your AO3 bookmarks page directly from your browser. The **reading history bookmarklet** catches fics you read but never bookmarked (runs client-side since AO3 history is private). You can also add individual fics by URL or drag in EPUB files — FicTracker reads AO3 metadata from them automatically.

### Track everything

Set reading status (to read, reading, completed, on hold, dropped), rate fics 1–5 stars, track your current chapter in long multi-chapter works with a visual progress bar, and add personal notes. Your library shuffles on every visit so buried bookmarks surface naturally.

### Bookshelves

Slice your library into named shelves — both the ones you curate by hand ("Comfort reads", "Enemies to lovers", "For the long flight") and **smart shelves** that save a filter query so you can jump back to it with one click ("Complete Drarry over 50k, highest rated first"). A work can live on multiple shelves, so you're not forced into a single taxonomy. Manual shelves are for mood and memory; smart shelves are for queries you want to keep warm. Free accounts get 3 shelves total; Plus is unlimited.

### Smart recommendations

FicTracker learns what you love. Rate a few fics and the For You tab lights up with three ways to find your next read: **AI Picks** uses Claude to craft AO3 searches tailored to your taste — including wildcard suggestions from fandoms you've never explored. **Discover** surfaces popular works from across the community that match your favorite fandoms and ships. **Your Queue** highlights the best unread fics already in your library, scored by how well they match your taste.

### Stats and analytics

See your reading life at a glance: top fandoms, favorite ships, word count distributions, rating breakdowns, and aggregate stats across your entire library. The **Analytics dashboard** goes deeper with reading activity over time (weekly or monthly), fandom timelines, reading pace, streak tracking, and completion rates.

### Reading Wrapped

Spotify Wrapped, but for fic. Monthly and yearly summaries of your reading: total words, chapters, fics completed, top fandom, top ship, and longest fic — rendered as shareable image cards you can export and post.

### WIP badges

Never lose track of an update. FicTracker checks your incomplete works for new chapters and shows per-fic banners right in your library — no email noise, just a quiet badge when something you're reading has new content.

### Chrome extension

The FicTracker extension lives on every AO3 page. Add fics to your library, update your reading status, and advance chapters — all without leaving AO3. It auto-detects which chapter you're on and silently syncs your progress as you read.

The panel has three modes: full (everything visible), mini (compact status badge + chapter controls), and hidden (floating button only). Your preference persists across page navigations.

### Chapter tracking everywhere

Whether you use the Chrome extension (auto-detects your chapter), the Chapter Sync bookmarklet (one tap on mobile), or the chapter slider in the web app — your progress syncs to the same place. Open a fic in FicTracker and "Continue Ch. 5 on AO3" takes you directly to that chapter page.

## Quick start

1. **Sign up** at [fictracker.app](https://fictracker.app)
2. **Import** your AO3 bookmarks with one click
3. **Browse, filter, and sort** your library by status, fandom, ship, rating, word count, or tags
4. **Rate and track** your way through your reading list
5. **Discover** new fics tailored to your taste

## Tech stack

- **Frontend:** Vite + React 19 (component architecture with custom hooks)
- **Backend:** [Supabase](https://supabase.com) (Postgres, Auth, Edge Functions, Row Level Security)
- **Hosting:** [Vercel](https://vercel.com) (auto-deploys from GitHub)
- **Charts:** Recharts
- **AI:** Claude Haiku (recommendation search strategies via Supabase Edge Functions)
- **Payments:** [Stripe](https://stripe.com) (Checkout + Customer Portal via Vercel serverless functions)

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
| Bookshelves (manual + smart) | Up to 3 | Unlimited |
| Stats & analytics | — | ✓ |
| Reading Wrapped | — | ✓ |
| AI-powered recs (3/day) | — | ✓ |
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
│   │   ├── RecsView.jsx    # For You tab (AI Picks, Discover, Your Queue)
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
├── api/                        # Vercel serverless functions
│   ├── create-checkout-session.js  # Stripe Checkout (creates session, returns URL)
│   ├── stripe-webhook.js           # Stripe webhook (subscription lifecycle → DB)
│   └── create-portal-session.js    # Stripe Customer Portal (manage billing)
├── supabase/
│   ├── migrations/             # SQL migration files (schema history)
│   └── functions/
│       └── import-works/       # Edge Function source (server-side fic cap)
├── vercel.json                 # Vercel config (framework, rewrites)
├── .env                        # Vite env vars (price IDs — gitignored)
├── FicTracker_Brand_Board.html # Brand identity reference (gitignored)
├── README.md
└── .gitignore
```

### Database

FicTracker uses Supabase with Row Level Security for full multi-user data isolation. The schema includes:

- **works** — Shared AO3 metadata cache (title, authors, tags, stats)
- **reading_status** — Per-user reading state, ratings, notes, chapter progress
- **reading_log** — Per-user reading session history (for stats over time)
- **wip_tracking** — Per-user WIP monitoring
- **user_preferences** — Per-user settings (AO3 username, subscription tier, AI rec rate limits)
- **subscriptions** — Stripe subscription lifecycle (customer ID, plan, period dates, cancel status)
- **import_jobs** — Server-side AO3 scraping progress tracking
- **shelves** — User-created manual bookshelves (name, color) with a combined 3-shelf free-tier cap enforced by a DB trigger
- **shelf_works** — Many-to-many between shelves and works (a work can live on multiple shelves)
- **smart_shelves** — Saved filter queries (status, search, sort) that restore Library state on click

## Contributing

FicTracker is currently in active development. If you're an AO3 reader who wants to help shape the product, reach out or open an issue — especially if you have thoughts on features, UX, or fandom-specific needs.

## License

MIT

---

*Built by a fanfic reader, for fanfic readers.*
