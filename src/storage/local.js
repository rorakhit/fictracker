// src/storage/local.js
// Single module for all FicTracker localStorage I/O.
// All user data lives here — no server storage of personal reading data.
//
// Key design: every read has a safe default (empty state) and every write
// is wrapped in try/catch so a quota error never crashes the app.

const KEYS = {
  library:        'ft_library',        // { works: [], statuses: {}, reading_log: [] }
  shelves:        'ft_shelves',        // [{ id, name, color, work_ids }]
  smartShelves:   'ft_smart_shelves',  // [{ id, name, filter_json }]
  settings:       'ft_settings',       // { ao3Username: '' }
  finderPresets:  'ft_finder_presets', // [{ id, name, ...criteria }]
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error(`[FicTracker] Storage write failed for key "${key}":`, e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Library (works + statuses + reading log)
// ---------------------------------------------------------------------------

export function getLibrary() {
  return read(KEYS.library, { works: [], statuses: {}, reading_log: [] });
}

export function saveLibrary(lib) {
  write(KEYS.library, lib);
}

// ---------------------------------------------------------------------------
// Shelves
// ---------------------------------------------------------------------------

export function getShelves() {
  return read(KEYS.shelves, []);
}

export function saveShelves(shelves) {
  write(KEYS.shelves, shelves);
}

export function getSmartShelves() {
  return read(KEYS.smartShelves, []);
}

export function saveSmartShelves(shelves) {
  write(KEYS.smartShelves, shelves);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function getSettings() {
  return read(KEYS.settings, {});
}

export function saveSettings(settings) {
  write(KEYS.settings, settings);
}

// ---------------------------------------------------------------------------
// Fic Finder presets
// ---------------------------------------------------------------------------

export function getFinderPresets() {
  return read(KEYS.finderPresets, []);
}

export function saveFinderPresets(presets) {
  write(KEYS.finderPresets, presets);
}

// ---------------------------------------------------------------------------
// Bulk export / import (for user backups)
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

export function importAllData(data) {
  if (!data || typeof data !== 'object') throw new Error('Invalid backup file');
  if (data.version !== 1) throw new Error(`Unknown backup version: ${data.version}`);

  if (data.library)         saveLibrary(data.library);
  if (data.shelves)         saveShelves(data.shelves);
  if (data.smart_shelves)   saveSmartShelves(data.smart_shelves);
  if (data.settings)        saveSettings(data.settings);
  if (data.finder_presets)  saveFinderPresets(data.finder_presets);
}

export function clearAllData() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k));
}
