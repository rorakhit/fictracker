import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  followList, toSyncValue, settingsFromSync, followChanges, mergeById, mergeShelves,
} from './sync.js';

const follows = {
  'author:b': { kind: 'author', id: 'b', name: 'B', known_ids: ['1', '2'], checked_at: 'x' },
  'series:9': { kind: 'series', id: '9', name: 'Saga' },
};

test('follows sync as who you follow, not what they posted', () => {
  assert.deepEqual(followList(follows), [
    { kind: 'author', id: 'b', name: 'B' },
    { kind: 'series', id: '9', name: 'Saga' },
  ]);
  assert.deepEqual(toSyncValue('ft_follows', follows), followList(follows));
});

test('the sync switch itself stays per browser', () => {
  assert.deepEqual(toSyncValue('ft_settings', { readingWpm: 300, syncEnabled: true }), { readingWpm: 300 });
  assert.deepEqual(settingsFromSync({ syncEnabled: true, readingWpm: 250 }, { readingWpm: 300 }), { readingWpm: 300, syncEnabled: true });
});

test('following matches the synced list: adds and removes', () => {
  const list = [{ kind: 'author', id: 'b', name: 'B' }, { kind: 'author', id: 'c', name: 'C' }];
  assert.deepEqual(followChanges(follows, list), { add: [{ kind: 'author', id: 'c', name: 'C' }], remove: ['series:9'] });
  assert.deepEqual(followChanges(follows, list, { union: true }).remove, [], 'turning sync on removes nothing');
});

test('presets merge by id, keeping your own versions', () => {
  const mine = [{ id: 'a', name: 'Mine' }];
  const theirs = [{ id: 'a', name: 'Theirs' }, { id: 'b', name: 'New' }];
  assert.deepEqual(mergeById(mine, theirs), [{ id: 'a', name: 'Mine' }, { id: 'b', name: 'New' }]);
  assert.deepEqual(mergeById(undefined, theirs).length, 2);
});

test('shelves with the same name combine their fics', () => {
  const mine = [{ id: 's1', name: 'Comfort', work_ids: ['1', '2'] }];
  const theirs = [{ id: 'other', name: 'comfort', work_ids: ['2', '3'] }, { id: 's2', name: 'Angst', work_ids: ['4'] }];
  const out = mergeShelves(mine, theirs);
  assert.deepEqual(out.map(s => [s.name, s.work_ids]), [['Comfort', ['1', '2', '3']], ['Angst', ['4']]]);
  assert.deepEqual(mine[0].work_ids, ['1', '2'], 'input not changed');
});
