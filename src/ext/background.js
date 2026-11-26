// src/ext/background.js
// FicTracker background service worker.
//
// This is the only place that writes the library. The on-page panel on AO3
// and the library tab both send operations here, and they are applied one
// at a time, so two open tabs can never overwrite each other's changes.
// Everything is stored in the browser's extension storage. Nothing leaves
// the device.

import { applyOp, normalizeLibrary } from '../core/library.js';

const LIB_KEY = 'ft_library';

let queue = Promise.resolve();

function enqueue(task) {
  const run = queue.then(task);
  queue = run.catch(() => {}); // a failed op must not block later ones
  return run;
}

async function readLibrary() {
  const got = await chrome.storage.local.get(LIB_KEY);
  return normalizeLibrary(got[LIB_KEY]);
}

function runOp(op) {
  return enqueue(async () => {
    const next = applyOp(await readLibrary(), op);
    await chrome.storage.local.set({ [LIB_KEY]: next });
    return next;
  });
}

function openLibrary(hash = '') {
  return chrome.tabs.create({ url: chrome.runtime.getURL(`app/index.html${hash}`) });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case 'LIB_GET':
        return { library: await enqueue(readLibrary) };
      case 'LIB_OP':
        await runOp(msg.op);
        return { ok: true };
      case 'IMPORT_LEGACY': {
        // Library data from the old fictracker.app web app. Merge it in once.
        const { ft_legacy_imported } = await chrome.storage.local.get('ft_legacy_imported');
        if (ft_legacy_imported) return { ok: true, skipped: true };
        await runOp({ op: 'merge', library: msg.data.library });
        await importLegacyExtras(msg.data);
        await chrome.storage.local.set({ ft_legacy_imported: new Date().toISOString() });
        return { ok: true, count: msg.data.library?.works?.length || 0 };
      }
      case 'OPEN_LIBRARY':
        await openLibrary(msg.hash || '');
        return { ok: true };
      default:
        return { error: 'Unknown message type' };
    }
  })().then(sendResponse, e => sendResponse({ error: e.message }));
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

// The toolbar button opens your library.
chrome.action.onClicked.addListener(() => openLibrary());

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') openLibrary('#welcome');
});
