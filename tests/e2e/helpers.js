// Shared setup for the browser tests: a Chromium with the built extension
// loaded, and AO3 answered from made-up pages. Tests never reach the real
// AO3 (it rate-limits quickly, and these must run the same every time).
//
// Needs `npm run build:ext` first. Chromium comes from Playwright
// (`npx playwright-core install chromium`), or set CHROMIUM_PATH.

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Lets Playwright see requests made by the extension's service worker.
// Must be set before Playwright is loaded.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const { chromium } = await import('playwright-core');

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../..');
export const EXT = path.join(ROOT, 'extension/dist/build-chrome');

export const fixture = name => readFileSync(path.join(here, 'fixtures', name), 'utf8');
export const coreFixture = name => readFileSync(path.join(ROOT, 'src/core/fixtures', name), 'utf8');

// The made-up work in fixtures/work.html (10 chapters, complete).
export const WORK = '90000001';
export const CHAPTER_IDS = Array.from({ length: 10 }, (_, i) => String(91000001 + i));

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const squash = s => s.replace(/\s+/g, ' ').trim();

// Start Chromium with the extension. `ao3` answers every AO3 request:
// (route, url) => fulfilled, or undefined for an empty 204.
export async function launch({ ao3 } = {}) {
  const ctx = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), 'ft-e2e-')), {
    // Extensions need the full browser in its new headless mode, not
    // Playwright's headless shell: the 'chromium' channel picks that.
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : { channel: 'chromium' }),
    headless: true,
    args: ['--headless=new', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    viewport: { width: 1280, height: 900 },
  });
  // Errors on FicTracker's own pages. AO3's pages are left out: their
  // scripts aren't served in tests, so their inline code throws.
  const errors = [];
  const watch = p => p.on('pageerror', e => {
    if (!p.url().startsWith('https://archiveofourown.org/')) errors.push(`${p.url()}: ${e.message}`);
  });
  ctx.pages().forEach(watch);
  ctx.on('page', watch);

  const hits = [];
  await ctx.route('https://archiveofourown.org/**', async route => {
    const url = new URL(route.request().url());
    hits.push({ path: url.pathname + url.search, t: Date.now() });
    const handled = ao3?.(route, url);
    if (handled !== undefined) return handled;
    return route.fulfill({ status: 204, body: '' });
  });
  // Nothing may reach the real fictracker.app either.
  await ctx.route('https://fictracker.app/**', route => route.fulfill({
    contentType: 'text/html', body: readFileSync(path.join(ROOT, 'site/index.html'), 'utf8'),
  }));

  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  await sleep(1000); // let the install handlers finish

  const store = keys => sw.evaluate(k => chrome.storage.local.get(k), keys);
  const setStore = values => sw.evaluate(v => chrome.storage.local.set(v), values);
  const library = async () => (await store('ft_library')).ft_library;
  const appUrl = `chrome-extension://${extId}/app/index.html`;

  // Send a library change the way the library page does. (The worker can't
  // message itself, and AO3 pages can't reach the extension from the
  // page's own scripts.)
  let opPage;
  const libOp = async op => {
    if (!opPage) { opPage = await ctx.newPage(); await opPage.goto(appUrl); }
    return opPage.evaluate(o => chrome.runtime.sendMessage({ type: 'LIB_OP', op: o }), op);
  };

  return { ctx, sw, extId, appUrl, errors, hits, store, setStore, library, libOp };
}

export const html = (route, body) => route.fulfill({ contentType: 'text/html', body });

// Answer work and chapter pages with the made-up work.
export function workPages(route, url) {
  if (url.pathname === `/works/${WORK}/chapters/${CHAPTER_IDS[2]}`) return html(route, fixture('chapter3.html'));
  if (/^\/works\/\d+(\/chapters\/\d+)?\/?$/.test(url.pathname)) return html(route, fixture('work.html'));
  return undefined;
}

export async function openWork(ctx, pathname = `/works/${WORK}`) {
  const page = await ctx.newPage();
  await page.goto(`https://archiveofourown.org${pathname}?view_adult=true`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#fictracker-panel .ft-message, #fictracker-panel .ft-in-library', { timeout: 20000 });
  return page;
}
