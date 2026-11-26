// src/core/finder.js
// Fic Finder presets: your own saved filters, run against your library or
// opened as a search on AO3. No ranking, no suggestions: your rules only.

// Run a preset against your library. Within each list, a fic matches if it
// has any of the tags you listed.
export function applyPreset(works, preset) {
  const anyOf = (wanted, have) => !wanted?.length || wanted.some(t => have.includes(t));
  const noneOf = (unwanted, have) => !unwanted?.length || !unwanted.some(t => have.includes(t));
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

// The same preset as an AO3 work search. AO3 takes each tag list as one
// comma-separated value (it ignores `name[]` arrays) and the word range as
// words_from / words_to. On AO3 a fic must have *all* the tags in a list,
// which is stricter than the library filter above; see presetSearchCaveat.
export function buildAO3SearchUrl(preset) {
  const params = new URLSearchParams();
  const list = arr => (arr || []).map(s => s.trim()).filter(Boolean).join(',');
  const set = (key, value) => { if (value) params.set(`work_search[${key}]`, value); };

  set('fandom_names', list(preset.fandoms_include));
  set('relationship_names', list(preset.ships_include));
  set('freeform_names', list(preset.tags_include));
  set('excluded_tag_names', list([
    ...(preset.fandoms_exclude || []),
    ...(preset.ships_exclude || []),
    ...(preset.tags_exclude || []),
  ]));
  set('words_from', preset.word_count_min ? String(Number(preset.word_count_min)) : '');
  set('words_to', preset.word_count_max ? String(Number(preset.word_count_max)) : '');
  if (preset.completion === 'complete') set('complete', 'T');
  if (preset.completion === 'wip') set('complete', 'F');
  params.set('commit', 'Search');
  return `https://archiveofourown.org/works/search?${params.toString()}`;
}

// A note to show by the AO3 button when the two searches differ.
export function presetSearchCaveat(preset) {
  const multi = ['fandoms_include', 'ships_include', 'tags_include']
    .some(k => (preset[k] || []).length > 1);
  return multi
    ? 'On AO3, fics must have all the tags in a list, not just one, so you may see fewer results.'
    : '';
}
