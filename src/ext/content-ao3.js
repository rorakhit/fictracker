// src/ext/content-ao3.js
// FicTracker on AO3.
// - On work pages: the panel. Reads the work's details from the page, shows
//   whether it's in your library, keeps your chapter progress up to date as
//   you read, and lets you follow the author or series.
// - On your history and bookmarks pages: importing them (see ao3-import.js).
// - On every page: notes which AO3 account you're logged in as, so the
//   library can link to your history.
// All changes go to the background worker; nothing is sent anywhere else.
//
// Panel modes: 'full' → 'mini' → 'hidden' (floating button only), saved
// across page loads.

import { parseWorkPage, detectCurrentChapter, loggedInUser } from '../core/scrape.js';
import { normalizeLibrary, progressFromVisit } from '../core/library.js';
import { followKey } from '../core/follows.js';
import { initImport, listingPageKind } from './ao3-import.js';

const workMatch = window.location.pathname.match(/^\/works\/(\d+)/);
const ao3Id = workMatch?.[1];

const STATUS_LABELS = {
  to_read: 'To Read',
  reading: 'Reading',
  completed: 'Completed',
  on_hold: 'On Hold',
  dropped: 'Dropped',
  author_abandoned: 'Author Abandoned',
};
const STATUS_COLORS = {
  to_read: '#3b82f6',
  reading: '#f59e0b',
  completed: '#22c55e',
  on_hold: '#8b5cf6',
  dropped: '#ef4444',
  author_abandoned: '#e04666',
};

let panelMode = 'full';
let pageMeta = null;

function send(msg) {
  return chrome.runtime.sendMessage(msg).then(res => {
    if (res?.error) throw new Error(res.error);
    return res;
  });
}

const libOp = op => send({ type: 'LIB_OP', op });

async function readLibrary() {
  const got = await chrome.storage.local.get('ft_library');
  return normalizeLibrary(got.ft_library);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return Math.round(n / 1000) + 'k';
  return String(n);
}

// ---- Panel mode ----

async function loadPanelMode() {
  try {
    const { fictracker_panel_mode } = await chrome.storage.local.get('fictracker_panel_mode');
    if (fictracker_panel_mode) panelMode = fictracker_panel_mode;
    else if (window.innerWidth < 540) panelMode = 'mini'; // phones: stay out of the way
  } catch { /* keep default */ }
}

function setPanelMode(mode) {
  panelMode = mode;
  chrome.storage.local.set({ fictracker_panel_mode: mode }).catch(() => {});
  applyPanelMode();
}

function applyPanelMode() {
  const panel = document.getElementById('fictracker-panel');
  const fab = document.getElementById('fictracker-fab');
  if (!panel) return;
  panel.classList.remove('ft-collapsed', 'ft-mini');
  if (fab) fab.style.display = 'none';
  if (panelMode === 'hidden') {
    panel.classList.add('ft-collapsed');
    showFloatingButton();
  } else if (panelMode === 'mini') {
    panel.classList.add('ft-mini');
  }
}

function showFloatingButton() {
  let btn = document.getElementById('fictracker-fab');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'fictracker-fab';
    btn.textContent = '📚';
    btn.title = 'Open FicTracker';
    btn.addEventListener('click', () => setPanelMode('full'));
    document.body.appendChild(btn);
  }
  btn.style.display = 'flex';
}

function createPanel() {
  document.getElementById('fictracker-panel')?.remove();
  document.getElementById('fictracker-fab')?.remove();
  const panel = document.createElement('div');
  panel.id = 'fictracker-panel';
  panel.innerHTML = `
    <div class="ft-header">
      <span class="ft-logo"><span class="ft-fic">Fic</span><span class="ft-tracker">Tracker</span></span>
      <div class="ft-header-actions">
        <button class="ft-minimize" title="Minimize">▾</button>
        <button class="ft-close" title="Hide">&times;</button>
      </div>
    </div>
    <div class="ft-body" id="ft-body"><div class="ft-loading">Checking your library…</div></div>
    <div class="ft-mini-bar" id="ft-mini-bar"></div>
  `;
  document.body.appendChild(panel);
  panel.querySelector('.ft-minimize').addEventListener('click', () => setPanelMode('mini'));
  panel.querySelector('.ft-close').addEventListener('click', () => setPanelMode('hidden'));
}

