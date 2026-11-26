// src/hooks/useLocalShelves.js
// Bookshelves (manual and smart). Stored in extension storage via storage/local.js.

import { useState, useMemo, useEffect } from 'react';
import { getShelves, saveShelves, getSmartShelves, saveSmartShelves, subscribe } from '../storage/local';
import { shelfMaps, nameTaken } from '../core/shelves';

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

// libraryIds: ids of the fics in your library. Shelf counts and filters
// only include those, so deleting a fic never leaves a ghost on a shelf.
export function useLocalShelves(libraryIds) {
  const [shelves, setShelves]           = useState(() => getShelves());
  const [smartShelves, setSmartShelves] = useState(() => getSmartShelves());

  // Restoring a backup, clearing data or another library tab can change
  // shelves; follow storage rather than only our own edits.
  useEffect(() => subscribe(() => {
    setShelves(getShelves());
    setSmartShelves(getSmartShelves());
  }), []);

  // Each shelf stores its work IDs as an array embedded in the shelf object.
  // We derive the two Maps that Library/WorkModal need via useMemo.
  //
  // shelvesByWork: work_id → Set<shelf_id>
  // worksByShelf:  shelf_id → Set<work_id>

  const { shelvesByWork, worksByShelf } = useMemo(
    () => shelfMaps(shelves, libraryIds),
    [shelves, libraryIds],
  );

  // ---------------------------------------------------------------------------
  // Shelf CRUD
  // ---------------------------------------------------------------------------

  function mutateShelves(updater) {
    setShelves(prev => {
      const next = updater(prev);
      saveShelves(next);
      return next;
    });
  }

  function createShelf({ name, color = '#6366f1' }) {
    if (nameTaken(shelves, name)) return { error: 'You already have a shelf with that name' };
    const shelf = { id: uid(), name, color, work_ids: [], created_at: new Date().toISOString() };
    mutateShelves(prev => [...prev, shelf]);
    return { shelf };
  }

  function updateShelf(id, updates) {
    if (updates.name !== undefined && nameTaken(shelves, updates.name, id)) {
      return { error: 'You already have a shelf with that name' };
    }
    let updated = null;
    mutateShelves(prev => prev.map(s => {
      if (s.id !== id) return s;
      updated = { ...s, ...updates };
      return updated;
    }));
    return { shelf: updated };
  }

  function deleteShelf(id) {
    mutateShelves(prev => prev.filter(s => s.id !== id));
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Smart shelf CRUD
  // ---------------------------------------------------------------------------

  function mutateSmartShelves(updater) {
    setSmartShelves(prev => {
      const next = updater(prev);
      saveSmartShelves(next);
      return next;
    });
  }

  function createSmartShelf({ name, filterJson }) {
    if (nameTaken(smartShelves, name)) return { error: 'You already have a smart shelf with that name' };
    const shelf = {
      id: uid(),
      name,
      filterJson,
      created_at: new Date().toISOString(),
    };
    mutateSmartShelves(prev => [...prev, shelf]);
    return { shelf };
  }

  function deleteSmartShelf(id) {
    mutateSmartShelves(prev => prev.filter(s => s.id !== id));
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Work ↔ shelf membership
  // ---------------------------------------------------------------------------

  function addWorkToShelf(shelfId, workId) {
    mutateShelves(prev => prev.map(s => {
      if (s.id !== shelfId) return s;
      if ((s.work_ids || []).includes(workId)) return s;
      return { ...s, work_ids: [...(s.work_ids || []), workId] };
    }));
    return { ok: true };
  }

  function removeWorkFromShelf(shelfId, workId) {
    mutateShelves(prev => prev.map(s => {
      if (s.id !== shelfId) return s;
      return { ...s, work_ids: (s.work_ids || []).filter(id => id !== workId) };
    }));
    return { ok: true };
  }

  function addWorksToShelf(shelfId, workIds) {
    let added = 0;
    mutateShelves(prev => prev.map(s => {
      if (s.id !== shelfId) return s;
      const existing = new Set(s.work_ids || []);
      const toAdd = workIds.filter(id => !existing.has(id));
      added = toAdd.length;
      return { ...s, work_ids: [...(s.work_ids || []), ...toAdd] };
    }));
    return { ok: true, added };
  }

  // ---------------------------------------------------------------------------
  // Read helpers
  // ---------------------------------------------------------------------------

  function getShelvesForWork(workId) {
    const ids = shelvesByWork.get(workId);
    if (!ids) return [];
    return shelves.filter(s => ids.has(s.id));
  }

  function getWorkIdsForShelf(shelfId) {
    return Array.from(worksByShelf.get(shelfId) || []);
  }

  return {
    shelves,
    smartShelves,
    loading: false,
    shelvesByWork,
    worksByShelf,
    getShelvesForWork,
    getWorkIdsForShelf,
    createShelf,
    updateShelf,
    deleteShelf,
    createSmartShelf,
    deleteSmartShelf,
    addWorkToShelf,
    removeWorkFromShelf,
    addWorksToShelf,
    reloadShelves: () => {
      setShelves(getShelves());
      setSmartShelves(getSmartShelves());
    },
  };
}
