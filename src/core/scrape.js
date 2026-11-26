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
