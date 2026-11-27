// The library page on a library shaped like an old web-app one: shelves,
// smart shelves, analytics, stats, Fic Finder, and the DNF filter.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, sleep } from './helpers.js';

const day = n => new Date(Date.now() - n * 86400e3).toISOString();
const work = (id, extra) => ({ id, ao3_id: Number(id), title: `Fic ${id}`, authors: ['someone'], fandoms: ['Star Wars'], relationships: [], freeform_tags: [], word_count: 10000, chapter_count: 5, chapter_total: 5, is_complete: true, ...extra });
const seed = {
  ft_library: {
    works: [
      work('1', { title: 'Oldest Added', added_at: day(30), relationships: ['A/B'], freeform_tags: ['Fluff'] }),
      work('2', { title: 'Newest Added', added_at: day(1), fandoms: ['Original Work'], word_count: 90000, is_complete: false, chapter_total: null }),
      work('3', { title: 'Imported Completed', added_at: day(10), source: 'ao3-history', word_count: 40000 }),
      work('4', { title: 'Put Down', added_at: day(20) }),
    ],
    statuses: {
      1: { work_id: '1', status: 'reading', current_chapter: 2, started_at: day(3), updated_at: day(1) },
      2: { work_id: '2', status: 'reading', current_chapter: 1, updated_at: day(1) },
      3: { work_id: '3', status: 'completed', current_chapter: 5, updated_at: day(10) },
      // Saved before 2.0.1, when Dropped was its own status.
      4: { work_id: '4', status: 'dropped', current_chapter: 1, updated_at: day(20) },
    },
    reading_log: [
      { id: 'l1', work_id: '1', chapters_read: 1, word_count_read: 2000, read_at: day(1) },
      { id: 'l2', work_id: '1', chapters_read: 1, word_count_read: 2000, read_at: new Date().toISOString() },
    ],
  },
  ft_shelves: [{ id: 's1', name: 'Comfort Reads', color: '#14b8a6', work_ids: ['1', 'deleted-999'], created_at: day(40) }],
  // Old web-app smart shelf: filter_json only, as a string.
  ft_smart_shelves: [{ id: 'm1', name: 'Still reading', filter_json: '{"statusFilter":"reading","search":"","sortBy":"recent"}' }],
  ft_finder_presets: [{ id: 'p1', name: 'Long Star Wars', fandoms_include: ['Star Wars', 'Original Work'], fandoms_exclude: [], ships_include: [], ships_exclude: [], tags_include: [], tags_exclude: ['Major Character Death'], word_count_min: '5000', word_count_max: '', completion: 'any' }],
  ft_legacy_imported: 'x',
};

let b, app;
before(async () => {
  b = await launch();
  await b.setStore(seed);
  app = await b.ctx.newPage();
  app.on('dialog', d => d.accept());
  await app.goto(b.appUrl);
  await app.waitForSelector('.shelf-chip');
});
after(async () => { await b?.ctx.close(); });

test('a fic saved as Dropped shows under DNF', async () => {
  const chips = await app.locator('.filters .pill').allInnerTexts();
  assert.ok(chips.some(c => /^DNF/.test(c)), chips.join(' | '));
  assert.ok(!chips.some(c => /Dropped/.test(c)), chips.join(' | '));
  await app.click('.filters .pill:has-text("DNF")');
  await sleep(300);
  assert.deepEqual(await app.locator('.work-card .work-title').allInnerTexts(), ['Put Down']);
  await app.click('.filters .pill:has-text("All")');
});

test('shelf counts leave out deleted fics', async () => {
  assert.equal(await app.locator('.shelf-chip:has-text("Comfort Reads") .shelf-chip-count').innerText(), '1');
});

test('an old-format smart shelf applies its filter', async () => {
  await app.click('.shelf-chip-smart:has-text("Still reading")');
  await sleep(300);
  const titles = await app.locator('.work-card .work-title').allInnerTexts();
  assert.deepEqual(titles, ['Newest Added', 'Oldest Added']);
  await app.click('.shelf-chip-all');
});

test('a duplicate shelf name is refused', async () => {
  await app.click('.shelf-chip-add');
  await app.fill('.shelf-chip-creating .shelf-chip-input', 'comfort reads');
  await app.click('.shelf-chip-creating button:has-text("Add")');
  assert.match(await app.locator('.shelf-strip-error').innerText(), /already have a shelf/);
  await app.click('.shelf-chip-creating button:has-text("Cancel")');
});

test('shelves changed in storage (a restored backup) appear without reloading', async () => {
  await b.setStore({ ft_shelves: [{ id: 's9', name: 'From Backup', color: '#e04666', work_ids: ['2', '3'] }] });
  await app.waitForSelector('.shelf-chip:has-text("From Backup")', { timeout: 3000 });
});

test('analytics and stats show no NaN', async () => {
  await app.click('.tab:has-text("Analytics")');
  await sleep(500);
  assert.doesNotMatch(await app.locator('.app').innerText(), /NaN/);
  await app.click('.tab:has-text("Stats")');
  await sleep(300);
  assert.doesNotMatch(await app.locator('.app').innerText(), /NaN|undefined/);
});

test('Fic Finder builds an any-of AO3 search and searches the library', async () => {
  await app.click('.tab:has-text("Fic Finder")');
  await app.waitForSelector('text=Long Star Wars');
  const href = await app.locator('a:has-text("Find on AO3")').getAttribute('href');
  const q = Object.fromEntries(new URL(href).searchParams);
  assert.equal(q['work_search[query]'], '(tag:"Star Wars" OR tag:"Original Work") -tag:"Major Character Death"');
  assert.equal(q['work_search[words_from]'], '5000');
  await app.click('button:has-text("Search my library")');
  assert.match(await app.locator('text=/matched in your library/').innerText(), /4 fics matched/);
});

test('no page errors', () => {
  assert.deepEqual(b.errors, []);
});
