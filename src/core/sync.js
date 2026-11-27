// src/core/sync.js
// Moving your FicTracker setup between browsers, with no FicTracker account
// or server. Pure functions, shared by the background worker and tests.
//
// Two ways:
// 1. Backup files. Restoring a backup merges it into what's here, so
//    exporting on one computer and restoring on the other (and back) works
//    as a manual two-way sync.
// 2. Browser sync (opt-in, Settings). Small things go through the browser's
//    own sync storage (your Google account in Chrome, Firefox Sync in
//    Firefox): settings, Fic Finder presets, smart shelves and the authors
//    and series you follow. The library itself is too big for browser sync
//    (about 100 KB in all, 8 KB per item), so it moves by backup file.

// Local key → browser-sync key.
export const SYNCED = {
  ft_settings: 'fts_settings',
  ft_finder_presets: 'fts_presets',
  ft_smart_shelves: 'fts_smart_shelves',
  ft_follows: 'fts_follows',
};

// Per-browser settings that never sync.
const LOCAL_ONLY_SETTINGS = ['syncEnabled'];

export const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Follows are synced as just who you follow; what each one has posted is
// worked out again by each browser.
export function followList(follows) {
  return Object.values(follows || {})
    .filter(f => f?.kind && f?.id)
    .map(f => ({ kind: f.kind, id: String(f.id), name: f.name || String(f.id) }))
    .sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
}

function syncedSettings(settings) {
  const out = { ...(settings || {}) };
  for (const k of LOCAL_ONLY_SETTINGS) delete out[k];
  return out;
}

// The browser-sync value for one local key.
export function toSyncValue(localKey, value) {
  if (localKey === 'ft_settings') return syncedSettings(value);
  if (localKey === 'ft_follows') return followList(value);
  return Array.isArray(value) ? value : [];
}

// A synced settings value applied here, keeping this browser's own.
export function settingsFromSync(local, synced) {
  const out = { ...syncedSettings(synced) };
  for (const k of LOCAL_ONLY_SETTINGS) if (local && k in local) out[k] = local[k];
  return out;
}

// Follows to add and remove so this browser follows exactly `list`.
// `union` keeps the ones only this browser has (used when sync is first
// turned on, so nobody loses a follow).
export function followChanges(localFollows, list, { union = false } = {}) {
  const key = f => `${f.kind}:${f.id}`;
  const want = new Map((list || []).map(f => [key(f), f]));
  const have = new Set(Object.values(localFollows || {}).filter(f => f?.kind && f?.id).map(key));
  return {
    add: [...want.values()].filter(f => !have.has(key(f))),
    remove: union ? [] : [...have].filter(k => !want.has(k)),
  };
}

// Combine two lists of things with ids (presets, smart shelves): everything
// here stays as it is, and anything only in `theirs` is added.
export function mergeById(mine, theirs) {
  const out = [...(mine || [])];
  const ids = new Set(out.map(x => x?.id));
  for (const x of theirs || []) if (x?.id && !ids.has(x.id)) { out.push(x); ids.add(x.id); }
  return out;
}

// Shelves: same id or same name (ignoring case) is the same shelf, and it
// keeps the fics from both.
export function mergeShelves(mine, theirs) {
  const out = (mine || []).map(s => ({ ...s, work_ids: [...(s.work_ids || [])] }));
  for (const s of theirs || []) {
    if (!s?.name) continue;
    const same = out.find(m => m.id === s.id || m.name?.toLowerCase() === s.name.toLowerCase());
    if (!same) { out.push({ ...s, work_ids: [...(s.work_ids || [])] }); continue; }
    for (const id of s.work_ids || []) if (!same.work_ids.includes(id)) same.work_ids.push(id);
  }
  return out;
}
