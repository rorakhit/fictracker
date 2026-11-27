// Importing AO3 history, following an author, the background checks (new
// works, WIP updates), the toolbar badge, and pausing when AO3 says 429.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, html, fixture, coreFixture, WORK, sleep, squash } from './helpers.js';

const readings = coreFixture('readings.html');
const readingsPage = n => n === 1 ? readings
  : readings.replace(/1001/g, `${n}101`).replace(/1002/g, `${n}102`);
const blurb = (id, title) => `<li id="work_${id}" class="work blurb group" role="article"><div class="header module">
  <h4 class="heading"><a href="/works/${id}">${title}</a> by <a rel="author" href="/users/lanternmoth/pseuds/lanternmoth">lanternmoth</a></h4>
  <h5 class="fandoms heading"><a class="tag" href="/tags/x">Original Work</a></h5><p class="datetime">25 Nov 2026</p></div>
  <blockquote class="userstuff summary"><p>Summary of ${title}.</p></blockquote>
  <dl class="stats"><dd class="words">2,000</dd><dd class="chapters">1/1</dd></dl></li>`;
let authorWorks = [[WORK, 'The Lamplighter’s Almanac'], ['5000', 'Older Work']];
const authorPage = () => `<html><body><div id="login"></div><ol class="work index group">${authorWorks.map(([i, t]) => blurb(i, t)).join('')}</ol></body></html>`;

function ao3(route, url) {
  if (url.pathname === '/users/test_reader/readings') return html(route, readingsPage(Number(url.searchParams.get('page') || 1)));
  if (url.pathname === '/users/lanternmoth/works') return html(route, authorPage());
  if (url.pathname === '/works/3101') return route.fulfill({ status: 429, headers: { 'retry-after': '60' }, body: 'slow down' });
  if (/^\/works\/\d+/.test(url.pathname)) return html(route, fixture('work.html'));
  return undefined;
}

let b, page, app;
const badge = () => b.sw.evaluate(() => chrome.action.getBadgeText({}));
before(async () => { b = await launch({ ao3 }); });
after(async () => { await b?.ctx.close(); });

test('checks are scheduled every 12 hours on install', async () => {
  const alarm = await b.sw.evaluate(() => chrome.alarms.get('ft-check'));
  assert.equal(alarm?.periodInMinutes, 720);
});

test('importing AO3 history adds every page, a few seconds apart', async () => {
  page = await b.ctx.newPage();
  await page.goto('https://archiveofourown.org/users/test_reader/readings', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#ft-import-all', { timeout: 10000 });
  await page.selectOption('#ft-import-status', 'reading');
  await page.click('#ft-import-all');
  await sleep(500);
  assert.equal(await page.inputValue('#ft-import-status'), 'reading', 'chosen status still shown while importing');
  await page.waitForFunction(() => /Done\.|Stopped|slow down/.test(document.getElementById('ft-import-progress')?.textContent || ''), null, { timeout: 30000 });
  assert.equal(await page.inputValue('#ft-import-status'), 'reading', 'chosen status still shown when done');

  const { ft_library: lib, ft_ao3_user: user } = await b.store(['ft_library', 'ft_ao3_user']);
  assert.equal(lib.works.length, 6);
  assert.equal(lib.statuses['1001']?.status, 'reading', 'WIP from history');
  assert.equal(lib.statuses['1002']?.status, 'to_read', 'marked for later');
  assert.equal(lib.works.find(w => w.id === '1001').added_at, '2026-11-20T00:00:00.000Z', 'added_at is when you last visited');
  assert.equal(lib.reading_log.length, 0, 'importing logs no reading');
  assert.equal(user, 'test_reader');
  const pages = b.hits.filter(h => h.path.startsWith('/users/test_reader/readings?page='));
  assert.equal(pages.length, 2);
  assert.ok(pages[1].t - pages[0].t >= 2900, `pages ${pages[1].t - pages[0].t} ms apart`);
});

test('importing again adds nothing twice', async () => {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#ft-import-one');
  await page.click('#ft-import-one');
  await page.waitForFunction(() => /Done\./.test(document.getElementById('ft-import-progress')?.textContent || ''));
  assert.equal((await b.library()).works.length, 6);
});

test('following the author from the panel remembers their current works', async () => {
  await page.goto(`https://archiveofourown.org/works/${WORK}?view_adult=true`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#ft-follows .ft-follow-btn', { timeout: 10000 });
  assert.match(squash(await page.locator('#ft-follows').innerText()), /lanternmoth/);
  await page.click('#ft-follows .ft-follow-btn');
  await page.waitForSelector('#ft-follows .ft-following');
  await sleep(4500); // the first fetch waits its turn
  const f = (await b.store('ft_follows')).ft_follows?.['author:lanternmoth'];
  assert.deepEqual(f?.known_ids?.slice().sort(), ['5000', WORK].sort());
});

test('"Check now" finds the author\'s new work', async () => {
  authorWorks = [['3000', 'Brand New Fic'], ...authorWorks];
  app = await b.ctx.newPage();
  await app.goto(b.appUrl);
  await app.waitForSelector('.tab');
  await app.click('.tab:has-text("Following")');
  await app.click('button:has-text("Check now")');
  await app.waitForSelector('.work-card:has-text("Brand New Fic")', { timeout: 20000 });
  await sleep(800);
  assert.equal(await badge(), '1');
  assert.match(await app.locator('.tabs').innerText(), /Following \(1\)/);
});

test('"Check WIPs" flags new chapters and stops when AO3 says 429', async () => {
  await app.click('.tab:has-text("Library")');
  await app.click('button:has-text("Check WIPs")');
  await app.waitForFunction(() => /slow down/.test(document.body.innerText), null, { timeout: 30000 });
  const s = await b.store(['ft_library', 'ft_ao3_cooldown', 'ft_check']);
  const flagged = s.ft_library.works.filter(w => w.wip_new_chapters > 0);
  assert.equal(flagged.length, 2, 'two WIPs flagged before the 429');
  assert.ok(s.ft_ao3_cooldown > Date.now() + 9 * 60e3, 'paused for about 10 minutes');
  assert.ok(s.ft_check.rate_limited && !s.ft_check.running);
  assert.equal(await badge(), '3', '2 WIPs + 1 new work');

  const before = b.hits.length;
  const r = await app.evaluate(() => chrome.runtime.sendMessage({ type: 'AO3_FETCH', url: 'https://archiveofourown.org/works/1' }));
  assert.match(r.error || '', /slow down/);
  assert.equal(b.hits.length, before, 'no AO3 requests during the pause');
});

test('adding the new work and catching up on a WIP clear the badge', async () => {
  await app.click('.tab:has-text("Following")');
  await app.click('button:has-text("Add as To Read")');
  await app.waitForSelector('text=Nothing new yet');
  assert.equal((await b.library()).statuses['3000']?.status, 'to_read');
  await app.evaluate(() => chrome.runtime.sendMessage({ type: 'LIB_OP', op: { op: 'updateStatus', workId: '1001', updates: { current_chapter: 10 } } }));
  await sleep(800);
  assert.equal(await badge(), '1');
});

test('turning checks off in Settings clears the schedule', async () => {
  await app.click('.tab:has-text("Settings")');
  await app.click('text=Check automatically');
  await sleep(800);
  assert.ok(!(await b.sw.evaluate(() => chrome.alarms.get('ft-check'))));
});

test('no page errors', () => {
  assert.deepEqual(b.errors, []);
});
