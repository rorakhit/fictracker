// src/core/library.js
// Pure library operations, shared by the background service worker (which
// owns all writes) and tests. No browser APIs in here.
//
// Library shape (unchanged from the v1 web app so old data migrates as-is):
//   { works: Work[], statuses: { [workId]: Status }, reading_log: LogEntry[] }
// A work's id is its AO3 work id as a string.

export const EMPTY_LIBRARY = Object.freeze({ works: [], statuses: {}, reading_log: [] });

export function normalizeLibrary(lib) {
  return {
    works: Array.isArray(lib?.works) ? lib.works : [],
    statuses: migrateStatuses(lib?.statuses && typeof lib.statuses === 'object' ? lib.statuses : {}),
    reading_log: Array.isArray(lib?.reading_log) ? lib.reading_log : [],
  };
}

// Statuses that were merged into another one. "Dropped" meant the same as
// DNF, so 2.0.1 keeps DNF only. Old libraries, backups and v1 copies are
// mapped on every read, so a retired status never comes back.
const RETIRED_STATUSES = { dropped: 'dnf' };

export function migrateStatuses(statuses) {
  let out = statuses;
  for (const [id, st] of Object.entries(statuses)) {
    const next = RETIRED_STATUSES[st?.status];
    if (!next) continue;
    if (out === statuses) out = { ...statuses };
    out[id] = { ...st, status: next };
  }
  return out;
}

