// src/ext/background.js
// FicTracker background worker.
//
// It is the only place that writes the library, follows and news. The panel
// on AO3 and the library tab send operations here and they are applied one
// at a time, so two open tabs can never overwrite each other's changes.
//
// It also owns every request FicTracker makes to AO3 (or hands out turns
// for them), so requests from all tabs and the scheduled checks share one
// pace: one every few seconds, and a pause if AO3 says to slow down.
// Everything is stored in the browser's extension storage. Nothing leaves
// the device except those requests to AO3.

import { DOMParser as LinkedomParser } from 'linkedom/worker';
import { applyOp, normalizeLibrary } from '../core/library.js';
import { parseWorkPage, parseListingPage, parseSeriesPage, isGatedPage } from '../core/scrape.js';
import {
  followKey, followUrl, diffFollow, mergeNews, wipTargets, badgeCount, checkSettings,
} from '../core/follows.js';

const LIB_KEY = 'ft_library';
const FOLLOWS_KEY = 'ft_follows';
const NEWS_KEY = 'ft_follow_news';
const CHECK_KEY = 'ft_check';
const ALARM = 'ft-check';

const get = async key => (await chrome.storage.local.get(key))[key];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Chrome's background service worker has no DOMParser; Firefox's
// background page does.
const parseHtml = html =>
  (typeof DOMParser !== 'undefined' ? new DOMParser() : new LinkedomParser())
    .parseFromString(html, 'text/html');

// ---------------------------------------------------------------------------
// One queue for every write
// ---------------------------------------------------------------------------

let queue = Promise.resolve();

function enqueue(task) {
  const run = queue.then(task);
  queue = run.catch(() => {}); // a failed write must not block later ones
  return run;
}

async function readLibrary() {
  return normalizeLibrary(await get(LIB_KEY));
}

function runOp(op) {
  return enqueue(async () => {
    const next = applyOp(await readLibrary(), op);
    await chrome.storage.local.set({ [LIB_KEY]: next });
    return next;
  });
}

// Read-modify-write follows and news together.
function updateFollows(fn) {
  return enqueue(async () => {
    const follows = (await get(FOLLOWS_KEY)) || {};
    const news = (await get(NEWS_KEY)) || [];
    const lib = await readLibrary();
    const out = fn({ follows, news, libraryIds: new Set(lib.works.map(w => w.id)) }) || {};
    const set = {};
    if (out.follows) set[FOLLOWS_KEY] = out.follows;
    if (out.news) set[NEWS_KEY] = out.news;
    if (Object.keys(set).length) await chrome.storage.local.set(set);
    return out;
  });
}

// ---------------------------------------------------------------------------
// AO3 requests: one at a time, a few seconds apart
// ---------------------------------------------------------------------------

const AO3_GAP_MS = 3000;
const COOLDOWN_MS = 10 * 60 * 1000;
let nextSlot = 0;

class RateLimited extends Error {}

async function cooldownLeft() {
  const until = (await get('ft_ao3_cooldown')) || 0;
  return Math.max(0, until - Date.now());
}

async function rateLimited(retryAfterSec) {
  const ms = Math.max(COOLDOWN_MS, (Number(retryAfterSec) || 0) * 1000);
  await chrome.storage.local.set({ ft_ao3_cooldown: Date.now() + ms });
}

// Wait for our turn to send one request to AO3.
async function takeSlot() {
  const left = await cooldownLeft();
  if (left) {
    throw new RateLimited(`AO3 asked FicTracker to slow down. Try again in ${Math.ceil(left / 60000)} min.`);
  }
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + AO3_GAP_MS;
  if (at > now) await sleep(at - now);
}

