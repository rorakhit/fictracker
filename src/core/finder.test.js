import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPreset, buildAO3SearchUrl, ao3SearchQuery, tagMatches } from './finder.js';

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

test('buildAO3SearchUrl: any-of tag phrases in the search box, AO3 filters for the rest', () => {
  const url = new URL(buildAO3SearchUrl({
    fandoms_include: ['Game of Thrones', 'A Song of Ice and Fire'],
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
  assert.equal(p['work_search[query]'],
    '(tag:"Game of Thrones" OR tag:"A Song of Ice and Fire") tag:"A/B" tag:"Slow Burn" -tag:"C/D" -tag:"Major Character Death"');
  assert.equal(p['work_search[fandom_names]'], undefined, 'exact-name boxes not used');
  assert.equal(p['work_search[words_from]'], '10000');
  assert.equal(p['work_search[words_to]'], undefined);
  assert.equal(p['work_search[complete]'], 'T');
  assert.equal(p['work_search[sort_column]'], 'revised_at');
  assert.ok(![...url.searchParams.keys()].some(k => k.endsWith('[]')), 'no array params');
});

test('ao3SearchQuery skips blanks and keeps quotes from breaking the phrase', () => {
  assert.equal(ao3SearchQuery({}), '');
  assert.equal(ao3SearchQuery({ fandoms_include: ['  ', 'Say "Hi"'] }), 'tag:"Say Hi"');
  assert.equal(new URL(buildAO3SearchUrl({})).searchParams.has('work_search[query]'), false);
});

test('tags match AO3 tag names loosely: case and whole words', () => {
  assert.equal(tagMatches('Game of Thrones', 'Game of Thrones (TV)'), true);
  assert.equal(tagMatches('A Song of Ice and Fire', 'A Song of Ice and Fire - George R. R. Martin'), true);
  assert.equal(tagMatches('A Song of Ice and Fire', 'A Song of Ice and Fire & Related Fandoms'), true);
  assert.equal(tagMatches('slow burn', 'Slow Burn'), true);
  assert.equal(tagMatches('hurt/comfort', 'Hurt/Comfort'), true);
  assert.equal(tagMatches('character death', 'Major Character Death'), true);
  assert.equal(tagMatches('Fire', 'Firefly'), false);
  assert.equal(tagMatches('Thrones', 'Throne of Glass'), false);
  assert.equal(tagMatches('  ', 'Anything'), false);
});

test('applyPreset finds GoT/ASOIAF fics under their full AO3 tags', () => {
  const lib = [
    { id: 'a', fandoms: ['Game of Thrones (TV)'] },
    { id: 'b', fandoms: ['A Song of Ice and Fire - George R. R. Martin'] },
    { id: 'c', fandoms: ['A Song of Ice and Fire & Related Fandoms', 'Game of Thrones (TV)'] },
    { id: 'd', fandoms: ['Throne of Glass Series - Sarah J. Maas'] },
  ];
  const ids = applyPreset(lib, { fandoms_include: ['Game of Thrones', 'A Song of Ice and Fire'] }).map(w => w.id);
  assert.deepEqual(ids, ['a', 'b', 'c']);
  assert.deepEqual(applyPreset(lib, { fandoms_exclude: ['game of thrones'] }).map(w => w.id), ['b', 'd']);
});

test('More like this: fandom, first ship, any of 3 tags, most kudos first', async () => {
  const { moreLikeThisUrl } = await import('./finder.js');
  const work = {
    id: '1', title: 'Fic', fandoms: ['Star Wars'], relationships: ['A/B', 'C/D'],
    freeform_tags: ['Fluff', 'Angst', 'Slow Burn', 'Coffee Shop AU'],
  };
  const q = Object.fromEntries(new URL(moreLikeThisUrl(work)).searchParams);
  assert.equal(q['work_search[query]'], 'tag:"Star Wars" tag:"A/B" (tag:"Fluff" OR tag:"Angst" OR tag:"Slow Burn")');
  assert.equal(q['work_search[sort_column]'], 'kudos_count');
});

test('More like this prefers tags from fics you rated highly', async () => {
  const { pickTags } = await import('./finder.js');
  const work = { id: '1', freeform_tags: ['Fluff', 'Angst', 'Slow Burn', 'Coffee Shop AU', 'Pining'] };
  const library = {
    works: [
      work,
      { id: '2', freeform_tags: ['Pining', 'Coffee Shop AU'] },
      { id: '3', freeform_tags: ['Pining'] },
      { id: '4', freeform_tags: ['Fluff', 'Angst'] }, // rated low: doesn't count
    ],
    statuses: { 2: { rating_personal: 5 }, 3: { rating_personal: 4 }, 4: { rating_personal: 2 } },
  };
  assert.deepEqual(pickTags(work, library), ['Pining', 'Coffee Shop AU', 'Fluff']);
});

test('More like this works with no ship or tags', async () => {
  const { moreLikeThisUrl } = await import('./finder.js');
  const q = Object.fromEntries(new URL(moreLikeThisUrl({ id: '1', fandoms: ['Original Work'] })).searchParams);
  assert.equal(q['work_search[query]'], 'tag:"Original Work"');
});
