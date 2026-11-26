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

const KEYS = {
  library:       'ft_library',        // { works: [], statuses: {}, reading_log: [] }
  shelves:       'ft_shelves',        // [{ id, name, color, work_ids }]
  smartShelves:  'ft_smart_shelves',  // [{ id, name, filter_json }]
  settings:      'ft_settings',       // { readingWpm, ... }
  finderPresets: 'ft_finder_presets', // [{ id, name, ...criteria }]
};

const DEFAULTS = {
  ft_library: { works: [], statuses: {}, reading_log: [] },
  ft_shelves: [],
  ft_smart_shelves: [],
  ft_settings: {},
  ft_finder_presets: [],
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
  return cache[KEYS.library];
}

// Send one change to the background worker. Resolves once it's saved.
export async function libraryOp(op) {
  const res = await chrome.runtime.sendMessage({ type: 'LIB_OP', op });
  if (res?.error) throw new Error(res.error);
}

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
  };
}

// Restoring a backup merges it into your library rather than wiping what's
// there. Shelves, presets and settings from the backup replace the current ones.
export async function importAllData(data) {
  if (!data || typeof data !== 'object') throw new Error('Invalid backup file');
  if (data.version !== 1) throw new Error(`Unknown backup version: ${data.version}`);
  if (data.library) await libraryOp({ op: 'merge', library: data.library });
  if (data.shelves) saveShelves(data.shelves);
  if (data.smart_shelves) saveSmartShelves(data.smart_shelves);
  if (data.settings) saveSettings(data.settings);
  if (data.finder_presets) saveFinderPresets(data.finder_presets);
}

export async function clearAllData() {
  await libraryOp({ op: 'replace', library: DEFAULTS.ft_library });
  await chrome.storage.local.remove([KEYS.shelves, KEYS.smartShelves, KEYS.settings, KEYS.finderPresets]);
}
