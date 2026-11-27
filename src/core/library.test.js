import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOp, mergeLibrary, progressFromVisit, normalizeLibrary } from './library.js';

const work = (id, extra = {}) => ({ id, ao3_id: Number(id), title: `Fic ${id}`, word_count: 10000, chapter_count: 10, chapter_total: 10, is_complete: true, ...extra });
const empty = () => normalizeLibrary(null);

test('upsertWork adds, then merges without resetting added_at', () => {
  let lib = applyOp(empty(), { op: 'upsertWork', work: work('1', { added_at: '2026-01-01' }) });
  lib = applyOp(lib, { op: 'upsertWork', work: { id: '1', kudos: 50, added_at: '2026-09-09' } });
  assert.equal(lib.works.length, 1);
  assert.equal(lib.works[0].kudos, 50);
  assert.equal(lib.works[0].title, 'Fic 1');
  assert.equal(lib.works[0].added_at, '2026-01-01');
});

test('updateStatus logs chapters read', () => {
  let lib = applyOp(empty(), { op: 'upsertWork', work: work('1') });
  lib = applyOp(lib, { op: 'updateStatus', workId: '1', updates: { status: 'reading', current_chapter: 2 } });
  lib = applyOp(lib, { op: 'updateStatus', workId: '1', updates: { current_chapter: 5 } });
  assert.equal(lib.statuses['1'].current_chapter, 5);
  const last = lib.reading_log.at(-1);
  assert.equal(last.chapters_read, 3);
  assert.equal(last.word_count_read, 3000);
});

test('deleteWork removes status and log entries', () => {
  let lib = applyOp(empty(), { op: 'upsertWork', work: work('1') });
  lib = applyOp(lib, { op: 'updateStatus', workId: '1', updates: { status: 'completed' } });
  lib = applyOp(lib, { op: 'deleteWork', workId: '1' });
  assert.deepEqual(lib, { works: [], statuses: {}, reading_log: [] });
});

test('mergeLibrary keeps the newer status and dedupes the log', () => {
  const mine = {
    works: [work('1')],
    statuses: { '1': { status: 'reading', current_chapter: 3, updated_at: '2026-05-01' } },
    reading_log: [{ id: 'a', work_id: '1' }],
  };
  const old = {
    works: [work('1'), work('2')],
    statuses: {
      '1': { status: 'to_read', updated_at: '2026-01-01' },
      '2': { status: 'completed', updated_at: '2026-02-01' },
    },
    reading_log: [{ id: 'a', work_id: '1' }, { id: 'b', work_id: '2' }],
  };
  const lib = mergeLibrary(mine, old);
  assert.equal(lib.works.length, 2);
  assert.equal(lib.statuses['1'].status, 'reading');
  assert.equal(lib.statuses['2'].status, 'completed');
  assert.deepEqual(lib.reading_log.map(e => e.id), ['a', 'b']);
});

test('progressFromVisit: opening a chapter starts and advances a fic', () => {
  const w = work('1');
  const u = progressFromVisit(w, { status: 'to_read' }, 3, 'now');
  assert.deepEqual(u, { current_chapter: 3, status: 'reading', started_at: 'now' });
  assert.equal(progressFromVisit(w, { status: 'reading', current_chapter: 3 }, 3), null);
  assert.equal(progressFromVisit(w, { status: 'reading', current_chapter: 5 }, 1), null, 'never rewinds');
  assert.equal(progressFromVisit(w, { status: 'completed' }, 2), null);
  assert.equal(progressFromVisit(w, { status: 'reading' }, null), null);
});

test('progressFromVisit: reaching the last chapter completes a finished fic only', () => {
  const finished = work('1');
  assert.equal(progressFromVisit(finished, { status: 'reading', current_chapter: 9 }, 10).status, 'completed');

  // A WIP at 10/? or 10/20: catching up to the latest chapter is not finishing it.
  const wip = work('2', { chapter_total: null, is_complete: false });
  assert.equal(progressFromVisit(wip, { status: 'reading', current_chapter: 9 }, 10).status, undefined);
});

test('unknown op throws', () => {
  assert.throws(() => applyOp(empty(), { op: 'nope' }), /Unknown library op/);
});

