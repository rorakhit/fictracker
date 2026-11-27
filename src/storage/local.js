// src/storage/local.js
// All storage for the library page, backed by the extension's own storage
// (chrome.storage.local). Nothing is sent to a server.
//
// Everything is loaded into memory once by initStorage() before the app
// renders, so the getters stay synchronous like they were in v1.
//
// The library itself (works, statuses, reading log) is also changed by the
// on-page panel on AO3, so library changes go to the background worker,
// which applies them one at a time. Shelves, presets and settings are only
// edited here, so they're written directly.

import { migrateStatuses } from '../core/library.js';
import { mergeById, mergeShelves } from '../core/sync.js';

const KEYS = {
  library:       'ft_library',        // { works: [], statuses: {}, reading_log: [] }
  shelves:       'ft_shelves',        // [{ id, name, color, work_ids }]
  smartShelves:  'ft_smart_shelves',  // [{ id, name, filter_json }]
  settings:      'ft_settings',       // { readingWpm, ... }
  finderPresets: 'ft_finder_presets', // [{ id, name, ...criteria }]
  follows:       'ft_follows',        // { [key]: follow } (written by the background worker)
  followNews:    'ft_follow_news',    // [{ key, follow_key, work, ... }] (background worker)
  check:         'ft_check',          // progress of the current or last check
  ao3User:       'ft_ao3_user',       // your AO3 username, seen on AO3 pages
  syncStatus:    'ft_sync_status',    // { ok, error?, at } of the last browser sync
};

const DEFAULTS = {
  ft_library: { works: [], statuses: {}, reading_log: [] },
  ft_shelves: [],
  ft_smart_shelves: [],
  ft_settings: {},
  ft_finder_presets: [],
  ft_follows: {},
  ft_follow_news: [],
  ft_check: null,
  ft_ao3_user: null,
  ft_sync_status: null,
};

const cache = { ...DEFAULTS };
const listeners = new Set();

export async function initStorage() {
  const got = await chrome.storage.local.get(Object.values(KEYS));
  for (const key of Object.values(KEYS)) {
    if (got[key] !== undefined) cache[key] = got[key];
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    let touched = false;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in DEFAULTS) {
        cache[key] = newValue ?? DEFAULTS[key];
        touched = true;
      }
    }
    if (touched) listeners.forEach(fn => fn());
  });
}

// Called whenever any FicTracker data changes, from this tab or another.
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function write(key, value) {
  cache[key] = value;
  chrome.storage.local.set({ [key]: value }).catch(e => {
    console.error(`[FicTracker] Storage write failed for "${key}":`, e);
  });
}

// ---------------------------------------------------------------------------
// Library (works + statuses + reading log)
// ---------------------------------------------------------------------------

export function getLibrary() {
  const lib = cache[KEYS.library];
  // Old statuses (Dropped) read as their new name even before the
  // background worker has saved the change.
  const statuses = lib?.statuses && migrateStatuses(lib.statuses);
  // Same object when nothing changed, so React skips needless redraws.
  return statuses && statuses !== lib.statuses ? { ...lib, statuses } : lib;
}

// Send a message to the background worker and wait for its answer.
export async function background(msg) {
  const res = await chrome.runtime.sendMessage(msg);
  if (res?.error) throw new Error(res.error);
  return res;
}

// Send one change to the background worker. Resolves once it's saved.
export async function libraryOp(op) {
  await background({ type: 'LIB_OP', op });
}

export const getFollows   = () => cache[KEYS.follows] || {};
export const getNews      = () => cache[KEYS.followNews] || [];
export const getCheck     = () => cache[KEYS.check];
export const getAo3User   = () => cache[KEYS.ao3User];
export const getSyncStatus = () => cache[KEYS.syncStatus];

// ---------------------------------------------------------------------------
// Shelves, presets, settings
// ---------------------------------------------------------------------------

export const getShelves        = () => cache[KEYS.shelves];
export const saveShelves       = v => write(KEYS.shelves, v);
export const getSmartShelves   = () => cache[KEYS.smartShelves];
export const saveSmartShelves  = v => write(KEYS.smartShelves, v);
export const getSettings       = () => cache[KEYS.settings];
export const saveSettings      = v => write(KEYS.settings, v);
export const getFinderPresets  = () => cache[KEYS.finderPresets];
export const saveFinderPresets = v => write(KEYS.finderPresets, v);

// ---------------------------------------------------------------------------
// Backup export / import
// ---------------------------------------------------------------------------

export function exportAllData() {
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    library: getLibrary(),
    shelves: getShelves(),
    smart_shelves: getSmartShelves(),
    settings: getSettings(),
    finder_presets: getFinderPresets(),
    follows: getFollows(),
  };
}

// Restoring a backup merges it into what's here rather than replacing it,
// so a backup carried between two computers works as a two-way sync:
// - library: each fic's newer status wins, reading history is combined
// - shelves: same name means the same shelf, with the fics from both
// - presets and smart shelves: yours stay, new ones are added
// - settings: the backup's, apart from this browser's sync switch
export async function importAllData(data) {
  if (!data || typeof data !== 'object') throw new Error('Invalid backup file');
  if (data.version !== 1) throw new Error(`Unknown backup version: ${data.version}`);
  if (data.library) await libraryOp({ op: 'merge', library: data.library });
  if (data.shelves) saveShelves(mergeShelves(getShelves(), data.shelves));
  if (data.smart_shelves) saveSmartShelves(mergeById(getSmartShelves(), data.smart_shelves));
  if (data.settings) {
    const { syncEnabled: _ignored, ...settings } = data.settings;
    saveSettings({ ...getSettings(), ...settings });
  }
  if (data.finder_presets) saveFinderPresets(mergeById(getFinderPresets(), data.finder_presets));
  if (data.follows && typeof data.follows === 'object') {
    for (const f of Object.values(data.follows)) {
      if (f?.kind && f?.id) await background({ type: 'FOLLOW', kind: f.kind, id: f.id, name: f.name });
    }
  }
}

export async function clearAllData() {
  await libraryOp({ op: 'replace', library: DEFAULTS.ft_library });
  await chrome.storage.local.remove([
    KEYS.shelves, KEYS.smartShelves, KEYS.settings, KEYS.finderPresets,
    KEYS.follows, KEYS.followNews, KEYS.check, KEYS.ao3User, KEYS.syncStatus,
  ]);
}
