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
  set('sort_column', 'revised_at'); // a text search is otherwise sorted by "best match"
  params.set('commit', 'Search');
  return `https://archiveofourown.org/works/search?${params.toString()}`;
}