async function ao3Fetch(url) {
  if (!url.startsWith('https://archiveofourown.org/')) throw new Error('Not an AO3 address');
  await takeSlot();
  // Uses your AO3 login if you're signed in, so locked works load too.
  const res = await fetch(url, { credentials: 'include' });
  if (res.status === 429 || res.status === 503) {
    await rateLimited(res.headers.get('retry-after'));
    throw new RateLimited('AO3 asked FicTracker to slow down. Try again in a few minutes.');
  }
  if (!res.ok) throw new Error(`AO3 returned HTTP ${res.status}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// Checks: new chapters in WIPs, new works from follows
// ---------------------------------------------------------------------------

let checkRunning = false;
let stopRequested = false;

async function runChecks({ manual = false, scope = 'all' } = {}) {
  if (checkRunning) return;
  checkRunning = true;
  stopRequested = false;

  const state = {
    running: true, manual, scope,
    started_at: new Date().toISOString(),
    done: 0, total: 0, current: '',
    new_chapters: [], new_works: 0, locked: 0, errors: 0,
    stopped: false, rate_limited: null,
  };
  const save = () => chrome.storage.local.set({ [CHECK_KEY]: { ...state } });

  try {
    const { hours } = checkSettings(await get('ft_settings'));
    // A scheduled check skips anything checked in the last stretch, so a
    // check you ran by hand isn't repeated straight away.
    const checkedBefore = manual ? null : new Date(Date.now() - hours * 0.9 * 3600e3).toISOString();
    const lib = await readLibrary();
    const wips = scope === 'follows' ? [] : wipTargets(lib, { checkedBefore });
    const follows = scope === 'wips' ? [] : Object.values((await get(FOLLOWS_KEY)) || {})
      .filter(f => !checkedBefore || !f.checked_at || f.checked_at < checkedBefore);
    state.total = wips.length + follows.length;
    await save();

    for (const w of wips) {
      if (stopRequested) break;
      state.current = w.title;
      await save();
      try {
        const doc = parseHtml(await ao3Fetch(`https://archiveofourown.org/works/${w.id}?view_adult=true`));
        if (isGatedPage(doc) || !doc.querySelector('h2.title')) {
          state.locked++;
          await runOp({ op: 'wipChecked', workId: w.id });
        } else {
          const fresh = parseWorkPage(doc, w.id);
          const gained = (fresh.chapter_count || 0) - (w.chapter_count || 0);
          await runOp({ op: 'wipChecked', work: fresh });
          if (gained > 0) state.new_chapters.push({ id: w.id, title: w.title, gained });
        }
      } catch (e) {
        if (e instanceof RateLimited) { state.rate_limited = e.message; break; }
        state.errors++;
      }
      state.done++;
    }

    for (const f of follows) {
      if (stopRequested || state.rate_limited) break;
      state.current = f.kind === 'author' ? `Works by ${f.name}` : f.name;
      await save();
      try {
        const n = await checkFollow(f);
        state.new_works += n;
      } catch (e) {
        if (e instanceof RateLimited) { state.rate_limited = e.message; break; }
        state.errors++;
      }
      state.done++;
    }
    state.stopped = stopRequested;
  } finally {
    state.running = false;
    state.current = '';
    state.finished_at = new Date().toISOString();
    await save();
    checkRunning = false;
  }
}

// Fetch one follow's page and record what's new. Returns the number of new works.
async function checkFollow(f) {
  const doc = parseHtml(await ao3Fetch(followUrl(f.kind, f.id)));
  const page = f.kind === 'series' ? parseSeriesPage(doc) : parseListingPage(doc);
  const key = followKey(f.kind, f.id);
  const out = await updateFollows(({ follows, news, libraryIds }) => {
    const current = follows[key];
    if (!current) return {}; // unfollowed while we were fetching
    const named = f.kind === 'series' && page.title ? { ...current, name: page.title } : current;
    const r = diffFollow(named, page.items, libraryIds);
    return {
      follows: { ...follows, [key]: r.follow },
      news: mergeNews(news, r.news, libraryIds),
      count: r.news.length,
    };
  });
  return out.count || 0;
}

async function scheduleChecks() {
  const { autoCheck, hours } = checkSettings(await get('ft_settings'));
  if (!autoCheck) { await chrome.alarms.clear(ALARM); return; }
  const existing = await chrome.alarms.get(ALARM);
  if (existing && existing.periodInMinutes === hours * 60) return;
  chrome.alarms.create(ALARM, {
    delayInMinutes: existing ? hours * 60 : 10, // first check soon after install
    periodInMinutes: hours * 60,
  });
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM) runChecks({ manual: false });
});

// ---------------------------------------------------------------------------
// Toolbar badge: how many fics have new chapters, plus new followed works
// ---------------------------------------------------------------------------

async function updateBadge() {
  const lib = await readLibrary();
  const { wips, fresh, total } = badgeCount(lib, (await get(NEWS_KEY)) || []);
  await chrome.action.setBadgeText({ text: total ? String(total) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#e04666' });
  const parts = [
    wips ? `${wips} fic${wips !== 1 ? 's' : ''} with new chapters` : '',
    fresh ? `${fresh} new work${fresh !== 1 ? 's' : ''} from people and series you follow` : '',
  ].filter(Boolean);
  await chrome.action.setTitle({
    title: parts.length ? `FicTracker: ${parts.join(', ')}` : 'Open your FicTracker library',
  });
}

let badgeTimer = null;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[LIB_KEY] || changes[NEWS_KEY]) {
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => updateBadge().catch(() => {}), 300);
  }
  if (changes.ft_settings) scheduleChecks().catch(() => {});
});

// ---------------------------------------------------------------------------
// Messages from the panel and the library tab
// ---------------------------------------------------------------------------

function openLibrary(hash = '') {
  return chrome.tabs.create({ url: chrome.runtime.getURL(`app/index.html${hash}`) });
}

