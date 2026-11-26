// src/core/scrape.js
// Reads a work's metadata out of an AO3 work page. Used by the on-page
// panel (on the live page) and by the library page (on a page it fetched).

const text = el => el?.textContent?.trim() || null;
const num = el => {
  const n = parseInt((el?.textContent || '').replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};

export function parseWorkPage(doc, ao3Id) {
  const tags = sel => Array.from(doc.querySelectorAll(sel)).map(e => e.textContent.trim());

  const authors = tags('h3.byline a[rel="author"]');
  const author_users = authorUsers(doc.querySelectorAll('h3.byline a[rel="author"]'));

  let chapter_count = null;
  let chapter_total = null;
  const chapMatch = (text(doc.querySelector('dd.chapters')) || '').match(/(\d+)\s*\/\s*(\d+|\?)/);
  if (chapMatch) {
    chapter_count = parseInt(chapMatch[1], 10);
    chapter_total = chapMatch[2] === '?' ? null : parseInt(chapMatch[2], 10);
  }

  // AO3's chapter dropdown lists every chapter with its internal id, which
  // is what lets "Continue reading" link straight to the right chapter.
  const chapter_ids = Array.from(doc.querySelectorAll('select#selected_id option'))
    .map((opt, idx) => ({
      num: parseInt(opt.textContent.match(/^(\d+)\./)?.[1] || String(idx + 1), 10),
      ao3_id: opt.value,
    }))
    .filter(ch => ch.ao3_id);

  const series_memberships = [];
  doc.querySelectorAll('dd.series .series').forEach(el => {
    const link = el.querySelector('a[href*="/series/"]');
    const id = link?.getAttribute('href')?.match(/\/series\/(\d+)/)?.[1];
    if (!id) return;
    series_memberships.push({
      ao3_series_id: parseInt(id, 10),
      series_name: link.textContent.trim(),
      position_in_series: num(el.querySelector('.position')),
    });
  });

  return {
    id: String(ao3Id),
    ao3_id: Number(ao3Id),
    title: text(doc.querySelector('h2.title')) || 'Untitled',
    authors: authors.length ? authors : ['Anonymous'],
    author_users,
    rating: text(doc.querySelector('dd.rating a.tag')),
    warnings: tags('dd.warning a.tag'),
    categories: tags('dd.category a.tag'),
    fandoms: tags('dd.fandom a.tag'),
    relationships: tags('dd.relationship a.tag'),
    characters: tags('dd.character a.tag'),
    freeform_tags: tags('dd.freeform a.tag'),
    language: text(doc.querySelector('dd.language')) || 'English',
    word_count: num(doc.querySelector('dd.words')),
    chapter_count,
    chapter_total,
    is_complete: chapter_total !== null && chapter_count !== null && chapter_count >= chapter_total,
    chapter_ids,
    series_memberships,
    kudos: num(doc.querySelector('dd.kudos')),
    hits: num(doc.querySelector('dd.hits')),
    bookmarks_count: num(doc.querySelector('dd.bookmarks')),
    comments_count: num(doc.querySelector('dd.comments')),
    date_published: text(doc.querySelector('dd.published')),
    date_updated: text(doc.querySelector('dd.status')),
    summary: text(doc.querySelector('.summary blockquote'))?.slice(0, 2000) || null,
  };
}

// AO3 usernames from byline links (/users/<name>/pseuds/<pseud>), which is
// what following an author needs. orphan_account isn't a person to follow.
function authorUsers(links) {
  const users = Array.from(links)
    .map(a => a.getAttribute('href')?.match(/^\/users\/([^/]+)/)?.[1])
    .filter(u => u && u !== 'orphan_account');
  return [...new Set(users)];
}

// ---------------------------------------------------------------------------
// Listing pages: history, bookmarks, an author's works, a series
// ---------------------------------------------------------------------------
// These show each work as a "blurb" (title, tags, stats) rather than the
// full work page. Blurbs have no chapter ids, so the parsed work leaves that
// field out and never wipes the chapter ids already saved for a fic.

const textOf = (root, sel) => text(root.querySelector(sel));
const tagsIn = (root, sel) => Array.from(root.querySelectorAll(sel)).map(e => e.textContent.trim());

export function parseWorkBlurb(li) {
  const link = li.querySelector('.header h4.heading a[href^="/works/"]');
  const ao3Id = link?.getAttribute('href').match(/^\/works\/(\d+)/)?.[1];
  if (!ao3Id) return null;

  const authorLinks = li.querySelectorAll('.header h4.heading a[rel="author"]');
  const authors = Array.from(authorLinks).map(a => a.textContent.trim());

  let chapter_count = null;
  let chapter_total = null;
  const chap = (textOf(li, 'dl.stats dd.chapters') || '').match(/(\d+)\s*\/\s*(\d+|\?)/);
  if (chap) {
    chapter_count = parseInt(chap[1], 10);
    chapter_total = chap[2] === '?' ? null : parseInt(chap[2], 10);
  }

  const series_memberships = [];
  li.querySelectorAll('ul.series li').forEach(el => {
    const a = el.querySelector('a[href^="/series/"]');
    const id = a?.getAttribute('href').match(/\/series\/(\d+)/)?.[1];
    if (!id) return;
    series_memberships.push({
      ao3_series_id: parseInt(id, 10),
      series_name: a.textContent.trim(),
      position_in_series: num(el.querySelector('strong')),
    });
  });

  const requiredTitle = sel => li.querySelector(`.required-tags ${sel}`)?.getAttribute('title') || null;

  return {
    id: ao3Id,
    ao3_id: Number(ao3Id),
    title: link.textContent.trim() || 'Untitled',
    authors: authors.length ? authors : ['Anonymous'],
    author_users: authorUsers(authorLinks),
    rating: requiredTitle('.rating'),
    warnings: tagsIn(li, 'ul.tags li.warnings a.tag'),
    categories: (requiredTitle('.category') || '').split(',').map(s => s.trim()).filter(Boolean),
    fandoms: tagsIn(li, '.header h5.fandoms a.tag'),
    relationships: tagsIn(li, 'ul.tags li.relationships a.tag'),
    characters: tagsIn(li, 'ul.tags li.characters a.tag'),
    freeform_tags: tagsIn(li, 'ul.tags li.freeforms a.tag'),
    language: textOf(li, 'dl.stats dd.language') || 'English',
    word_count: num(li.querySelector('dl.stats dd.words')),
    chapter_count,
    chapter_total,
    is_complete: chapter_total !== null && chapter_count !== null && chapter_count >= chapter_total,
    series_memberships,
    kudos: num(li.querySelector('dl.stats dd.kudos')),
    hits: num(li.querySelector('dl.stats dd.hits')),
    bookmarks_count: num(li.querySelector('dl.stats dd.bookmarks')),
    comments_count: num(li.querySelector('dl.stats dd.comments')),
    date_updated: textOf(li, '.header p.datetime'),
    summary: textOf(li, 'blockquote.summary')?.slice(0, 2000) || null,
  };
}

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
// AO3 dates look like "14 Nov 2026".
export function parseAo3Date(s) {
  const m = (s || '').match(/(\d{1,2})\s+([A-Z][a-z]{2})\s+(\d{4})/);
  if (!m || MONTHS[m[2]] === undefined) return null;
  return new Date(Date.UTC(+m[3], MONTHS[m[2]], +m[1])).toISOString();
}

// The highest page number in AO3's pagination, or 1.
export function lastPageNumber(doc) {
  const nums = Array.from(doc.querySelectorAll('ol.pagination li a, ol.pagination li span'))
    .map(e => parseInt(e.textContent.trim(), 10))
    .filter(Number.isFinite);
  return nums.length ? Math.max(...nums) : 1;
}

// Every item on a history, bookmarks, author or series listing page.
// kind is 'work', or 'skipped' for deleted works, hidden works and
// bookmarked series, which FicTracker can't track.
export function parseListingPage(doc) {
  const items = [];
  doc.querySelectorAll('li.blurb').forEach(li => {
    const work = parseWorkBlurb(li);
    if (!work) { items.push({ kind: 'skipped' }); return; }
    const item = { kind: 'work', work };
    const viewed = li.querySelector('h4.viewed');
    if (viewed) {
      const t = viewed.textContent.replace(/\s+/g, ' ');
      item.last_visited = parseAo3Date(t.match(/Last visited:\s*([^()]+)/)?.[1]);
      item.marked_for_later = /Marked for Later/i.test(t);
      item.update_available = /Update available/i.test(t);
      item.visits = parseInt(t.match(/Visited (\d+) times/)?.[1] || (/Visited once/.test(t) ? '1' : '0'), 10);
    }
    items.push(item);
  });
  return { items, lastPage: lastPageNumber(doc) };
}

// A series page: its title, whether it's finished, and its works.
export function parseSeriesPage(doc) {
  const metaPairs = {};
  const dts = doc.querySelectorAll('dl.series.meta dt');
  dts.forEach(dt => {
    const dd = dt.nextElementSibling;
    if (dd) metaPairs[dt.textContent.trim().replace(/:$/, '')] = dd.textContent.trim();
  });
  return {
    title: text(doc.querySelector('h2.heading')) || 'Untitled series',
    complete: /^yes/i.test(metaPairs.Complete || ''),
    ...parseListingPage(doc),
  };
}

// The logged-in AO3 user, from the "Hi, name!" menu, or null.
export function loggedInUser(doc) {
  const a = doc.querySelector('#greeting a[href^="/users/"], #header ul.user a.dropdown-toggle[href^="/users/"]');
  return a?.getAttribute('href').match(/^\/users\/([^/?#]+)/)?.[1] || null;
}

// Is this page AO3's "this work could have adult content" or login wall?
export function isGatedPage(doc) {
  return Boolean(
    doc.querySelector('#adult-gate-form') ||
    doc.querySelector('p.caution a[href*="view_adult"]') ||
    (doc.querySelector('#login') && !doc.querySelector('h2.title'))
  );
}

// Which chapter is open right now: the selected chapter in AO3's dropdown,
// or the /chapters/<id> in the URL. Null on a work's index or full-work view.
export function detectCurrentChapter(doc, pathname, chapterIds) {
  const sel = doc.querySelector('select#selected_id');
  const opt = sel?.options?.[sel.selectedIndex];
  const fromSelect = opt?.textContent?.match(/^(\d+)\./)?.[1];
  if (fromSelect && /\/chapters\/\d+/.test(pathname)) return parseInt(fromSelect, 10);

  const chapterId = pathname.match(/\/chapters\/(\d+)/)?.[1];
  if (chapterId) return chapterIds.find(ch => String(ch.ao3_id) === chapterId)?.num || null;
  return null;
}