test('importListing adds new works with a status and leaves existing ones alone', () => {
  let lib = applyOp(empty(), { op: 'upsertWork', work: work('1', { added_at: '2026-01-01' }) });
  lib = applyOp(lib, { op: 'updateStatus', workId: '1', updates: { status: 'reading', current_chapter: 4 } });
  const logBefore = lib.reading_log.length;
  lib = applyOp(lib, { op: 'importListing', items: [
    { work: work('1', { kudos: 99, added_at: '2030-01-01' }), status: 'completed' },
    { work: work('2'), status: 'completed', added_at: '2025-05-05' },
    { work: work('3'), status: 'to_read' },
  ] });
  assert.equal(lib.works.length, 3);
  assert.equal(lib.works[0].kudos, 99);
  assert.equal(lib.works[0].added_at, '2026-01-01');
  assert.equal(lib.statuses['1'].status, 'reading');
  assert.equal(lib.statuses['1'].current_chapter, 4);
  assert.equal(lib.statuses['2'].status, 'completed');
  assert.equal(lib.statuses['2'].current_chapter, 10);
  assert.equal(lib.works[1].added_at, '2025-05-05');
  assert.equal(lib.statuses['3'].status, 'to_read');
  assert.equal(lib.reading_log.length, logBefore, 'imports are not reading activity');
});

test('catching up on a WIP clears its new-chapters flag', () => {
  let lib = applyOp(empty(), { op: 'upsertWork', work: work('1', { chapter_count: 8, chapter_total: null, is_complete: false, wip_new_chapters: 2 }) });
  lib = applyOp(lib, { op: 'updateStatus', workId: '1', updates: { status: 'reading', current_chapter: 7 } });
  assert.equal(lib.works[0].wip_new_chapters, 2);
  lib = applyOp(lib, { op: 'updateStatus', workId: '1', updates: { current_chapter: 8 } });
  assert.equal(lib.works[0].wip_new_chapters, 0);
});

test('wipChecked counts new chapters and keeps your added date', () => {
  let lib = applyOp(empty(), { op: 'upsertWork', work: work('1', { chapter_count: 5, chapter_total: null, is_complete: false, added_at: 'then' }) });
  lib = applyOp(lib, { op: 'wipChecked', work: work('1', { chapter_count: 7, chapter_total: null, is_complete: false, added_at: 'now', source: 'url' }) });
  assert.equal(lib.works[0].wip_new_chapters, 2);
  assert.equal(lib.works[0].added_at, 'then');
  assert.ok(lib.works[0].wip_checked_at);
  lib = applyOp(lib, { op: 'wipChecked', work: work('1', { chapter_count: 8, chapter_total: 8, is_complete: true }) });
  assert.equal(lib.works[0].wip_new_chapters, 3);
  assert.equal(lib.works[0].is_complete, true);
});

test('Dropped is read as DNF, and the rest of the status is kept', () => {
  const statuses = { '1': { status: 'dropped', rating_personal: 2, notes: 'meh' }, '2': { status: 'dnf' } };
  const lib = normalizeLibrary({ works: [work('1'), work('2')], statuses });
  assert.deepEqual(lib.statuses['1'], { status: 'dnf', rating_personal: 2, notes: 'meh' });
  assert.equal(lib.statuses['2'].status, 'dnf');
  assert.equal(statuses['1'].status, 'dropped', 'input is not changed');
  // Nothing to migrate: the same object comes back, so callers can tell.
  const clean = { '2': { status: 'dnf' } };
  assert.equal(normalizeLibrary({ statuses: clean }).statuses, clean);
});

test('restoring a backup or v1 library with Dropped brings it in as DNF', () => {
  const backup = { works: [work('1')], statuses: { '1': { status: 'dropped', updated_at: '2026-01-01' } } };
  const merged = applyOp(empty(), { op: 'merge', library: backup });
  assert.equal(merged.statuses['1'].status, 'dnf');
  const replaced = applyOp(empty(), { op: 'replace', library: backup });
  assert.equal(replaced.statuses['1'].status, 'dnf');
});