function forceWhiteAccentText(root) {
  // Some AO3 site skins override button text colour even with !important.
  root.querySelectorAll('.ft-btn-accent').forEach(b => b.style.setProperty('color', '#ffffff', 'important'));
}

function showError(message) {
  const body = document.getElementById('ft-body');
  if (!body) return;
  let el = body.querySelector('.ft-error');
  if (!el) {
    el = document.createElement('div');
    el.className = 'ft-error';
    body.appendChild(el);
  }
  el.textContent = message;
}

// ---- Rendering ----

function renderNewWork(meta) {
  const body = document.getElementById('ft-body');
  body.innerHTML = `
    <div class="ft-message">This fic isn't in your library yet.</div>
    <div class="ft-work-preview">
      <div class="ft-work-title">${escapeHtml(meta.title)}</div>
      <div class="ft-work-meta">${meta.word_count ? formatNumber(meta.word_count) + ' words · ' : ''}${meta.chapter_count || '?'}/${meta.chapter_total || '?'} ch</div>
    </div>
    <div class="ft-status-picker">
      <label for="ft-add-status">Add as:</label>
      <select id="ft-add-status">
        <option value="to_read">To Read</option>
        <option value="reading">Reading</option>
        <option value="completed">Completed</option>
      </select>
    </div>
    <button class="ft-btn ft-btn-accent" id="ft-add-btn">Add to Library</button>
    <div class="ft-follows" id="ft-follows"></div>
  `;
  renderFollows();
  forceWhiteAccentText(body);

  const miniBar = document.getElementById('ft-mini-bar');
  miniBar.innerHTML = `
    <span class="ft-mini-label">Not in library</span>
    <button class="ft-mini-expand" title="Expand">▴</button>
  `;
  miniBar.querySelector('.ft-mini-expand').addEventListener('click', () => setPanelMode('full'));

  body.querySelector('#ft-add-btn').addEventListener('click', async () => {
    const btn = body.querySelector('#ft-add-btn');
    const status = body.querySelector('#ft-add-status').value;
    btn.disabled = true;
    btn.textContent = 'Adding…';
    const now = new Date().toISOString();
    const updates = { status };
    if (status === 'reading') {
      updates.started_at = now;
      const ch = currentChapterFor(meta);
      if (ch) updates.current_chapter = ch;
    }
    if (status === 'completed') {
      updates.completed_at = now;
      updates.current_chapter = meta.chapter_count || 0;
    }
    // You just chose the status yourself, so don't auto-update it on this page.
    syncedThisPage = true;
    try {
      await libOp({ op: 'upsertWork', work: { ...meta, source: 'extension' } });
      await libOp({ op: 'updateStatus', workId: meta.id, updates });
      // The storage listener re-renders the panel.
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Add to Library';
      showError(`Couldn't add this fic: ${e.message}`);
    }
  });
}

