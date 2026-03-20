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

### WIP alerts *(coming soon)*

Never miss an update. FicTracker monitors your incomplete works and notifies you when new chapters drop.

## Quick start

1. **Sign up** at [fictracker.app](https://fictracker.app) *(coming soon)*
2. **Import** your AO3 bookmarks with one click
3. **Browse, filter, and sort** your library by status, fandom, ship, rating, word count, or tags
4. **Rate and track** your way through your reading list
5. **Discover** new fics tailored to your taste

## Tech stack

- **Frontend:** React 18 (migrating to Vite + React for production)
- **Backend:** [Supabase](https://supabase.com) (Postgres, Auth, Edge Functions, Row Level Security)
- **Hosting:** Vercel *(planned)*
- **Payments:** Stripe *(planned)*

## Pricing

| | Free | Plus |
|---|---|---|
| **Price** | $0 | $4/month (or $36/year) |
| Fics tracked | Up to 50 | Unlimited |
| Import bookmarks | ✓ | ✓ |
| Search, filter, sort | ✓ | ✓ |
| Status tracking | ✓ | ✓ |
| Stats & analytics | — | ✓ |
| Reading Wrapped | — | ✓ |
| WIP update alerts | — | ✓ |
| Personalized recs | — | ✓ |
| Browser extension | — | ✓ |
| EPUB import | — | ✓ |

## Development

FicTracker is a single-page app. For local development:

```bash
# Clone the repo
git clone https://github.com/rorakhit/fictracker.git
cd fictracker

# Open index.html in your browser — that's it (for now)
# Vite build pipeline coming in Phase 4
```

### Project structure

```
fictracker/
├── index.html          # The entire app (React SPA, single-file)
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
