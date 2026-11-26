import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPreset, buildAO3SearchUrl, presetSearchCaveat } from './finder.js';

const works = [
  { id: '1', fandoms: ['A'], relationships: ['X/Y'], freeform_tags: ['Fluff'], word_count: 5000, is_complete: true },
  { id: '2', fandoms: ['B'], relationships: [], freeform_tags: ['Angst'], word_count: 90000, is_complete: false },
  { id: '3', fandoms: ['A', 'B'], relationships: ['X/Y'], freeform_tags: ['Angst'], word_count: 20000, is_complete: true },
];

test('applyPreset: any-of includes, none-of excludes, ranges, completion', () => {
  const ids = p => applyPreset(works, p).map(w => w.id);
  assert.deepEqual(ids({ fandoms_include: ['A'] }), ['1', '3']);
  assert.deepEqual(ids({ fandoms_include: ['A', 'B'], tags_exclude: ['Angst'] }), ['1']);
  assert.deepEqual(ids({ word_count_min: '10000', completion: 'complete' }), ['3']);
  assert.deepEqual(ids({ completion: 'wip' }), ['2']);
  assert.deepEqual(ids({}), ['1', '2', '3']);
});

test('buildAO3SearchUrl uses the parameters AO3 accepts', () => {
  const url = new URL(buildAO3SearchUrl({
    fandoms_include: ['Star Wars', 'Original Work'],
    ships_include: ['A/B'],
    tags_include: ['Slow Burn'],
    tags_exclude: ['Major Character Death'],
    ships_exclude: ['C/D'],
    word_count_min: '10000',
    word_count_max: '',
    completion: 'complete',
  }));
  const p = Object.fromEntries(url.searchParams);
  assert.equal(url.pathname, '/works/search');
  assert.equal(p['work_search[fandom_names]'], 'Star Wars,Original Work');
  assert.equal(p['work_search[relationship_names]'], 'A/B');
  assert.equal(p['work_search[freeform_names]'], 'Slow Burn');
  assert.equal(p['work_search[excluded_tag_names]'], 'C/D,Major Character Death');
  assert.equal(p['work_search[words_from]'], '10000');
  assert.equal(p['work_search[words_to]'], undefined);
  assert.equal(p['work_search[complete]'], 'T');
  assert.ok(![...url.searchParams.keys()].some(k => k.endsWith('[]')), 'no array params');
});

test('presetSearchCaveat only when a list has several tags', () => {
  assert.equal(presetSearchCaveat({ fandoms_include: ['A'] }), '');
  assert.match(presetSearchCaveat({ tags_include: ['A', 'B'] }), /all the tags/);
});
