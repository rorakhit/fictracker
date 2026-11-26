// Runs in a US time zone so "late evening" lands on a different UTC day.
process.env.TZ = 'America/Los_Angeles';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAnalytics, dayKey } from './analytics.js';

const log = (work_id, read_at, words = 1000) => ({ id: `${work_id}-${read_at}`, work_id, read_at, chapters_read: 1, word_count_read: words });

test('streaks use your own days, not UTC days', () => {
  // 10am Nov 24 and 11pm Nov 25 Pacific are consecutive days locally,
  // but Nov 24 and Nov 26 in UTC.
  const now = new Date('2026-11-25T23:30:00-08:00');
  const a = computeAnalytics(
    [{ id: '1', fandoms: ['F'], word_count: 5000, chapter_count: 5 }],
    { '1': { status: 'reading' } },
    [log('1', '2026-11-24T10:00:00-08:00'), log('1', '2026-11-25T23:00:00-08:00')],
    now,
  );
  assert.equal(dayKey(now), '2026-11-25');
  assert.equal(a.currentStreak, 2);
  assert.equal(a.longestStreak, 2);
  assert.equal(a.weeklyActivity.length, 1);
  assert.equal(a.weeklyActivity[0].week, '2026-11-23'); // the Monday, locally
});

test('fics imported as Completed count toward words read', () => {
  const a = computeAnalytics(
    [{ id: '1', fandoms: ['F'], word_count: 40000, chapter_count: 4, added_at: '2026-10-01T00:00:00Z' }],
    { '1': { status: 'completed', current_chapter: 4 } },
    [],
  );
  assert.equal(a.totalWordsRead, 40000);
  assert.equal(a.totalCompleted, 1);
  assert.deepEqual(a.weeklyActivity, [], 'imports stay out of the activity timeline');
});

test('average rating is N/A, not NaN, when nothing is rated', () => {
  const a = computeAnalytics([{ id: '1', word_count: 1 }], { '1': { status: 'completed', completed_at: '2026-01-01' } }, []);
  assert.equal(a.avgRating, 'N/A');
  const b = computeAnalytics(
    [{ id: '1' }, { id: '2' }],
    { '1': { status: 'completed', rating_personal: 4 }, '2': { status: 'completed' } },
    [],
  );
  assert.equal(b.avgRating, '4.0');
});
