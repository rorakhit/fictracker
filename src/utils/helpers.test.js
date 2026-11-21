import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wordCountLabel, readingTime, ratingClass } from './helpers.js';

test('wordCountLabel', () => {
  assert.equal(wordCountLabel(0), '?');
  assert.equal(wordCountLabel(null), '?');
  assert.equal(wordCountLabel(undefined), '?');
  assert.equal(wordCountLabel(999), '999');
  assert.equal(wordCountLabel(1500), '1.5k');
  assert.equal(wordCountLabel(12345), '12k');
  assert.equal(wordCountLabel(2500000), '2.5M');
  // Bug fix: values that would round to 1000k should show as 1.0M
  assert.equal(wordCountLabel(999950), '1.0M');
});

test('readingTime', () => {
  assert.equal(readingTime(null), null);
  assert.equal(readingTime(0), null);
  assert.equal(readingTime(100), '< 1 min');
  assert.equal(readingTime(11250), '~45 min');
  assert.equal(readingTime(37500), '~2h 30m');
});

test('ratingClass', () => {
  assert.equal(ratingClass('Explicit'), 'rating-e');
  assert.equal(ratingClass('Teen And Up Audiences'), 'rating-t');
  assert.equal(ratingClass(''), '');
});
