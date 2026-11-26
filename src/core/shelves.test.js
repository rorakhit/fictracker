import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shelfMaps, nameTaken, smartShelfFilter } from './shelves.js';

test('shelfMaps leaves out fics no longer in the library', () => {
  const shelves = [{ id: 's1', work_ids: ['1', '2', 'gone'] }, { id: 's2', work_ids: ['2'] }];
  const { shelvesByWork, worksByShelf } = shelfMaps(shelves, new Set(['1', '2']));
  assert.deepEqual([...worksByShelf.get('s1')], ['1', '2']);
  assert.deepEqual([...shelvesByWork.get('2')], ['s1', 's2']);
  assert.equal(shelvesByWork.has('gone'), false);
});

test('nameTaken ignores case, spaces and the shelf being renamed', () => {
  const list = [{ id: 'a', name: 'Comfort Reads' }];
  assert.equal(nameTaken(list, ' comfort reads '), true);
  assert.equal(nameTaken(list, 'Comfort Reads', 'a'), false);
  assert.equal(nameTaken(list, 'Angst'), false);
});

test('smartShelfFilter reads new, old and string-encoded filters', () => {
  assert.deepEqual(smartShelfFilter({ filterJson: { statusFilter: 'reading' } }), { statusFilter: 'reading', search: '', sortBy: 'shuffle' });
  assert.deepEqual(smartShelfFilter({ filter_json: { search: 'dragons', sortBy: 'words' } }), { statusFilter: 'all', search: 'dragons', sortBy: 'words' });
  assert.deepEqual(smartShelfFilter({ filter_json: '{"statusFilter":"completed"}' }).statusFilter, 'completed');
  assert.deepEqual(smartShelfFilter({ filter_json: 'not json' }), { statusFilter: 'all', search: '', sortBy: 'shuffle' });
});
