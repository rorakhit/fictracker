// Moving FicTracker between browsers: backups that merge, and the opt-in
// browser sync. Chromium's sync storage works without a signed-in account
// (it just stays on this machine), so a "remote" change is simulated by
// writing to it directly, as the browser does when another computer syncs.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, sleep } from './helpers.js';

let b, app;
const sync = keys => b.sw.evaluate(k => chrome.storage.sync.get(k), keys);
before(async () => {
  b = await launch(); // AO3 answers every request with an empty page
  await b.setStore({
    ft_library: {
      works: [{ id: '1', ao3_id: 1, title: 'Mine', fandoms: ['X'], chapter_count: 5, chapter_total: 5, is_complete: true }],
      statuses: { 1: { work_id: '1', status: 'reading', current_chapter: 2, updated_at: '2026-11-01' } },
      reading_log: [],
    },
    ft_shelves: [{ id: 's1', name: 'Comfort', color: '#e0a872', work_ids: ['1'] }],
    ft_finder_presets: [{ id: 'p1', name: 'My preset', fandoms_include: ['X'] }],
    ft_settings: { readingWpm: 250 },
    ft_legacy_imported: 'x',
  });
  app = await b.ctx.newPage();
  await app.goto(b.appUrl);
  await app.waitForSelector('.tabs');
});
after(async () => { await b?.ctx.close(); });

test('restoring a backup merges it in, nothing here is lost', async () => {
  const backup = {
    version: 1,
    library: {
      works: [
        { id: '1', ao3_id: 1, title: 'Mine', fandoms: ['X'], chapter_count: 5, chapter_total: 5, is_complete: true },
        { id: '2', ao3_id: 2, title: 'From the laptop', fandoms: ['Y'], chapter_count: 3, chapter_total: 3, is_complete: true },
      ],
      statuses: {
        1: { work_id: '1', status: 'reading', current_chapter: 4, updated_at: '2026-11-20' }, // newer
        2: { work_id: '2', status: 'to_read', current_chapter: 0, updated_at: '2026-11-02' },
      },
      reading_log: [],
    },
    shelves: [{ id: 'other-id', name: 'comfort', work_ids: ['2'] }],
    finder_presets: [{ id: 'p1', name: 'Changed elsewhere' }, { id: 'p2', name: 'Laptop preset' }],
    settings: { readingWpm: 400, syncEnabled: true },
  };
  await app.click('.tab:has-text("Import")');
  await app.locator('input[type=file][accept=".json"]').setInputFiles({
    name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)),
  });
  await app.waitForSelector('text=Backup restored.', { timeout: 5000 });
  await sleep(800);

  const s = await b.store(['ft_library', 'ft_shelves', 'ft_finder_presets', 'ft_settings']);
  assert.deepEqual(s.ft_library.works.map(w => w.id).sort(), ['1', '2']);
  assert.equal(s.ft_library.statuses['1'].current_chapter, 4, 'newer status wins');
  assert.deepEqual(s.ft_shelves.map(x => [x.name, x.work_ids]), [['Comfort', ['1', '2']]]);
  assert.deepEqual(s.ft_finder_presets.map(p => p.name), ['My preset', 'Laptop preset']);
  assert.equal(s.ft_settings.readingWpm, 400);
  assert.ok(!s.ft_settings.syncEnabled, "a backup doesn't switch sync on");
});

test('turning sync on shares settings, presets and follows', async () => {
  await b.setStore({ ft_follows: { 'author:lanternmoth': { kind: 'author', id: 'lanternmoth', name: 'lanternmoth', known_ids: ['9'], checked_at: 'x' } } });
  await app.click('.tab:has-text("Settings")');
  await app.click('text=Sync settings, Fic Finder presets');
  await app.waitForSelector('text=/Synced /', { timeout: 5000 });
  const r = await sync(null);
  assert.equal(r.fts_settings.readingWpm, 400);
  assert.equal(r.fts_settings.syncEnabled, undefined, 'the switch itself stays per browser');
  assert.deepEqual(r.fts_presets.map(p => p.name), ['My preset', 'Laptop preset']);
  assert.deepEqual(r.fts_follows, [{ kind: 'author', id: 'lanternmoth', name: 'lanternmoth' }]);
});

test('a change made here is synced out', async () => {
  await app.click('button:has-text("Slow")');
  await sleep(1800); // pushes are batched for a second
  const wpm = (await b.store('ft_settings')).ft_settings.readingWpm;
  assert.notEqual(wpm, 400);
  assert.equal((await sync('fts_settings')).fts_settings.readingWpm, wpm);
});

test('changes from another computer arrive here', async () => {
  await b.sw.evaluate(() => chrome.storage.sync.set({
    fts_presets: [{ id: 'p9', name: 'From the desktop' }],
    fts_follows: [
      { kind: 'author', id: 'lanternmoth', name: 'lanternmoth' },
      { kind: 'series', id: '77', name: 'A Series' },
    ],
  }));
  await sleep(1500);
  const s = await b.store(['ft_finder_presets', 'ft_follows']);
  assert.deepEqual(s.ft_finder_presets.map(p => p.name), ['From the desktop']);
  assert.deepEqual(Object.keys(s.ft_follows).sort(), ['author:lanternmoth', 'series:77']);
  assert.deepEqual(s.ft_follows['author:lanternmoth'].known_ids, ['9'], "an existing follow keeps what it's seen");

  // Unfollowed on the other computer: gone here too.
  await b.sw.evaluate(() => chrome.storage.sync.set({ fts_follows: [{ kind: 'series', id: '77', name: 'A Series' }] }));
  await sleep(1500);
  assert.deepEqual(Object.keys((await b.store('ft_follows')).ft_follows), ['series:77']);
});

test('with sync off, nothing more goes out', async () => {
  await app.click('text=Sync settings, Fic Finder presets'); // off
  await sleep(300);
  await b.setStore({ ft_finder_presets: [{ id: 'local-only', name: 'Private' }] });
  await sleep(1800);
  assert.deepEqual((await sync('fts_presets')).fts_presets.map(p => p.name), ['From the desktop']);
});

test('no page errors', () => {
  assert.deepEqual(b.errors, []);
});
