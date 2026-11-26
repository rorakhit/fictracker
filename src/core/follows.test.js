import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffFollow, mergeNews, wipTargets, badgeCount, checkSettings, followUrl } from './follows.js';

const item = id => ({ kind: 'work', work: { id, title: `W${id}` } });

test('first check of a follow only records what is there', () => {
  const f = { kind: 'author', id: 'sky', name: 'sky', known_ids: null };
  const r = diffFollow(f, [item('1'), item('2'), { kind: 'skipped' }], new Set(), 'now');
  assert.deepEqual(r.follow.known_ids, ['1', '2']);
  assert.equal(r.follow.checked_at, 'now');
  assert.deepEqual(r.news, []);
});

test('later checks report only works that are new and not in the library', () => {
  const f = { kind: 'series', id: '501', name: 'Upward', known_ids: ['1'] };
  const r = diffFollow(f, [item('3'), item('2'), item('1')], new Set(['2']));
  assert.deepEqual(r.news.map(n => n.work.id), ['3']);
  assert.equal(r.news[0].key, 'series:501|3');
  assert.deepEqual(r.follow.known_ids.sort(), ['1', '2', '3']);
});

test('mergeNews dedupes and drops works since added to the library', () => {
  const old = [{ key: 'a|1', work: { id: '1' } }, { key: 'a|2', work: { id: '2' } }];
  const out = mergeNews(old, [{ key: 'b|2', work: { id: '2' } }, { key: 'b|3', work: { id: '3' } }], new Set(['1']));
  assert.deepEqual(out.map(n => n.key), ['a|2', 'b|3']);
});

test('wipTargets: unfinished fics you are reading or plan to, skipping recent checks', () => {
  const lib = {
    works: [
      { id: '1', is_complete: false, wip_checked_at: '2026-11-25T00:00:00Z' },
      { id: '2', is_complete: false },
      { id: '3', is_complete: true },
      { id: '4', is_complete: false },
    ],
    statuses: { '4': { status: 'dropped' } },
  };
  assert.deepEqual(wipTargets(lib).map(w => w.id), ['1', '2']);
  assert.deepEqual(wipTargets(lib, { checkedBefore: '2026-11-24T00:00:00Z' }).map(w => w.id), ['2']);
});

test('badgeCount and settings defaults', () => {
  const lib = { works: [{ id: '1', wip_new_chapters: 2 }, { id: '2' }], statuses: {} };
  assert.deepEqual(badgeCount(lib, [{ work: { id: '2' } }, { work: { id: '9' } }]), { wips: 1, fresh: 1, total: 2 });
  assert.deepEqual(checkSettings({}), { autoCheck: true, hours: 12 });
  assert.deepEqual(checkSettings({ autoCheck: false, autoCheckHours: 24 }), { autoCheck: false, hours: 24 });
  assert.match(followUrl('author', 'a b'), /users\/a%20b\/works\?work_search%5Bsort_column%5D=created_at$/);
});
