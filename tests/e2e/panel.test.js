// The panel on AO3 work pages: adding a fic, progress as you read, status,
// rating and notes, and the library page staying in step.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, workPages, openWork, WORK, CHAPTER_IDS, sleep, squash } from './helpers.js';

let b, ao3;
before(async () => { b = await launch({ ao3: workPages }); });
after(async () => { await b?.ctx.close(); });

test('an old fictracker.app library is copied in, Dropped becoming DNF', async () => {
  const site = await b.ctx.newPage();
  await site.goto('https://fictracker.app/');
  await site.evaluate(() => localStorage.setItem('ft_library', JSON.stringify({
    works: [
      { id: '111', ao3_id: 111, title: 'Old Fic', fandoms: ['X'], chapter_count: 3, chapter_total: 3, is_complete: true },
      { id: '112', ao3_id: 112, title: 'Gave Up', fandoms: ['X'], chapter_count: 9, chapter_total: 9, is_complete: true },
    ],
    statuses: {
      111: { work_id: '111', status: 'completed', rating_personal: 5, updated_at: '2026-03-01' },
      112: { work_id: '112', status: 'dropped', notes: 'not for me', updated_at: '2026-03-02' },
    },
    reading_log: [],
  })));
  await site.reload();
  await site.waitForFunction(() => /copied/i.test(document.querySelector('#legacy-notice')?.innerText || ''), null, { timeout: 10000 });
  const lib = await b.library();
  assert.deepEqual(lib.works.map(w => w.title).sort(), ['Gave Up', 'Old Fic']);
  assert.equal(lib.statuses['112'].status, 'dnf');
  assert.equal(lib.statuses['112'].notes, 'not for me');
  await site.close();
});