function renderExistingWork(work, status) {
  const body = document.getElementById('ft-body');
  const st = status?.status || 'to_read';
  const total = work.chapter_total || work.chapter_count || null;
  const current = status?.current_chapter || 0;
  const progress = total ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const atEnd = total !== null && current >= total;

  body.innerHTML = `
    <div class="ft-in-library">
      <span class="ft-badge" style="background:${STATUS_COLORS[st]}">${STATUS_LABELS[st]}</span>
      <span class="ft-check">In your library</span>
    </div>
    ${st === 'reading' ? `
      <div class="ft-progress-section">
        <div class="ft-progress-label">Chapter ${current} of ${total ?? '?'}</div>
        <div class="ft-progress-bar"><div class="ft-progress-fill" style="width:${progress}%"></div></div>
        <div class="ft-chapter-controls">
          <button class="ft-btn ft-btn-sm ft-btn-ghost" data-ch="-1" ${current <= 0 ? 'disabled' : ''}>−</button>
          <span class="ft-chapter-num">${current}</span>
          <button class="ft-btn ft-btn-sm ft-btn-ghost" data-ch="1" ${atEnd ? 'disabled' : ''}>+</button>
        </div>
      </div>` : ''}
    <div class="ft-status-update">
      <select id="ft-status-select" aria-label="Reading status">
        ${Object.entries(STATUS_LABELS).map(([k, v]) =>
          `<option value="${k}" ${k === st ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
    </div>
    <div class="ft-follows" id="ft-follows"></div>
    <a class="ft-open-app" href="#" id="ft-open-library">Open your library →</a>
  `;
  renderFollows();

  const miniBar = document.getElementById('ft-mini-bar');
  miniBar.innerHTML = `
    <span class="ft-mini-badge" style="background:${STATUS_COLORS[st]}">${STATUS_LABELS[st]}</span>
    ${st === 'reading' ? `
      <div class="ft-mini-chapters">
        <button class="ft-mini-ch-btn" data-ch="-1" ${current <= 0 ? 'disabled' : ''}>−</button>
        <span class="ft-mini-ch-num">Ch. ${current}/${total ?? '?'}</span>
        <button class="ft-mini-ch-btn" data-ch="1" ${atEnd ? 'disabled' : ''}>+</button>
      </div>` : ''}
    <button class="ft-mini-expand" title="Expand">▴</button>
  `;
  miniBar.querySelector('.ft-mini-expand').addEventListener('click', () => setPanelMode('full'));

  for (const btn of document.querySelectorAll('#fictracker-panel [data-ch]')) {
    btn.addEventListener('click', () => setChapter(work, status, current + Number(btn.dataset.ch)));
  }

  body.querySelector('#ft-status-select').addEventListener('change', e => {
    const next = e.target.value;
    const now = new Date().toISOString();
    const updates = { status: next };
    if (next === 'reading' && !status?.started_at) updates.started_at = now;
    if (next === 'completed') updates.completed_at = now;
    libOp({ op: 'updateStatus', workId: work.id, updates }).catch(err => showError(err.message));
  });

  body.querySelector('#ft-open-library').addEventListener('click', e => {
    e.preventDefault();
    send({ type: 'OPEN_LIBRARY', hash: `#work=${work.id}` }).catch(() => {});
  });
}

function setChapter(work, status, chapter) {
  const total = work.chapter_total || work.chapter_count || null;
  if (chapter < 0 || (total !== null && chapter > total)) return;
  const updates = { current_chapter: chapter };
  // Only a finished fic can be completed by reaching its last chapter.
  // Catching up on a WIP leaves it as Reading.
  if (work.is_complete && total && chapter >= total && status?.status !== 'completed') {
    updates.status = 'completed';
    updates.completed_at = new Date().toISOString();
  }
  libOp({ op: 'updateStatus', workId: work.id, updates }).catch(err => showError(err.message));
}

// ---- Following the author or series ----

let follows = {};

function followTargets(meta) {
  const authors = (meta.author_users || []).slice(0, 3).map(u => ({ kind: 'author', id: u, name: u }));
  const series = (meta.series_memberships || []).slice(0, 3)
    .map(s => ({ kind: 'series', id: String(s.ao3_series_id), name: s.series_name }));
  return [...authors, ...series];
}