function uid() {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function logEntry(workId, chaptersRead, wordCountRead, now) {
  return {
    id: uid(),
    work_id: workId,
    chapters_read: chaptersRead || 0,
    word_count_read: wordCountRead || 0,
    read_at: now,
  };
}

// Add a work, or merge fresh metadata into an existing one. Keeps the
// original added_at so re-scraping a work never resets when you added it.
export function upsertWork(lib, work) {
  const id = String(work.id ?? work.ao3_id);
  const existing = lib.works.find(w => w.id === id);
  const merged = existing
    ? { ...existing, ...work, id, added_at: existing.added_at || work.added_at }
    : { ...work, id, added_at: work.added_at || new Date().toISOString() };
  return {
    ...lib,
    works: existing ? lib.works.map(w => (w.id === id ? merged : w)) : [...lib.works, merged],
  };
}

// Update a work's reading status, logging reading activity the same way the
// v1 app did (chapter advances, completion, starting to read).
export function updateStatus(lib, workId, updates, now = new Date().toISOString()) {
  const existing = lib.statuses[workId];
  const work = lib.works.find(w => w.id === workId);
  const wordsPerCh = work?.word_count && work?.chapter_count
    ? Math.round(work.word_count / work.chapter_count) : 0;
  const log = [];

  if (updates.current_chapter !== undefined && existing) {
    const delta = (updates.current_chapter || 0) - (existing.current_chapter || 0);
    if (delta > 0) log.push(logEntry(workId, delta, delta * wordsPerCh, now));
  }

  if (updates.status === 'completed' && existing?.status !== 'completed' && work) {
    const currentCh = updates.current_chapter ?? existing?.current_chapter ?? 0;
    const totalCh = work.chapter_total || work.chapter_count || 1;
    const remaining = Math.max(0, totalCh - currentCh);
    if (remaining > 0) log.push(logEntry(workId, remaining, remaining * wordsPerCh, now));
    else if (currentCh === 0 && work.word_count) log.push(logEntry(workId, totalCh, work.word_count, now));
  }

  if (updates.status === 'reading' && existing?.status !== 'reading'
      && (existing?.current_chapter || 0) === 0 && wordsPerCh > 0) {
    log.push(logEntry(workId, 1, wordsPerCh, now));
  }

  const status = { ...(existing || { work_id: workId }), ...updates, updated_at: now };

  // Reading up to the latest chapter clears its "new chapters" flag.
  let works = lib.works;
  if (work?.wip_new_chapters && status.current_chapter >= (work.chapter_count || Infinity)) {
    works = works.map(w => (w.id === workId ? { ...w, wip_new_chapters: 0 } : w));
  }
  return {
    ...lib,
    works,
    statuses: { ...lib.statuses, [workId]: status },
    reading_log: log.length ? [...lib.reading_log, ...log] : lib.reading_log,
  };
}

export function deleteWork(lib, workId) {
  const { [workId]: _removed, ...statuses } = lib.statuses;
  return {
    works: lib.works.filter(w => w.id !== workId),
    statuses,
    reading_log: lib.reading_log.filter(e => e.work_id !== workId),
  };
}

// Merge another library (an old fictracker.app library or a backup file)
// into this one. Works are merged by id; for statuses the most recently
// updated one wins; reading log entries are deduplicated by id.
export function mergeLibrary(lib, incoming) {
  const other = normalizeLibrary(incoming);
  let next = lib;
  for (const w of other.works) next = upsertWork(next, w);

  const statuses = { ...next.statuses };
  for (const [id, st] of Object.entries(other.statuses)) {
    const mine = statuses[id];
    if (!mine || (st.updated_at || '') > (mine.updated_at || '')) statuses[id] = st;
  }

  const seen = new Set(next.reading_log.map(e => e.id));
  const log = [...next.reading_log, ...other.reading_log.filter(e => !seen.has(e.id))];
  return { works: next.works, statuses, reading_log: log };
}

// Add works found on an AO3 listing (your history or bookmarks). New works
// get the given status; works already in your library only get fresh
// metadata, so your status and progress are never touched. No reading-log
// entries are written: you didn't read them today.
//   items: [{ work, status, added_at? }]
export function importListing(lib, items, now = new Date().toISOString()) {
  const known = new Set(lib.works.map(w => w.id));
  let next = lib;
  const statuses = { ...lib.statuses };
  let added = 0;
  for (const { work, status, added_at } of items) {
    if (known.has(work.id)) {
      const { added_at: _a, source: _s, ...meta } = work;
      next = upsertWork(next, meta);
      continue;
    }
    known.add(work.id);
    next = upsertWork(next, { ...work, added_at: added_at || now });
    if (!statuses[work.id]) {
      statuses[work.id] = {
        work_id: work.id,
        status: status || 'to_read',
        current_chapter: status === 'completed' ? (work.chapter_count || 0) : 0,
        updated_at: now,
      };
    }
    added++;
  }
  return { lib: { ...next, statuses }, added };
}

// Record a fresh copy of a work fetched by a WIP check. New chapters since
// the last copy add to its "new chapters" count until you read them.
export function wipChecked(lib, fresh, now = new Date().toISOString()) {
  const existing = lib.works.find(w => w.id === String(fresh.id));
  if (!existing) return lib;
  const gained = Math.max(0, (fresh.chapter_count || 0) - (existing.chapter_count || 0));
  const { added_at: _a, source: _s, ...meta } = fresh;
  return upsertWork(lib, {
    ...meta,
    wip_new_chapters: (existing.wip_new_chapters || 0) + gained,
    wip_checked_at: now,
  });
}

// Work out what the on-page panel should change when you open a chapter.
// Returns null when nothing should change.
export function progressFromVisit(work, status, detectedChapter, now = new Date().toISOString()) {
  if (!detectedChapter) return null;
  const st = status?.status || 'to_read';
  if (st !== 'reading' && st !== 'to_read') return null;
  // Only ever move forward. Re-reading an earlier chapter, or opening the
  // work's front page (AO3 sends you to chapter 1), keeps your place.
  if (detectedChapter <= (status?.current_chapter || 0)) return null;

  const updates = { current_chapter: detectedChapter };
  if (st === 'to_read') {
    updates.status = 'reading';
    if (!status?.started_at) updates.started_at = now;
  }
  const total = work.chapter_total;
  if (work.is_complete && total && detectedChapter >= total) {
    updates.status = 'completed';
    updates.completed_at = now;
  }
  return updates;
}

// Apply one operation message. This is the single entry point the service
// worker uses, so every write goes through the same code path.
export function applyOp(lib, op) {
  switch (op.op) {
    case 'upsertWork':   return upsertWork(lib, op.work);
    case 'upsertWorks':  return op.works.reduce(upsertWork, lib);
    case 'updateStatus': return updateStatus(lib, op.workId, op.updates);
    case 'updateMany':   return op.items.reduce((l, it) => updateStatus(l, it.workId, it.updates), lib);
    case 'deleteWork':   return deleteWork(lib, op.workId);
    case 'deleteMany':   return op.workIds.reduce(deleteWork, lib);
    case 'merge':        return mergeLibrary(lib, op.library);
    case 'importListing': return importListing(lib, op.items).lib;
    case 'wipChecked':   return op.work ? wipChecked(lib, op.work)
      : upsertWork(lib, { id: op.workId, wip_checked_at: new Date().toISOString() });
    case 'replace':      return normalizeLibrary(op.library);
    default: throw new Error(`Unknown library op: ${op.op}`);
  }
}