test('a new fic can be added from its page', async () => {
  ao3 = await openWork(b.ctx);
  assert.match(squash(await ao3.locator('#ft-body').innerText()), /isn't in your library yet.*Lamplighter/);
  await ao3.click('#ft-add-btn');
  await ao3.waitForSelector('#fictracker-panel .ft-in-library', { timeout: 5000 });
  const lib = await b.library();
  const w = lib.works.find(x => x.id === WORK);
  assert.equal(w.title, 'The Lamplighter’s Almanac');
  assert.equal(w.chapter_ids.length, 10);
  assert.equal(lib.statuses[WORK].status, 'to_read');
});

test('opening chapter 3 moves you to Reading, chapter 3', async () => {
  await ao3.goto(`https://archiveofourown.org/works/${WORK}/chapters/${CHAPTER_IDS[2]}?view_adult=true`, { waitUntil: 'domcontentloaded' });
  await ao3.waitForSelector('#fictracker-panel .ft-progress-section', { timeout: 20000 });
  await sleep(500);
  const st = (await b.library()).statuses[WORK];
  assert.equal(st.status, 'reading');
  assert.equal(st.current_chapter, 3);
  assert.match(await ao3.locator('.ft-progress-label').innerText(), /Chapter 3 of 10/);
});

test('going back to the work page keeps your place', async () => {
  await ao3.goto(`https://archiveofourown.org/works/${WORK}?view_adult=true`, { waitUntil: 'domcontentloaded' });
  await ao3.waitForSelector('#fictracker-panel .ft-in-library', { timeout: 20000 });
  await sleep(800);
  assert.equal((await b.library()).statuses[WORK].current_chapter, 3);
});

test('More like this links to an AO3 search from the fic\'s own tags', async () => {
  const href = await ao3.locator('.ft-more-like').getAttribute('href');
  const q = Object.fromEntries(new URL(href).searchParams);
  assert.equal(q['work_search[query]'],
    'tag:"Original Work" tag:"Original Female Character/Original Female Character" (tag:"Slow Burn" OR tag:"Found Family" OR tag:"Small Town")');
  assert.equal(q['work_search[sort_column]'], 'kudos_count');
});

test('the status menu offers DNF and not Dropped', async () => {
  const options = await ao3.locator('#ft-status-select option').allInnerTexts();
  assert.ok(options.includes('DNF'), options.join(', '));
  assert.ok(!options.includes('Dropped'), options.join(', '));
});

test('stars rate the fic, and clicking your rating clears it', async () => {
  await ao3.click('.ft-star[data-star="4"]');
  await ao3.waitForSelector('.ft-star[data-star="4"].ft-star-on');
  assert.equal((await b.library()).statuses[WORK].rating_personal, 4);
  assert.equal(await ao3.locator('.ft-star.ft-star-on').count(), 4);

  await ao3.click('.ft-star[data-star="4"]');
  await ao3.waitForFunction(() => !document.querySelector('.ft-star.ft-star-on'));
  assert.equal((await b.library()).statuses[WORK].rating_personal, null);
});

test('a note saves as you type and survives the panel redrawing', async () => {
  await ao3.click('.ft-note summary');
  const box = ao3.locator('#ft-note-text');
  await box.click();
  await box.pressSequentially('the lighthouse scene', { delay: 20 });
  await sleep(1000); // past the save delay; the save redraws the panel
  assert.equal((await b.library()).statuses[WORK].notes, 'the lighthouse scene');

  // Still open and focused after the redraw, so you can keep typing.
  assert.ok(await ao3.locator('.ft-note').evaluate(d => d.open));
  assert.ok(await box.evaluate(el => document.activeElement === el));
  await box.pressSequentially(', ch 3', { delay: 20 });
  // A change from elsewhere (the library page) redraws mid-typing too.
  await b.sw.evaluate(wid => chrome.storage.local.get('ft_library').then(({ ft_library: l }) => {
    l.statuses[wid].rating_personal = 5;
    return chrome.storage.local.set({ ft_library: l });
  }), WORK);
  await sleep(300);
  assert.equal(await box.inputValue(), 'the lighthouse scene, ch 3');
  await ao3.locator('.ft-header').click(); // blur saves right away
  await sleep(500);
  const st = (await b.library()).statuses[WORK];
  assert.equal(st.notes, 'the lighthouse scene, ch 3');
  assert.equal(st.rating_personal, 5);

  // Closed, the note shows as a preview line.
  await ao3.reload({ waitUntil: 'domcontentloaded' });
  await ao3.waitForSelector('.ft-note-preview');
  assert.match(await ao3.locator('.ft-note-preview').innerText(), /lighthouse scene/);
});

test('finishing an unrated fic asks for a rating', async () => {
  await b.libOp({ op: 'updateStatus', workId: WORK, updates: { rating_personal: null, status: 'completed', current_chapter: 10 } });
  await ao3.waitForSelector('.ft-rating-ask');
  assert.match(await ao3.locator('.ft-rating-label').innerText(), /Finished! Rate it\?/);
  await ao3.click('.ft-star[data-star="5"]');
  await ao3.waitForFunction(() => !document.querySelector('.ft-rating-ask'));
  assert.equal((await b.library()).statuses[WORK].rating_personal, 5);
});

test('the library page shows the rating and note from AO3', async () => {
  const app = await b.ctx.newPage();
  await app.goto(`${b.appUrl}#work=${WORK}`);
  await app.waitForSelector('.modal textarea', { timeout: 10000 });
  assert.equal(await app.locator('.modal textarea').inputValue(), 'the lighthouse scene, ch 3');
  assert.equal(await app.locator('.modal .star.filled').count(), 5);

  // More like this, saved as a Fic Finder preset.
  await app.click('.modal button:has-text("Save as Fic Finder preset")');
  await app.waitForSelector('.modal button:has-text("Saved to Fic Finder")');
  const presets = (await b.store('ft_finder_presets')).ft_finder_presets;
  assert.equal(presets.at(-1).name, 'More like The Lamplighter’s Almanac');
  assert.equal(presets.at(-1).sort_column, 'kudos_count');
  await app.close();
});

test('edits from the library page and AO3 at the same time both land', async () => {
  await b.libOp({ op: 'updateStatus', workId: WORK, updates: { status: 'reading', current_chapter: 3 } });
  await ao3.waitForSelector('#fictracker-panel [data-ch="1"]');
  const app = await b.ctx.newPage();
  await app.goto(b.appUrl);
  await app.waitForSelector('.tabs');
  await Promise.all([
    app.evaluate(wid => chrome.runtime.sendMessage({ type: 'LIB_OP', op: { op: 'updateStatus', workId: wid, updates: { rating_personal: 2 } } }), WORK),
    ao3.evaluate(() => document.querySelector('#fictracker-panel .ft-chapter-controls [data-ch="1"]').click()),
  ]);
  await sleep(800);
  const st = (await b.library()).statuses[WORK];
  assert.equal(st.rating_personal, 2);
  assert.equal(st.current_chapter, 4);
  await app.close();
});

test('the panel link opens the fic in your library', async () => {
  const [page] = await Promise.all([
    b.ctx.waitForEvent('page', { timeout: 5000 }),
    ao3.click('#ft-open-library'),
  ]);
  await page.waitForSelector('.modal', { timeout: 8000 });
  assert.match(await page.locator('.modal h2').innerText(), /Lamplighter/);
});

test('no page errors', () => {
  assert.deepEqual(b.errors, []);
});
