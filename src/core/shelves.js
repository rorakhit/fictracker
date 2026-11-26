// src/core/shelves.js
// Manual shelves (a named list of fics) and smart shelves (a saved Library
// filter). Pure helpers used by hooks/useLocalShelves.js.
//
// ft_shelves:       [{ id, name, color, work_ids, created_at }]
// ft_smart_shelves: [{ id, name, filterJson, created_at }]  (older data: filter_json)

// work id → shelf ids, and shelf id → work ids. Fics deleted from your
// library are left out, so shelf counts stay right without rewriting shelves.
export function shelfMaps(shelves, libraryIds) {
  const byWork = new Map();
  const byShelf = new Map();
  for (const shelf of shelves || []) {
    const ids = new Set((shelf.work_ids || []).filter(id => !libraryIds || libraryIds.has(id)));
    byShelf.set(shelf.id, ids);
    for (const id of ids) {
      if (!byWork.has(id)) byWork.set(id, new Set());
      byWork.get(id).add(shelf.id);
    }
  }
  return { shelvesByWork: byWork, worksByShelf: byShelf };
}

export function nameTaken(list, name, exceptId = null) {
  const n = name.trim().toLocaleLowerCase();
  return (list || []).some(s => s.id !== exceptId && (s.name || '').trim().toLocaleLowerCase() === n);
}

// A smart shelf's saved filter. Shelves from the old web app stored it as
// filter_json, sometimes as a JSON string.
export function smartShelfFilter(shelf) {
  let f = shelf?.filterJson ?? shelf?.filter_json ?? {};
  if (typeof f === 'string') {
    try { f = JSON.parse(f); } catch { f = {}; }
  }
  return {
    statusFilter: f.statusFilter || 'all',
    search: f.search || '',
    sortBy: f.sortBy || 'shuffle',
  };
}
