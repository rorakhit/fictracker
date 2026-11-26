// src/core/follows.js
// Following authors and series, and the background check schedule. Pure
// functions shared by the background worker and tests.
//
// ft_follows:     { [key]: { kind: 'author'|'series', id, name, added_at, known_ids, checked_at } }
// ft_follow_news: [{ key, follow_key, kind, follow_name, work, found_at }]
// key for a follow is "author:<username>" or "series:<id>".

export const followKey = (kind, id) => `${kind}:${id}`;

// The one AO3 page checked for each follow. An author's works are sorted
// by date posted, so a new work is always on the first page, and an old
// work that just got a new chapter doesn't count as new.
export function followUrl(kind, id) {
  return kind === 'author'
    ? `https://archiveofourown.org/users/${encodeURIComponent(id)}/works?work_search%5Bsort_column%5D=created_at`
    : `https://archiveofourown.org/series/${encodeURIComponent(id)}`;
}

// Compare a follow's listing with what it had last time. The first check
// only records what's there, so following someone doesn't flood you with
// their back catalogue. Works already in your library are never "new".
export function diffFollow(follow, items, libraryIds, now = new Date().toISOString()) {
  const works = items.filter(i => i.kind === 'work').map(i => i.work);
  const ids = works.map(w => w.id);
  if (!Array.isArray(follow.known_ids)) {
    return { follow: { ...follow, known_ids: ids, checked_at: now }, news: [] };
  }
  const known = new Set(follow.known_ids);
  const fresh = works.filter(w => !known.has(w.id) && !libraryIds.has(w.id));
  const key = followKey(follow.kind, follow.id);
  return {
    follow: { ...follow, known_ids: [...new Set([...follow.known_ids, ...ids])], checked_at: now },
    news: fresh.map(work => ({
      key: `${key}|${work.id}`,
      follow_key: key,
      kind: follow.kind,
      follow_name: follow.name,
      work,
      found_at: now,
    })),
  };
}

// Add news items, skipping duplicates and works already in the library.
export function mergeNews(existing, incoming, libraryIds) {
  const seenWorks = new Set(existing.map(n => n.work.id));
  const out = existing.filter(n => !libraryIds.has(n.work.id));
  for (const n of incoming) {
    if (seenWorks.has(n.work.id) || libraryIds.has(n.work.id)) continue;
    seenWorks.add(n.work.id);
    out.push(n);
  }
  return out;
}

// Unfinished fics worth checking for new chapters. A scheduled check skips
// fics checked recently (by you or by an earlier run).
export function wipTargets(lib, { checkedBefore = null } = {}) {
  return lib.works.filter(w => {
    const st = lib.statuses[w.id]?.status || 'to_read';
    if (w.is_complete || !['reading', 'to_read', 'on_hold'].includes(st)) return false;
    if (w.source === 'epub' && !w.chapter_count) return false; // nothing to compare against yet
    return !checkedBefore || !w.wip_checked_at || w.wip_checked_at < checkedBefore;
  });
}

// The number on the toolbar icon: fics with new chapters plus new works
// from people and series you follow.
export function badgeCount(lib, news) {
  const ids = new Set(lib.works.map(w => w.id));
  const wips = lib.works.filter(w => (w.wip_new_chapters || 0) > 0).length;
  const fresh = (news || []).filter(n => !ids.has(n.work.id)).length;
  return { wips, fresh, total: wips + fresh };
}

export const DEFAULT_CHECK_HOURS = 12;

export function checkSettings(settings) {
  return {
    autoCheck: settings?.autoCheck !== false,
    hours: [6, 12, 24, 72].includes(settings?.autoCheckHours) ? settings.autoCheckHours : DEFAULT_CHECK_HOURS,
  };
}
