import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../supabase';

// Free-tier shelf cap. Must match the DB trigger in migration 009.
// Keep these in sync: if you change one, change the other.
export const FREE_SHELF_LIMIT = 3;

// The DB trigger raises an exception with this prefix. We detect it on
// insert errors so the UI can show an upgrade CTA instead of a generic
// "something went wrong". See 009_create_bookshelves.sql.
const BOOKSHELF_LIMIT_MARKER = 'BOOKSHELF_LIMIT_REACHED';

function isLimitError(error) {
  if (!error) return false;
  return (
    error.message?.includes(BOOKSHELF_LIMIT_MARKER) ||
    error.details?.includes(BOOKSHELF_LIMIT_MARKER)
  );
}

export function useShelves(userId, subscriptionTier = 'free') {
  // Manual shelves: [{ id, user_id, name, color, created_at }]
  const [shelves, setShelves] = useState([]);
  // Smart shelves: [{ id, user_id, name, filterJson, created_at }]
  const [smartShelves, setSmartShelves] = useState([]);
  // Flat list of join rows: [{ shelf_id, work_id, added_at }]
  // Single source of truth — the two maps below are derived via useMemo
  // so we can't get them out of sync with each other.
  const [shelfWorkRows, setShelfWorkRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const isPremium = subscriptionTier === 'plus' || subscriptionTier === 'beta';
  const totalShelfCount = shelves.length + smartShelves.length;
  const shelvesRemaining = isPremium
    ? Infinity
    : Math.max(0, FREE_SHELF_LIMIT - totalShelfCount);
  const isAtShelfLimit = !isPremium && totalShelfCount >= FREE_SHELF_LIMIT;

  // Derived indices — recomputed whenever the flat row list changes.
  // shelvesByWork: work_id -> Set of shelf_ids (for work modal chips)
  // worksByShelf: shelf_id -> Set of work_ids (for shelf page, counts)
  const { shelvesByWork, worksByShelf } = useMemo(() => {
    const byWork = new Map();
    const byShelf = new Map();
    for (const row of shelfWorkRows) {
      if (!byWork.has(row.work_id)) byWork.set(row.work_id, new Set());
      byWork.get(row.work_id).add(row.shelf_id);
      if (!byShelf.has(row.shelf_id)) byShelf.set(row.shelf_id, new Set());
      byShelf.get(row.shelf_id).add(row.work_id);
    }
    return { shelvesByWork: byWork, worksByShelf: byShelf };
  }, [shelfWorkRows]);

  // ------------------------------------------------------------------
  // Load
  // ------------------------------------------------------------------
  const loadShelves = useCallback(async () => {
    if (!userId) return;
    try {
      // Fire all three reads in parallel. RLS filters shelf_works by
      // ownership automatically (via the EXISTS policy on shelves),
      // so we don't need an explicit user filter on it.
      const [shelvesRes, smartRes, joinRes] = await Promise.all([
        supabase
          .from('shelves')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: true }),
        supabase
          .from('smart_shelves')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: true }),
        supabase
          .from('shelf_works')
          .select('shelf_id, work_id, added_at'),
      ]);

      if (shelvesRes.error) throw shelvesRes.error;
      if (smartRes.error) throw smartRes.error;
      if (joinRes.error) throw joinRes.error;

      setShelves(shelvesRes.data || []);
      // Map snake_case filter_json -> camelCase filterJson at the boundary
      setSmartShelves(
        (smartRes.data || []).map(row => ({
          ...row,
          filterJson: row.filter_json,
        }))
      );
      setShelfWorkRows(joinRes.data || []);
    } catch (e) {
      console.error('useShelves load error:', e);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadShelves(); }, [loadShelves]);

  // ------------------------------------------------------------------
  // Shelf CRUD (manual)
  // ------------------------------------------------------------------

  // Returns { shelf } on success, { hitLimit: true } if free cap hit,
  // { error } for other failures. Matches the "don't throw, return a
  // result object" style the rest of the codebase uses for mutations
  // the UI needs to branch on.
  async function createShelf({ name, color = '#6366f1' }) {
    const { data, error } = await supabase
      .from('shelves')
      .insert({ user_id: userId, name, color })
      .select()
      .single();
    if (error) {
      if (isLimitError(error)) return { hitLimit: true };
      console.error('createShelf error:', error);
      return { error };
    }
    setShelves(prev => [...prev, data]);
    return { shelf: data };
  }

  async function updateShelf(id, updates) {
    const { data, error } = await supabase
      .from('shelves')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) { console.error('updateShelf error:', error); return { error }; }
    setShelves(prev => prev.map(s => (s.id === id ? data : s)));
    return { shelf: data };
  }

  async function deleteShelf(id) {
    // Cascade from shelves -> shelf_works handles the join rows DB-side.
    // We still need to clean them from local state.
    const { error } = await supabase.from('shelves').delete().eq('id', id);
    if (error) { console.error('deleteShelf error:', error); return { error }; }
    setShelves(prev => prev.filter(s => s.id !== id));
    setShelfWorkRows(prev => prev.filter(r => r.shelf_id !== id));
    return { ok: true };
  }

  // ------------------------------------------------------------------
  // Smart shelf CRUD
  // ------------------------------------------------------------------

  async function createSmartShelf({ name, filterJson }) {
    const { data, error } = await supabase
      .from('smart_shelves')
      .insert({ user_id: userId, name, filter_json: filterJson })
      .select()
      .single();
    if (error) {
      if (isLimitError(error)) return { hitLimit: true };
      console.error('createSmartShelf error:', error);
      return { error };
    }
    const camel = { ...data, filterJson: data.filter_json };
    setSmartShelves(prev => [...prev, camel]);
    return { shelf: camel };
  }

  async function updateSmartShelf(id, { name, filterJson }) {
    const patch = {};
    if (name !== undefined) patch.name = name;
    if (filterJson !== undefined) patch.filter_json = filterJson;
    const { data, error } = await supabase
      .from('smart_shelves')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) { console.error('updateSmartShelf error:', error); return { error }; }
    const camel = { ...data, filterJson: data.filter_json };
    setSmartShelves(prev => prev.map(s => (s.id === id ? camel : s)));
    return { shelf: camel };
  }

  async function deleteSmartShelf(id) {
    const { error } = await supabase.from('smart_shelves').delete().eq('id', id);
    if (error) { console.error('deleteSmartShelf error:', error); return { error }; }
    setSmartShelves(prev => prev.filter(s => s.id !== id));
    return { ok: true };
  }

  // ------------------------------------------------------------------
  // Work <-> shelf membership (optimistic)
  //
  // These are the hot-path actions (drag-to-shelf, chip toggles) so
  // they update local state synchronously and roll back on error.
  // ------------------------------------------------------------------

  async function addWorkToShelf(shelfId, workId) {
    // No-op if already there
    if (shelvesByWork.get(workId)?.has(shelfId)) return { ok: true };

    const optimisticRow = {
      shelf_id: shelfId,
      work_id: workId,
      added_at: new Date().toISOString(),
    };
    setShelfWorkRows(prev => [...prev, optimisticRow]);

    const { error } = await supabase
      .from('shelf_works')
      .insert(optimisticRow);

    if (error) {
      // Roll back
      setShelfWorkRows(prev =>
        prev.filter(r => !(r.shelf_id === shelfId && r.work_id === workId))
      );
      console.error('addWorkToShelf error:', error);
      return { error };
    }
    return { ok: true };
  }

  async function removeWorkFromShelf(shelfId, workId) {
    const prevRows = shelfWorkRows;
    setShelfWorkRows(prev =>
      prev.filter(r => !(r.shelf_id === shelfId && r.work_id === workId))
    );

    const { error } = await supabase
      .from('shelf_works')
      .delete()
      .eq('shelf_id', shelfId)
      .eq('work_id', workId);

    if (error) {
      setShelfWorkRows(prevRows); // roll back
      console.error('removeWorkFromShelf error:', error);
      return { error };
    }
    return { ok: true };
  }

  // Bulk: add a list of works to a shelf in one round trip.
  // Used by the Library bulk-select flow.
  async function addWorksToShelf(shelfId, workIds) {
    const existing = worksByShelf.get(shelfId) || new Set();
    const toAdd = workIds.filter(id => !existing.has(id));
    if (toAdd.length === 0) return { ok: true, added: 0 };

    const now = new Date().toISOString();
    const rows = toAdd.map(work_id => ({ shelf_id: shelfId, work_id, added_at: now }));

    setShelfWorkRows(prev => [...prev, ...rows]);

    const { error } = await supabase.from('shelf_works').insert(rows);
    if (error) {
      // Roll back only the rows we added
      const toRemove = new Set(toAdd);
      setShelfWorkRows(prev =>
        prev.filter(r => !(r.shelf_id === shelfId && toRemove.has(r.work_id)))
      );
      console.error('addWorksToShelf error:', error);
      return { error };
    }
    return { ok: true, added: toAdd.length };
  }

  // ------------------------------------------------------------------
  // Read helpers for components
  // ------------------------------------------------------------------

  function getShelvesForWork(workId) {
    const ids = shelvesByWork.get(workId);
    if (!ids) return [];
    return shelves.filter(s => ids.has(s.id));
  }

  function getWorkIdsForShelf(shelfId) {
    return Array.from(worksByShelf.get(shelfId) || []);
  }

  return {
    // state
    shelves,
    smartShelves,
    loading,
    // cap info
    isAtShelfLimit,
    shelvesRemaining,
    totalShelfCount,
    FREE_SHELF_LIMIT,
    // lookups
    shelvesByWork,
    worksByShelf,
    getShelvesForWork,
    getWorkIdsForShelf,
    // mutators
    createShelf,
    updateShelf,
    deleteShelf,
    createSmartShelf,
    updateSmartShelf,
    deleteSmartShelf,
    addWorkToShelf,
    removeWorkFromShelf,
    addWorksToShelf,
    // manual refetch
    reloadShelves: loadShelves,
  };
}
