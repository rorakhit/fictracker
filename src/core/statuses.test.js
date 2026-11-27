import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUSES, statusLabel } from './statuses.js';

test('every status has one name', () => {
  assert.deepEqual(STATUSES, ['to_read', 'reading', 'completed', 'on_hold', 'dnf', 'author_abandoned']);
  assert.equal(statusLabel('completed'), 'Completed');
  assert.equal(statusLabel('author_abandoned'), 'Author Abandoned');
  assert.equal(statusLabel(undefined), 'To Read', 'no status yet reads as To Read');
});
