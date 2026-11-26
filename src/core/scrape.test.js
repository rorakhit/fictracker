import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DOMParser } from 'linkedom';
import { parseListingPage, parseSeriesPage, loggedInUser, parseAo3Date } from './scrape.js';

const load = name => new DOMParser().parseFromString(
  fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'), 'text/html');

test('history page: works, visit details, deleted works skipped', () => {
  const doc = load('readings.html');
  const { items, lastPage } = parseListingPage(doc);
  assert.equal(lastPage, 3);
  assert.deepEqual(items.map(i => i.kind), ['work', 'work', 'skipped']);

  const [a, b] = items;
  assert.equal(a.work.id, '1001');
  assert.equal(a.work.title, 'Stars Fall Upward');
  assert.deepEqual(a.work.authors, ['Sky (skywriter)']);
  assert.deepEqual(a.work.author_users, ['skywriter']);
  assert.equal(a.work.rating, 'Mature');
  assert.deepEqual(a.work.categories, ['M/M', 'Gen']);
  assert.deepEqual(a.work.fandoms, ['Star Wars']);
  assert.deepEqual(a.work.relationships, ['A/B']);
  assert.deepEqual(a.work.characters, ['A', 'B']);
  assert.deepEqual(a.work.freeform_tags, ['Slow Burn']);
  assert.equal(a.work.word_count, 45210);
  assert.equal(a.work.chapter_count, 7);
  assert.equal(a.work.chapter_total, null);
  assert.equal(a.work.is_complete, false);
  assert.equal(a.work.kudos, 1234);
  assert.equal(a.work.comments_count, 88);
  assert.deepEqual(a.work.series_memberships, [{ ao3_series_id: 501, series_name: 'The Upward Series', position_in_series: 2 }]);
  assert.equal(a.work.summary, 'They fall upward.');
  assert.equal('chapter_ids' in a.work, false, 'blurbs must not wipe saved chapter ids');
  assert.equal(a.last_visited, '2026-11-20T00:00:00.000Z');
  assert.equal(a.update_available, true);
  assert.equal(a.marked_for_later, false);
  assert.equal(a.visits, 5);

  assert.deepEqual(b.work.author_users, ['nightowl', 'dawnlark']);
  assert.equal(b.work.is_complete, true);
  assert.equal(b.marked_for_later, true);
  assert.equal(b.visits, 1);

  assert.equal(loggedInUser(doc), 'test_reader');
});

test('bookmarks page: bookmarked series are skipped, bookmark date is not the work date', () => {
  const doc = load('bookmarks.html');
  const { items, lastPage } = parseListingPage(doc);
  assert.equal(lastPage, 1);
  assert.deepEqual(items.map(i => i.kind), ['work', 'skipped']);
  assert.equal(items[0].work.date_updated, '05 May 2026');
  assert.equal(items[0].last_visited, undefined);
  assert.equal(loggedInUser(doc), null);
});

test('series page: title, completion and works', () => {
  const s = parseSeriesPage(load('series.html'));
  assert.equal(s.title, 'The Upward Series');
  assert.equal(s.complete, false);
  assert.deepEqual(s.items.map(i => i.work.id), ['1000', '1001']);
});

test('parseAo3Date', () => {
  assert.equal(parseAo3Date('03 Feb 2026'), '2026-02-03T00:00:00.000Z');
  assert.equal(parseAo3Date('nonsense'), null);
});