function renderFollows() {
  const slot = document.getElementById('ft-follows');
  if (!slot || !pageMeta) return;
  const targets = followTargets(pageMeta);
  if (!targets.length) { slot.innerHTML = ''; return; }
  slot.innerHTML = `
    <div class="ft-follows-label">Get told about new works from:</div>
    ${targets.map(t => {
      const on = Boolean(follows[followKey(t.kind, t.id)]);
      return `<button class="ft-btn ft-btn-sm ft-btn-ghost ft-follow-btn${on ? ' ft-following' : ''}"
        data-kind="${t.kind}" data-id="${escapeHtml(t.id)}" data-name="${escapeHtml(t.name)}"
        title="${on ? 'Click to stop following' : 'Follow'}">
        ${on ? '✓ ' : '+ '}${t.kind === 'series' ? 'Series: ' : ''}${escapeHtml(t.name)}</button>`;
    }).join('')}
  `;
  slot.querySelectorAll('.ft-follow-btn').forEach(btn => btn.addEventListener('click', () => {
    const { kind, id, name } = btn.dataset;
    const key = followKey(kind, id);
    btn.disabled = true;
    const msg = follows[key] ? { type: 'UNFOLLOW', key } : { type: 'FOLLOW', kind, id, name };
    send(msg).catch(err => showError(err.message)).finally(() => { btn.disabled = false; });
  }));
}

// The chapter open on this page, or null on a full-work view or a
// single-chapter fic.
function currentChapterFor(meta) {
  if (new URLSearchParams(location.search).has('view_full_work')) return null;
  if (!(meta.chapter_count > 1)) return null;
  return detectCurrentChapter(document, location.pathname, meta.chapter_ids)
    // A multi-chapter work's front page (/works/123) shows chapter 1.
    || (/^\/works\/\d+\/?$/.test(location.pathname) ? 1 : null);
}

// ---- Main ----

let syncedThisPage = false;
let renderSeq = 0;

async function render() {
  // Storage changes can arrive back to back; only the newest read may draw,
  // so a slow, older read never paints stale progress over a newer one.
  const seq = ++renderSeq;
  const lib = await readLibrary();
  if (seq !== renderSeq) return;
  const work = lib.works.find(w => w.id === pageMeta.id);
  if (!work) {
    renderNewWork(pageMeta);
  } else {
    const status = lib.statuses[work.id];
    renderExistingWork(work, status);

    if (!syncedThisPage) {
      syncedThisPage = true;
      // Refresh stored metadata (chapter count, chapter ids, kudos…) from
      // the page you're looking at, then record the chapter you opened.
      const { added_at, ...fresh } = pageMeta;
      await libOp({ op: 'upsertWork', work: fresh }).catch(() => {});
      const updates = progressFromVisit({ ...work, ...fresh }, status, currentChapterFor(pageMeta));
      if (updates) await libOp({ op: 'updateStatus', workId: work.id, updates }).catch(() => {});
    }
  }
  applyPanelMode();
}

async function init() {
  // Works with an adult-content or login wall have no metadata to read.
  if (!document.querySelector('h2.title')) return;
  pageMeta = parseWorkPage(document, ao3Id);
  await loadPanelMode();
  createPanel();
  // Listen before the first render: that render may itself update the
  // library (fresh metadata, the chapter you opened) and must redraw after.
  follows = (await chrome.storage.local.get('ft_follows')).ft_follows || {};
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.ft_follows) { follows = changes.ft_follows.newValue || {}; renderFollows(); }
    if (changes.ft_library) render();
  });
  await render();
}

// Remember the logged-in AO3 account (only its username) so the library
// page can link to your history and bookmarks.
const user = loggedInUser(document);
if (user) {
  chrome.storage.local.get('ft_ao3_user').then(r => {
    if (r.ft_ao3_user !== user) chrome.storage.local.set({ ft_ao3_user: user });
  }).catch(() => {});
}

if (ao3Id) init();
else if (listingPageKind(location.pathname)) {
  initImport({ createPanel, loadPanelMode, applyPanelMode, setPanelMode, escapeHtml, send, forceWhiteAccentText });
}