const handlers = {
  LIB_GET: async () => ({ library: await enqueue(readLibrary) }),

  LIB_OP: async msg => { await runOp(msg.op); return { ok: true }; },

  // Library data from the old fictracker.app web app. Merged in once.
  IMPORT_LEGACY: async msg => {
    if (await get('ft_legacy_imported')) return { ok: true, skipped: true };
    await runOp({ op: 'merge', library: msg.data.library });
    await importLegacyExtras(msg.data);
    await chrome.storage.local.set({ ft_legacy_imported: new Date().toISOString() });
    return { ok: true, count: msg.data.library?.works?.length || 0 };
  },

  OPEN_LIBRARY: async msg => { await openLibrary(msg.hash || ''); return { ok: true }; },

  // A page that fetches AO3 itself (the history import on AO3) asks for a turn.
  AO3_SLOT: async () => { await takeSlot(); return { ok: true }; },
  AO3_RATE_LIMITED: async msg => { await rateLimited(msg.retryAfter); return { ok: true }; },
  // The library tab's fetches go through here so they share the pace.
  AO3_FETCH: async msg => ({ html: await ao3Fetch(msg.url) }),

  CHECK_START: async msg => {
    if (checkRunning) return { ok: true, already: true };
    runChecks({ manual: true, scope: msg.scope || 'all' }).catch(() => {});
    return { ok: true };
  },
  CHECK_STOP: async () => { stopRequested = true; return { ok: true }; },

  FOLLOW: async ({ kind, id, name }) => {
    if (!['author', 'series'].includes(kind) || !id) throw new Error('Nothing to follow');
    const key = followKey(kind, String(id));
    await updateFollows(({ follows }) => follows[key] ? {} : {
      follows: {
        ...follows,
        [key]: { kind, id: String(id), name: name || String(id), added_at: new Date().toISOString(), known_ids: null, checked_at: null },
      },
    });
    // Note what's there now, so only later works count as new.
    get(FOLLOWS_KEY).then(f => f?.[key] && !f[key].checked_at && checkFollow(f[key])).catch(() => {});
    return { ok: true };
  },

  UNFOLLOW: async ({ key }) => {
    await updateFollows(({ follows, news }) => {
      const { [key]: _gone, ...rest } = follows;
      return { follows: rest, news: news.filter(n => n.follow_key !== key) };
    });
    return { ok: true };
  },

  NEWS_DISMISS: async ({ keys }) => {
    const drop = new Set(keys);
    await updateFollows(({ news }) => ({ news: news.filter(n => !drop.has(n.key)) }));
    return { ok: true };
  },

  NEWS_ADD: async ({ key, status }) => {
    const news = (await get(NEWS_KEY)) || [];
    const item = news.find(n => n.key === key);
    if (!item) return { ok: true };
    await runOp({ op: 'importListing', items: [{ work: { ...item.work, source: 'follow' }, status: status || 'to_read' }] });
    await updateFollows(({ news: current }) => ({ news: current.filter(n => n.work.id !== item.work.id) }));
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = handlers[msg?.type];
  if (!handler) { sendResponse({ error: 'Unknown message type' }); return false; }
  handler(msg).then(sendResponse, e => sendResponse({ error: e.message, rateLimited: e instanceof RateLimited }));
  return true; // keep the channel open for the async reply
});

// Shelves, presets and settings from the old web app: only fill them in
// when the extension doesn't have any yet.
async function importLegacyExtras(data) {
  const keys = ['ft_shelves', 'ft_smart_shelves', 'ft_settings', 'ft_finder_presets'];
  const current = await chrome.storage.local.get(keys);
  const updates = {};
  for (const k of keys) {
    const empty = current[k] === undefined
      || (Array.isArray(current[k]) && current[k].length === 0)
      || (k === 'ft_settings' && Object.keys(current[k] || {}).length === 0);
    if (empty && data[k] !== undefined && data[k] !== null) updates[k] = data[k];
  }
  if (Object.keys(updates).length) await chrome.storage.local.set(updates);
}

// The toolbar button opens your library, on the Following tab when the
// only news is from people and series you follow.
chrome.action.onClicked.addListener(async () => {
  const { wips, fresh } = badgeCount(await readLibrary(), (await get(NEWS_KEY)) || []);
  openLibrary(fresh && !wips ? '#following' : '');
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') openLibrary('#welcome');
  scheduleChecks().catch(() => {});
});
chrome.runtime.onStartup.addListener(() => { scheduleChecks().catch(() => {}); });

// A check can't survive the worker being stopped; don't leave it looking stuck.
get(CHECK_KEY).then(s => {
  if (s?.running) chrome.storage.local.set({ [CHECK_KEY]: { ...s, running: false, interrupted: true } });
}).catch(() => {});
updateBadge().catch(() => {});
