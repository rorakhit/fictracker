// src/core/finder.js
// Fic Finder presets: your own saved filters, run against your library or
// opened as a search on AO3. No ranking, no suggestions: your rules only.

// Does a fic's tag match what you typed? Ignores case, and matches whole
// words inside longer tags, because AO3's tags carry extras you don't type:
// "game of thrones" matches "Game of Thrones (TV)", and "a song of ice and
// fire" matches "A Song of Ice and Fire - George R. R. Martin".
// "Fire" alone doesn't match "Firefly": only whole words count.
const norm = s => String(s || '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = new Map();
function tagPattern(wanted) {
  const w = norm(wanted);
  if (!patterns.has(w)) {
    patterns.set(w, new RegExp(`(?:^|[^\\p{L}\\p{N}])${escape(w)}(?:$|[^\\p{L}\\p{N}])`, 'u'));
  }
  return patterns.get(w);
}
export function tagMatches(wanted, tag) {
  if (!norm(wanted)) return false;
  return tagPattern(wanted).test(norm(tag));
}

// Run a preset against your library. Within each list, a fic matches if it
// has any of the tags you listed (see tagMatches).
export function applyPreset(works, preset) {
  const has = (have, t) => have.some(tag => tagMatches(t, tag));
  const anyOf = (wanted, have) => !wanted?.length || wanted.some(t => has(have, t));
  const noneOf = (unwanted, have) => !unwanted?.length || !unwanted.some(t => has(have, t));
  return works.filter(w => {
    const fandoms = w.fandoms || [];
    const ships = w.relationships || [];
    const tags = w.freeform_tags || [];
    const wc = w.word_count || 0;
    return anyOf(preset.fandoms_include, fandoms)
      && noneOf(preset.fandoms_exclude, fandoms)
      && anyOf(preset.ships_include, ships)
      && noneOf(preset.ships_exclude, ships)
      && anyOf(preset.tags_include, tags)
      && noneOf(preset.tags_exclude, tags)
      && !(preset.word_count_min && wc < Number(preset.word_count_min))
      && !(preset.word_count_max && wc > Number(preset.word_count_max))
      && !(preset.completion === 'complete' && !w.is_complete)
      && !(preset.completion === 'wip' && w.is_complete);
  });
}

// The same preset as an AO3 work search, matching tags the way the library
// search does. AO3 can't take regex (its search escapes "/"), and its tag
// boxes need exact tag names and require *all* of them. So the tag lists go
// in AO3's search box as phrases on its `tag` field instead, e.g.
//   (tag:"Game of Thrones" OR tag:"A Song of Ice and Fire") -tag:"Major Character Death"
// AO3 matches a phrase on whole words, ignoring case, so this finds
// "Game of Thrones (TV)" too. That field holds every kind of tag, so a
// fandom name can also match a character or additional tag that contains it.
// Words and completion use AO3's own filters (words_from / words_to,
// complete=T/F); see otwarchive app/models/search/work_query.rb.
const phrase = t => `tag:"${t.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim()}"`;
const clean = arr => (arr || []).map(t => String(t).trim()).filter(t => t.replace(/["\\]/g, '').trim());

export function ao3SearchQuery(preset) {
  const parts = [];
  for (const key of ['fandoms_include', 'ships_include', 'tags_include']) {
    const list = clean(preset[key]).map(phrase);
    if (list.length === 1) parts.push(list[0]);
    else if (list.length > 1) parts.push(`(${list.join(' OR ')})`);
  }
  for (const key of ['fandoms_exclude', 'ships_exclude', 'tags_exclude']) {
    for (const t of clean(preset[key])) parts.push(`-${phrase(t)}`);
  }
  return parts.join(' ');
}

export function buildAO3SearchUrl(preset) {
  const params = new URLSearchParams();
  const set = (key, value) => { if (value) params.set(`work_search[${key}]`, value); };
  set('query', ao3SearchQuery(preset));
  set('words_from', preset.word_count_min ? String(Number(preset.word_count_min)) : '');
  set('words_to', preset.word_count_max ? String(Number(preset.word_count_max)) : '');
  if (preset.completion === 'complete') set('complete', 'T');
  if (preset.completion === 'wip') set('complete', 'F');
  // A text search is otherwise sorted by "best match".
  set('sort_column', SORT_COLUMNS.has(preset.sort_column) ? preset.sort_column : 'revised_at');
  params.set('commit', 'Search');
  return `https://archiveofourown.org/works/search?${params.toString()}`;
}

// AO3's own sort options (otwarchive WorkSearchForm::SORT_OPTIONS) that
// FicTracker uses.
const SORT_COLUMNS = new Set(['revised_at', 'kudos_count']);

// ---- More like this ----
// An AO3 search for fics like one you have, built only from that fic's own
// tags. Nothing is generated: AO3 does the searching and returns real fics.
//   fandom(s) AND first ship AND any of up to 3 additional tags,
//   best-loved (most kudos) first.
// Which additional tags: the fic's tags you've liked most, counted across
// fics you rated 4 or 5 stars; ties keep AO3's order.

const MAX_TAGS = 3;

export function pickTags(work, library) {
  const tags = clean(work?.freeform_tags);
  if (!library) return tags.slice(0, MAX_TAGS);
  const liked = new Map();
  for (const w of library.works || []) {
    if (w.id === work.id) continue;
    if ((library.statuses?.[w.id]?.rating_personal || 0) < 4) continue;
    for (const t of w.freeform_tags || []) liked.set(t, (liked.get(t) || 0) + 1);
  }
  return tags
    .map((t, i) => ({ t, i, n: liked.get(t) || 0 }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .slice(0, MAX_TAGS)
    .map(x => x.t);
}

export function moreLikeThisPreset(work, library) {
  return {
    name: `More like ${work.title || 'this'}`,
    fandoms_include: clean(work.fandoms),
    fandoms_exclude: [],
    ships_include: clean(work.relationships).slice(0, 1),
    ships_exclude: [],
    tags_include: pickTags(work, library),
    tags_exclude: [],
    word_count_min: '',
    word_count_max: '',
    completion: 'any',
    sort_column: 'kudos_count',
  };
}

export const moreLikeThisUrl = (work, library) => buildAO3SearchUrl(moreLikeThisPreset(work, library));
