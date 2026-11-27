// src/ext/ao3-import.js
// Importing your AO3 history or bookmarks, from those pages on AO3.
//
// This runs on AO3 itself, so the pages it reads come with your AO3 login
// (your history is only visible to you). It reads one page at a time, a
// few seconds apart, taking turns with every other FicTracker request.
// Fics already in your library keep their status and progress; only their
// details are refreshed.

import { parseListingPage } from '../core/scrape.js';
import { STATUS_LABELS } from '../core/statuses.js';

const PATH = /^\/users\/([^/]+)(?:\/pseuds\/[^/]+)?\/(readings|bookmarks)\/?$/;

export function listingPageKind(pathname) {
  const m = pathname.match(PATH);
  return m ? (m[2] === 'readings' ? 'history' : 'bookmarks') : null;
}

const STATUS_CHOICES = {
  auto: `${STATUS_LABELS.completed}, or ${STATUS_LABELS.reading} if a WIP`,
  reading: STATUS_LABELS.reading,
  completed: STATUS_LABELS.completed,
  to_read: STATUS_LABELS.to_read,
};

function statusFor(item, choice) {
  if (item.marked_for_later) return 'to_read';
  if (choice !== 'auto') return choice;
  return item.work.is_complete ? 'completed' : 'reading';
}

function pageUrl(n) {
  const u = new URL(location.href);
  u.searchParams.set('page', String(n));
  return u.toString();
}

export function initImport(ui) {
  const kind = listingPageKind(location.pathname);
  const first = parseListingPage(document);
  const here = parseInt(new URLSearchParams(location.search).get('page') || '1', 10);
  if (!first.items.length) return; // empty, or not your history

  const pages = first.lastPage;
  const label = kind === 'history' ? 'your AO3 history' : 'these bookmarks';
  let stop = false;
  let running = false;
  // Kept here because the panel is redrawn on every progress update.
  let choice = kind === 'history' ? 'auto' : 'to_read';

  ui.loadPanelMode().then(() => {
    ui.createPanel();
    draw();
    ui.applyPanelMode();
  });

  function draw(progress = '', done = false) {
    const body = document.getElementById('ft-body');
    const minutes = Math.max(1, Math.ceil((pages * 3.5) / 60));
    body.innerHTML = `
      <div class="ft-message">Add ${label} to your FicTracker library.</div>
      <div class="ft-work-meta">${pages} page${pages !== 1 ? 's' : ''}${pages > 1 ? `, about ${minutes} min for all of them` : ''}.
        Fics already in your library keep their status.</div>
      <div class="ft-status-picker ft-import-picker">
        <label for="ft-import-status">Add new fics as:</label>
        <select id="ft-import-status" ${running ? 'disabled' : ''}>
          ${Object.entries(STATUS_CHOICES).map(([k, v]) =>
            `<option value="${k}" ${k === choice ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
      ${kind === 'history' ? '<div class="ft-work-meta">Fics you marked for later are added as To Read.</div>' : ''}
      ${running
        ? '<button class="ft-btn ft-btn-ghost" id="ft-import-stop">Stop</button>'
        : `<button class="ft-btn ft-btn-accent" id="ft-import-all">${pages > 1 ? `Import all ${pages} pages` : 'Import'}</button>
           ${pages > 1 ? `<button class="ft-btn ft-btn-ghost" id="ft-import-one">Just this page</button>` : ''}`}
      <div class="ft-import-progress" id="ft-import-progress" role="status">${ui.escapeHtml(progress)}</div>
      ${done ? '<a class="ft-open-app" href="#" id="ft-open-library">Open your library →</a>' : ''}
    `;
    ui.forceAccentText(body);

    const mini = document.getElementById('ft-mini-bar');
    mini.innerHTML = `
      <span class="ft-mini-label">${running ? ui.escapeHtml(progress) : `Import ${kind}`}</span>
      <button class="ft-mini-expand" title="Expand">▴</button>`;
    mini.querySelector('.ft-mini-expand').addEventListener('click', () => ui.setPanelMode('full'));

    body.querySelector('#ft-import-status').addEventListener('change', e => { choice = e.target.value; });
    body.querySelector('#ft-import-all')?.addEventListener('click', () => run(false));
    body.querySelector('#ft-import-one')?.addEventListener('click', () => run(true));
    body.querySelector('#ft-import-stop')?.addEventListener('click', () => { stop = true; });
    body.querySelector('#ft-open-library')?.addEventListener('click', e => {
      e.preventDefault();
      ui.send({ type: 'OPEN_LIBRARY' }).catch(() => {});
    });
  }

  async function fetchPage(n) {
    if (n === here) return first;
    await ui.send({ type: 'AO3_SLOT' }); // throws if AO3 asked us to pause
    const res = await fetch(pageUrl(n), { credentials: 'same-origin' });
    if (res.status === 429 || res.status === 503) {
      ui.send({ type: 'AO3_RATE_LIMITED', retryAfter: res.headers.get('retry-after') }).catch(() => {});
      throw new Error('AO3 asked FicTracker to slow down. Wait a few minutes, then import again: fics already added are skipped quickly.');
    }
    if (!res.ok) throw new Error(`AO3 returned HTTP ${res.status} for page ${n}`);
    return parseListingPage(new DOMParser().parseFromString(await res.text(), 'text/html'));
  }

  async function run(onlyThisPage) {
    running = true;
    stop = false;
    const order = onlyThisPage ? [here] : [here, ...Array.from({ length: pages }, (_, i) => i + 1).filter(n => n !== here)];
    let added = 0;
    let seen = 0;
    let skipped = 0;
    let error = '';
    const before = new Set(((await chrome.storage.local.get('ft_library')).ft_library?.works || []).map(w => w.id));

    for (let i = 0; i < order.length && !stop; i++) {
      draw(`Page ${i + 1} of ${order.length}… ${added} added so far`);
      try {
        const page = await fetchPage(order[i]);
        const works = page.items.filter(it => it.kind === 'work');
        skipped += page.items.length - works.length;
        seen += works.length;
        if (works.length) {
          added += works.filter(it => !before.has(it.work.id)).length;
          works.forEach(it => before.add(it.work.id));
          await ui.send({
            type: 'LIB_OP',
            op: {
              op: 'importListing',
              items: works.map(it => ({
                work: { ...it.work, source: kind === 'history' ? 'ao3-history' : 'ao3-bookmarks' },
                status: statusFor(it, choice),
                added_at: it.last_visited || undefined,
              })),
            },
          });
        }
      } catch (e) {
        error = e.message;
        break;
      }
    }

    running = false;
    draw([
      stop ? 'Stopped.' : error ? '' : 'Done.',
      `${added} fic${added !== 1 ? 's' : ''} added, ${seen - added} already in your library.`,
      skipped ? `${skipped} deleted, hidden or series bookmark${skipped !== 1 ? 's' : ''} skipped.` : '',
      error,
    ].filter(Boolean).join(' '), true);
  }
}
